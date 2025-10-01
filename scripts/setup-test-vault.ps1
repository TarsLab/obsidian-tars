# PowerShell script for Windows users
# Setup Test Vault Script - Creates an Obsidian test vault with Tars plugin

Write-Host "🚀 Setting up Obsidian test vault for MCP integration testing..." -ForegroundColor Green

# Configuration
$VaultDir = "$env:USERPROFILE\obsidian-test-vault"
$PluginDir = "$VaultDir\.obsidian\plugins\obsidian-tars"
$ProjectDir = Split-Path -Parent $PSScriptRoot

# Step 1: Build the plugin
Write-Host "📦 Building plugin..." -ForegroundColor Cyan
Set-Location $ProjectDir
npm run build

if (-not (Test-Path "main.js")) {
    Write-Host "❌ Error: Build failed. main.js not found." -ForegroundColor Red
    exit 1
}

# Step 2: Create vault structure
Write-Host "📁 Creating vault structure..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
New-Item -ItemType Directory -Force -Path $VaultDir | Out-Null

# Step 3: Copy plugin files
Write-Host "📋 Copying plugin files..." -ForegroundColor Cyan
Copy-Item "main.js" -Destination $PluginDir
Copy-Item "manifest.json" -Destination $PluginDir
if (Test-Path "styles.css") {
    Copy-Item "styles.css" -Destination $PluginDir
}

# Step 4: Create sample test note
Write-Host "📝 Creating test note..." -ForegroundColor Cyan
@"
# MCP Integration Test

## Quick Start

1. Go to Settings → Tars → MCP Servers
2. Click "Add MCP Server"  
3. Configure your server
4. Enable the server
5. Use the code block below to test

## Test Code Block

``````test-server
tool: echo
message: Hello from MCP!
timestamp: true
count: 42
``````

## MCP Commands

Try these from the Command Palette:
- `MCP: Show Execution History`
- `MCP: Stop Executions`
- `MCP: Reset Session Limits`
"@ | Out-File -FilePath "$VaultDir\MCP Test.md" -Encoding UTF8

# Step 5: Create config files
Write-Host "⚙️ Creating Obsidian config..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$VaultDir\.obsidian" | Out-Null

@"
{
  "livePreview": true,
  "readableLineLength": false
}
"@ | Out-File -FilePath "$VaultDir\.obsidian\app.json" -Encoding UTF8

@"
[
  "obsidian-tars"
]
"@ | Out-File -FilePath "$VaultDir\.obsidian\community-plugins.json" -Encoding UTF8

Write-Host ""
Write-Host "✅ Test vault created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Vault location: $VaultDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Obsidian"
Write-Host "2. Select 'Open folder as vault'"
Write-Host "3. Choose: $VaultDir"
Write-Host "4. Go to Settings → Community plugins"
Write-Host "5. Enable 'Tars' plugin"
Write-Host "6. Configure MCP servers"
Write-Host "7. Open 'MCP Test.md' to start testing"
Write-Host ""
Write-Host "Happy testing! 🎉" -ForegroundColor Green
