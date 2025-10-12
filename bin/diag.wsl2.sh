#!/bin/bash

# Script to gather and publish current network configuration of the WSL2 instance
# Focuses on networking and Docker IPs, printed directly to terminal

# Define color codes for output
GRAY="$(tput setaf 8)"
NC="$(tput sgr0)"
BOLD="$(tput bold)"
GREEN="$(tput setaf 2)"
YELLOW="$(tput setaf 3)"
BLUE="$(tput setaf 4)"
RED="$(tput setaf 1)"
NC="$(tput sgr0)"

# Docker default bridge network
DOCKER_IP="172.17.0.1"

# compose regex for matching ipv6 in GNU grep style, print it to STDOUT
function ipv6:grep() {
    local ipv6_zone="fe80:(:[0-9a-f]{1,4}){0,7}%[a-z0-9_.-]+"                                            # Link-local IPv6 addresses with zone identifiers
    local ipv4_mapped="::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}"                            # IPv4-mapped addresses in IPv6 format
    local ipv4_mapped_alt="(0{0,4}:){0,5}ffff:(([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})" # Alternative IPv4-mapped notation with optional leading zeros
    local ipv6_full="([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}"                                                   # Standard full IPv6 address
    local ipv6_compressed="([0-9a-f]{1,4}:)*[0-9a-f]{0,4}::[0-9a-f]{0,4}(:[0-9a-f]{1,4})*"               # IPv6 with zero compression (::)
    local ipv6_loopback="(::)"                                                                           # IPv6 loopback (::)

    # Combine all IPv6 patterns
    local grep_regex="${ipv6_zone}|${ipv4_mapped}|${ipv4_mapped_alt}|${ipv6_full}|${ipv6_compressed}|${ipv6_loopback}"

    echo "${grep_regex}"
}

# ref1: https://regex101.com/r/uwPxJf/10
function color:ipv6() {
    local line=$1 grep_regex seeds
    local ipv6s ipv4s seeds

    # Combine all IPv6 patterns
    grep_regex=$(ipv6:grep)
    local sed_regex="${grep_regex}"

    # Extract IPv6 addresses
    ipv6s=$(echo "$line" | grep -oPI "${grep_regex}")
    ipv4s=$(echo "$line" | grep -oPI '([0-9]{1,3}\.){3}[0-9]{1,3}') # IPv4 addresses format

    # Break down regex into components for readability
    local marker="\{IPv6\}"
    local sed_replace="s/(${sed_regex})/${GREEN}${marker}${NC}/Ig"

    # Combine all patterns into a single regex
    seeds=$(echo "$line" | sed -E "$sed_replace")

    # iterate on seeds string until we replace all {IPv6} (marker) tags with proper ipv6 addresses
    # ipv6s may contain multiple ipv6 addresses separated by space
    local final="${seeds}"
    for ipv6 in $ipv6s; do
        # Replace only the first occurrence of the marker with the current IPv6 address
        final=$(echo "$final" | sed -E "0,/${marker}/s/${marker}/${ipv6}/")
    done

    echo "$final" | sed -E "s/(([0-9]{1,3}\.){3}[0-9]{1,3})/${YELLOW}\1${NC}/Ig"
}

# Logger function for consistent output formatting
function log() {
    local type="${1:-}"
    local message="${2:-}"
    local nonewline="${3:-}"

    # Pre-process the message to highlight network elements
    message=$(color:ipv6 "$message")

    case "${type}" in
    header)
        echo -e "${BOLD}${message}${NC}"
        ;;
    section)
        echo -e "\n${BOLD}${BLUE}=== ${message} ===${NC}"
        ;;
    success)
        echo -e "${GREEN}${message}${NC}"
        ;;
    info)
        if [ "${nonewline}" = "nonl" ]; then
            echo -n "${message}"
        else
            echo -e "${message}"
        fi
        ;;
    warning)
        echo -e "${YELLOW}${message}${NC}"
        ;;
    error)
        echo -e "${RED}${message}${NC}"
        ;;
    gray)
        [ "${nonewline}" = "nonl" ] && echo -n "${GRAY}${message}${NC}" || echo -e "${GRAY}${message}${NC}"
        #echo -e "${GRAY}${message}${NC}"
        ;;
    separator)
        echo -e "${BOLD}==========================================${NC}"
        ;;
    *)
        echo -e "${message}"
        ;;
    esac
}

