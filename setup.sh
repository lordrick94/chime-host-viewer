#!/bin/bash
set -e  # exit on first error

echo "📦 Installing FRB Viewer into current environment..."
pip install -e .
echo "✅ Done! Now run: frb-viewer"
