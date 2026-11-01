#!/bin/bash
# trigger the preview pipeline, wait for it and pull the results
set -e
cd "$(dirname "$0")/.."
SHOTS_CSV="$1"
if [ -n "$SHOTS_CSV" ]; then
  gh workflow run preview.yml --repo jhanyrmdan034-arch/bigfile --ref arena/5fd27e85-bigfile -f shots="$SHOTS_CSV"
else
  gh workflow run preview.yml --repo jhanyrmdan034-arch/bigfile --ref arena/5fd27e85-bigfile
fi
sleep 8
RUN=$(gh run list --repo jhanyrmdan034-arch/bigfile --workflow preview.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "run=$RUN"
gh run watch "$RUN" --repo jhanyrmdan034-arch/bigfile --exit-status --interval 15 2>&1 | grep -E "✓|X" | tail -3
git pull -q --no-rebase origin arena/5fd27e85-bigfile
