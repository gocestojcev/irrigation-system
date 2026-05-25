# Irrigation System — Deployment Guide

This document explains how to deploy and run all three parts of the monorepo in **dev**:

| Component | Directory | Role |
|-----------|-----------|------|
| ESP32 firmware | `irrigation-system-esp32` | Relay control, schedules, local HTTP API, AWS IoT MQTT |
| Mobile app | `irrigation-system-mobile` | LAN-first control with optional Cloud mode |
| AWS backend | `irrigation-system-aws` | API Gateway, Lambda, IoT Core, DynamoDB |

**Prerequisites (shared):**

- Git clone of this monorepo
- AWS CLI configured (profile `goce` in examples below)
- Region: `eu-central-1`

---

## 1. AWS infrastructure (deploy first)

Deploy the cloud stack before provisioning devices or using Cloud mode in the app.

### 1.1 Install and deploy

```powershell
cd irrigation-system-aws
npm install
npm run deploy:dev
```

Uses AWS profile **`goce`** (see `package.json` script). Outputs the API URL, e.g.:

`https://fegc56wnv1.execute-api.eu-central-1.amazonaws.com/dev`

### 1.2 Configure Cognito

Set `userPoolId` per environment in `cdk.json` → `context.environments`. The mobile app reads pool/client IDs from `app.json` → `extra.irrigation` (with fallbacks in `services/config.js`).

### 1.3 Grant user access to a device

```powershell
npm run seed:access -- --table=device_user_access_dev --user-sub=<cognito-sub> --device-id=irrigation-dev-001 --role=owner --status=active
```

Roles: `viewer` (read), `operator` (write), `owner`.

### 1.4 Provision an IoT Thing + certificate

Creates Thing, policy, certificate, and writes `irrigation-system-esp32/secrets/iot_secrets.h`:

```powershell
npm run provision:device -- --device-id=irrigation-dev-001 --stage=dev --profile=goce
```

Certificates are **not** committed to git. Keep `secrets/iot_secrets.h` and `secrets/wifi_secrets.h` local only.

### 1.5 Redeploy after Lambda changes

```powershell
npm run deploy:dev
```

### 1.6 Prod (later)

1. Set prod Cognito pool in `cdk.json`
2. `npm run deploy:prod`

See [irrigation-system-aws/IMPLEMENTATION_PLAN.md](irrigation-system-aws/IMPLEMENTATION_PLAN.md) for Phase 5 ops items (CI/CD, alarms, dashboards).

---

## 2. ESP32 firmware — flash and monitor

### 2.1 Secrets

Copy examples or use provisioning output:

```powershell
cd irrigation-system-esp32
# secrets/wifi_secrets.h  — SSID/password
# secrets/iot_secrets.h   — Thing name, endpoint, cert, key (from provision:device)
```

### 2.2 Build, upload, serial monitor

PlatformIO (Windows — adjust path if needed):

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -t upload
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor
```

Or if `pio` is on PATH:

```powershell
pio run -t upload
pio device monitor
```

Set upload port in `platformio.ini` if required (`upload_port = COM4`).

### 2.3 Expected serial output

```
WiFi connected
IP: 192.168.x.x
HTTP server started
[IOT] Client initialized for thing irrigation-dev-001
[IOT] MQTT connected
[IOT] Shadow reported published (… bytes)
```

Occasional `[IOT] MQTT disconnected, state=-3` on boot followed by a stable connection is normal.

### 2.4 Verify shadow (optional)

```powershell
aws iot-data get-thing-shadow --thing-name irrigation-dev-001 --profile goce --region eu-central-1 shadow.json
```

Reported `status` should show live `Epoch` / `Time`, not stale zeros.

### 2.5 Local HTTP API

While on the same LAN:

- `GET http://<device-ip>/status`
- `GET http://<device-ip>/schedule/1`
- `POST http://<device-ip>/line/1` body `{"Value":"on"}`

See [irrigation-system-esp32/API_ENDPOINTS.md](irrigation-system-esp32/API_ENDPOINTS.md).

---

## 3. Mobile app — dev mode

### 3.1 Install

```powershell
cd irrigation-system-mobile
npm install
```

### 3.2 Run (Expo Go)

**Default connection mode is LAN** — app talks to `http://<server-ip>/…` on your Wi‑Fi.

Same Wi‑Fi as phone and ESP32:

```powershell
npm start
# or
npm run start:lan
```

Phone cannot reach PC (common on corporate/restricted Wi‑Fi) — tunnel for **Metro only**:

```powershell
npm run start:tunnel
# more reliable with your own ngrok account:
npm run start:tunnel:ngrok
```

Scan QR with **Expo Go SDK 56** from [expo.dev/go](https://expo.dev/go).

### 3.3 LAN unreachable → Cloud

If the ESP32 is not reachable on LAN, a banner offers **Switch to Cloud** (with confirmation). Cloud mode requires:

- Sign-in (Cognito)
- Device ID = IoT Thing name (e.g. `irrigation-dev-001`)
- API base URL from stack output

Configure in **Settings** or use defaults in `services/config.js`.

### 3.4 Production APK (optional)

```powershell
npx eas-cli login
npx eas-cli build --profile preview --platform android
```

See [irrigation-system-mobile/README.md](irrigation-system-mobile/README.md).

---

## 4. End-to-end smoke test

Run with ESP32 powered, flashed, and dev stack deployed.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Mobile LAN mode, correct server IP | Home loads lines + schedules |
| 2 | Toggle Line 1 | Relay changes; `/status` updates |
| 3 | Schedules tab → save | Schedule persists after refresh |
| 4 | Logs tab | Entries appear (LAN: local; Cloud: after MQTT sync) |
| 5 | Switch to Cloud (or offline banner) → sign in | Home loads from shadow |
| 6 | Cloud toggle Line 2 | Serial: `[IOT] Shadow delta command received` |
| 7 | IoT Console Activity | `shadow/update/accepted` every ~60s |

---

## 5. Dev environment reference

| Item | Value |
|------|-------|
| AWS profile | `goce` |
| Region | `eu-central-1` |
| API base URL | `https://fegc56wnv1.execute-api.eu-central-1.amazonaws.com/dev` |
| Cognito User Pool | `eu-central-1_i66pYQHZR` |
| Cognito app client | `irrigation-system-mobile` |
| Test Thing | `irrigation-dev-001` |
| Default LAN IP (app) | `192.168.100.161` (change in Settings) |

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Mobile 404 Cloud Home | No device shadow | Wait for ESP32 MQTT + shadow publish |
| Mobile 502 Cloud Home | Shadow schema mismatch | Redeploy latest Lambdas |
| MQTT reconnect loop | TLS re-init each connect | Flash latest firmware (`iot_client.cpp` fixes) |
| Cloud command ignored | Delta parse bug | Flash firmware with `state.command` delta fix |
| Expo tunnel drops | Expo tunnel instability | `npm run start:tunnel:ngrok` |
| `fetchAllData warning` in dev console | LAN unreachable | Handled — banner only; no crash in production |

---

## Related docs

- [IMPLEMENTATION_PLAN.md](irrigation-system-aws/IMPLEMENTATION_PLAN.md) — architecture and phase status
- [iot-implementation.md](irrigation-system-esp32/docs/iot-implementation.md) — ESP32 MQTT/shadow details
- [EXPO_TUNNEL.md](irrigation-system-mobile/docs/EXPO_TUNNEL.md) — tunnel troubleshooting
