import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, Mock
spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[1] / 'desktop/audio_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class AudioLifecycle(unittest.TestCase):
    def setUp(self):
        bridge.generation=1
        bridge.closed=False
        bridge.muted=False
        bridge.busy=True
        bridge.enabled=True
        bridge.player=None

    def test_cancel_during_synthesis_never_plays_stale_audio(self):
        def synthesize(_):
            bridge.generation=2
            return '/tmp/stale.wav'
        with patch.object(bridge.voice,'synthesize',side_effect=synthesize), patch.object(bridge.subprocess,'Popen') as play, patch.object(bridge,'emit'), patch.object(bridge,'sync') as sync:
            bridge.speak('Resposta anterior.',1)
            play.assert_not_called()
            sync.assert_not_called()

    def test_playback_finishes_before_microphone_resumes(self):
        order=[]
        process=Mock();process.wait.side_effect=lambda **_:order.append('finished') or 0
        with patch.object(bridge.voice,'synthesize',return_value='/tmp/voice.wav'), patch.object(bridge.subprocess,'Popen',return_value=process), patch.object(bridge,'emit'), patch.object(bridge.time,'sleep'), patch.object(bridge,'sync',side_effect=lambda:order.append('resume')):
            bridge.speak('Resposta completa.',1)
        self.assertEqual(order,['finished','resume'])
        self.assertFalse(bridge.busy)

    def test_empty_recognition_releases_microphone(self):
        with patch.object(bridge,'transcribe_audio',return_value=''),patch.object(bridge,'sync') as sync:
            bridge.recognize(1)
            sync.assert_called_once()
        self.assertFalse(bridge.busy)

    def test_pausing_during_recognition_drops_transcript(self):
        bridge.enabled=False
        with patch.object(bridge,'transcribe_audio',return_value='fala antiga'),patch.object(bridge,'emit') as emit,patch.object(bridge,'sync'):
            bridge.recognize(1)
            emit.assert_not_called()

if __name__=='__main__':unittest.main()
