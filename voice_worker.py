"""Chatterbox Portuguese voice cloning; one model load per desktop session."""
import contextlib
import json
import os
from pathlib import Path
import sys
import traceback

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from core import DATA, speech_key, transcribe_audio, speech_accuracy, write_json


def load_model():
    import torch
    torch.set_num_threads(4)
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from chatterbox.models.tokenizers.tokenizer import ChineseCangjieConverter
    def portuguese_only(converter, model_dir=None):
        converter.word2cj = {}
        converter.cj2word = {}
        converter.segmenter = None
    ChineseCangjieConverter.__init__ = portuguese_only
    from chatterbox import mtl_tts as components
    from safetensors.torch import load_file
    directory = ROOT / 'models/chatterbox-ptbr'
    ve = components.VoiceEncoder()
    ve.load_state_dict(torch.load(ROOT / 'models/chatterbox/ve.pt', map_location='cpu', weights_only=True))
    ve.eval()
    t3 = components.T3(components.T3Config.multilingual())
    t3.load_state_dict(load_file(str(directory / 't3_pt_br.safetensors')))
    t3.eval()
    decoder = components.S3Gen()
    missing, unexpected = decoder.load_state_dict(torch.load(
        directory / 's3gen_v3.pt', map_location='cpu', weights_only=True), strict=False)
    # The official V3 decoder omits these deterministic frontend buffers;
    # S3Gen constructs them from the sampling configuration on initialization.
    missing_weights = set(missing) - {'tokenizer._mel_filters', 'tokenizer.window'}
    if missing_weights:
        raise RuntimeError('Decoder brasileiro incompatível: ' + str(sorted(missing_weights)[:8]))
    if unexpected:
        print('Additional official decoder buffers:', unexpected, file=sys.stderr)
    decoder.eval()
    tokenizer = components.MTLTokenizer(str(directory / 'grapheme_mtl_merged_expanded_v1.json'))
    model = ChatterboxMultilingualTTS(t3, decoder, ve, tokenizer, 'cpu')
    reference = ROOT / 'assets/eneas-reference.wav'
    if not reference.exists():
        raise RuntimeError('Falta o áudio de referência da voz em assets/eneas-reference.wav.')
    model.prepare_conditionals(str(reference), exaggeration=.35)
    return model


def main():
    model = None
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get('warmup'):
                with contextlib.redirect_stdout(sys.stderr):
                    if model is None:
                        model = load_model()
                print(json.dumps({'ready': True}), flush=True)
                continue
            text = request['text'][:650]
            output = DATA / 'speech' / (speech_key(text) + '.wav')
            output.parent.mkdir(exist_ok=True)
            verification = output.with_suffix('.json')
            if not output.exists() or not verification.exists():
                with contextlib.redirect_stdout(sys.stderr):
                    import torch
                    import soundfile as sf
                    import time
                    if model is None:
                        model = load_model()
                    accepted = False
                    for attempt in range(2):
                        torch.manual_seed(187 + attempt * 1000)
                        started = time.monotonic()
                        wav = model.generate(text, language_id='pt',
                            exaggeration=.35 if attempt == 0 else .25,
                            cfg_weight=.65 if attempt == 0 else .9,
                            temperature=.6 if attempt == 0 else .5)
                        temporary = output.with_suffix('.tmp.wav')
                        sf.write(str(temporary), wav.squeeze(0).detach().cpu().numpy(), model.sr)
                        recognized = transcribe_audio(temporary)
                        accuracy = speech_accuracy(text, recognized)
                        report = {'text': text, 'recognized': recognized, 'accuracy': accuracy,
                                  'accepted': accuracy >= .75, 'attempt': attempt + 1,
                                  'seconds': round(time.monotonic() - started, 2),
                                  'model': 'Chatterbox-Multilingual-pt-br-fp32',
                                  'reference': str(ROOT / 'assets/eneas-reference.wav')}
                        with open(DATA / 'voice-quality.jsonl', 'a') as log:
                            log.write(json.dumps(report, ensure_ascii=False) + '\n')
                        if accuracy >= .75:
                            temporary.replace(output)
                            write_json(verification, report)
                            accepted = True
                            break
                        rejected = DATA / 'rejected-voice'
                        rejected.mkdir(exist_ok=True)
                        temporary.replace(rejected / (output.stem + f'-{attempt + 1}.wav'))
                    if not accepted:
                        raise RuntimeError('A síntese não pronunciou a resposta corretamente após duas tentativas. '
                                           'Use Repetir última fala para tentar novamente.')
            print(json.dumps({'path': str(output)}), flush=True)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({'error': str(exc)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
