"""Local conversation, bounded memory, and subprocess lifecycle."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
import tempfile
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
SYSTEM = '''Você é Mini Enéas, um personagem virtual caricatural inspirado no estilo
de Enéas Carneiro. Converse em português brasileiro. Seja enfático, culto, direto,
bem-humorado e um pouco impaciente, mas afetuoso com seu companheiro. Use frases
curtas e uma explicação concreta. Não grite o tempo todo nem repita bordões em toda
resposta. Responda para uma conversa falada: no máximo duas frases, até 35 palavras.
Não descreva gestos, não use
asteriscos, emojis ou marcação. Você pode explicar ciência, conversar sobre o dia,
ajudar a organizar ideias e responder perguntas. Se provocarem você, reclame de
forma teatral e divertida, sem crueldade. Reconheça incerteza; nunca invente fatos
ou afirme ter executado ações. Você não acessa Telegram, arquivos ou ferramentas.
Se perguntarem sua identidade real, explique que é uma interpretação virtual,
não a pessoa histórica. Não faça campanha política espontaneamente.'''
SYSTEM += ''' Responda diretamente à intenção da pergunta. Explique algo útil,
em vez de repetir a pergunta ou encerrar toda resposta com uma pergunta genérica.
Se a frase estiver confusa, peça uma repetição curta. Não invente o que ouviu.'''


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def clean_reply(text):
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.S)
    if '<think>' in text:
        text = text.split('<think>', 1)[0]
    text = re.sub(r'[*#`]', '', text).strip()
    if not text:
        raise RuntimeError('O modelo não produziu uma resposta. Tente novamente.')
    # Keep speech short without cutting words in the middle.
    if len(text) > 650:
        text = text[:650].rsplit(' ', 1)[0].rstrip(',;:') + '.'
    return text


def speech_key(text):
    reference = ROOT / 'assets' / 'eneas-reference.wav'
    signature = str(reference.stat().st_mtime_ns) if reference.exists() else 'missing'
    return hashlib.sha256(('ptbr-verified-v2:' + signature + ':' + text).encode()).hexdigest()[:24]


def speech_chunks(text, limit=260):
    """Keep normal replies together: tiny sentence fragments degrade cloning."""
    chunks = []
    chunk = ''
    for sentence in re.split(r'(?<=[.!?;])\s+', text.strip()):
        words = sentence.split()
        for word in words:
            if chunk and len(chunk) + len(word) + 1 > limit:
                chunks.append(chunk)
                chunk = ''
            chunk = (chunk + ' ' + word).strip()
    if chunk:
        chunks.append(chunk)
    return chunks


def extract_transcription(output):
    """Voxtype writes banners and even INFO logs to stdout, including in quiet mode."""
    output = re.sub(r'\x1b\[[0-9;]*m', '', output)
    metadata = re.compile(r'^(?:Loading audio file:|Audio format:|Processing \d|'
        r'\d{4}-\d\d-\d\d[T ]|whisper_|ggml_|system_info:|'
        r'(?:TRACE|DEBUG|INFO|WARN|ERROR)\s)')
    lines = [line.strip() for line in output.splitlines()
             if line.strip() and not metadata.match(line.strip())]
    text = '\n'.join(lines)
    text = re.sub(r'\[[^\]]*\]|\([^)]*\)', '', text).strip()
    if not re.search(r'[A-Za-zÀ-ÿ]', text):
        return ''
    if any(credit in text.casefold() for credit in ('legendas pela comunidade', 'amara.org')):
        return ''
    return text


def integer_words(number):
    small = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete',
             'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze',
             'dezesseis', 'dezessete', 'dezoito', 'dezenove']
    if number < 20:
        return small[number]
    if number < 100:
        tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta',
                'setenta', 'oitenta', 'noventa'][number // 10]
        return tens + (' e ' + small[number % 10] if number % 10 else '')
    if number == 100:
        return 'cem'
    if number < 1000:
        hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
                    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'][number // 100]
        return hundreds + (' e ' + integer_words(number % 100) if number % 100 else '')
    if number < 1000000:
        prefix = (integer_words(number // 1000) + ' ' if number >= 2000 else '') + 'mil'
        remainder = number % 1000
        joiner = ' e ' if remainder < 100 or remainder % 100 == 0 else ' '
        return prefix + (joiner + integer_words(remainder) if remainder else '')
    return str(number)


def normalized_words(text):
    text = ''.join(char for char in unicodedata.normalize('NFD', text.casefold())
                   if unicodedata.category(char) != 'Mn')
    text = re.sub(r'(\d):(\d)', r'\1 e \2', text)
    aliases = {'eneias': 'eneas', 'uma': 'um', 'duas': 'dois', 'quatorze': 'catorze',
               'duzentas': 'duzentos', 'trezentas': 'trezentos'}
    words = []
    for word in re.findall(r'[a-z0-9]+', text):
        expanded = integer_words(int(word)).split() if word.isdigit() and len(word) < 7 else [word]
        words.extend(aliases.get(token, token) for token in expanded)
    return words


def speech_accuracy(expected, actual):
    """Word edit distance catches missing, unrelated, or repeated speech."""
    expected, actual = normalized_words(expected), normalized_words(actual)
    if not expected or not actual:
        return 0.0
    # A wrong place name changes the meaning even when most words match.
    for anchor in ('brasil', 'brasilia'):
        if anchor in expected and anchor not in actual:
            return 0.0
    previous = list(range(len(actual) + 1))
    for index, word in enumerate(expected, 1):
        current = [index]
        for other_index, other in enumerate(actual, 1):
            current.append(min(current[-1] + 1, previous[other_index] + 1,
                               previous[other_index - 1] + (word != other)))
        previous = current
    return max(0.0, 1 - previous[-1] / len(expected))


def transcribe_audio(path):
    import wave
    path = Path(path)
    temporary = None
    try:
        with wave.open(str(path)) as wav:
            convert = (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (16000, 1, 2)
        if convert:
            fd, temporary = tempfile.mkstemp(suffix='.wav', dir=DATA)
            os.close(fd)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(path),
                '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', temporary],
                capture_output=True, check=True, timeout=30)
            path = Path(temporary)
        model = 'small' if (ROOT / 'models/ggml-small.bin').exists() else 'base'
        result = subprocess.run(['voxtype', '--quiet', '-c', str(ROOT / 'voxtype.toml'),
            '--model', model, '--language', 'pt', '--threads', '4', 'transcribe', str(path)],
            capture_output=True, text=True, timeout=120, cwd=ROOT)
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)
    if result.returncode:
        raise RuntimeError('Falha ao reconhecer sua fala: ' + result.stderr[-300:])
    return extract_transcription(result.stdout)


class Brain:
    def __init__(self):
        self.process = None
        self.log = None
        self.port = None
        self.api_key = secrets.token_urlsafe(32)
        self.lock = threading.Lock()
        self.start_lock = threading.Lock()
        self.closed = False
        history = read_json(DATA / 'history.json', [])
        if isinstance(history, list) and any(isinstance(message, dict) and
                message.get('role') == 'user' and
                str(message.get('content', '')).startswith('Loading audio file:')
                for message in history):
            # Preserve the original before removing turns contaminated by logs.
            backup = DATA / 'history-before-transcription-fix.json'
            if not backup.exists():
                write_json(backup, history)
            history = []
            write_json(DATA / 'history.json', history)
        self.history = [m for m in history if isinstance(m, dict)
                        and m.get('role') in ('user', 'assistant')
                        and isinstance(m.get('content'), str)][-20:] if isinstance(history, list) else []

    def request(self, path, payload=None, timeout=180):
        url = f'http://127.0.0.1:{self.port}{path}'
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(url, data=body, headers={
            'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.api_key})
        # Local traffic must never go through an environment-configured proxy.
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as response:
            return json.load(response)

    def start(self):
        with self.start_lock:
            return self._start()

    def _start(self):
        if self.closed:
            raise RuntimeError('O assistente está encerrando.')
        if self.process and self.process.poll() is None:
            return
        import socket
        binary = next(iter((ROOT / 'bin').rglob('llama-server')), None)
        model = ROOT / 'models/qwen3-1.7b-q4_k_m.gguf'
        if binary is None or not model.exists():
            raise RuntimeError('Modelo de conversa ausente. Veja o README para instalar.')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        env = os.environ.copy()
        env['LD_LIBRARY_PATH'] = str(binary.parent) + ':' + env.get('LD_LIBRARY_PATH', '')
        self.log = open(DATA / 'brain.log', 'a')
        self.process = subprocess.Popen([
            str(binary), '-m', str(model), '--host', '127.0.0.1',
            '--port', str(self.port), '-c', '4096', '-t', '4', '-tb', '6',
            '-ngl', '0', '--parallel', '1', '--jinja', '--no-webui',
            '--api-key', self.api_key,
        ], stdout=self.log, stderr=self.log, env=env)
        for _ in range(180):
            if self.process.poll() is not None:
                raise RuntimeError('A IA local não iniciou. Detalhes em data/brain.log.')
            try:
                self.request('/health', timeout=1)
                return
            except Exception:
                time.sleep(.5)
        self.close()
        raise RuntimeError('A IA demorou para iniciar. Tente abrir novamente.')

    def reply(self, text, irritation=0):
        with self.lock:
            self.start()
            system = SYSTEM + f'\nSeu nível de irritação atual é {irritation}/5.'
            # A failed request never leaves a half-turn in persisted memory.
            history = []
            budget = max(0, 6500 - len(system) - len(text[:2000]))
            for index in range(len(self.history) - 2, -1, -2):
                pair = self.history[index:index + 2]
                size = sum(len(message['content']) for message in pair)
                if size > budget:
                    break
                history = pair + history
                budget -= size
            messages = [{'role': 'system', 'content': system}] + history + [
                {'role': 'user', 'content': text[:2000]}]
            result = self.request('/v1/chat/completions', {
                'messages': messages, 'max_tokens': 220, 'temperature': .75,
                'top_p': .9, 'chat_template_kwargs': {'enable_thinking': False},
            })
            reply = clean_reply(result['choices'][0]['message']['content'])
            self.history.extend([{'role': 'user', 'content': text[:2000]},
                                 {'role': 'assistant', 'content': reply}])
            self.history = self.history[-20:]
            write_json(DATA / 'history.json', self.history)
            return reply

    def forget(self):
        with self.lock:
            self.history = []
            write_json(DATA / 'history.json', [])

    def close(self):
        self.closed = True
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        if self.log:
            self.log.close()


class Voice:
    """Persistent synthesis process. No network access after model installation."""
    def __init__(self):
        self.process = None
        self.log = None
        self.lock = threading.Lock()

    def prepare(self):
        self.exchange({'warmup': True})

    def synthesize(self, text):
        target = DATA / 'speech' / (speech_key(text) + '.wav')
        report = read_json(target.with_suffix('.json'), {})
        if target.exists() and report.get('accepted') and report.get('text') == text:
            return str(target)
        return self.exchange({'text': text})['path']

    def exchange(self, request):
        with self.lock:
            if not self.process or self.process.poll() is not None:
                executable = ROOT / '.voice/bin/python'
                if not executable.exists():
                    raise RuntimeError('O ambiente de voz não está instalado.')
                if self.log:
                    self.log.close()
                self.log = open(DATA / 'voice.log', 'a')
                env = os.environ.copy()
                env.update(HF_HOME=str(ROOT / 'models/huggingface'),
                           HF_HUB_OFFLINE='1', NUMBA_CACHE_DIR=str(DATA / 'numba'),
                           OMP_NUM_THREADS='4', MKL_NUM_THREADS='4',
                           MINI_ENEAS_INT8='0',
                           PYTHONUNBUFFERED='1')
                self.process = subprocess.Popen([str(executable), str(ROOT / 'voice_worker.py')],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log,
                    text=True, bufsize=1, env=env)
            self.process.stdin.write(json.dumps(request, ensure_ascii=False) + '\n')
            self.process.stdin.flush()
            for line in self.process.stdout:
                try:
                    result = json.loads(line)
                except ValueError:
                    continue
                if 'error' in result:
                    raise RuntimeError(result['error'])
                if 'path' in result or result.get('ready'):
                    return result
            raise RuntimeError('A voz não iniciou. Veja data/voice.log.')

    def close(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        if self.log:
            self.log.close()
