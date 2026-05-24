# Device Access Model (Phase 1)

## Goal
Authorize `user -> device` access before any command/read operation.

## Identity Source
- User identity from Cognito JWT (`sub` claim).
- Device identity from API path (`deviceId`) and AWS IoT Thing name.

## DynamoDB Table
Table name: `device_user_access`

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

## Authorization Rules
- `viewer`: read only (`GET /status`, `GET /line/{n}`, `GET /schedule/{n}`, `GET /logs`).
- `operator`: viewer + write commands (`POST /line/{n}`, `POST /schedule/{n}`, `POST /logs/clear`).
- `owner`: operator + access administration (future phase).

## Lambda AuthZ Flow
1. Validate JWT.
2. Resolve `userSub`.
3. Read item `USER#{sub}` + `DEVICE#{deviceId}`.
4. Deny if missing, `status != active`, or role insufficient.
5. Continue request handling.

## Caching (optional)
- Cache successful `user/device/role` checks for 30-60 seconds in-memory per Lambda instance.
- Always bypass cache for `disabled` records during incident response.

## Audit
For each request, log:
- `requestId`
- `userSub`
- `deviceId`
- `route`
- `decision` (`allow|deny`)
- `reason`
