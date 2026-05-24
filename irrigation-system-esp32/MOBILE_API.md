# ESP32 Relay API (Mobile Integration)

## Base
- Base URL: `http://<esp32-ip>`
- Port: `80`
- Content-Type (request): `application/json` for `POST`
- Content-Type (response): `application/json` (except `OPTIONS` => `text/plain` empty body)
- Auth: none

## CORS
All endpoints include:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

---

## Data Models

### Line state
```json
{"Value":"on"}
```
or
```json
{"Value":"off"}
```

### Runtime status
```json
{
  "Epoch": 1711824150,
  "Time": "19:42:30",
  "Line1": {"Value": "on", "Source": "scheduled"},
  "Line2": {"Value": "off", "Source": "off"}
}
```
- `Source` values in `/status`: `manual` | `scheduled` | `off`

### Schedule
```json
{"Enabled":true,"Start":"08:30:00","End":"17:00:00","Duration":120,"IntervalSec":0,"DaysMask":62,"Days":["Mon","Tue","Wed","Thu","Fri"]}
```
- `Enabled`: `true|false`
- `Start`: `HH:MM:SS` (24h) — when the daily schedule window opens
- `End`: `HH:MM:SS` (24h) — when the daily schedule window closes (default end-of-day `24:00:00`)
- `Duration`: seconds, range `1..86400`
- `IntervalSec`: `0..86400`; `0` means once per day, otherwise repeat every N seconds within the `Start`-`End` window
- `DaysMask`: `0..127` (`bit0=Sun`, `bit1=Mon`, ..., `bit6=Sat`)
- `Days`: derived readable list returned by API

DaysMask bit mapping:
- `1` = Sun
- `2` = Mon
- `4` = Tue
- `8` = Wed
- `16` = Thu
- `32` = Fri
- `64` = Sat

### Log entry
```json
{
  "Epoch": 1711824150,
  "Time": "19:42:30",
  "Line": 1,
  "Event": "Started",
  "Source": "scheduled",
  "DurationSec": 600,
  "DurationMin": 10
}
```
- `Event`: `Started` | `Stopped`
- `Source`: `manual` | `scheduled` | `system` | `unknown`
- `Time`: time-of-day derived from epoch (`HH:MM:SS`)

---

## Endpoints

## 0) Runtime status

### GET /status
Returns current state and active source for both lines.

**200**
```json
{
  "Epoch": 1711824150,
  "Time": "19:42:30",
  "Line1": {"Value": "on", "Source": "scheduled"},
  "Line2": {"Value": "off", "Source": "off"}
}
```

### OPTIONS /status
**200** empty body

## 1) Line control/status

### GET /line/1
### GET /line/2
Returns current relay state.

**200**
```json
{"Value":"on"}
```

### POST /line/1
### POST /line/2
Sets relay state.

If set to `on`, the device first turns other lines `off` (manual single-line activation).

Body:
```json
{"Value":"on"}
```
or
```json
{"Value":"off"}
```

**200**
```json
{"Value":"on"}
```

**400**
```json
{"error":"missing body"}
```

### OPTIONS /line/1
### OPTIONS /line/2
**200** empty body

---

## 2) Scheduler

### GET /schedule/1
### GET /schedule/2
Returns line schedule.

**200**
```json
{"Enabled":true,"Start":"08:30:00","End":"17:00:00","Duration":120,"IntervalSec":0,"DaysMask":62,"Days":["Mon","Tue","Wed","Thu","Fri"]}
```

### POST /schedule/1
### POST /schedule/2
Create/update schedule.

Body (auto-enable if `Enabled` omitted):
```json
{"Start":"08:30:00","End":"17:00:00","Duration":120,"IntervalSec":0,"DaysMask":62}
```

Body (explicit):
```json
{"Enabled":true,"Start":"08:30:00","End":"17:00:00","Duration":120,"IntervalSec":0,"DaysMask":62}
```

Recurring example: every hour for 5 minutes, 10:00–18:00
```json
{"Enabled":true,"Start":"10:00:00","End":"18:00:00","Duration":300,"IntervalSec":3600,"DaysMask":127}
```

