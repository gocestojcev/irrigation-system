# Moisture Sensors Implementation Plan

**Branch:** `feature/moisture-sensors`  
**Last updated:** 2026-05-24  
**Status:** Mobile UI mock complete; firmware and cloud not started

Cross-cutting feature: one soil moisture sensor per irrigation line (zone). Follows the same patterns as relay control, logs, and Thing Shadow sync.

---

## Done (mobile UI — mock data)

| Item | Location |
|------|----------|
| 💧 icon under line avatar on Home | `irrigation-system-mobile/App.js` |
| Moisture tab (line picker, readout, chart) | `irrigation-system-mobile/App.js` |
| Icon, chart, mock data service | `components/MoistureIconButton.js`, `MoistureHistoryChart.js`, `MoistureReadout.js` |
| Mock + future API hooks | `services/moistureSensors.js` |

Mobile already parses live data when firmware exposes `LineN.MoisturePercent` on `/status`. History still uses `generateMockMoistureHistory()` until backend exists.

---

## Target architecture

Device is source of truth; cloud mirrors for remote access (same as relays + logs).

```
Soil sensor (per line)
    → ESP32 read + calibrate
    → /status (current) + optional LAN history
    → MQTT sample publish
    → IoT Rule → DynamoDB
    → GET /devices/{deviceId}/moisture/{lineId}
    → Mobile (LAN or Cloud mode)
```

| Data | LAN | Cloud |
|------|-----|-------|
| Current % | `GET /status` | Thing Shadow `reported.status` or status GET |
| History | `GET /moisture/{lineId}?range=…` (phase 2) | `GET /devices/{deviceId}/moisture/{lineId}?range=…` |

---

## Proposed API contract

### Extend `GET /status` (LAN + shadow)

```json
{
  "LineCount": 3,
  "Line1": {
    "Value": "off",
    "Source": "off",
    "MoisturePercent": 42,
    "MoistureUpdatedAt": "2026-05-24T14:30:00.000Z"
  }
}
```

Mobile parser: `services/moistureSensors.js` → `parseMoistureFromStatus()`.

### New LAN endpoint (phase 2)

`GET /moisture/{lineId}?range=3d|1w|1m`

```json
{
  "lineId": 1,
  "range": "3d",
  "points": [
    { "timestamp": "2026-05-24T12:00:00.000Z", "percent": 40 }
  ]
}
```

### New cloud endpoint (phase 3)

`GET /devices/{deviceId}/moisture/{lineId}?range=3d|1w|1m`  
Same response shape. Role: `viewer` (same as logs).

### MQTT topic (phase 3)

`irrigation/devices/{thingName}/moisture`

```json
{
  "deviceId": "irrigation-dev-001",
  "lineId": 1,
  "percent": 42,
  "sampledAt": "2026-05-24T14:30:00.000Z"
}
```

Publish on interval (e.g. every 15–60 min) and/or on significant change. Include latest value in shadow heartbeat.

---

## Implementation phases

### Phase 1 — Hardware + firmware (current reading only)

**Goal:** Real `%` on Home in LAN mode.

1. **Hardware decision**
   - Sensor type: capacitive analog vs I2C
   - One sensor per line zone; GPIO / ADC pin map (ESP32 ADC1: GPIO 32–39)
   - Per-line calibration (dry/wet → 0–100%), store min/max in NVS

2. **Firmware** (`irrigation-system-esp32`)
   - New module: `moisture_sensor.cpp` — ADC read, smoothing, 0–100% mapping
   - Poll interval: e.g. every 5 minutes
   - Extend status JSON in `device_api.cpp` / `api.cpp`
   - Document in `docs/API_ENDPOINTS.md`

3. **Mobile** (small change)
   - Live values appear automatically via `parseMoistureFromStatus`
   - Hide “Preview” badge when `isMock: false`
   - Keep mock fallback only when field missing

**Acceptance:** `GET /status` returns `MoisturePercent`; Home icons update on refresh.

---

### Phase 2 — Firmware history buffer

**Goal:** Moisture tab history works in LAN mode without cloud.

