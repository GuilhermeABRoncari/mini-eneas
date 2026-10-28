"""Local continuous PipeWire capture + Silero VAD. JSON commands on stdin.

Capture is discarded while paused. Only completed speech is written to disk.
--input exercises the exact detector using a WAV instead of the microphone.
"""
import argparse
import array
import contextlib
import json
import math
import os
from pathlib import Path
import queue
import select
import signal
import subprocess
import sys
import threading
import time
import wave

from core import ROOT, DATA
from listening import SpeechEndpoint


def emit(event, **values):
    print(json.dumps({'event': event, **values}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path, default=DATA / 'recording.wav')
    args = parser.parse_args()
    capture = None
    capture_log = None
    commands = queue.Queue()
    def receive_commands():
        for line in sys.stdin:
            try:
                commands.put(json.loads(line).get('command'))
            except ValueError:
                pass
        commands.put('stop')
    if not args.input:
        threading.Thread(target=receive_commands, daemon=True).start()
    def terminate(*_):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            from silero_vad import load_silero_vad
            torch.set_num_threads(1)
            model = load_silero_vad()
        detector = SpeechEndpoint()
        paused = False
        if args.input:
            source = wave.open(str(args.input), 'rb')
            if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (16000, 1, 2):
                raise RuntimeError('O teste precisa de WAV mono, 16 kHz, PCM 16-bit.')
        else:
            capture_log = open(DATA / 'microphone-capture.log', 'a')
            capture = subprocess.Popen(['pw-record', '--raw', '--rate=16000',
                '--channels=1', '--format=s16', '-'], stdout=subprocess.PIPE,
                stderr=capture_log, bufsize=0)
        emit('ready')
        pending = bytearray()
        last_level = 0
        while True:
            while not commands.empty():
                command = commands.get_nowait()
                if command == 'stop':
                    return
                if command in ('pause', 'resume'):
                    paused = command == 'pause'
                    detector.reset()
                    model.reset_states()
                    pending.clear()
                    emit('paused' if paused else 'listening')
            if args.input:
                raw = source.readframes(512)
                if not raw:
                    break
            else:
                if capture.poll() is not None:
                    raise RuntimeError('O microfone fechou. Veja data/microphone-capture.log.')
                readable, _, _ = select.select([capture.stdout], [], [], .1)
                if not readable:
                    continue
                raw = os.read(capture.stdout.fileno(), 4096)
                if not raw:
                    raise RuntimeError('O microfone não está entregando áudio.')
            if paused:
                continue
            pending.extend(raw)
            while len(pending) >= 1024:
                frame = bytes(pending[:1024])
                del pending[:1024]
                samples = array.array('h', frame)
                rms = math.sqrt(sum(value * value for value in samples) / len(samples))
                db = 20 * math.log10(max(rms / 32768, 1e-6))
                # No per-frame normalization: it would amplify quiet noise.
                tensor = torch.tensor(samples, dtype=torch.float32) / 32768
                with torch.inference_mode():
                    probability = model(tensor, 16000).item()
                now = time.monotonic()
                if now - last_level > .12:
                    emit('level', level=max(0, min(100, int((db + 60) * 100 / 60))),
                         speech=probability > .6)
                    last_level = now
                event, pcm = detector.push(probability, frame)
                if event == 'start':
                    emit('speech_start')
                elif event == 'discard':
                    emit('listening')
                elif event == 'utterance':
                    output = args.output
                    temporary = output.with_suffix('.tmp.wav')
                    with wave.open(str(temporary), 'wb') as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(16000)
                        wav.writeframes(pcm)
                    temporary.replace(output)
                    # Pause immediately, before the GUI has even received this
                    # event. No second utterance can sneak into the same turn.
                    paused = True
                    pending.clear()
                    emit('utterance', path=str(output))
                    break
        emit('eof')
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        emit('error', message=str(exc))
        return 1
    finally:
        if capture and capture.poll() is None:
            capture.terminate()
            try:
                capture.wait(timeout=2)
            except subprocess.TimeoutExpired:
                capture.kill()
                capture.wait()
        if capture_log:
            capture_log.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
