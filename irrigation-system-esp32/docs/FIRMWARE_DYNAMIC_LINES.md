# Firmware guide: dynamic line count (`LineCount`)

This document describes how ESP32 firmware exposes relay lines so the mobile app discovers them automatically. After this is implemented, adding line 4 (or more) is a **firmware-only** change — no mobile app update.

**Related docs:** [API_ENDPOINTS.md](./API_ENDPOINTS.md) (endpoint reference), [MOBILE_API.md](./MOBILE_API.md) (integration guide).

---

## Goal

The mobile app calls `GET /status`, reads **`LineCount`**, then loads:

- `GET /schedule/1` … `GET /schedule/{LineCount}`
- Home UI and manual control use `Line1` … `Line{LineCount}` from the same `/status` response

If `LineCount` is missing, the app falls back to counting `Line1`, `Line2`, … keys in the JSON. **`LineCount` is still required** for a correct contract (gaps in numbering, future fields, and consistent endpoint range).

---

## 1. Single source of truth in firmware

Define the number of lines **once** at compile time (or from board config):

```c
// config.h (example)
#define LINE_COUNT 3
```

Every subsystem must use `LINE_COUNT` (or a `line_count` variable set at boot from the same constant):

| Area | What to size / loop |
|------|---------------------|
| GPIO / relays | `relay_pin[LINE_COUNT]` |
| Runtime state | `lines[LINE_COUNT]` (`value`, `source`, …) |
| Scheduler | `schedules[LINE_COUNT]` in RAM + NVS |
| HTTP routes | Register handlers for `n = 1 .. LINE_COUNT` |
| `/status` JSON | Emit `LineCount` + `Line1` … `Line{LINE_COUNT}` |
| Overlap checks | Compare new schedule against **all** other lines `1..LINE_COUNT` |
| Logs | `Line` field `1..LINE_COUNT` |

**Do not** hardcode `2` or `3` in scattered places. When you add a line, change **`LINE_COUNT` only** (plus hardware pin map).

---

## 2. `GET /status` response

### Required shape

```json
{
  "Epoch": 1711824150,
  "Time": "19:42:30",
  "LineCount": 3,
  "Line1": { "Value": "on",  "Source": "scheduled" },
  "Line2": { "Value": "off", "Source": "off" },
  "Line3": { "Value": "off", "Source": "off" }
}
```

### Field rules

| Field | Type | Rules |
|-------|------|--------|
| `LineCount` | integer | **Required.** Must equal the number of lines you expose. Range `1..32` (mobile cap). |
| `Line{n}` | object | **Required** for every `n` from `1` to `LineCount`. |
| `Line{n}.Value` | string | `"on"` or `"off"` only. |
| `Line{n}.Source` | string | `"manual"`, `"scheduled"`, or `"off"` (see existing API). |
| `Epoch` | integer | Unix seconds (unchanged). |
| `Time` | string | `HH:MM:SS` local or device time (unchanged). |

### Implementation sketch (pseudo-C)

```c
void append_status_json(JsonWriter *w) {
  json_object_start(w);
  json_int(w, "Epoch", time(NULL));
  json_string(w, "Time", format_time_hms());
  json_int(w, "LineCount", LINE_COUNT);

  for (int i = 0; i < LINE_COUNT; i++) {
    char key[8];
    snprintf(key, sizeof(key), "Line%d", i + 1);
    json_object_start(w, key);
    json_string(w, "Value", lines[i].on ? "on" : "off");
    json_string(w, "Source", source_to_string(lines[i].source));
    json_object_end(w);
  }
  json_object_end(w);
}
```

### Validation checklist

- [ ] `LineCount` matches the number of `Line{n}` objects (no missing index, no extra index).
- [ ] Keys are exactly `Line1`, `Line2`, … (capital **L**, no spaces).
- [ ] Response is valid JSON (trailing commas, UTF-8).

---

## 3. Per-line HTTP endpoints

For each `n` in `1 .. LINE_COUNT`, expose the same behavior as existing lines 1 and 2.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/line/{n}` | `{"Value":"on"}` or `{"Value":"off"}` |
| `POST` | `/line/{n}` | Body `{"Value":"on"}` or `{"Value":"off"}`; when turning **on**, turn other lines **off** (manual single-line rule). |
| `OPTIONS` | `/line/{n}` | CORS preflight, empty body |
| `GET` | `/schedule/{n}` | Full schedule object |
| `POST` | `/schedule/{n}` | Create/update; same validation as lines 1–2 |
| `OPTIONS` | `/schedule/{n}` | CORS preflight |

### Out-of-range line numbers

If the URI line index `n` is **not** in `1..LINE_COUNT`:

**404**

```json
{"error":"URI not found","uri":"/line/99"}
```

(or a dedicated message, e.g. `"invalid line"` — mobile treats non-2xx as failure).

### Route registration pattern

Avoid copy-pasting three handlers. Parse the line index from the URI once:

```c
// Example: /line/3 -> line_index = 3
int parse_line_index(const char *uri, const char *prefix); // returns 1..LINE_COUNT or -1

