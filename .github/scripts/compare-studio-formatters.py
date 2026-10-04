"""Run identical offline selections and reject new failures/skips/missing tests.

Node20 does not expand the package scripts' quoted globs. Expand those exact
patterns here without changing package.json or hiding the existing scripts failure.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import subprocess

PATTERNS = {
    'server': ['server/*.test.mjs', 'server/lib/*.test.js', 'server/lib/wellhub/*.test.js'],
    'scripts': ['scripts/*.test.mjs'],
}


def summarize(raw, checkout, exit_code):
    normalized = raw.replace(str(checkout.resolve()), '<repo>')
    counts = {k: int(v) for k, v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', normalized, re.M)}
    assert set(counts) == {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}, 'Missing TAP totals'
    entries = []
    for match in re.finditer(r'^(not ok|ok) \d+ - (.*)$', normalized, re.M):
        status, name = match.groups()
        directive = re.search(r'\s+# (SKIP|TODO)\b', name)
        if directive:
            name, status = name[:directive.start()], directive.group(1).lower()
        else:
            status = 'pass' if status == 'ok' else 'fail'
        entries.append({'name': name, 'status': status})
    assert entries, 'No test results'
    assert counts['cancelled'] == 0, 'Cancelled tests are not an acceptable baseline'
    assert (exit_code == 0) == (counts['fail'] == 0), 'Runner exit and TAP totals disagree'
    diagnostics = re.findall(r'^# (?:\w*Error)(?: \[[^\]]+\])?: .+$', normalized, re.M)
    return {'exitCode': exit_code, 'counts': counts, 'entries': entries, 'errorDiagnostics': diagnostics}


def compare(before, after):
    old = Counter((r['name'], r['status']) for r in before['entries'])
    new = Counter((r['name'], r['status']) for r in after['entries'])
    missing = list((old-new).elements())
    added = list((new-old).elements())
    errors = []
    if missing: errors.append({'missingOrChangedTests': missing})
    if any(status != 'pass' for _, status in added): errors.append({'nonPassingAddedTests': added})
    if before['errorDiagnostics'] != after['errorDiagnostics']: errors.append('Error diagnostics changed')
    for key in ['fail', 'cancelled', 'skipped', 'todo']:
        if before['counts'][key] != after['counts'][key]: errors.append(f'{key} count changed')
    delta = after['counts']['tests']-before['counts']['tests']
    if delta != after['counts']['pass']-before['counts']['pass'] or delta != len(added):
        errors.append('Test-count delta is not entirely accounted for by added passing tests')
    return {'status': 'FAIL' if errors else 'PASS_NO_NEW_FAILURES', 'errors': errors, 'addedPassingTests': [name for name, _ in added]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # Explicit environment: no inherited application credentials or opt-in DB URLs.
    env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR'] if k in os.environ}
    env.update({'TZ': 'UTC', 'CI': 'true'})
    node = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
    assert node == 'v20.19.5', node
    report = {'node': node, 'scope': 'Offline server and scripts selections; existing opt-in DB/API tests remain skipped.', 'versions': {}}
    for label, checkout in [('baseline', args.baseline), ('candidate', args.candidate)]:
        result = {'sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip(), 'suites': {}}
        for suite, patterns in PATTERNS.items():
            files = [str(p.relative_to(checkout)) for pattern in patterns for p in sorted(checkout.glob(pattern))]
            assert files, f'Empty selection {suite}'
            cmd = ['node', '--test', '--test-concurrency=1', *files]
            run = subprocess.run(cmd, cwd=checkout, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=180)
            (args.output/f'{label}-{suite}.tap').write_text(run.stdout)
            summary = summarize(run.stdout, checkout, run.returncode)
            summary['files'] = files
            summary['command'] = cmd
            result['suites'][suite] = summary
        report['versions'][label] = result
    report['comparison'] = {suite: compare(report['versions']['baseline']['suites'][suite], report['versions']['candidate']['suites'][suite]) for suite in PATTERNS}
    report['status'] = 'PASS_NO_NEW_FAILURES' if all(x['status']=='PASS_NO_NEW_FAILURES' for x in report['comparison'].values()) else 'FAIL'
    (args.output/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'node': node, 'status': report['status'], 'counts': {k: {s: r['counts'] for s, r in v['suites'].items()} for k, v in report['versions'].items()}}, ensure_ascii=False, indent=2))
    if report['status'] != 'PASS_NO_NEW_FAILURES': raise SystemExit(1)


if __name__ == '__main__':
    main()
