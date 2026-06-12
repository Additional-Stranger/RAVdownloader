#!/bin/bash
# RAVdownloader first-run installer.
# This script runs from inside the mounted DMG. It copies the .app to
# /Applications, removes the quarantine attribute so Gatekeeper does not
# show the "unidentified developer" / "damaged" warning, and launches the
# installed copy.

set -e

APP_NAME="RAVdownloader.app"

# The .command file's directory is the mounted DMG root.
DMG_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SRC_APP="$DMG_DIR/$APP_NAME"
DEST_APP="/Applications/$APP_NAME"

osascript -e 'tell application "Terminal" to set custom title of selected tab of front window to "RAVdownloader Installer"' >/dev/null 2>&1 || true

echo ""
echo "  Installing RAVdownloader..."
echo ""

if [ ! -d "$SRC_APP" ]; then
    echo "  ERROR: Could not find $APP_NAME inside the installer."
    echo "  Please re-download the DMG and try again."
    echo ""
    read -p "  Press Return to close this window."
    exit 1
fi

# Quit any running instance before overwriting
osascript -e 'tell application "RAVdownloader" to quit' >/dev/null 2>&1 || true
sleep 1

# Copy the app to /Applications (overwrites prior install)
if [ -d "$DEST_APP" ]; then
    echo "  Removing previous version..."
    rm -rf "$DEST_APP"
fi

echo "  Copying to /Applications..."
cp -R "$SRC_APP" "$DEST_APP"

# Strip the quarantine attribute that macOS attaches to anything downloaded
# from the internet. This is what bypasses the Gatekeeper warning.
echo "  Removing quarantine flag..."
xattr -cr "$DEST_APP" 2>/dev/null || true

# Launch the installed app
echo "  Launching RAVdownloader..."
open "$DEST_APP"

# Show a friendly success message and exit
osascript -e 'display dialog "RAVdownloader is installed and ready to use.\n\nYou can drag the DMG to the Trash now." with title "Installation Complete" buttons {"OK"} default button "OK" with icon note' >/dev/null 2>&1 || true

# Eject the DMG (best-effort; ignore failure if user already detached)
DMG_VOLUME=$(echo "$DMG_DIR" | sed -n 's|^\(/Volumes/[^/]*\).*|\1|p')
if [ -n "$DMG_VOLUME" ]; then
    hdiutil detach "$DMG_VOLUME" -force >/dev/null 2>&1 || true
fi

exit 0
