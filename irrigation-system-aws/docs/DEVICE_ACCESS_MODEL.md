# Device Access Model

## Goal

Authorize `user → device` access before any cloud command or read operation.

## Identity source

- User identity from Cognito JWT (`sub` claim).
- Device identity from API path (`deviceId`) and AWS IoT Thing name.

## DynamoDB table

Table name: `device_user_access_{stage}` (e.g. `device_user_access_dev`)

Primary key:

- `PK` (string): `USER#{userSub}`
- `SK` (string): `DEVICE#{deviceId}`

Attributes:

- `role` (string): `owner | operator | viewer`
- `status` (string): `active | disabled`
- `createdAt` (ISO-8601)
- `updatedAt` (ISO-8601)

Optional GSI for reverse lookup:

- `GSI1PK`: `DEVICE#{deviceId}`
- `GSI1SK`: `USER#{userSub}`

## Authorization rules

Cloud routes use prefix `/devices/{deviceId}/…`. Response bodies mirror the ESP32 LAN API shapes.

| Role | Allowed |
|------|---------|
| `viewer` | `GET /devices/{deviceId}/status`, `/line/{n}`, `/schedule/{n}`, `/logs`, `/commands/{commandId}` |
| `operator` | viewer + `POST /line/{n}`, `/schedule/{n}`, `/logs/clear` |
| `owner` | operator + access administration (future phase) |

`lineId` must be `1`, `2`, or `3` (matches firmware `LINE_COUNT`).

## Lambda authZ flow

1. Validate JWT (API Gateway Cognito authorizer).
2. Resolve `userSub`.
3. Read item `USER#{sub}` + `DEVICE#{deviceId}`.
4. Deny if missing, `status != active`, or role insufficient.
5. Continue request handling.

## Caching (optional)

- Cache successful `user/device/role` checks for 30–60 seconds in-memory per Lambda instance.
- Always bypass cache for `disabled` records during incident response.

## Audit

For each request, log:

- `requestId`
- `userSub`
- `deviceId`
- `route`
- `decision` (`allow|deny`)
- `reason`

Seed access: `npm run seed:access` (see [README.md](../README.md)).
