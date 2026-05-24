# Irrigation System Cloud Integration Implementation Plan

## Source Instructions Reviewed
- [iot-implementation.md](../irrigation-system-esp32/docs/iot-implementation.md)
- [API_ENDPOINTS.md](../irrigation-system-esp32/API_ENDPOINTS.md)
- [API_ENDPOINTS.md](../irrigation-system-mobile/docs/API_ENDPOINTS.md)

## Objective
Enable secure remote irrigation control using AWS IoT + API Gateway + Lambda while preserving the existing mobile contract and keeping device-side safety authoritative.

## Infrastructure as Code Standard
- All AWS infrastructure must be created and managed using AWS CDK.
- Do not provision runtime infrastructure manually in the console except for temporary troubleshooting.
- Keep CDK stacks environment-aware (`dev`, `staging`, `prod`) and version-controlled in this repository.

## Scope (MVP)
- Remote command path for:
  - `POST /line/1`, `POST /line/2`
  - `POST /schedule/1`, `POST /schedule/2`
- Remote read path for:
  - `GET /status`, `GET /line/{n}`, `GET /schedule/{n}`
- Device command acknowledgement with `commandId` and result state.
- No direct internet exposure of ESP32 HTTP API.

## Target Architecture
1. Mobile app calls API Gateway.
2. API Gateway authorizes via Cognito JWT.
3. Lambda validates request and authorization.
4. Lambda writes command to AWS IoT Thing Shadow desired state (or command topic).
5. ESP32 subscribed client receives command over MQTT/TLS.
6. ESP32 enforces final safety validation and executes action.
7. ESP32 publishes reported state + command result.
8. API `GET` routes read Shadow reported state (or cache).

## Canonical Contracts (MVP)

### Command Envelope (cloud -> device)
```json
{
  "commandId": "uuid",
  "deviceId": "thingName",
  "type": "line.set|schedule.set|logs.clear",
  "issuedAt": "ISO-8601",
  "requestedBy": "userSub",
  "payload": {}
}
```

### Command Result (device -> cloud)
```json
{
  "commandId": "uuid",
  "status": "pending|applied|failed|timeout",
  "appliedAt": "ISO-8601",
  "errorCode": "optional",
  "errorMessage": "optional"
}
```

### Reported State Shape
```json
{
  "status": {
    "Epoch": 0,
    "Time": "HH:MM:SS",
    "Line1": { "Value": "on|off", "Source": "manual|scheduled|off|system" },
    "Line2": { "Value": "on|off", "Source": "manual|scheduled|off|system" }
  },
  "schedule": {
    "1": { "Enabled": true, "Start": "HH:MM:SS", "End": "HH:MM:SS", "Duration": 0, "IntervalSec": 0, "DaysMask": 0 },
    "2": { "Enabled": true, "Start": "HH:MM:SS", "End": "HH:MM:SS", "Duration": 0, "IntervalSec": 0, "DaysMask": 0 }
  },
  "lastCommand": {
    "commandId": "uuid",
    "status": "pending|applied|failed|timeout"
  }
}
```

## Phase Plan

### Phase 1: Contract and Access Model (2-3 days)
Deliverables:
- OpenAPI draft for mobile-facing routes mirroring existing endpoints.
- JSON schema for command envelope and reported state.
- Error code map (validation, authorization, offline, timeout).
- Device access model (`user -> device`) in DynamoDB.

Acceptance criteria:
- All existing route shapes are documented.
- `commandId` is mandatory for all write calls.
- Cloud and firmware teams approve schema.

### Phase 2: Cloud MVP (4-6 days)
Deliverables:
- AWS CDK app and stacks for API Gateway, Lambda, DynamoDB, IAM, and CloudWatch baseline resources.
- API Gateway routes:
  - `POST /line/{id}`
  - `POST /schedule/{id}`
  - `GET /status`
  - `GET /line/{id}`
  - `GET /schedule/{id}`
- Lambda handlers:
  - auth checks (Cognito subject)
  - device ownership check
  - payload validation
  - IoT publish / shadow update
- DynamoDB table for device-user mapping.
- Basic CloudWatch logs and alarms.

Acceptance criteria:
- Valid writes return `202` with `commandId`.
- Invalid payloads return deterministic `4xx` errors.
- Unauthorized access denied.

### Phase 3: ESP32 AWS IoT Integration (5-8 days)
Deliverables:
- MQTT/TLS connectivity with per-device certs.
- Subscription to command channel (Shadow delta or topic).
- Command parser mapped to existing handlers (`line`/`schedule`/`logs`).
- Final on-device validation/safety preserved.
- Reported state + command result publishing.

Acceptance criteria:
- Device reconnects with backoff after Wi-Fi/MQTT drop.
- `commandId` idempotency guard prevents duplicate execution.
- On success/failure, result appears in cloud within SLA target.

### Phase 4: Logs and History (3-4 days)
Deliverables:
- Telemetry event schema for `Started`/`Stopped` and source.
- IoT Rule -> DynamoDB log ingestion.
- `GET /logs` from DynamoDB.
- `POST /logs/clear` policy:
  - clear cloud logs only, or
  - clear cloud + dispatch device clear command.

Acceptance criteria:
- Logs query supports `limit` and descending time.
- Clear behavior is explicit and audited.

### Phase 5: Hardening and Ops (3-5 days)
Deliverables:
- Retry policy and dead-letter handling for command write failures.
- Command timeout watcher (mark stale `pending` as `timeout`).
- IAM least-privilege tightening.
- Certificate rotation runbook.
- Dashboards/alarms for API errors, command latency, device offline.

Acceptance criteria:
- No wildcard IAM actions for runtime roles.
- Alerts trigger on elevated failures/offline devices.
- Runbook validated in a test rotation exercise.

## Vertical Slice First (recommended immediate work)
Implement one full path first:
1. `POST /line/1` accepted by API.
2. Command reaches device with `commandId`.
3. Device executes and reports `applied`.
4. `GET /status` reflects new state from reported Shadow.

Success metrics:
- P50 command latency < 2s
- P95 command latency < 5s
- 0 duplicate execution for retried requests

## Repository Tasks

### In [irrigation-system-aws](.)
- Add AWS CDK IaC structure (`infra/`, `lambdas/`, `schemas/`, `openapi/`).
- Add environment configs for `dev` and `prod`.
- Add deployment pipeline (staging first).

### In [irrigation-system-esp32](../irrigation-system-esp32)
- Add AWS IoT client module.
- Add command ingestion and `commandId` dedupe storage.
- Add state/result publish helpers.

### In [irrigation-system-mobile](../irrigation-system-mobile)
- Replace direct `http://<esp32-ip>` calls with cloud base URL.
- Add auth token flow and refresh handling.
- Add command pending UX for async writes.

## Risks and Mitigations
- Device offline during command:
  - Return `accepted` + track pending; timeout if no ack.
- Clock drift on device:
  - Require NTP sync; include server timestamps in responses.
- Duplicate writes due to retries:
  - Enforce idempotency by `commandId` on device and cloud.
- Schema drift across app/cloud/device:
  - Store versioned JSON schemas in one shared folder.

## Next Concrete Actions (This Week)
1. Freeze command/reported JSON schemas.
2. Build cloud `POST /line/1` and `GET /status` stubs.
3. Add ESP32 MQTT connect + subscribe scaffold.
4. Wire command ack with `commandId` in firmware.
5. Execute end-to-end demo in `dev` environment.
