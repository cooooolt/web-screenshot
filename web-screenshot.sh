#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Web Screenshot
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 📸
# @raycast.argument1 { "type": "text", "placeholder": "Paste URL here" }
# @raycast.argument2 { "type": "dropdown", "placeholder": "Screenshot method", "data": [{"title": "Native", "value": "native"}, {"title": "Stitched", "value": "stitched"}] }

# Documentation:
# @raycast.author Colt
# @raycast.authorURL https://raycast.com/colt

NODE_EXE="/opt/homebrew/opt/node@24/bin/node"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAP_JS_PATH="$SCRIPT_DIR/snap.js"

# Default to native method if no method specified
METHOD="${2:-native}"

$NODE_EXE "$SNAP_JS_PATH" "$1" "$METHOD"
