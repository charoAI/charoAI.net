#!/bin/sh
# CYBERSPYKE — installs a desktop icon / app-menu entry that opens the game in
# its own window. Run:  sh cyberspyke-linux-install.sh
set -e

URL="https://charoai.net/cyberspyke/"   # for local play: http://localhost:8137/cyberspyke/

DIR="$(cd "$(dirname "$0")" && pwd)"
ICON="$DIR/../assets/icon-256.png"

BIN="$HOME/.local/bin/cyberspyke-launch"
mkdir -p "$HOME/.local/bin"
cat > "$BIN" <<LAUNCHER
#!/bin/sh
URL="$URL"
for b in google-chrome chromium chromium-browser brave-browser microsoft-edge; do
  command -v "\$b" >/dev/null 2>&1 && exec "\$b" --app="\$URL"
done
exec xdg-open "\$URL"
LAUNCHER
chmod +x "$BIN"

write_desktop() {
  cat > "$1" <<ENTRY
[Desktop Entry]
Type=Application
Name=CYBERSPYKE
Comment=Learn Python by looting the dead internet
Exec=$BIN
Icon=$ICON
Terminal=false
Categories=Game;Education;
ENTRY
  chmod +x "$1"
}

mkdir -p "$HOME/.local/share/applications"
write_desktop "$HOME/.local/share/applications/cyberspyke.desktop"
[ -d "$HOME/Desktop" ] && write_desktop "$HOME/Desktop/cyberspyke.desktop"

echo "Done — CYBERSPYKE is in your app menu (and on your desktop, if you have one)."
