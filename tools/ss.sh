#!/bin/bash
# push current changes and wait for the preview pipeline to render the requested screens
set -e
cd "$(dirname "$0")/.."
printf '%s' "$1" > tools/shots.txt
git add -A tools www .github
git -c http.version=HTTP/1.1 commit -q -m "chore: refresh previews (${1:-all})" || true
git -c http.version=HTTP/1.1 push -q origin arena/5fd27e85-bigfile
sleep 10
RUN=$(gh run list --repo jhanyrmdan034-arch/bigfile --workflow preview.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "run=$RUN"
gh run watch "$RUN" --repo jhanyrmdan034-arch/bigfile --exit-status --interval 15 2>&1 | grep -E "✓|X" | tail -3
git pull -q --no-rebase origin arena/5fd27e85-bigfile
echo done
