# IoT Implementation Plan (ESP32 + AWS Relay)

**Last reviewed:** 2026-05-24 (branch `iot`)  
**Parent plan:** [IMPLEMENTATION_PLAN.md](../../irrigation-system-aws/IMPLEMENTATION_PLAN.md)

## Goal
Enable secure remote control of the ESP32 from the public internet **without exposing the device directly** and **without requiring a static public IP**.

---

## Chosen Architecture
- **ESP32 firmware** connects outbound to **AWS IoT Core** over MQTT/TLS using per-device X.509 certificates.
- **Mobile app** calls a **cloud API** (API Gateway + Lambda), not the ESP directly.
- **Cloud backend** validates requests, authorizes user/device access, and writes commands to AWS IoT Thing Shadow.
- **ESP32** consumes shadow deltas, applies local safety rules, executes relay actions, and reports status back.

### Why this approach
- Works behind NAT/CGNAT and dynamic IP.
- No router port-forwarding required.
- Centralized auth, auditing, and rate limiting.
- Production-friendly and scalable.

---

## Responsibility Split

### Cloud (API + Lambda) — mostly implemented
- Authenticate users (Cognito JWT).
- Authorize access per device (DynamoDB `device_user_access`).
- Validate request shape/ranges.
- Write command to Thing Shadow `desired.command`.
- Track command lifecycle in DynamoDB; ingest results from MQTT topic.
- Return `202 Accepted` with cloud-generated `commandId`.

### Device (ESP32) — implemented (pending hardware E2E)
- MQTT/TLS connect with per-device certificate.
- Subscribe to Thing Shadow delta for `state.desired.command`.
- Map commands to existing internal handlers (`line`, `schedule`, `logs`).
- Keep final, authoritative validation and safety logic.
- Publish `reported` shadow (`status`, `schedule`, `lastCommand`) with NTP-based ISO-8601 timestamps.
- Publish acknowledgements to `irrigation/devices/{deviceId}/command-result`.
- Periodic shadow heartbeat (`SHADOW_HEARTBEAT_INTERVAL_MS`, default 60s).
- WiFi credentials from NVS or gitignored `secrets/wifi_secrets.h` (no hardcoded defaults in `config.h`).

> Validation exists in both layers by design (defense in depth):
> cloud = gateway protection, device = final safety barrier.

---

## API Strategy for Mobile

Cloud routes mirror local ESP32 shapes but add a device prefix and auth:

| Local (LAN) | Cloud |
|-------------|-------|
| `GET /status` | `GET /devices/{deviceId}/status` |
| `GET/POST /line/{n}` | `GET/POST /devices/{deviceId}/line/{n}` |
| `GET/POST /schedule/{n}` | `GET/POST /devices/{deviceId}/schedule/{n}` |
| `GET /logs` | `GET /devices/{deviceId}/logs` |
| `POST /logs/clear` | `POST /devices/{deviceId}/logs/clear` |
| — | `GET /devices/{deviceId}/commands/{commandId}` |

Write flow:
1. Mobile sends authenticated request to cloud API.
2. Cloud validates and writes `desired.command` with `commandId`.
3. ESP receives shadow delta, executes, publishes result.
4. Mobile polls command status or re-reads status.

Read flow:
- `GET /status`, `/line`, `/schedule` read from Thing Shadow **reported**.
- `GET /logs` reads from DynamoDB (ingested from device MQTT telemetry).

---

## Thing Shadow Contract (firmware must implement)

See [command-envelope.v1.json](../../irrigation-system-aws/schemas/command-envelope.v1.json) and [reported-state.v1.json](../../irrigation-system-aws/schemas/reported-state.v1.json).

**Subscribe:** shadow delta where `state.desired.command` changes.  
**Publish reported:** update `state.reported` with `status`, `schedule`, `lastCommand`.  
**Publish result:** MQTT topic `irrigation/devices/{deviceId}/command-result`.

After processing a command, clear or merge `desired.command` per AWS shadow semantics to avoid re-processing.

---

## Monorepo Layout
```
irrigation-system/
  irrigation-system-esp32/    ← this project (PlatformIO)
  irrigation-system-aws/      ← CDK + Lambda
  irrigation-system-mobile/   ← Expo app
```

Local HTTP API remains useful for LAN development and optional fallback.

---

## Phase Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Contracts + access model | Done (cloud) |
| 2 | Cloud MVP | Done (dev deployed) |
| 2.5 | Device onboarding (Thing, cert, policy) | Done (script + dev device) |
| 3 | ESP32 MQTT + shadow handler | Code done — E2E pending |
| 3b | Mobile cloud integration | Done (cloud/LAN modes) |
| 4 | Logs in DynamoDB | Mostly done |
| 5 | Hardening + ops | Partial |

---

## Firmware Tasks (Phase 3)

1. Add PlatformIO dependency for AWS IoT MQTT client (evaluate `256dpi/arduino-mqtt` + TLS certs or ESP-IDF AWS IoT port).
2. Load device cert/key/endpoint from embedded files or NVS (not committed to git).
3. Connect and subscribe to `$aws/things/{thingName}/shadow/update/delta`.
4. Parse `command` envelope; reject unknown `schemaVersion` or duplicate `commandId`.
5. Dispatch by `type`:
   - `line.set` → existing relay/manual logic
   - `schedule.set` → existing scheduler persistence
   - `logs.clear` → existing log clear
6. Update reported shadow and publish `command-result`.
7. Implement reconnect backoff and periodic reported-state heartbeat; preserve existing HTTP server for LAN use.

**Note:** firmware and cloud both support **3 relay lines** (`LINE_COUNT=3`).

---

## Vertical Slice Target
1. `POST /devices/{deviceId}/line/1` accepted by cloud.
2. ESP32 executes and reports `applied`.
3. `GET /devices/{deviceId}/status` shows updated line state.

---

## Non-Goals (initial rollout)
- Direct internet exposure of device HTTP endpoints.
- Port forwarding / DDNS-based control.

---

## Notes
- Existing local endpoints remain useful for LAN testing.
- Cloud path becomes the primary production control plane for remote access.
- NTP sync is already required and used in firmware (`main.cpp`).
