#!/bin/bash
# Launch Obsidian with test vault
# Auto-detects OS and uses appropriate launch method

set -e

# Determine vault path based on OS
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
  VAULT_DIR="$USERPROFILE/obsidian-test-vault"
elif [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
  # WSL2: Use Windows user directory for vault (accessible by Windows apps)
  WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  VAULT_DIR="/mnt/c/Users/$WIN_USER/obsidian-test-vault"
else
  VAULT_DIR="$HOME/obsidian-test-vault"
fi

# Detect OS and launch
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  echo "🍎 Detected macOS"
  if [[ -d "/Applications/Obsidian.app" ]]; then
    open -a Obsidian "$VAULT_DIR"
    echo "✅ Launched Obsidian"
  else
    echo "❌ Obsidian not found at /Applications/Obsidian.app"
    echo "📍 Vault location: $VAULT_DIR"
  fi

elif [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
  # WSL2
  echo "🐧 Detected WSL2"
  
  # Convert to Windows path
  WIN_VAULT_DIR=$(wslpath -w "$VAULT_DIR")
  
  # Get Windows username (may differ from WSL username)
  WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  
  echo "📂 Vault path: $WIN_VAULT_DIR"
  
  # Find Obsidian executable
  OBSIDIAN_EXE=""
  
  # Check if in PATH first
  if command -v obsidian.exe &> /dev/null; then
    OBSIDIAN_EXE="obsidian.exe"
  # Try with detected Windows username
  elif [[ -f "/mnt/c/Users/$WIN_USER/AppData/Local/Obsidian/Obsidian.exe" ]]; then
    OBSIDIAN_EXE="/mnt/c/Users/$WIN_USER/AppData/Local/Obsidian/Obsidian.exe"
  elif [[ -f "/mnt/c/Users/$WIN_USER/scoop/apps/obsidian/current/Obsidian.exe" ]]; then
    OBSIDIAN_EXE="/mnt/c/Users/$WIN_USER/scoop/apps/obsidian/current/Obsidian.exe"
  # Fallback: search all user directories
  elif OBSIDIAN_EXE=$(find /mnt/c/Users/*/scoop/apps/obsidian/current/Obsidian.exe 2>/dev/null | head -1); then
    true  # Already set
  elif OBSIDIAN_EXE=$(find /mnt/c/Users/*/AppData/Local/Obsidian/Obsidian.exe 2>/dev/null | head -1); then
    true  # Already set
  fi
  
  if [[ -n "$OBSIDIAN_EXE" ]]; then
    # Launch Obsidian with vault path as argument
    echo "🚀 Launching: $OBSIDIAN_EXE"
    echo "📂 Opening vault: $WIN_VAULT_DIR"
    
    # Launch with vault path - Obsidian will open it directly
    "$OBSIDIAN_EXE" "$WIN_VAULT_DIR" > /dev/null 2>&1 &
    
    sleep 2
    echo "✅ Launched Obsidian"
    echo ""
    echo "📝 If vault doesn't open automatically:"
    echo "   1. In Obsidian, click 'Open another vault'"
    echo "   2. Select 'Open folder as vault'"
    echo "   3. Navigate to: $WIN_VAULT_DIR"
  else
    echo "❌ Obsidian not found"
    echo "📍 Checked locations:"
    echo "  - obsidian.exe in PATH"
    echo "  - C:\\Users\\$WIN_USER\\AppData\\Local\\Obsidian\\Obsidian.exe"
    echo "  - C:\\Users\\$WIN_USER\\scoop\\apps\\obsidian\\current\\Obsidian.exe"
    echo "  - All user directories under C:\\Users\\*\\"
    echo "📍 Windows vault path: $WIN_VAULT_DIR"
    echo "💡 Tip: Add Obsidian to PATH or update this script with your install location"
  fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  echo "🐧 Detected Linux"
  
  if command -v obsidian &> /dev/null; then
    obsidian "$VAULT_DIR" &
    echo "✅ Launched Obsidian"
  elif command -v flatpak &> /dev/null && flatpak list | grep -q obsidian; then
    flatpak run md.obsidian.Obsidian "$VAULT_DIR" &
    echo "✅ Launched Obsidian (Flatpak)"
  elif [[ -f "/usr/bin/obsidian" ]]; then
    /usr/bin/obsidian "$VAULT_DIR" &
    echo "✅ Launched Obsidian"
  else
    echo "❌ Obsidian not found"
    echo "📍 Vault location: $VAULT_DIR"
  fi

else
  echo "⚠️  Unknown OS: $OSTYPE"
  echo "📍 Vault location: $VAULT_DIR"
fi