1. Ring buffer in NVS/SPIFFS (~30 days at 1 sample/hour, or sparser for 1 month)
2. `GET /moisture/{lineId}?range=…` on local HTTP server
3. Mobile: `irrigationApi.getMoistureHistory(lineId, range)`; Moisture tab calls API instead of mock

**Acceptance:** Chart shows real LAN data for 3d / 1w / 1m.

---

### Phase 3 — AWS backend

**Goal:** Cloud mode parity.

1. **Schema** — extend `schemas/reported-state.v1.json` `lineStatus`:
   - `MoisturePercent` (0–100, optional)
   - `MoistureUpdatedAt` (ISO-8601, optional)

2. **DynamoDB** — `device_moisture_{stage}`
   - PK: `DEVICE#{deviceId}`
   - SK: `LINE#{lineId}#TS#{iso8601}`
   - Attributes: `percent`, `lineId`, `sampledAt`
   - Optional TTL for retention (e.g. 90 days)

3. **Lambda**
   - `ingest-moisture-sample.ts` (IoT Rule)
   - `get-moisture-history.ts` (API Gateway)
   - Update validation + OpenAPI

4. **Firmware IoT**
   - Publish samples on interval
   - Include latest in shadow `reported.status`
   - Backfill buffer on MQTT reconnect (like logs)

5. Deploy dev stack (`npm run deploy:dev`)

**Acceptance:** Cloud Home + Moisture tab use live API on `irrigation-dev-001`.

---

### Phase 4 — Mobile polish

1. Wire `fetchMoistureHistory()` for LAN + cloud
2. Pull-to-refresh on Moisture tab
3. Loading / empty / error states
4. Optional: Home banner when any line below target (35%)
5. Merge `feature/moisture-sensors` → `main`

---

### Phase 5 — Future (out of scope for first release)

- Per-line target thresholds in Settings
- “Suggest watering” from moisture + schedule
- Skip scheduled run if soil already wet
- Push notifications / alarms

---

## Recommended work order

| Step | Task | Repo |
|------|------|------|
| 1 | Confirm sensor hardware + wiring | Hardware |
| 2 | Firmware: ADC → `%` in `/status` | `irrigation-system-esp32` |
| 3 | Test LAN — Home icons live | `irrigation-system-mobile` |
| 4 | Update `API_ENDPOINTS.md` | `irrigation-system-esp32` |
| 5 | History buffer + `GET /moisture/{n}` | esp32 |
| 6 | Mobile LAN history API | mobile |
| 7 | AWS ingest + GET + shadow schema | `irrigation-system-aws` |
| 8 | E2E cloud test on `irrigation-dev-001` | all |

---

## Open decisions

| Topic | Options |
|-------|---------|
| Sensor model | Capacitive analog vs I2C |
| Sample rate | e.g. 5 min local display, 15 min cloud |
| History retention | 30 / 90 days TTL vs unlimited |
| Mock fallback | Per-line: mock only when `MoisturePercent` absent |

---

## Mobile files (reference)

| File | Role |
|------|------|
| `services/moistureSensors.js` | Parse status, thresholds, mock history → add `fetchMoistureHistory` |
| `services/irrigationApi.js` | Add LAN + cloud moisture endpoints |
| `components/MoistureIconButton.js` | Home screen icon |
| `components/MoistureHistoryChart.js` | History chart |
| `components/MoistureReadout.js` | Current readout on Moisture tab |
| `App.js` | Tab + navigation; swap mock history for API |

---

## Related docs

- [DEPLOYMENT.md](../DEPLOYMENT.md) — flash, deploy, mobile dev
- [API_ENDPOINTS.md](../irrigation-system-esp32/docs/API_ENDPOINTS.md) — LAN HTTP (extend for moisture)
- [IMPLEMENTATION_PLAN.md](../irrigation-system-aws/IMPLEMENTATION_PLAN.md) — cloud integration patterns
- [iot-implementation.md](../irrigation-system-esp32/docs/iot-implementation.md) — MQTT / shadow