Disable schedule (keep last `Start`/`Duration`):
```json
{"Enabled":false}
```

Disable schedule and update active days:
```json
{"Enabled":false,"DaysMask":65}
```

**200**
```json
{"Enabled":true,"Start":"08:30:00","End":"17:00:00","Duration":120,"IntervalSec":0,"DaysMask":62,"Days":["Mon","Tue","Wed","Thu","Fri"]}
```

**400** examples:
```json
{"error":"missing body"}
```
```json
{"error":"invalid Enabled, expected true or false"}
```
```json
{"error":"missing Start or Duration"}
```
```json
{"error":"invalid Start, expected HH:MM:SS"}
```
```json
{"error":"invalid End, expected HH:MM:SS"}
```
```json
{"error":"invalid End, must be after Start"}
```
```json
{"error":"invalid Duration, expected 1..86400"}
```
```json
{"error":"invalid IntervalSec, expected 0..86400"}
```
```json
{"error":"invalid IntervalSec, expected 0 or >= Duration"}
```
```json
{"error":"invalid DaysMask, expected 0..127"}
```
```json
{"error":"schedule overlaps with the other active line"}
```
```json
{"error":"schedule would activate while another line is already on"}
```

DaysMask quick examples:
- `127` = every day
- `62` = Mon-Fri
- `65` = Sun + Sat
- `0` = no days active

Update behavior:
- If `IntervalSec` is omitted in `POST /schedule/{line}`, the previous `IntervalSec` is kept.
- If `DaysMask` is omitted in `POST /schedule/{line}`, the previous `DaysMask` is kept.
- If `End` is omitted in `POST /schedule/{line}`, the previous `End` is kept.
- For new/empty schedule storage, default `IntervalSec` is `0` (once per day).
- For new/empty schedule storage, default `DaysMask` is `127` (all days).
- For new/empty schedule storage, default `End` is `24:00:00` (end of day window).

### OPTIONS /schedule/1
### OPTIONS /schedule/2
**200** empty body

---

## 3) Activity logs (persistent)

### GET /logs
Returns newest-first log list.

Optional query:
- `limit` => `1..60` (default `50`)

**200**
```json
{
  "Count": 2,
  "Logs": [
    {
      "Epoch": 1711824150,
      "Time": "19:42:30",
      "Line": 1,
      "Event": "Started",
      "Source": "scheduled",
      "DurationSec": 600,
      "DurationMin": 10
    },
    {
      "Epoch": 1711823550,
      "Time": "19:32:30",
      "Line": 1,
      "Event": "Stopped",
      "Source": "scheduled",
      "DurationSec": 602,
      "DurationMin": 11
    }
  ]
}
```

Notes:
- Max persisted capacity is **60** entries.
- Ring buffer behavior: oldest entries are overwritten.
- `Source` tells who triggered the hardware action (`manual`, `scheduled`, `system`).

### POST /logs/clear
Clears all logs.

**200**
```json
{"ok":true}
```

### OPTIONS /logs
### OPTIONS /logs/clear
**200** empty body

---

## 4) Fallback
Any unknown route:

**404**
```json
{"error":"URI not found","uri":"<requested-uri>"}
```

---

## Runtime behavior notes for mobile team

- Supported lines are only `1` and `2`.
- Scheduler is daily and repeats every day.
- Scheduler can be limited by weekday using `DaysMask`.
- Scheduler can be limited by time window using `Start` and `End` (default 00:00:00–24:00:00).
- Scheduler can repeat multiple times per day using `IntervalSec` within the `Start`–`End` window.
- **Two lines cannot have overlapping schedules on common active days** — the API rejects with `400`.
- The API also rejects a schedule save if it would turn a line on immediately while another line is already active.
- If a line is manually turned on before a schedule window starts, it remains on during the window and is forced off when that schedule window ends.
- As a safety net, runtime arbitration always suppresses all but one active line.
- Scheduler supports ranges crossing midnight.
- If schedule is enabled for a line, scheduler controls relay output.
- If schedule is disabled, manual `/line/{n}` state controls output.
- Schedule and logs are persisted in ESP32 NVS (survive reboot/power cycle).
- Device clock source is NTP (`pool.ntp.org`).