# Helpers: Query Windows networking from WSL using PowerShell (single-quoted to avoid Bash $ expansion)
function get_windows_lan_ip() {
    if ! command -v powershell.exe &>/dev/null; then
        return 1
    fi

    # Prefer interface whose gateway is 192.168.*; fallback to any 192.168.* on an Up adapter
    powershell.exe -NoProfile -Command '
        $c = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4Address -ne $null };
        $lan = $c | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4DefaultGateway.NextHop -like "192.168.*" } | Select-Object -First 1;
        if (-not $lan) { $lan = $c | Where-Object { $_.IPv4Address.IPAddress -like "192.168.*" } | Select-Object -First 1 };
        if ($lan) { $lan.IPv4Address.IPAddress }
    ' | tr -d "\r"
}

function get_windows_default_route() {
    if ! command -v powershell.exe &>/dev/null; then
        return 1
    fi

    powershell.exe -NoProfile -Command '
        $r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1;
        if ($r) { "{0}|{1}" -f $r.InterfaceAlias, $r.NextHop }
    ' | tr -d "\r"
}

function get_windows_default_route_ip() {
    if ! command -v powershell.exe &>/dev/null; then
        return 1
    fi

    powershell.exe -NoProfile -Command '
        $r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1;
        if ($r) { (Get-NetIPConfiguration -InterfaceIndex $r.ifIndex).IPv4Address.IPAddress }
    ' | tr -d "\r"
}

function get_docker_network_name_by_ip() {
    local ip=$1

    docker network ls --format '{{.Name}}' | while read -r net; do
        if [[ "$net" != "bridge" && "$net" != "host" && "$net" != "none" ]]; then
            gateway=$(docker network inspect "$net" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null)

            if [[ "$gateway" == "$ip" ]]; then
                echo "$net"
                break
            fi
        fi
    done    
}

# Print all IPs with descriptions
function show_all_ips() {
    log "section" "All IP addresses"

    # host-gateway resolving
    HOST_DOCKER_INTERNAL=$(docker run --add-host=host.docker.internal:host-gateway \
        --rm busybox sh -c "ping host.docker.internal -c 1" \
        | grep 'bytes from' | awk -F: '{print $1}' | awk '{print $4}')

    # Try to obtain Windows LAN IP and default-route info
    WINDOWS_LAN_IP=$(get_windows_lan_ip)
    # Resolve the IPv4 bound to the default-route interface
    DEFAULT_ROUTE_IP=$(get_windows_default_route_ip)    
    # Get default route info
    DEFAULT_ROUTE_INFO=$(get_windows_default_route)
    DEFAULT_ROUTE_ALIAS=""
    DEFAULT_ROUTE_NEXTHOP=""
    if [[ -n "$DEFAULT_ROUTE_INFO" ]]; then
        DEFAULT_ROUTE_ALIAS="${DEFAULT_ROUTE_INFO%%|*}"
        DEFAULT_ROUTE_NEXTHOP="${DEFAULT_ROUTE_INFO#*|}"        
    fi

    # Expand the list with discovered host IPs for annotation
    ALL_IPS=$(hostname -I)
    ALL_IPS+=" ${HOST_DOCKER_INTERNAL} "
    if [[ -n "$WINDOWS_LAN_IP" ]]; then ALL_IPS+=" ${WINDOWS_LAN_IP} "; fi

    # make ALL_IPS items unique
    ALL_IPS=$(echo "${ALL_IPS}" | xargs -n1 | sort -u | xargs)

    for ip in ${ALL_IPS}; do
        log "info" "${ip} - " "nonl"

        # Check IP patterns for known network types
        if [[ "${ip}" == "${HOST_DOCKER_INTERNAL}" ]]; then
            log "info" "Host Docker Internal ${GREEN}host.docker.internal${NC}"
        elif [[ -n "$WINDOWS_LAN_IP" && "${ip}" == "${WINDOWS_LAN_IP}" ]]; then
            log "info" "Windows LAN IP (${BLUE}Wi‑Fi/Ethernet${NC})"
        elif [[ "${ip}" == "${DOCKER_IP}" ]]; then
            log "info" "Docker default bridge network"
        elif [[ "${ip}" =~ 172\.[0-9]+\.0\.1 ]]; then
            # Find the network that has this IP as gateway
            network_name=$(get_docker_network_name_by_ip "${ip}")

            if [[ -n "${network_name}" ]]; then
                log "info" "Docker network: ${BLUE}${network_name}${NC}"
            else
                log "info" "Docker custom network bridge"
            fi
        else
            log "info" "Main WSL2 network interface"
        fi
    done

    # Heuristic VPN/enterprise route detection and notice
    if [[ -n "$DEFAULT_ROUTE_IP" && -n "$WINDOWS_LAN_IP" && "$DEFAULT_ROUTE_IP" != "$WINDOWS_LAN_IP" ]]; then
        # If default-route IP is not a typical home LAN 192.168.x.x, warn user
        if [[ ! "$DEFAULT_ROUTE_IP" =~ ^192\.168\.[0-9]+\.[0-9]+$ ]]; then
            log "gray" ""
            log "gray" "Windows default route prefers '${BLUE}${DEFAULT_ROUTE_ALIAS}${GRAY}' (${DEFAULT_ROUTE_IP}${GRAY}, next hop ${DEFAULT_ROUTE_NEXTHOP}${GRAY})."
            log "gray" "A VPN or enterprise adapter may be active."
            log "gray" ""
            log "gray" "Using LAN IP ${WINDOWS_LAN_IP} ${GRAY}for local host mappings.${NC}"
        fi
    fi
}

