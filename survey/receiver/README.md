# Site Survey Receiver — home machine setup

The Site Survey app keeps everything **on your phone** (IndexedDB, works
offline). Syncing to your home machine is optional. When you tap
**Sync to home machine**, the app pushes:

- `survey.json` — the full structured survey (previous versions are kept in `history/`)
- `media/` — every geotagged photo/video, with `.meta.json` sidecars (GPS, heading, timestamps)
- `report.html` — the self-contained interactive report (toggleable in Settings)

## 1. Run the receiver

Copy `receiver.py` to your home machine (it's plain Python 3.8+, no
dependencies) and run:

```bash
python3 receiver.py --token SOME-LONG-RANDOM-STRING
```

It listens on `127.0.0.1:8777` and saves to `~/SiteSurveys/`.
Options: `--port`, `--dir`, `--bind`, or `SURVEY_TOKEN` env var.

To keep it running, a systemd unit works well:

```ini
# /etc/systemd/system/survey-receiver.service
[Unit]
Description=Site Survey receiver
After=network.target

[Service]
ExecStart=/usr/bin/python3 /home/YOU/receiver.py --token SOME-LONG-RANDOM-STRING
Restart=on-failure
User=YOU

[Install]
WantedBy=multi-user.target
```

## 2. Expose it over your tailnet with HTTPS

The app is served from `https://charoai.net`, and browsers refuse to send
requests from an HTTPS page to a plain-HTTP address (mixed content). So the
receiver must be reachable over **HTTPS**. Tailscale does this for you with
valid certificates:

```bash
tailscale serve --bg localhost:8777
```

That publishes `https://<machine-name>.<your-tailnet>.ts.net` → proxied to
the receiver on localhost. Only devices on your tailnet can reach it.
(Older Tailscale versions use `tailscale serve https / http://localhost:8777`.
Check with `tailscale serve status`.)

Notes:
- HTTPS certificates require `tailscale cert` / MagicDNS to be enabled on
  your tailnet (Admin console → DNS → HTTPS Certificates → Enable).
- Your **phone must also be on the tailnet** (install the Tailscale app and
  log in) when you sync. In the field with no signal, just keep working —
  sync when you're back on the net.
- Do **not** use `tailscale funnel` unless you genuinely want the receiver
  reachable from the public internet; `serve` keeps it tailnet-only.

## 3. Point the app at it

In the Site Survey app: **⚙ Settings → Sync**

- Endpoint: `https://<machine-name>.<your-tailnet>.ts.net`
- Token: the same string you passed to `--token`
- Tap **Test connection** — you should see the machine's hostname.

Then use **Export & Sync → Sync to home machine** whenever you want to push.
Sync is incremental: media already on the server is skipped.

## Staying fully on-device instead

Don't want a server at all? Use **Export & Sync → JSON bundle** to save a
single full-fidelity file (survey + all media) to your phone, and share it
however you like (AirDrop, USB, Tailscale Taildrop). The same file imports
back into the app via **Settings → Import bundle**.
