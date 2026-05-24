# ESP32-Mobile

React Native Expo app for controlling ESP32 irrigation relay lines over HTTP.

## Features

- Relay control for every line reported by the ESP32 (`LineCount` in `/status`)
- Named lines with icons (Lawn, Tomatoes, Cucumbers)
- Manual control, schedules, and activity logs
- Configurable ESP32 server IP and network scan
- Real-time state updates (green = ON, gray = OFF)

---

## Prerequisites

On your PC:

- [Node.js](https://nodejs.org/) LTS (20+)
- This repo cloned locally

On your Android phone (for development or install):

- Internet access
- Same Wi‑Fi as the ESP32 when using the app (for `http://192.168.x.x`)

One-time Expo account (free): [expo.dev](https://expo.dev)

---

## Two ways to run on your phone

| Method | Best for | Needs PC while using app? |
|--------|----------|---------------------------|
| **A. Expo Go (dev)** | Coding and quick UI tests | **Yes** — Metro dev server must run |
| **B. EAS APK (install)** | Daily use, stable install | **No** — standalone app |

**Important:** This project uses **Expo SDK 56**. The Expo Go app from Google Play may be an older SDK and show *“project is not compatible”*. Use **Expo Go SDK 56** from [expo.dev/go](https://expo.dev/go) for method A, or use method B and skip Expo Go entirely.

---

## Setup (first time on PC)

```powershell
cd C:\projects\irrigation-system\esp32-mobile
npm install
```

---

## A. Development on phone (Expo Go + QR code)

Use this while you are changing the app. Every save on the PC can reload the app on the phone.

### Step 1 — Install Expo Go SDK 56 on Android

1. Open [expo.dev/go](https://expo.dev/go)
2. **SDK Version:** select **SDK 56 (latest)**
3. Tap **Android** → download and install the APK
4. If you also have Expo Go from Play Store, uninstall the old one to avoid opening the wrong app

### Step 2 — Start the dev server on PC

**Same Wi‑Fi as phone (LAN):**

```powershell
npm start
```

**Phone cannot reach PC** (common on Windows) — use **tunnel**:

```powershell
npm run start:tunnel
```

Wait until the terminal shows **`Tunnel ready.`** (can take 1–2 minutes).

Clear cache if something looks stale:

```powershell
npx expo start -c --tunnel
```

### Step 3 — Open the app on the phone

1. Open **Expo Go** (SDK 56 build from expo.dev/go)
2. Tap **Scan QR code**
3. Scan the QR from the terminal or browser window

Do **not** scan with Notes, Google Lens, or the default camera — open **Expo Go** first, then scan from inside the app.

### Step 4 — Reload after code changes

- Shake the phone → **Reload**, or  
- Press `r` in the terminal where Metro is running

### Troubleshooting (dev)

| Error | What to do |
|-------|------------|
| `Project is incompatible with Expo Go` | Install **SDK 56** Expo Go from [expo.dev/go](https://expo.dev/go), not Play Store |
| `failed to download remote update` | Use `npm run start:tunnel`; allow Node.js in Windows Firewall |
| `failed to start tunnel` | See [docs/EXPO_TUNNEL.md](docs/EXPO_TUNNEL.md) |
| QR opens in Notes / browser only | Scan from **inside Expo Go** |
| App offline / cannot reach ESP32 | Phone and ESP32 must be on the **same Wi‑Fi**; set IP in **Settings** |

More tunnel help: [docs/EXPO_TUNNEL.md](docs/EXPO_TUNNEL.md)

---

## B. Install on phone (EAS build — recommended for daily use)

Builds a real **APK** in Expo’s cloud. Install once; no QR code and no PC connection needed when using the app.

### Step 1 — Log in to Expo (once)

```powershell
npx eas-cli login
```

### Step 2 — Build the APK

```powershell
npx eas-cli build --profile preview --platform android
```

- First build: answer prompts; choose **Yes** when Expo offers to create an Android keystore
- Wait ~10–20 minutes on [expo.dev](https://expo.dev) → project **esp32-mobile** → **Builds**

### Step 3 — Install on Android

1. Open the finished build on [expo.dev](https://expo.dev) (on your phone browser is fine)
2. Tap **Download** (`.apk`)
3. Allow install from browser/files if Android asks
4. Install and open **ESP32-Mobile** from the home screen

### Step 4 — After you change the app

Run the build command again, download the new APK, and install (replace the old version).

```powershell
npx eas-cli build --profile preview --platform android
```

---

## Using the app with your ESP32

1. Power on the ESP32 and connect it to your home Wi‑Fi
2. Put your **phone on the same Wi‑Fi**
3. Open the app → **Settings**
4. Enter the ESP32 IP (default: `192.168.100.161`) or use **Scan Network**
5. **Home** — tap a line to turn it on/off manually
6. **Schedules** — configure watering windows
7. **Logs** — view recent activity

The app talks to the ESP32 over plain HTTP (`http://<ip>/...`). HTTP to local IPs only works on the same network; tunnel mode only helps load the app in Expo Go, not reach the ESP32 from another network.

---

## Other commands

```powershell
# Web UI on PC (no phone)
npm run web

# Android emulator or USB device (needs Android Studio + device/emulator)
npm run android
```

---

## API & firmware

- Mobile API: [docs/MOBILE_API.md](docs/MOBILE_API.md)
- Firmware line count / Line 3+: [docs/FIRMWARE_DYNAMIC_LINES.md](docs/FIRMWARE_DYNAMIC_LINES.md)

Quick reference:

- `GET http://<IP>/status` — includes `LineCount` and line states
- `GET/POST http://<IP>/line/{n}` — manual control
- `GET/POST http://<IP>/schedule/{n}` — scheduler

Line display names and icons are configured in `services/lineLabels.js` (firmware still uses line numbers 1, 2, 3, …).
