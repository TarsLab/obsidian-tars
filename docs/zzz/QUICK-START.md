# Quick Start Guide

## 🚀 One-Command Testing

The simplest way to test the MCP integration:

```bash
mise test
```

This automatically:
1. ✅ Builds the plugin to `dist/`
2. ✅ Creates test vault at `~/obsidian-test-vault`
3. ✅ Launches Obsidian with the vault

Then in Obsidian:
- Go to Settings → Community plugins
- Enable "Tars" plugin
- Navigate to Settings → Tars → MCP Servers
- Configure your MCP server
- Open "MCP Test.md" and try the examples

---

## 📋 Available Commands

### Development
```bash
# Start dev mode (watch for changes)
mise dev

# Setup development with symlinked vault
mise dev-setup
# Then: mise dev
# Changes are reflected immediately - just toggle plugin in Obsidian
```

### Testing
```bash
# Complete test workflow
mise test

# Individual steps
mise build          # Build plugin
mise setup-vault    # Create test vault
mise launch         # Open Obsidian
```

### Quality
```bash
mise lint           # Run ESLint
mise format         # Format with Prettier
mise check          # Run lint + tests
```

### Docker/MCP
```bash
mise docker-status  # Check Docker & MCP containers
mise docker-logs    # View container logs
mise docker-stop    # Stop MCP containers
```

### Cleanup
```bash
mise clean          # Remove test vault and build artifacts
```

---

## 🔧 Manual Build & Test

If you prefer manual steps:

```bash
# 1. Build
npm run build

# 2. Setup vault
./scripts/setup-test-vault.sh

# 3. Launch Obsidian
./scripts/launch-obsidian.sh
```

---

## 📁 Project Structure

```
obsidian-tars/
├── dist/                    # Build output (gitignored)
│   ├── main.js             # Compiled plugin
│   ├── manifest.json       # Plugin manifest
│   └── styles.css          # Plugin styles
├── scripts/
│   ├── build.sh            # Build to dist/
│   ├── setup-test-vault.sh # Create test vault
│   ├── launch-obsidian.sh  # Launch Obsidian
│   └── test-workflow.sh    # Full workflow orchestrator
├── src/                     # Source code
│   ├── mcp/                # MCP integration
│   └── main.ts             # Plugin entry point
├── mise.toml               # Task orchestrator
└── package.json            # Dependencies & scripts
```

---

## 🎯 Quick Test Checklist

After running `mise test`:

1. **Enable Plugin**
   - Settings → Community plugins
   - Enable "Tars"

2. **Configure MCP Server**
   - Settings → Tars → MCP Servers
   - Click "Add MCP Server"
   - Example config:
     ```
     Name: test-echo
     Transport: stdio
     Deployment: Managed (Docker)
     Docker Image: mcp-test/echo-server:latest
     Container: tars-mcp-test
     Enabled: ✓
     ```

3. **Test Execution**
   - Open "MCP Test.md"
   - Tool should execute
   - Results appear inline

4. **Try Commands**
   - `Ctrl/Cmd + P` → "MCP: Show Execution History"
   - `Ctrl/Cmd + P` → "MCP: Stop Executions"
   - `Ctrl/Cmd + P` → "MCP: Reset Session Limits"

---

## 🐛 Troubleshooting

**Build fails?**
```bash
# Check Node/npm versions
node --version  # Should be 18+
npm --version

# Clean and rebuild
mise clean
npm install
mise build
```

**Obsidian doesn't launch?**
```bash
# Check if Obsidian is installed
which obsidian  # Linux
ls /Applications/Obsidian.app  # macOS

# Windows/WSL - check common locations:
ls /mnt/c/Users/$USER/AppData/Local/Obsidian/Obsidian.exe  # Standard install
ls /mnt/c/Users/$USER/scoop/apps/obsidian/current/Obsidian.exe  # Scoop

# Launch manually
open ~/obsidian-test-vault  # Then open in Obsidian
```

**Plugin not working?**
- Check browser console: `Ctrl/Cmd + Shift + I`
- Look for `[MCP]` logs
- Verify Docker is running: `docker ps`
- Check container logs: `mise docker-logs`

**Docker issues?**
```bash
# Verify Docker
docker ps

# Check MCP containers
mise docker-status

# View logs
mise docker-logs

# Restart
mise docker-stop
# Then disable/enable server in settings
```

---

## 💡 Pro Tips

1. **Use Dev Mode** for active development:
   ```bash
   mise dev-setup  # One-time symlink setup
   mise dev        # Watch mode
   # Toggle plugin in Obsidian to reload changes
   ```

2. **Check status** before testing:
   ```bash
   mise docker-status  # Ensure Docker is ready
   ```

3. **Clean between tests**:
   ```bash
   mise clean
   mise test
   ```

4. **View all tasks**:
   ```bash
   mise tasks  # List all available commands
   ```

---

## 📚 More Information

- **Full Testing Guide**: See `TESTING.md`
- **MCP Documentation**: See `specs/001-integrate-mcp-servers/`
- **Implementation Details**: See checkpoint summaries in chat

---

## 🎉 You're Ready!

Start testing with one command:

```bash
mise test
```

Happy testing! 🚀
