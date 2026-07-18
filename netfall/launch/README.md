# Launch NETFALL from your desktop

These launchers open the game in its own chromeless app window — no tabs, no URL
bar — with the NETFALL icon. They point at **https://charoai.net/netfall/** (the
live site); each file has the URL on its first lines if you want to change it.

## Windows

Right-click `NETFALL-windows.ps1` → **Run with PowerShell**. It creates a
**NETFALL** shortcut on your desktop (Chrome or Edge, app mode, proper icon).
If PowerShell scripts are blocked:

```
powershell -ExecutionPolicy Bypass -File NETFALL-windows.ps1
```

## Linux

```sh
sh netfall-linux-install.sh
```

Adds NETFALL to your app menu and desktop.

## macOS

Double-click `NETFALL-mac.command` (or drag it to the Dock). First run may need
approval under System Settings → Privacy & Security. For a Dock icon with the
proper artwork: in Chrome, visit the game → ⋮ menu → *Cast, save and share* →
*Install page as app* — Chrome installs it like a native app, icon and all
(that works on Windows/Linux too, and is the nicest option if you don't mind
the one-time manual step).

## Playing locally (before the site is live / offline dev)

```sh
python3 ../tools/serve.py
```

then change the URL at the top of your launcher to `http://localhost:8137/netfall/`.

## In-game

The game opens on the title screen (boot log → menu). `menu` in the terminal,
or clicking the NETFALL wordmark, brings the title screen back. FULLSCREEN is
on the menu; sound can be toggled there too.