# Network interfaces section with color coding for DOWN interfaces
function show_network_interfaces() {
    log "section" "Network Interfaces"
    ip -brief addr show | while read -r line; do
        if echo "${line}" | grep -q "DOWN"; then
            log "gray" "${line}"
        else
            log "info" "${line}"
        fi
    done
}

# Docker network info
function show_docker_info() {
    if command -v docker &>/dev/null; then
        log "section" "Docker Network Information"
        docker network ls

        log "section" "Docker Containers with IPs"
        containers=$(docker ps -q)
        if [[ -n "${containers}" ]]; then
            local output=$(docker ps -q | xargs -r docker inspect --format '{{.Name}} - {{range .NetworkSettings.Networks}}{{if .IPAddress}}{{.IPAddress}},{{end}}{{end}}' | sed 's#^/##' | sed 's/,$//')
            log "info" "${output}"
        else
            log "warning" "No running containers"
        fi
    else
        log "section" "Docker Not Installed"
    fi
}

# Show listening ports
function show_listening_ports() {
    log "section" "Listening Ports (WSL side)"
    LISTENPORTS=$(ss -tuln 2>&1)
    IFS=$'\n' read -r -d '' -a lines <<<"${LISTENPORTS}"
    for line in "${lines[@]}"; do
        log "info" "${line}"
    done

    log "section" "Listening Ports (Windows side)"
    #powershell.exe "Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State" | while read -r line; do
    #    log "info" " |  ${line/$'\t'/    }"
    #done
    cmd.exe /c 'netstat -an | findstr /V /C:"[::]" | findstr LISTENING' | while read -r line; do
        log "info" " |  ${line/$'\t'/    }"
    done
}

# Check WSL generation
wsl_ver="Unknown"
function detect_wsl_version() {
    if [ -f "/proc/version" ]; then
        if grep -qi "microsoft\|WSL" /proc/version; then
            if grep -qi "WSL2" /proc/version; then
                wsl_ver="WSL2"
            else
                wsl_ver="WSL1"
            fi
        fi
    fi
    log "info" "WSL Version: ${wsl_ver}"
}

# Check if the /etc/resolv.conf file exists and show its contents
function show_resolv_conf() {
    if [ -f "/etc/resolv.conf" ]; then
        log "info" "\nGlobal DNS Configuration from /etc/resolv.conf:"

        # Check if /etc/resolv.conf is a symlink (which is common in WSL)
        if [ -L "/etc/resolv.conf" ]; then
            target=$(readlink -f "/etc/resolv.conf")
            log "info" "Note: /etc/resolv.conf is a symlink to ${target}"
        fi

        # Display nameserver entries with highlighting
        cat /etc/resolv.conf | grep -v "^#" | grep -v "^$" | while read -r line; do
            log "info" "$line"
        done
    fi
}

