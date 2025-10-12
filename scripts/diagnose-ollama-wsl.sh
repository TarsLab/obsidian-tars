#!/usr/bin/env bash
set -euo pipefail

PORT=11434

section() {
  printf '\n[%s]\n' "$1"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

section "WSL environment"
if command_exists lsb_release; then
  lsb_release -d 2>/dev/null || true
fi
printf 'Kernel: %s\n' "$(uname -a)"

section "WSL networking"
ip addr show eth0 2>/dev/null || true
default_gateway=$(ip route | awk '/default/ {print $3; exit}')
if [[ -n "${default_gateway}" ]]; then
  printf 'Default gateway (Windows host): %s\n' "$default_gateway"
else
  printf 'Failed to detect default gateway.\n'
fi

section "Connectivity tests"
targets=("127.0.0.1" "localhost")
if [[ -n "${default_gateway}" ]]; then
  targets+=("${default_gateway}")
fi
for target in "${targets[@]}"; do
  printf 'curl http://%s:%s ... ' "$target" "$PORT"
  if timeout 5 curl -fsS "http://${target}:${PORT}" >/dev/null 2>&1; then
    printf 'OK\n'
  else
    printf 'FAILED (exit %s)\n' "$?"
  fi
  if command_exists nc; then
    timeout 5 nc -vz "$target" "$PORT" 2>&1 | sed 's/^/  /'
  else
    printf '  nc not available, skipping TCP handshake test.\n'
  fi
  if command_exists ping; then
    ping -c 2 "$target" 2>&1 | sed 's/^/  /'
  fi
  printf '\n'
done

section "Windows listeners"
if command_exists powershell.exe; then
  cat <<'PS' | powershell.exe -NoLogo -NoProfile -Command -
$port = 11434
try {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop
  if ($connections) {
    "Listening entries for port $port:" | Write-Output
    $connections | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize | Out-String | Write-Output
    foreach ($conn in $connections) {
      try {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
        "Process: $($process.ProcessName) (PID $($process.Id))" | Write-Output
      } catch {
        "Process info unavailable for PID $($conn.OwningProcess)." | Write-Output
      }
    }
  } else {
    "No processes currently listening on port $port." | Write-Output
  }
} catch {
  "Failed to query listening ports: $($_.Exception.Message)" | Write-Output
}
PS
else
  printf 'powershell.exe not available; cannot inspect Windows listeners.\n'
fi

section "Windows firewall"
if command_exists powershell.exe; then
  cat <<'PS' | powershell.exe -NoLogo -NoProfile -Command -
$port = 11434
$rules = Get-NetFirewallRule -Enabled True -Direction Inbound -ErrorAction SilentlyContinue
$result = @()
foreach ($rule in $rules) {
  $filters = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
  foreach ($filter in $filters) {
    if ($filter.LocalPort -eq "$port" -or $filter.LocalPort -eq $port) {
      $result += [PSCustomObject]@{
        DisplayName   = $rule.DisplayName
        Profile       = $rule.Profile
        Action        = $rule.Action
        Enabled       = $rule.Enabled
        Program       = $rule.Program
        Protocol      = $filter.Protocol
        LocalAddress  = ($filter.LocalAddress -join ',')
        RemoteAddress = ($filter.RemoteAddress -join ',')
      }
    }
  }
}
if ($result.Count -eq 0) {
  Write-Output "No inbound firewall rules found for port $port."
} else {
  $result | Format-Table -AutoSize | Out-String | Write-Output
}
PS
else
  printf 'powershell.exe not available; cannot inspect Windows firewall.\n'
fi

section "Suggested remediation"
cat <<'TXT'
If reachability tests to the Windows gateway fail while the listener is active and no firewall rules are listed above, create an inbound firewall rule that allows TCP port 11434 on the "vEthernet (WSL)" interface (Private or Domain profile) or enable the Ollama.exe app for the desired profiles.
TXT
