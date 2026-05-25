# Error Codes

Cloud API error codes returned in JSON responses (`errorCode`, `message`, `requestId`).

## Validation Errors (`4xx`)

- `VALIDATION_INVALID_JSON` — request body is not valid JSON.
- `VALIDATION_MISSING_FIELD` — required field is missing.
- `VALIDATION_INVALID_FIELD` — field type/value/range is invalid.
- `VALIDATION_INVALID_LINE_ID` — `lineId` is not `1`, `2`, or `3`.
- `VALIDATION_INVALID_SCHEDULE` — schedule violates constraints.

## Authentication/Authorization (`401` / `403`)

- `AUTH_MISSING_TOKEN` — bearer token not provided.
- `AUTH_INVALID_TOKEN` — token invalid/expired.
- `AUTH_FORBIDDEN_DEVICE` — user is not mapped to target device.

## Resource/State (`404` / `409`)

- `DEVICE_NOT_FOUND` — device or shadow resource not found.
- `COMMAND_NOT_FOUND` — command ID does not exist for device.
- `COMMAND_DUPLICATE_ID` — command ID already processed.
- `STATE_CONFLICT` — command conflicts with current state/policy.

## Availability/Runtime (`5xx`)

- `UPSTREAM_IOT_UNAVAILABLE` — IoT shadow publish/read failed.
- `UPSTREAM_INVALID_STATE` — device shadow payload failed schema validation.
- `COMMAND_TIMEOUT` — command remained pending past timeout window.
- `INTERNAL_ERROR` — unhandled server-side fault.

## Device command errors (MQTT `command-result`)

- `DEVICE_COMMAND_REJECTED` — device rejected command (validation or policy).
- `VALIDATION_INVALID_FIELD` — malformed command envelope on device.

## Response shape

```json
{
  "errorCode": "AUTH_FORBIDDEN_DEVICE",
  "message": "You do not have access to this device.",
  "requestId": "api-gw-request-id",
  "timestamp": "2026-04-01T10:00:00.000Z",
  "details": {
    "deviceId": "irrigation-dev-001"
  }
}
```
