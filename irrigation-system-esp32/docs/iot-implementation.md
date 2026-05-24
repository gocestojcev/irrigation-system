# IoT Implementation Plan (ESP32 + AWS Relay)

## Goal
Enable secure remote control of the ESP32 from the public internet **without exposing the device directly** and **without requiring a static public IP**.

---

## Chosen Architecture
- **ESP32 firmware** connects outbound to **AWS IoT Core** over MQTT/TLS using per-device X.509 certificates.
- **Mobile app** calls a **cloud API** (API Gateway + Lambda), not the ESP directly.
- **Cloud backend** validates requests, authorizes user/device access, and writes commands to AWS IoT (Thing Shadow / command topic).
- **ESP32** consumes commands, applies local safety rules, executes relay actions, and reports status back.

### Why this approach
- Works behind NAT/CGNAT and dynamic IP.
- No router port-forwarding required.
- Centralized auth, auditing, and rate limiting.
- Production-friendly and scalable.

---

## Responsibility Split

### Cloud (API + Lambda)
- Authenticate users (Cognito/JWT).
- Authorize access per device.
- Validate request shape/ranges (pre-validation).
- Send command to AWS IoT (Shadow desired state or command topic).
- Return command acceptance + tracking ID.

### Device (ESP32)
- Keep final, authoritative validation and safety logic.
- Enforce runtime constraints (single active line, schedule conflict protection, etc.).
- Execute accepted commands.
- Publish reported state and command result/ack.

> Validation exists in both layers by design (defense in depth):
> cloud = gateway protection, device = final safety barrier.

---

## API Strategy for Mobile
Keep current mobile-facing contract close to existing endpoints, but host it in cloud.

### Write endpoints (POST)
Examples:
- `POST /line/1`
- `POST /line/2`
- `POST /schedule/1`
- `POST /schedule/2`

Flow:
1. Mobile sends request to cloud API.
2. Cloud validates/auth checks.
3. Cloud writes command (`commandId`) to IoT Shadow desired state (or publishes command topic).
4. ESP receives command, executes, then reports result.
5. Mobile reads updated state via GET endpoint.

### Read endpoints (GET)
- `GET /status`, `GET /line/{n}`, `GET /schedule/{n}` should read from **reported state** (Shadow/cache).
- `GET /logs` should read from **DynamoDB** (fed by IoT Rule telemetry).

### Clear logs
- `POST /logs/clear` clears device log store source (cloud DB and/or command to clear local persisted logs, based on final policy).

---

## Suggested AWS Components
- AWS IoT Core
- AWS API Gateway
- AWS Lambda
- Amazon Cognito
- Amazon DynamoDB (logs/history)
- IAM + IoT Policies (least privilege)

---

## Suggested Repo/Workspace Organization
Use a parent folder with side-by-side projects:

- `relay-system/`
  - `esp-firmware/` (PlatformIO project)
  - `cloud-backend/` (API/Lambda/IaC)
  - `mobile-app/` (optional)
  - `docs/` (shared contracts)

PlatformIO will continue to build/flash normally as long as `esp-firmware/platformio.ini` remains at that project root.

---

## Phased Implementation Plan

### Phase 1 — Contracts and Modeling
- Define canonical command/state schema.
- Add `commandId`, `status` (`pending|applied|failed|timeout`), timestamps.
- Finalize topic/shadow key names and error codes.

### Phase 2 — Cloud MVP
- Create API routes mirroring current mobile endpoints.
- Implement request validation + auth.
- Write desired state/commands to IoT Core.
- Return accepted responses with tracking metadata.

### Phase 3 — ESP Integration
- Add AWS IoT MQTT/TLS client.
- Subscribe to shadow delta or command topic.
- Map incoming commands to existing internal handlers.
- Publish reported state and acknowledgements.

### Phase 4 — Logs and History
- Emit event telemetry from ESP (`Started`, `Stopped`, source, duration).
- IoT Rule stores events in DynamoDB.
- Implement cloud `GET /logs` and `POST /logs/clear` behavior.

### Phase 5 — Hardening
- Retry/backoff + reconnect strategy.
- Idempotency handling via `commandId`.
- Rate limits, monitoring, alarms, and audit trails.
- Secret/certificate lifecycle process and rotation guidance.

---

## Non-Goals (for initial rollout)
- Direct internet exposure of device HTTP endpoints.
- Port forwarding/DDNS-based control.

---

## Immediate Next Steps
1. Create cloud API contract draft aligned with existing mobile endpoints.
2. Define Shadow JSON schema for desired/reported states.
3. Implement one vertical slice end-to-end:
   - `POST /line/1` command
   - ESP execution
   - `GET /status` reflects reported state
4. Validate latency, reliability, and failure handling.

---

## Notes
- Existing local endpoints remain useful for local LAN fallback/testing.
- Cloud path becomes the primary production control plane for remote access.
