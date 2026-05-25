# ESP32 IoT Integration (MQTT + Thing Shadow)

**Last reviewed:** 2026-05-25  
**Architecture & phases:** [IMPLEMENTATION_PLAN.md](../../irrigation-system-aws/IMPLEMENTATION_PLAN.md)  
**Deploy / flash:** [DEPLOYMENT.md](../../DEPLOYMENT.md)

## Status

Firmware IoT integration is **complete and E2E-verified** on `irrigation-dev-001`. Flash and monitor: [DEPLOYMENT.md §2](../../DEPLOYMENT.md#2-esp32-firmware--flash-and-monitor).

---

## LAN vs cloud API (mobile)

| Local (LAN) | Cloud |
|-------------|-------|
| `GET /status` | `GET /devices/{deviceId}/status` |
| `GET/POST /line/{n}` | `GET/POST /devices/{deviceId}/line/{n}` |
| `GET/POST /schedule/{n}` | `GET/POST /devices/{deviceId}/schedule/{n}` |
| `GET /logs` | `GET /devices/{deviceId}/logs` |
| `POST /logs/clear` | `POST /devices/{deviceId}/logs/clear` |
| — | `GET /devices/{deviceId}/commands/{commandId}` |

LAN HTTP reference: [API_ENDPOINTS.md](./API_ENDPOINTS.md).

**Write flow:** mobile → cloud API → shadow `desired.command` → ESP32 delta → execute → `command-result` MQTT + updated `reported`.

**Read flow:** cloud GET handlers read Thing Shadow `reported` (status/schedule). Logs read from DynamoDB (MQTT ingest).

---

## Thing Shadow contract (firmware)

Schemas: [command-envelope.v1.json](../../irrigation-system-aws/schemas/command-envelope.v1.json), [reported-state.v1.json](../../irrigation-system-aws/schemas/reported-state.v1.json).

| Topic / action | Purpose |
|----------------|---------|
| Subscribe `$aws/things/{thing}/shadow/update/delta` | Receive `state.command` (not `state.desired.command`) |
| Publish `$aws/things/{thing}/shadow/update` | Update `reported`; clear `desired.command` when done |
| Publish `irrigation/devices/{thing}/command-result` | Command lifecycle for DynamoDB ingest |
| Publish `irrigation/devices/{thing}/logs` | Log events for DynamoDB ingest |

After processing a command, publish reported state with `desired.command: null` to clear the delta.

Implementation: `src/iot_client.cpp`, shared handlers in `src/device_api.cpp`.

---

## Firmware implementation checklist

| # | Task | Location |
|---|------|----------|
| 1 | MQTT/TLS (PubSubClient + WiFiClientSecure) | `src/iot_client.cpp` |
| 2 | Cert/key/endpoint from `secrets/iot_secrets.h` | `provision-device.ts` |
| 3 | Shadow delta subscription | `iot_client.cpp` |
| 4 | Command envelope parse + NVS `commandId` idempotency | `iot_client.cpp` |
| 5 | Dispatch `line.set`, `schedule.set`, `logs.clear` | `device_api.cpp` |
| 6 | Reported shadow + command-result publish | `iot_client.cpp` |
| 7 | Reconnect backoff + 60s shadow heartbeat | `iot_client.cpp` |
| 8 | ISO-8601 timestamps from NTP | `logging_utils.cpp` |
| 9 | WiFi via NVS / `secrets/wifi_secrets.h` | `wifi_config.cpp` |
| 10 | Log backfill to cloud on MQTT connect | `iot_client.cpp` |

**Line count:** firmware and cloud support **3 lines** (`LINE_COUNT=3`). See [FIRMWARE_DYNAMIC_LINES.md](./FIRMWARE_DYNAMIC_LINES.md).

---

## Expected serial output

```
WiFi connected
HTTP server started
[IOT] Client initialized for thing irrigation-dev-001
[IOT] MQTT connected
[IOT] Shadow reported published (… bytes)
```

On cloud command: `[IOT] Shadow delta command received`.

---

## Non-goals

- Exposing device HTTP API to the public internet.
- Port forwarding / DDNS remote access.

Local HTTP remains for LAN development and optional fallback.
