"""Native microphone/voice bridge. JSON lines; renderer never receives file access."""
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import ROOT, DATA, Voice, speech_chunks, transcribe_audio

output_lock = threading.Lock()
state_lock = threading.RLock()
voice = Voice()
listener = player = None
enabled = False
busy = False
muted = False
closed = False
generation = 0
pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)


def emit(event, **values):
    with output_lock:
        print(json.dumps({'event': event, **values}, ensure_ascii=False), flush=True)


def capture(command):
    if listener and listener.poll() is None:
        try:
            listener.stdin.write(json.dumps({'command': command}) + '\n')
            listener.stdin.flush()
        except (BrokenPipeError, OSError):
            pass


def sync():
    capture('resume' if enabled and not busy else 'pause')
    emit('status', state='busy' if busy else 'listening' if enabled else 'paused')


def recognize(token):
    global busy
    try:
        text = transcribe_audio(DATA / 'recording.wav')
        with state_lock:
            if token != generation or closed:
                return
            if text and enabled:
                # Remain paused until the UI completes the AI turn.
                emit('transcript', text=text)
            else:
                busy = False
                sync()
    except Exception as exc:
        with state_lock:
            if token == generation:
                busy = False
                emit('error', message=str(exc))
                sync()


def listen_events():
    global busy
    for line in listener.stdout:
        try:
            value = json.loads(line)
        except ValueError:
            continue
        with state_lock:
            if closed:
                return
            event = value.get('event')
            if event == 'utterance' and enabled and not busy:
                busy = True
                emit('status', state='transcribing')
                pool.submit(recognize, generation)
            elif event == 'level':
                emit('level', level=value.get('level', 0))
            elif event == 'error':
                emit('error', message=value.get('message', 'Falha no microfone.'))
            elif event == 'ready':
                sync()
    if not closed:
        emit('error', message='A captura do microfone parou. Reabra o aplicativo.')


def speak(text, token):
    global busy, player
    try:
        for chunk in speech_chunks(text):
            with state_lock:
                if token != generation or muted or closed:
                    return
                emit('status', state='synthesizing')
            path = voice.synthesize(chunk)
            with state_lock:
                if token != generation or muted or closed:
                    return
                emit('status', state='speaking')
                player = subprocess.Popen(['mpv', '--no-video', '--no-terminal', '--really-quiet', path], stdout=sys.stderr, stderr=sys.stderr)
            if player.wait(timeout=180):
                raise RuntimeError('Não foi possível reproduzir a voz. Confira a saída de áudio.')
        time.sleep(.8)  # Let speaker echo fade before resuming capture.
    except Exception as exc:
        emit('error', message=str(exc))
    finally:
        with state_lock:
            if token == generation and not closed:
                busy = False
                sync()


def main():
    global listener, enabled, busy, muted, generation, closed
    env = {**os.environ, 'HF_HUB_OFFLINE': '1', 'OMP_NUM_THREADS': '1', 'PYTHONUNBUFFERED': '1'}
    listener = subprocess.Popen([str(ROOT / '.voice/bin/python'), str(ROOT / 'audio_worker.py')],
        cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr, text=True, bufsize=1, env=env)
    capture('pause')
    threading.Thread(target=listen_events, daemon=True).start()
    try:
        for line in sys.stdin:
            value = json.loads(line)
            with state_lock:
                command = value.get('command')
                if command == 'stop':
                    break
                if command == 'listen':
                    enabled = value.get('enabled') is True
                    sync()
                elif command == 'mute':
                    muted = value.get('muted') is True
                    if muted and player and player.poll() is None:
                        player.terminate()
                elif command == 'busy':
                    generation += 1
                    busy = value.get('busy') is True
                    if player and player.poll() is None:
                        player.terminate()
                    sync()
                elif command == 'speak':
                    generation += 1
                    text = str(value.get('text', ''))[:12000]
                    busy = bool(text) and not muted
                    sync()
                    if busy:
                        pool.submit(speak, text, generation)
    finally:
        closed = True
        capture('stop')
        for process in (listener, player):
            if process and process.poll() is None:
                process.terminate()
        voice.close()
        pool.shutdown(wait=False, cancel_futures=True)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    main()
