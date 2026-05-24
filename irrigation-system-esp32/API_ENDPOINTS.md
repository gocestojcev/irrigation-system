# API Endpoints

Base URL: `http://<esp32-ip>` (port 80)

## Common Notes

- Content type for responses: `application/json`
- CORS headers are set to allow all origins (`*`)
- Allowed methods in CORS: `GET, POST, OPTIONS`
- Allowed headers in CORS: `Content-Type`

## 0) GET /status

Returns current runtime state for both lines, including active source.

- Success response (`200`):

```json
{
	"Epoch": 1711824150,
	"Time": "19:42:30",
	"Line1": {"Value": "on", "Source": "scheduled"},
	"Line2": {"Value": "off", "Source": "off"}
}
```

- `Source` values in `/status`:
	- `manual` = currently on due to manual state
	- `scheduled` = currently on due to schedule
	- `off` = line is currently off

## 0b) OPTIONS /status

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## 1) GET /line/1

Returns current state for line 1.

- Success response (`200`):

```json
{"Value": "on"}
```

or

```json
{"Value": "off"}
```

## 2) GET /line/2

Returns current state for line 2.

- Success response (`200`):

```json
{"Value": "on"}
```

or

```json
{"Value": "off"}
```

## 3) POST /line/1

Sets state for line 1.

When set to `on`, the device first turns other lines `off` (manual single-line activation).

- Required body (`application/json`):

```json
{"Value":"on"}
```

or

```json
{"Value":"off"}
```

- Success response (`200`):

```json
{"Value": "on"}
```

or

```json
{"Value": "off"}
```

- Error responses (`400`):

```json
{"error": "missing body"}
```

```json
{"error": "invalid value, expected {"Value":"on"} or {"Value":"off"}"}
```

## 4) POST /line/2

Sets state for line 2.

When set to `on`, the device first turns other lines `off` (manual single-line activation).

- Required body (`application/json`):

```json
{"Value":"on"}
```

or

```json
{"Value":"off"}
```

- Success response (`200`):

```json
{"Value": "on"}
```

or

```json
{"Value": "off"}
```

- Error responses (`400`):

```json
{"error": "missing body"}
```

```json
{"error": "invalid value, expected {"Value":"on"} or {"Value":"off"}"}
```

## 5) OPTIONS /line/1

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## 6) OPTIONS /line/2

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## Fallback (all other routes)

Any unknown URI returns:

- Status: `404`
- Body:

```json
{"error": "URI not found", "uri": "<requested-uri>"}
```

## 7) GET /schedule/1

Returns scheduler config for line 1.

- Success response (`200`):

```json
{"Enabled": true, "Start": "08:30:00", "End": "17:00:00", "Duration": 120, "IntervalSec": 0, "DaysMask": 62, "Days": ["Mon","Tue","Wed","Thu","Fri"]}
```

## 8) GET /schedule/2

Returns scheduler config for line 2.

- Success response (`200`):

```json
{"Enabled": true, "Start": "08:30:00", "End": "17:00:00", "Duration": 120, "IntervalSec": 0, "DaysMask": 62, "Days": ["Mon","Tue","Wed","Thu","Fri"]}
```

## 9) POST /schedule/1

Sets scheduler config for line 1.

- Request body (`application/json`):

```json
{"Start":"08:30:00", "End":"17:00:00", "Duration":120, "IntervalSec":0, "DaysMask":62}
```

or with explicit enable/disable:

```json
{"Enabled":true, "Start":"08:30:00", "End":"17:00:00", "Duration":120, "IntervalSec":0, "DaysMask":62}
```

Recurring example, every hour for 5 minutes (10:00–18:00):

```json
{"Enabled":true, "Start":"10:00:00", "End":"18:00:00", "Duration":300, "IntervalSec":3600, "DaysMask":127}
```

Disable schedule while keeping last configured values:

```json
{"Enabled":false}
```

Disable schedule and update active days:

```json
{"Enabled":false,"DaysMask":65}
```

- Success response (`200`):

