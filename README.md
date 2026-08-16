# WhatsApp Forward Bot

Watches one WhatsApp chat and forwards new incoming messages to another chat,
only during a scheduled weekday window. Built on Baileys, deployable on Railway.

## Files

- `index.js` — web server (health check + QR login page), starts the bot
- `bot.js` — connection handling, message matching, time-window logic, forwarding
- `package.json` — dependencies
- `.env.example` — copy these as environment variables into Railway
- `.gitignore` — keeps session credentials and secrets out of git

## 1. Push to your Git repo

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

`auth_info/` and `.env` are gitignored on purpose — **never commit these**.
`auth_info/` contains your live WhatsApp session; anyone with it can act as
that linked device.

## 2. Create the Railway project

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → select this repo.
2. Railway auto-detects Node.js and runs `npm start`.

## 3. Add a persistent volume (important)

Railway's filesystem resets on every redeploy. Without a volume, you'd have
to rescan the QR code every time you deploy. Fix this once:

1. In your Railway service → **Settings → Volumes → Add Volume**.
2. Mount path: `/data`
3. In **Variables**, set `AUTH_FOLDER=/data/auth_info`

Now your session survives redeploys and restarts.

## 4. Set environment variables

In Railway → **Variables**, add everything from `.env.example`:

| Variable | Purpose |
|---|---|
| `SOURCE_JID` | Chat to watch |
| `DEST_JID` | Chat to forward into |
| `KNOWN_SOURCE_LIDS` | Optional extra `@lid` aliases for the source contact |
| `WINDOW_START` / `WINDOW_END` | Forwarding window, 24h `HH:MM` |
| `WINDOW_DAYS` | `0`=Sun ... `6`=Sat, e.g. `1,2,3,4,5` for Mon-Fri |
| `TIMEZONE` | e.g. `Asia/Kolkata` |
| `AUTH_FOLDER` | `/data/auth_info` (see step 3) |
| `QR_SECRET` | A password of your choosing for the QR page |

Don't set `PORT` — Railway provides it automatically.

## 5. Deploy and link your WhatsApp account

1. Deploy the service.
2. Open the Railway-provided public URL, then visit:
   `https://your-app.up.railway.app/qr?secret=YOUR_QR_SECRET`
3. Scan it: **WhatsApp → Settings → Linked Devices → Link a Device**.
4. Check **Deploy Logs** for `[CONNECTION] OPEN — bot connected and watching for messages.`

You only need to do this once, as long as the volume from step 3 stays attached.

## Session longevity

This uses WhatsApp's normal linked-device system (same as WhatsApp Web/Desktop).
The session stays valid indefinitely as long as:

- You don't manually remove it from **WhatsApp → Linked Devices** on your phone
- Your phone connects to the internet at least once every ~14 days
  (WhatsApp auto-expires linked devices after prolonged phone inactivity)

No daily re-login needed.

## Updating chat IDs later

Since you mentioned `SOURCE_JID` / `DEST_JID` will change: just update them in
Railway → Variables, then **restart** the service (no code changes, no redeploy
needed, no QR rescan needed).

## Security notes

- Keep `QR_SECRET` private — anyone who scans your `/qr` page before you links
  their own WhatsApp as the bot's account.
- Never commit `auth_info/` or `.env` to git.
- If you ever suspect the session is compromised, remove it from
  **WhatsApp → Linked Devices** on your phone immediately, then delete the
  Railway volume contents and relink.

## Cost note

This bot keeps a live WebSocket connection open 24/7 (it only filters *forwarding*
by the time window, not the connection itself) — that's what keeps reconnect
logic simple and avoids repeated relogin. Railway bills for this continuous
runtime. If you'd rather only run during the window to cut cost, let me know
and I can add scheduled start/stop instead.
# trade_forward
