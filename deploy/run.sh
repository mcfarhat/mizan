#!/usr/bin/env bash
# Server-side command runner for remote.bat: reads one line of arguments from a file (quoted like a shell,
# but NOT shell-expanded, so "$6 into halal AI" stays literal) and runs the matching script as user mizan.
set -u
F="${1:?args file}"
python3 - "$F" <<'PY'
import shlex, subprocess, sys
args = shlex.split(open(sys.argv[1], encoding='utf-8', errors='replace').read().strip())
allowed = {'agent', 'buy', 'verify', 'trapcheck', 'engines', 'report'}
if not args or args[0] not in allowed:
    print('usage: remote.bat <agent|buy|verify|trapcheck|engines|report> [args...]'); sys.exit(1)
cmd = ['sudo', '-u', 'mizan', '-H', 'node', f'scripts/{args[0]}.mjs', *args[1:]]
sys.exit(subprocess.call(cmd, cwd='/opt/mizan'))
PY
