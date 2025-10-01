#!/bin/bash
# Build script - compiles and copies all deliverables to dist/

set -e

echo "🏗️  Building Obsidian Tars plugin..."

# Create dist directory
mkdir -p dist

# Run esbuild (outputs to dist/main.js)
echo "📦 Running esbuild..."
node esbuild.config.mjs production

# Copy manifest and styles to dist
echo "📋 Copying manifest and styles..."
cp manifest.json dist/
if [ -f "styles.css" ]; then
  cp styles.css dist/
fi

echo "✅ Build complete! Deliverables in dist/"
echo ""
echo "📦 Contents:"
ls -lh dist/