void handle_get_line(HttpRequest *req) {
  int n = parse_line_index(req->uri, "/line/");
  if (n < 1 || n > LINE_COUNT) return respond_404(req);
  respond_line_state(req, n - 1); // 0-based internal index
}
```

Same pattern for `/schedule/{n}`.

---

## 4. Hardware and runtime state

When `LINE_COUNT` goes from 2 → 3:

1. Add relay GPIO for line 3 in the pin map.
2. Extend `lines[]` initialization (default off).
3. Extend scheduler loop in the main tick: for `i = 0 .. LINE_COUNT-1`, evaluate `schedules[i]`.
4. Keep **single active line** arbitration: if more than one line would be on, firmware policy already documented in [MOBILE_API.md](./MOBILE_API.md) applies to **all** lines.

---

## 5. NVS / persistence

Use per-line keys so storage scales with `LINE_COUNT`:

```
schedule_1, schedule_2, schedule_3, ...
```

Or a blob `schedules` with size `sizeof(Schedule) * LINE_COUNT`.

On boot:

1. Load all `LINE_COUNT` schedules.
2. If a new line was added (e.g. upgraded firmware from 2 → 3 lines), **initialize line 3** with safe defaults:
   - `Enabled: false`
   - `Start: "08:00:00"`, `End: "24:00:00"`
   - `Duration: 60`, `IntervalSec: 0`, `DaysMask: 127`

Document defaults in code so field behavior matches [MOBILE_API.md](./MOBILE_API.md).

---

## 6. Scheduler overlap and arbitration

Existing rules apply to **every pair** of lines `1..LINE_COUNT`:

- Reject `POST /schedule/{n}` with **400** if the new window overlaps another **enabled** schedule on a shared `DaysMask` day.
- Reject if saving would turn line `n` on while another line is already on (if that rule is already implemented for 2 lines).
- Runtime: only one line may be active at a time (safety net).

When adding line 3, update overlap loops from:

```c
for (int other = 0; other < 2; other++)
```

to:

```c
for (int other = 0; other < LINE_COUNT; other++)
  if (other == n) continue;
```

---

## 7. Activity logs

Log entries must use `"Line": n` with `1 <= n <= LINE_COUNT`.

No mobile change needed if the log schema is unchanged.

---

## 8. Adding a fourth line later (example)

1. Set `#define LINE_COUNT 4`
2. Add relay pin for line 4
3. Ensure routes and NVS cover index 4
4. Deploy firmware

Mobile app will show four lines on next refresh.

**Maximum:** mobile accepts up to **32** lines (`LineCount <= 32`). Stay within relay/hardware limits.

---

## 9. Testing

Replace `<IP>` with the device address.

### Status and discovery

```bash
curl -s http://<IP>/status
```

Expect `"LineCount":3` and `Line1`..`Line3`.

### Line 3 control

```bash
curl -s http://<IP>/line/3
curl -s -X POST http://<IP>/line/3 -H "Content-Type: application/json" -d "{\"Value\":\"on\"}"
curl -s http://<IP>/status   # Line3 on; others off if arbitration works
```

### Schedule 3

```bash
curl -s http://<IP>/schedule/3
curl -s -X POST http://<IP>/schedule/3 -H "Content-Type: application/json" \
  -d "{\"Enabled\":true,\"Start\":\"10:00:00\",\"End\":\"18:00:00\",\"Duration\":300,\"IntervalSec\":0,\"DaysMask\":127}"
```

### Invalid line (must 404)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<IP>/line/99
```

### Mobile smoke test

1. Flash firmware with `LINE_COUNT = 3`.
2. Open app → Home: three line cards.
3. Schedules tab: three editors.
4. Toggle line 3; pull to refresh; state matches `/status`.

---

## 10. Common mistakes

| Mistake | Symptom on mobile |
|---------|-------------------|
| `LineCount` is 3 but only `Line1`/`Line2` in JSON | Missing line 3 or wrong states |
| `Line3` present but `LineCount` is 2 | App only loads schedules 1–2 |
| `/schedule/3` returns 404 | Home may show line 3 from status but Schedules tab fails |
| `LineCount` as string `"3"` | Fallback may still work via `Line1`..`Line3` keys; prefer integer |
| Gap in numbering (`Line1`, `Line3`, no `Line2`) | Unpredictable; always use contiguous `1..LineCount` |

---

## 11. Summary for firmware developers

1. Introduce **`LINE_COUNT`** (or equivalent) as the only line-count constant.
2. Add **`LineCount`** to **`GET /status`** and emit **`Line1`..`Line{LINE_COUNT}`**.
3. Register **`/line/{n}`** and **`/schedule/{n}`** for all `n` in range; return **404** outside range.
4. Extend GPIO, scheduler, NVS, overlap checks, and logs to use **`LINE_COUNT`** loops.
5. Test with curl and the mobile app.

The mobile discovery logic lives in `irrigation-system-mobile/services/lineDiscovery.js` (`parseLineIdsFromStatus`).
