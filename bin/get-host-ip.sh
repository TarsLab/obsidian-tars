#!/usr/bin/env bash
# Helper script to detect and return the appropriate HOST_IP
# Supports: Linux (127.0.0.1), macOS (127.0.0.1), WSL2 (Windows host IP)

set -euo pipefail

# -----------------------------------------------------------------------------
# Detect Windows LAN IP for WSL2 (using PowerShell - most accurate)
# -----------------------------------------------------------------------------
get_windows_lan_ip() {
    if ! command -v powershell.exe &>/dev/null; then
        return 1
    fi

    # Use PowerShell to get proper Windows LAN IP (preferred method)
    local windows_ip
    windows_ip=$(powershell.exe -NoProfile -Command '
        $c = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4Address -ne $null };
        $lan = $c | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4DefaultGateway.NextHop -like "192.168.*" } | Select-Object -First 1;
        if (-not $lan) { $lan = $c | Where-Object { $_.IPv4Address.IPAddress -like "192.168.*" } | Select-Object -First 1 };
        if ($lan) { $lan.IPv4Address.IPAddress }
    ' | tr -d "\r" 2>/dev/null)
    
    if [[ -n "$windows_ip" && "$windows_ip" =~ ^192\.168\.[0-9]+\.[0-9]+$ ]]; then
        echo "$windows_ip"
        return 0
    fi
    
    return 1
}

# -----------------------------------------------------------------------------
# Main IP detection logic
# -----------------------------------------------------------------------------
detect_host_ip() {
    local os_type=$(uname -s)
    
    case "$os_type" in
        "Linux")
            # Check if WSL2
            if [[ -f "/proc/version" ]] && grep -q "microsoft" "/proc/version" 2>/dev/null; then
                # WSL2 environment - get Windows host IP
                local windows_ip=""
                
                # Method 1: Use PowerShell (most accurate)
                if windows_ip=$(get_windows_lan_ip); then
                    echo "$windows_ip"
                    return 0
                fi
                
                # Method 2: Fallback to Docker routing
                if command -v docker >/dev/null 2>&1; then
                    windows_ip=$(docker run --rm alpine sh -c "ip route | awk '/default/ {print \$3}'" 2>/dev/null || echo "")
                    if [[ -n "$windows_ip" && "$windows_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                        echo "$windows_ip"
                        return 0
                    fi
                fi
                
                # Method 3: Use ip route (WSL2 fallback)
                if command -v ip >/dev/null 2>&1; then
                    windows_ip=$(ip route show default | awk '/default/ {print $3}' | head -1)
                    if [[ -n "$windows_ip" && "$windows_ip" =~ ^192\.168\.[0-9]+\.[0-9]+$ ]]; then
                        echo "$windows_ip"
                        return 0
                    fi
                fi
                
                # Fallback for WSL2
                echo "192.168.1.103"
            else
                # Native Linux
                echo "127.0.0.1"
            fi
            ;;
        "Darwin")
            # macOS
            echo "127.0.0.1"
            ;;
        *)
            # Default fallback
            echo "127.0.0.1"
            ;;
    esac
}

# Execute detection
# echo "detecting docker host ip... (it can be slow)" >&2
detect_host_ip

