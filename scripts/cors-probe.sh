#!/usr/bin/env bash
#
# CORS preflight probe for Obsidian providers.
#
# Obsidian's renderer runs at origin app://obsidian.md, so every provider call is
# a cross-origin request and is subject to a CORS preflight. This script asks each
# provider's endpoint the same OPTIONS question the browser would, and applies the
# Fetch spec's preflight rules to the answer. It is a fast oracle, not a substitute
# for a real call: it says nothing about whether the response *stream* works.
#
# The main thing it catches: the OpenAI SDK attaches eight X-Stainless-* headers to
# every request. A provider whose Access-Control-Allow-Headers is a fixed allowlist
# rejects the preflight because of them, even though the request itself is fine.
# Each endpoint is therefore probed twice, with and without those headers.
#
# SCOPE: this reports what a provider *advertises* over its own network path. It is
# not the verdict. The shell's route is not the plugin's — Obsidian's Chromium honours
# the macOS system proxy while this script may not, so "unreachable" here can be
# "HTTP 200" there, and vice versa. Confirm every finding with the in-Obsidian probe
# (test/smoke), which separates a CORS block from a network failure by running the
# same request through both fetch and requestUrl.
#
# Usage:  scripts/cors-probe.sh [--strip-proxy] [name-filter]
#
# --strip-proxy   ignore HTTP(S)_PROXY. Needed under a sandbox that injects one;
#                 do NOT use it if you genuinely reach providers through a proxy.

set -uo pipefail

ORIGIN="${ORIGIN:-app://obsidian.md}"
STAINLESS="x-stainless-os,x-stainless-lang,x-stainless-arch,x-stainless-runtime,x-stainless-runtime-version,x-stainless-package-version,x-stainless-retry-count,x-stainless-timeout"
STRIP_PROXY=0
FILTER=""

for arg in "$@"; do
	case "$arg" in
	--strip-proxy) STRIP_PROXY=1 ;;
	-h | --help)
		sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
	*) FILTER="$arg" ;;
	esac
done

if [ "$STRIP_PROXY" = 1 ]; then
	unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
fi

# A proxy that intercepts CONNECT makes every probe return the tunnel's response
# instead of the provider's, which reads as "no CORS headers" across the board.
# Never let that happen silently.
if [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]; then
	echo "!! proxy in effect: ${HTTPS_PROXY:-$https_proxy}"
	echo "!! if every row below says NO-CORS, re-run with --strip-proxy"
	echo
fi

# name | url | headers the client sends beyond the CORS-safelisted ones
ENDPOINTS=(
	"OpenAI|https://api.openai.com/v1/chat/completions|authorization,content-type"
	"Claude|https://api.anthropic.com/v1/messages|x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access,content-type"
	"DeepSeek|https://api.deepseek.com/chat/completions|authorization,content-type"
	"Doubao|https://ark.cn-beijing.volces.com/api/v3/chat/completions|authorization,content-type"
	"Grok|https://api.x.ai/v1/chat/completions|authorization,content-type"
	"Kimi|https://api.moonshot.cn/v1/chat/completions|authorization,content-type"
	"OpenRouter|https://openrouter.ai/api/v1/chat/completions|authorization,content-type"
	"QianFan|https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat|authorization,content-type"
	"Qwen|https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions|authorization,content-type"
	"SiliconFlow|https://api.siliconflow.cn/v1/chat/completions|authorization,content-type"
	"Zhipu|https://open.bigmodel.cn/api/paas/v4/chat/completions|authorization,content-type"
	# candidates from open issues
	"MiniMax|https://api.minimaxi.com/v1/chat/completions|authorization,content-type"
	"LongCat|https://api.longcat.chat/openai/v1/chat/completions|authorization,content-type"
	"ModelScope|https://api-inference.modelscope.cn/v1/chat/completions|authorization,content-type"
	"OpenCodeZen|https://opencode.ai/zen/v1/chat/completions|authorization,content-type"
)

# Echoes "PASS" or "FAIL <reason>" for one preflight, per the Fetch spec's rules.
preflight() {
	local url="$1" req_headers="$2" raw status acao acah h

	raw=$(curl -s -o /dev/null -D - --max-time 15 -X OPTIONS "$url" \
		-H "Origin: $ORIGIN" \
		-H 'Access-Control-Request-Method: POST' \
		-H "Access-Control-Request-Headers: $req_headers" 2>/dev/null)

	if [ -z "$raw" ]; then
		echo "SKIP unreachable"
		return
	fi

	status=$(printf '%s' "$raw" | grep -i '^HTTP/' | tail -1 | awk '{print $2}')
	acao=$(printf '%s' "$raw" | grep -i '^access-control-allow-origin:' | head -1 | cut -d: -f2- | tr -d ' \r')
	acah=$(printf '%s' "$raw" | grep -i '^access-control-allow-headers:' | head -1 | cut -d: -f2- |
		tr -d ' \r' | tr '[:upper:]' '[:lower:]')

	case "$status" in
	2*) ;;
	# A 403 from a CDN or a 404 from an endpoint that ignores OPTIONS says nothing
	# about CORS. api.anthropic.com answers 403 to curl and 401 to a real fetch from
	# Obsidian; opencode.ai answers 404 to OPTIONS but serves the endpoint fine.
	*)
		echo "SKIP http-$status"
		return
		;;
	esac

	if [ -z "$acao" ]; then
		echo "FAIL no-allow-origin"
		return
	fi
	if [ "$acao" != "*" ] && [ "$acao" != "$ORIGIN" ]; then
		echo "FAIL origin-mismatch($acao)"
		return
	fi

	for h in ${req_headers//,/ }; do
		# The Fetch spec says `*` does not cover Authorization, and MDN says the same.
		# Chromium disagrees: SiliconFlow answers `Access-Control-Allow-Headers: *`
		# and a real fetch from app://obsidian.md reaches it. Follow the implementation,
		# not the spec — treating `*` as strict produced a false BLOCKED here.
		if [ "$acah" = "*" ]; then continue; fi
		case ",$acah," in
		*",$h,"*) ;;
		*)
			echo "FAIL header-rejected($h)"
			return
			;;
		esac
	done

	echo "PASS"
}

printf '%-13s %-26s %-26s %s\n' PROVIDER "WITHOUT x-stainless-*" "WITH x-stainless-*" VERDICT
printf '%-13s %-26s %-26s %s\n' "-------------" "--------------------------" "--------------------------" "-------"

for row in "${ENDPOINTS[@]}"; do
	IFS='|' read -r name url base <<<"$row"
	[ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue

	plain=$(preflight "$url" "$base")
	stain=$(preflight "$url" "$base,$STAINLESS")

	case "$plain:$stain" in
	PASS:PASS) verdict="headers ok" ;;
	PASS:FAIL*) verdict="** x-stainless-* rejected — strip them **" ;;
	SKIP*:*) verdict="inconclusive — confirm inside Obsidian" ;;
	FAIL*:*) verdict="preflight rejected — confirm inside Obsidian" ;;
	esac

	printf '%-13s %-26s %-26s %s\n' "$name" "$plain" "$stain" "$verdict"
done
