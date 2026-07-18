#!/bin/sh
# NETFALL — installs a desktop icon / app-menu entry that opens the game in
# its own window. Run:  sh netfall-linux-install.sh
set -e

URL="https://charoai.net/netfall/"   # for local play: http://localhost:8137/netfall/

DIR="$(cd "$(dirname "$0")" && pwd)"
ICON="$DIR/../assets/icon-256.png"

BIN="$HOME/.local/bin/netfall-launch"
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
Name=NETFALL
Comment=Learn Python by looting the dead internet
Exec=$BIN
Icon=$ICON
Terminal=false
Categories=Game;Education;
ENTRY
  chmod +x "$1"
}

mkdir -p "$HOME/.local/share/applications"
write_desktop "$HOME/.local/share/applications/netfall.desktop"
[ -d "$HOME/Desktop" ] && write_desktop "$HOME/Desktop/netfall.desktop"

echo "Done — NETFALL is in your app menu (and on your desktop, if you have one)."
