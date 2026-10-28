"""Speech endpoints independent from UI and model inference (16 kHz PCM)."""
from collections import deque


class SpeechEndpoint:
    FRAME_SAMPLES = 512
    RATE = 16000

    def __init__(self, silence_ms=960, min_speech_ms=320, max_seconds=30):
        self.silence_frames = max(1, round(silence_ms / 32))
        self.min_frames = max(1, round(min_speech_ms / 32))
        self.max_frames = round(max_seconds * self.RATE / self.FRAME_SAMPLES)
        self.reset()

    def reset(self):
        self.preroll = deque(maxlen=10)
        self.frames = []
        self.active = False
        self.onset = 0
        self.voiced = 0
        self.quiet = 0

    def push(self, probability, pcm):
        if not self.active:
            self.preroll.append(pcm)
            self.onset = self.onset + 1 if probability >= .6 else 0
            if self.onset >= 3:
                self.active = True
                self.voiced = self.onset
                self.frames = list(self.preroll)
                return 'start', None
            return None, None
        self.frames.append(pcm)
        if probability >= .35:
            self.voiced += 1
            self.quiet = 0
        else:
            self.quiet += 1
        if self.quiet >= self.silence_frames or len(self.frames) >= self.max_frames:
            pcm = b''.join(self.frames) if self.voiced >= self.min_frames else None
            self.reset()
            return ('utterance', pcm) if pcm else ('discard', None)
        return None, None
