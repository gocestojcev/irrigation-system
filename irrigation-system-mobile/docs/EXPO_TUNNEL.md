# Expo tunnel (phone cannot reach your PC)

Use this when **Expo Go** fails on the same Wi‑Fi (`failed to download remote update`, `java.io.IOException`, etc.) but you still want dev mode with a **QR code** — without building an APK.

---

## Method 1 — Built-in tunnel (try first)

This project includes `@expo/ngrok` (required by Expo).

```powershell
cd C:\goce.stojcev\projects\irrigation-system\irrigation-system-mobile
npm install
npm run start:tunnel
```

Or:

```powershell
npx expo start -c --tunnel
```

`-c` clears the bundler cache. Wait until the terminal shows a **tunnel URL** (can take 1–2 minutes).

### On the phone

1. Install **Expo Go SDK 56** from [expo.dev/go](https://expo.dev/go) (SDK 56 → Android).
2. Open **Expo Go** → **Scan QR code** (not Notes / not the default camera).
3. Scan the QR from the terminal.

Tunnel works even if phone and PC are on **different networks** (still needs internet on both).

### If you see `failed to start tunnel` / `session closed`

1. **Clear Expo local state**
   ```powershell
   Remove-Item -Recurse -Force .expo -ErrorAction SilentlyContinue
   npx expo start -c --tunnel
   ```

2. **Windows Firewall** — allow **Node.js** on **Private** networks when prompted.

3. **Antivirus** — temporarily allow ngrok / Node, or add an exclusion for the project folder.

4. **VPN** — turn off on PC and phone, then retry.

5. **More logging**
   ```powershell
   $env:EXPO_DEBUG="1"
   npx expo start -c --tunnel
   ```
   Read the ngrok error (e.g. `ERR_NGROK_108` = too many ngrok sessions).

6. **Ngrok status** — [status.ngrok.com](https://status.ngrok.com/)

7. If it still fails → **Method 2** (your own ngrok account).

---

## Method 2 — Your own ngrok (reliable fallback)

Expo’s shared ngrok can hit limits. Use a **free ngrok account**:

### One-time setup

1. Sign up: [ngrok.com](https://ngrok.com)
2. Install ngrok on Windows:
   ```powershell
   winget install ngrok.ngrok
   ```
   Or download from [ngrok.com/download](https://ngrok.com/download)
3. Add your authtoken (from the ngrok dashboard):
   ```powershell
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

### Every dev session (two terminals)

**Terminal 1 — Metro (LAN, no tunnel flag):**

```powershell
cd C:\goce.stojcev\projects\irrigation-system\irrigation-system-mobile
npx expo start -c --lan
```

Leave it running. Note the port (default **8081**).

**Terminal 2 — ngrok to Metro:**

```powershell
ngrok http 8081
```

Copy the **Forwarding** HTTPS URL, e.g. `https://abc123.ngrok-free.app`

**Terminal 1 — stop (Ctrl+C), then restart with proxy:**

```powershell
$env:EXPO_PACKAGER_PROXY_URL="https://abc123.ngrok-free.app"
npx expo start -c --lan
```

Use the QR / URL shown in the terminal. In **Expo Go**, you can also use **Enter URL manually** with the `exp://...` link from the dev tools.

> Replace the URL each time ngrok restarts (free URLs change).

---

## Method 3 — No tunnel: EAS APK

If tunnel is too flaky for daily use:

```powershell
npx eas-cli build --profile preview --platform android
```

Install the APK from [expo.dev](https://expo.dev). No connection from phone to PC.

---

## Quick reference

| Command | Purpose |
|---------|---------|
| `npm run start:tunnel` | Built-in tunnel |
| `npx expo start -c --lan` | Same Wi‑Fi only (no ngrok) |
| `ngrok http 8081` + `EXPO_PACKAGER_PROXY_URL` | Own tunnel |

---

## ESP32 note

Tunnel only fixes **loading the app in Expo Go**. Talking to the ESP32 still uses `http://192.168.x.x` on your **home Wi‑Fi** — phone and ESP32 must be on the same LAN for irrigation control.