# Check for systemd-resolved (common in Ubuntu)
function show_systemd_resolved() {
    local not_available=false

    if command -v resolvectl &>/dev/null; then
        log "info" "\nNetwork-specific DNS configuration via systemd-resolved:"
        local output=$(resolvectl status 2>/dev/null)
        IFS=$'\n' read -r -d '' -a lines <<<"${output}"
        for line in "${lines[@]}"; do
            log "info" "$line"
        done

        # if lines array is empty, fallback to other methods
        if [ ${#lines[@]} -eq 0 ]; then not_available=true; fi
    else
        not_available=true
    fi

    if [ "$not_available" = true ]; then
        log "gray" "No DNS configuration via systemd-resolved is available"

        # Check for NetworkManager as an alternative
        if command -v nmcli &>/dev/null; then
            log "info" "\nNetworkManager DNS configuration:"
            nmcli dev show | grep -i dns | while read -r line; do
                log info "$line"
            done
        fi

        # Fallback to getting network interfaces and showing any DNS-related info
        log "info" "\nNetwork interfaces with possible DNS info:"
        interfaces=$(ip -o link show | awk -F': ' '{print $2}' | cut -d '@' -f1)

        for interface in $interfaces; do
            # Skip loopback
            if [[ "$interface" == "lo" ]]; then
                continue
            fi

            log "info" "${BOLD}Interface: $interface${NC}" "nonl"

            # Get IP for the interface
            ip_info=$(ip -4 addr show dev "$interface" 2>/dev/null)
            if [[ -n "$ip_info" ]]; then
                ip_addr=$(echo "$ip_info" | grep -oP 'inet\s+\K[\d.]+' | head -1)
                log "info" " - IP: $ip_addr" "nonl"

                # Try to determine DNS servers for this interface
                if [[ -n "$ip_addr" ]]; then
                    if command -v nmcli &>/dev/null; then
                        dns_servers=$(nmcli device show "$interface" 2>/dev/null | grep -i 'DNS' | awk '{print $2}')
                        if [[ -n "$dns_servers" ]]; then
                            log "info" " - DNS Servers:"
                            echo "$dns_servers" | while read -r dns_line; do
                                log "info" " - $dns_line"
                            done
                        fi
                    else
                        log "gray" " - No DNS servers found, fallback to /etc/resolv.conf"
                    fi
                fi
            else
                log "gray" " - No IPv4 address, skipping" "nonl"
                log "info" " - IPv6: $(ip -6 addr show dev "$interface" | grep inet6 | awk '{print $2}')"
            fi
            # log "info" ""
        done
    fi
}

# Check .wslconfig in Windows user profile
function show_wsl_config() {
    log "info" "${BOLD}WSL Configuration Files:${NC}"
    if [ -f "/etc/wsl.conf" ]; then
        log "info" "- WSL DNS settings in /etc/wsl.conf:"
        if grep -qi "\[network\]\|\[dns\]\|generateResolvConf\|generateHosts\|nameserver" "/etc/wsl.conf"; then
            grep -i "\[network\]\|\[dns\]\|generateResolvConf\|generateHosts\|nameserver" "/etc/wsl.conf"
        else
            log "gray" "- No DNS-related entries found in /etc/wsl.conf"
        fi
    else
        log "gray" "/etc/wsl.conf does not exist"
    fi
}

# Check host DNS resolver settings (from Windows)
function show_windows_dns() {
    log "info" "\n${BOLD}Windows Host DNS Influence:${NC}"
    if [[ "$wsl_ver" = "WSL2" ]]; then
        # In WSL2, check if we are using the Windows host resolver
        if grep -q "generateResolvConf=false" "/etc/wsl.conf" 2>/dev/null; then
            log "info" "WSL2 is configured to NOT use the Windows host resolver"
        elif [ -f "/etc/resolv.conf" ] && grep -q "nameserver.*172\..*\..*\..*" "/etc/resolv.conf"; then
            log "info" "WSL2 appears to be using a custom DNS setup (not Windows host resolver)"
        else
            log "info" "WSL2 is likely using the Windows host resolver"

            # Try to get Windows DNS info from /mnt/c if available
            if [ -d "/mnt/c/Windows" ]; then
                log "info" "Attempting to retrieve Windows DNS configuration:"
                if command -v powershell.exe &>/dev/null; then
                    log "gray" "Windows DNS Servers from PowerShell:"
                    powershell.exe "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, ServerAddresses" |
                        while read -r line; do
                            # if line contains '{}' skip it
                            if [[ "$line" == *'{}'* ]]; then continue; fi
                            log "info" " |  $line"
                        done
                    log "gray" ""
                else
                    log "gray" "powershell.exe not accessible from WSL"
                fi
            else
                log "gray" "Windows drive not mounted at /mnt/c"
            fi
        fi
    else
        log "gray" "Unsupported WSL version: $wsl_ver"
    fi
}

# Check DNS resolution via nslookup in Ubuntu
function check_dns_resolution() {
    log "info" "${BOLD}DNS Resolution Test:${NC}"
    if command -v nslookup &>/dev/null; then
        log "info" "Testing DNS resolution to 'google.com':"
        nslookup google.com | grep -v "^#" | while read -r line; do
            log "info" " |  ${line/$'\t'/    }"
        done
    else
        log "gray" "nslookup not available"
    fi
}

# Show Linux hosts file configuration
function show_linux_hosts() {
    log "section" "Linux Hosts Configuration"
    
    if [ -f "/etc/hosts" ]; then
        if [ -r "/etc/hosts" ]; then
            log "info" "Contents of /etc/hosts:"
            
            # Check if /etc/hosts is a symlink
            if [ -L "/etc/hosts" ]; then
                target=$(readlink -f "/etc/hosts")
                log "info" "Note: /etc/hosts is a symlink to ${target}"
            fi
            
            # Display hosts entries with highlighting, filter out comments and empty/whitespace lines
            cat /etc/hosts | grep -v "^#" | grep -v "^[[:space:]]*$" | while read -r line; do
                log "info" " |  $line"
            done
        else
            log "error" "/etc/hosts exists but is not readable (permission denied)"
        fi
    else
        log "gray" "/etc/hosts file does not exist"
    fi
}

# Show Windows hosts file configuration
function show_windows_hosts() {
    log "section" "Windows Hosts Configuration"
    
    # Check if Windows drive is mounted
    if [ -d "/mnt/c/Windows" ]; then
        local windows_hosts="/mnt/c/Windows/System32/drivers/etc/hosts"
        
        if [ -f "$windows_hosts" ]; then
            if [ -r "$windows_hosts" ]; then
                log "info" "Contents of C:/Windows/System32/drivers/etc/hosts:"
                
                # Display hosts entries with highlighting, filter out comments and empty/whitespace lines
                cat "$windows_hosts" | grep -v "^#" | grep -v "^[[:space:]]*$" | while read -r line; do
                    log "info" " |  $line"
                done
            else
                log "error" "Windows hosts file exists but is not readable (permission denied)"
                log "gray" "Try running WSL as administrator or check file permissions"
            fi
        else
            log "gray" "Windows hosts file not found at C:/Windows/System32/drivers/etc/hosts"
        fi
    else
        log "gray" "Windows drive not mounted at /mnt/c - cannot access Windows hosts file"
    fi
}

function main() {
    # Report header
    log "separator"
    log "header" "WSL2 Network Configuration Report"
    log "info" "Generated: $(date)"
    log "separator"

    detect_wsl_version

    # WSL2 IP Addresses section
    log "section" "WSL2 IP Addresses"
    log "info" "Primary WSL2 IP: $(hostname -I | awk '{print $1}')"
    log "info" "Windows Host IP: $(ip route | grep default | awk '{print $3}')"

    show_all_ips
    show_network_interfaces
    show_docker_info
    show_listening_ports

    # DNS Configuration
    log "section" "DNS Configuration"
    show_resolv_conf
    show_systemd_resolved

    # WSL-specific DNS configuration
    log "info" "\nWSL-specific DNS configuration:"
    show_wsl_config
    show_windows_dns
    check_dns_resolution

    # Hosts file configuration
    show_linux_hosts
    show_windows_hosts

    log "gray" ""
    log "separator"
    log "header" "End of Network Report"
    log "separator"
}

main "$@"