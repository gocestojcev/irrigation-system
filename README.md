# irrigation-system

Monorepo for the ESP32 irrigation controller, mobile app, and AWS cloud backend.

| Directory | Description |
|-----------|-------------|
| `irrigation-system-esp32` | ESP32 firmware (PlatformIO) — relay control, schedules, local HTTP API, AWS IoT MQTT |
| `irrigation-system-mobile` | React Native / Expo app — **LAN-first**, optional Cloud mode |
| `irrigation-system-aws` | AWS CDK backend — API Gateway, Lambda, IoT Core, DynamoDB |

## Quick start

**Full step-by-step:** [DEPLOYMENT.md](DEPLOYMENT.md)

1. **AWS:** `cd irrigation-system-aws && npm install && npm run deploy:dev`
2. **Device:** provision Thing + flash ESP32 (see DEPLOYMENT.md §2)
3. **Mobile:** `cd irrigation-system-mobile && npm install && npm start`

## Architecture

- **LAN:** Phone → HTTP → ESP32 (same Wi‑Fi)
- **Cloud:** Phone → API Gateway + Cognito → Lambda → IoT Shadow → ESP32 (MQTT/TLS outbound)

Default mobile mode is **LAN**. If the device is unreachable, the app offers **Switch to Cloud** after user confirmation.

## Documentation

| Doc | Contents |
|-----|----------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Flash, monitor, mobile dev, AWS deploy |
| [IMPLEMENTATION_PLAN.md](irrigation-system-aws/IMPLEMENTATION_PLAN.md) | Cloud integration plan and phase status |
| [iot-implementation.md](irrigation-system-esp32/docs/iot-implementation.md) | ESP32 MQTT/shadow firmware |
| [irrigation-system-mobile/README.md](irrigation-system-mobile/README.md) | Expo Go, EAS builds, app usage |
