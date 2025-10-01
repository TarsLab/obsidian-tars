#!/bin/bash

# Setup Test Vault Script
# Creates an Obsidian test vault with the Tars plugin pre-installed

set -e  # Exit on error

echo "🚀 Setting up Obsidian test vault for MCP integration testing..."

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Determine vault path based on OS
if [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
  # WSL2: Use Windows user directory for vault (accessible by Windows apps)
  WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  VAULT_DIR="/mnt/c/Users/$WIN_USER/obsidian-test-vault"
  echo "🐧 WSL2 detected - creating vault in Windows user directory"
else
  VAULT_DIR="${HOME}/obsidian-test-vault"
fi

PLUGIN_DIR="${VAULT_DIR}/.obsidian/plugins/obsidian-tars"

# Step 1: Build the plugin
echo "📦 Building plugin..."
cd "$PROJECT_DIR"
npm run build

if [ ! -f "dist/main.js" ]; then
    echo "❌ Error: Build failed. dist/main.js not found."
    exit 1
fi

# Step 2: Create vault structure
echo "📁 Creating vault structure..."
mkdir -p "$PLUGIN_DIR"
mkdir -p "$VAULT_DIR"

# Step 3: Copy plugin files
echo "📋 Copying plugin files..."
cp dist/main.js "$PLUGIN_DIR/"
cp dist/manifest.json "$PLUGIN_DIR/"
if [ -f "dist/styles.css" ]; then
    cp dist/styles.css "$PLUGIN_DIR/"
fi

# Step 4: Create sample test note
echo "📝 Creating test note..."
cat > "$VAULT_DIR/MCP Test.md" << 'EOF'
# MCP Integration Test

## Quick Start

1. Go to Settings → Tars → MCP Servers
2. Click "Add MCP Server"
3. Configure your server
4. Enable the server
5. Use the code block below to test

## Test Code Block

```test-server
tool: echo
message: Hello from MCP!
timestamp: true
count: 42
```

## Expected Result

The tool should execute and display results inline with:
- Execution time
- Status indicator
- Tool output

## Troubleshooting

- Open Developer Tools: Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)
- Check console for errors
- Verify Docker is running: `docker ps`
- Check MCP commands in Command Palette

## Test Scenarios

### Scenario 1: Invalid Tool
```test-server
tool: nonexistent
```

Expected: Error message "Tool not found"

### Scenario 2: Complex Parameters
```test-server
tool: complex_tool
nested:
  key: value
  number: 42
list: [1, 2, 3]
boolean: true
```

### Scenario 3: Multiple Executions

```test-server
tool: echo
message: First execution
```

```test-server
tool: echo
message: Second execution
```

## MCP Commands

Try these from the Command Palette:
- `MCP: Show Execution History`
- `MCP: Stop Executions`
- `MCP: Reset Session Limits`

---

## Configuration Example

Here's a sample MCP server configuration:

**Docker Server:**
- Name: `test-echo`
- Transport: `stdio`
- Deployment: `Managed (Docker)`
- Docker Image: `mcp-test/echo-server:latest`
- Container Name: `tars-mcp-test`

**Remote SSE Server:**
- Name: `remote-api`
- Transport: `sse`
- Deployment: `External`
- SSE URL: `http://localhost:8080/sse`
EOF

# Step 5: Create .obsidian config
echo "⚙️ Creating Obsidian config..."

# Create .obsidian directory if it doesn't exist
mkdir -p "$VAULT_DIR/.obsidian"

# app.json
cat > "$VAULT_DIR/.obsidian/app.json" << 'EOF'
{
  "livePreview": true,
  "readableLineLength": false
}
EOF

# community-plugins.json - enable our plugin
cat > "$VAULT_DIR/.obsidian/community-plugins.json" << 'EOF'
[
  "obsidian-tars"
]
EOF

# appearance.json
cat > "$VAULT_DIR/.obsidian/appearance.json" << 'EOF'
{
  "baseFontSize": 16
}
EOF

# core-plugins.json
cat > "$VAULT_DIR/.obsidian/core-plugins.json" << 'EOF'
[
  "file-explorer",
  "global-search",
  "switcher",
  "graph",
  "backlink",
  "outgoing-link",
  "tag-pane",
  "page-preview",
  "daily-notes",
  "templates",
  "note-composer",
  "command-palette",
  "editor-status",
  "markdown-importer",
  "word-count",
  "file-recovery"
]
EOF

# workspace.json - basic workspace layout
cat > "$VAULT_DIR/.obsidian/workspace.json" << 'EOF'
{
  "main": {
    "id": "main",
    "type": "split",
    "children": [
      {
        "id": "leaf1",
        "type": "leaf",
        "state": {
          "type": "markdown",
          "state": {
            "file": "MCP Test.md",
            "mode": "source"
          }
        }
      }
    ]
  }
}
EOF

# graph.json
cat > "$VAULT_DIR/.obsidian/graph.json" << 'EOF'
{
  "collapse-filter": false,
  "search": "",
  "showTags": false,
  "showAttachments": false,
  "hideUnresolved": false,
  "showOrphans": true,
  "collapse-color-groups": false,
  "colorGroups": [],
  "collapse-display": false,
  "showArrow": false,
  "textFadeMultiplier": 0,
  "nodeSizeMultiplier": 1,
  "lineSizeMultiplier": 1,
  "collapse-forces": false,
  "centerStrength": 0.518713248970312,
  "repelStrength": 10,
  "linkStrength": 1,
  "linkDistance": 250,
  "scale": 1,
  "close": false
}
EOF

# Step 6: Create a README
cat > "$VAULT_DIR/README.md" << 'EOF'
# Obsidian Test Vault for Tars MCP Integration

This vault is pre-configured with the Tars plugin and ready for MCP testing.

## Getting Started

1. Open this vault in Obsidian
2. Enable the Tars plugin: Settings → Community plugins
3. Configure MCP servers: Settings → Tars → MCP Servers
4. Open "MCP Test.md" to start testing

## Files

- `MCP Test.md` - Main testing document with examples
- `.obsidian/plugins/obsidian-tars/` - Plugin installation

## Updating the Plugin

To update the plugin after making changes:

```bash
cd /mnt/wsl/workspace/obsidian-tars
npm run build
./scripts/setup-test-vault.sh
```

Then in Obsidian:
- Settings → Community plugins
- Toggle Tars off and on to reload

## For Development

Use symlink for live development:

```bash
# Remove copied files
rm -rf ~/obsidian-test-vault/.obsidian/plugins/obsidian-tars

# Create symlink
ln -s /mnt/wsl/workspace/obsidian-tars ~/obsidian-test-vault/.obsidian/plugins/obsidian-tars

# Run dev mode
cd /mnt/wsl/workspace/obsidian-tars
npm run dev
```
EOF

echo ""
echo "✅ Test vault created successfully!"
echo ""

# Show appropriate path based on OS
if [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
  WIN_VAULT_PATH=$(wslpath -w "$VAULT_DIR")
  echo "📍 Vault location:"
  echo "   Windows: $WIN_VAULT_PATH"
  echo "   WSL:     $VAULT_DIR"
else
  echo "📍 Vault location: $VAULT_DIR"
fi

echo ""
echo "Next steps:"
echo "1. Run: mise launch  (or let the workflow continue)"
echo "2. In Obsidian: Settings → Community plugins → Enable 'Tars'"
echo "3. Configure MCP servers in Settings → Tars → MCP Servers"
echo "4. Open 'MCP Test.md' to start testing"
echo ""
echo "Happy testing! 🎉"
