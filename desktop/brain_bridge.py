import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import core
from core import Brain
# Keep context in the Electron session, as with the other providers.
core.write_json = lambda *_: None
brain = Brain()
# The Electron service owns this session's context; don't import old UI history.
brain.history = []
try:
    for line in sys.stdin:
        value = json.loads(line)
        brain.history = value['messages'][:-1]
        result = brain.reply(value['messages'][-1]['content'])
        print(json.dumps({'text': result}, ensure_ascii=False), flush=True)
finally:
    brain.close()
