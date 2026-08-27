#!/usr/bin/env bash
#
# Runs the tars-smoke harness against a live Obsidian and files the result.
#
# Needs: the vault open, "Command line interface" on under Settings > General >
# Advanced, and both plugins deployed (`npm run build`, `npm run smoke`, copy).
#
# Usage:
#   VAULT="$HOME/path/to/vault" scripts/smoke-run.sh          # everything
#   VAULT=... scripts/smoke-run.sh --free                     # skip chat(), spend nothing
#
# cors() and sdk() use a deliberately invalid key and cost nothing. chat() sends
# one real question through every configured provider and DOES spend credit.

set -uo pipefail

VAULT="${VAULT:?set VAULT to the vault holding the tars-smoke plugin}"
OUT_DIR="$VAULT/Tars/smoke"
STAMP=$(date +%Y-%m-%d-%H%M%S)
OUT="$OUT_DIR/$STAMP.md"
FREE=0
[ "${1:-}" = "--free" ] && FREE=1

if ! obsidian version >/dev/null 2>&1; then
	echo "Obsidian CLI is not answering."
	echo "Turn it on: Settings > General > Advanced > Command line interface."
	exit 1
fi

mkdir -p "$OUT_DIR"

# `obsidian eval` prefixes its result with "=> "; strip it so the tables line up.
run() {
	obsidian eval code="(async()=>app.plugins.plugins['tars-smoke'].$1)()" 2>&1 | sed '1s/^=> //'
}

{
	echo "# Smoke run $STAMP"
	echo
	echo "- vault: \`$(basename "$VAULT")\`"
	echo "- tars: $(python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null || echo '?')"
	echo "- commit: $(git rev-parse --short HEAD 2>/dev/null || echo '?')$(git diff --quiet 2>/dev/null || echo ' (dirty)')"
	echo
	echo "## cors — can the browser reach it, and is CORS or the network to blame"
	echo
	echo '```'
	run "cors()"
	echo '```'
	echo
	echo "## sdk — through the OpenAI SDK, with and without its X-Stainless-* headers"
	echo
	echo '```'
	run "sdk()"
	echo '```'
	if [ "$FREE" = 0 ]; then
		echo
		echo "## chat — every configured provider, one real question"
		echo
		echo '```'
		run "chat({timeoutMs:30000})"
		echo '```'
	fi
	echo
	echo "## errors captured during the run"
	echo
	echo '```'
	obsidian dev:errors 2>&1
	echo '```'
} >"$OUT"

echo "wrote $OUT"
