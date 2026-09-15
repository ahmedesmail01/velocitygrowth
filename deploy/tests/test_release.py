"""Linux-only release control-flow checks; Docker is mocked, no containers start."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

source = (Path(__file__).resolve().parents[1] / 'release.sh').read_text()
for mode in ['success', 'pull_failure', 'startup_failure']:
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        state = root / 'state'
        state.mkdir()
        (state / 'current').write_text('a' * 40 + '\n')
        env_file = root / 'worker.env'
        env_file.write_text('TEST_ONLY=true\n')
        release = root / 'release.sh'
        release.write_text(source.replace('/etc/velocitygrowth/worker.env', str(env_file))
                          .replace('/var/lib/velocitygrowth', str(state)))
        mock = root / 'docker'
        mock.write_text('''#!/usr/bin/env python3
import os,sys,json
with open(os.environ['CALLS'],'a') as out:
 out.write(json.dumps([os.environ.get('VERSION'),sys.argv[1:]])+'\\n')
if os.environ['MODE']=='pull_failure' and 'pull' in sys.argv: sys.exit(1)
if os.environ['MODE']=='startup_failure' and 'up' in sys.argv and os.environ['VERSION']=='b'*40: sys.exit(1)
''')
        mock.chmod(0o755)
        log = root / 'calls'
        env = dict(os.environ, PATH=str(root)+os.pathsep+os.environ['PATH'], MODE=mode, CALLS=str(log))
        result = subprocess.run(['bash', str(release), 'b'*40], env=env, capture_output=True, text=True)
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        current = (state / 'current').read_text().strip()
        if mode == 'success':
            assert result.returncode == 0, result.stderr
            assert current == 'b'*40
            assert (state / 'previous').read_text().strip() == 'a'*40
        else:
            assert result.returncode != 0
            assert current == 'a'*40
            if mode == 'pull_failure':
                assert not any('up' in args for _, args in calls)
            else:
                assert any(version == 'a'*40 and 'up' in args for version, args in calls)
        print('PASS:', mode)
