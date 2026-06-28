#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-report}" # report | strict

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) not found; skipping UI audit."
  exit 0
fi

declare -a PATTERNS=(
  "#ffffff"
  "background:\\s*#ffffff"
  "border:\\s*1px\\s+solid\\s+rgba\\("
  "box-shadow:.*rgba\\("
)

echo "UI audit ($MODE): scanning src/admin for style drift…"

FAIL=0
for P in "${PATTERNS[@]}"; do
  if rg -n "$P" src/admin -S >/dev/null 2>&1; then
    echo
    echo "Matches for pattern: $P"
    rg -n "$P" src/admin -S || true
    if [[ "$MODE" == "strict" ]]; then
      FAIL=1
    fi
  fi
done

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "UI audit: OK (no blocking issues)."
else
  echo "UI audit: FAILED (style drift detected)."
fi

exit "$FAIL"