```json
{"Enabled": true, "Start": "08:30:00", "End": "17:00:00", "Duration": 120, "IntervalSec": 0, "DaysMask": 62, "Days": ["Mon","Tue","Wed","Thu","Fri"]}
```

- Error responses (`400`):

```json
{"error": "missing body"}
```

```json
{"error": "invalid Enabled, expected true or false"}
```

```json
{"error": "missing Start or Duration"}
```

```json
{"error": "invalid Start, expected HH:MM:SS"}
```

```json
{"error": "invalid End, expected HH:MM:SS"}
```

```json
{"error": "invalid End, must be after Start"}
```

```json
{"error": "invalid Duration, expected 1..86400"}
```

```json
{"error": "invalid IntervalSec, expected 0..86400"}
```

```json
{"error": "invalid IntervalSec, expected 0 or >= Duration"}
```

```json
{"error": "invalid DaysMask, expected 0..127"}
```

```json
{"error": "schedule overlaps with the other active line"}
```

```json
{"error": "schedule would activate while another line is already on"}
```

Same behavior as `/schedule/1`, for line 2.

## 11) OPTIONS /schedule/1

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## 12) OPTIONS /schedule/2

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## 13) GET /logs

Returns activity log entries (newest first).

- Optional query parameter:
	- `limit` (1..60), default `50`

- Success response (`200`):

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

- `Source` values:
	- `manual` = change requested by `POST /line/{n}`
	- `scheduled` = change applied by scheduler evaluation in main loop
	- `system` = internal firmware action (e.g. startup safe-off)
	- `unknown` = fallback for unexpected source values

## 14) POST /logs/clear

Clears all persisted activity logs.

- Success response (`200`):

```json
{"ok": true}
```

## 15) OPTIONS /logs

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## 16) OPTIONS /logs/clear

CORS preflight endpoint.

- Success response: `200` with empty body (`text/plain`)

## Scheduler behavior

- Time source: NTP (`pool.ntp.org`)
- Each line can have one daily schedule with:
	- `Start` in `HH:MM:SS` (opening time of the daily schedule window)
	- `End` in `HH:MM:SS` (closing time of the daily schedule window; default end-of-day `24:00:00`)
	- `Duration` in seconds (`1..86400`)
	- `IntervalSec` in seconds (`0..86400`), where `0` means once per day, otherwise repeats every N seconds within `Start`–`End` window
	- `DaysMask` as bitmask (`0..127`, bit0=Sun ... bit6=Sat)
- `DaysMask` values:
	- `1`=Sun, `2`=Mon, `4`=Tue, `8`=Wed, `16`=Thu, `32`=Fri, `64`=Sat
	- `127`=every day, `62`=Mon-Fri, `65`=Sun+Sat, `0`=no days active
- If `DaysMask` is omitted in `POST /schedule/{line}`, previous mask is kept.
- If `IntervalSec` is omitted in `POST /schedule/{line}`, previous interval is kept.
- If `End` is omitted in `POST /schedule/{line}`, previous `End` is kept.
- For new/empty schedule storage, default `DaysMask` is `127` (all days).
- For new/empty schedule storage, default `IntervalSec` is `0` (once per day).
- For new/empty schedule storage, default `End` is `24:00:00` (end of day window).
- If `IntervalSec > 0`, the schedule repeats every `IntervalSec` seconds starting from `Start` and ending at `End`.
- `IntervalSec` must be `0` or greater than/equal to `Duration`.
- If a line schedule is enabled, line output is controlled by schedule.
- If a line schedule is disabled, line output follows manual `/line/{n}` state.
- If a line is manually turned on before a schedule window starts, it remains on during the window and is forced off when that schedule window ends.
- Schedules repeat every day and support crossing midnight.
- **Two lines cannot have overlapping schedules on common active days** — the API rejects the second schedule with a `400` error.
- The API also rejects a schedule save if it would turn a line on immediately while another line is already active.
- As a safety net, runtime arbitration always suppresses all but one active line.
- Schedule settings are persisted in ESP32 NVS and survive reboot/power cycle.
- Activity logs are persisted in ESP32 NVS and survive reboot/power cycle.
- Log capacity is 60 entries (ring buffer, oldest entries are overwritten).
