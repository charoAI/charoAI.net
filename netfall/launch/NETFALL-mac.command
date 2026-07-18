#!/bin/sh
# NETFALL — double-click to play in an app window.
# (First run: macOS may ask you to allow it under System Settings > Privacy & Security.)

URL="https://charoai.net/netfall/"   # for local play: http://localhost:8137/netfall/

open -na "Google Chrome" --args --app="$URL" 2>/dev/null && exit 0
open -na "Microsoft Edge" --args --app="$URL" 2>/dev/null && exit 0
open -na "Chromium" --args --app="$URL" 2>/dev/null && exit 0
open "$URL"
