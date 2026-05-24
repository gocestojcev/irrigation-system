# irrigation-system

Monorepo for the ESP32 irrigation controller, mobile app, and AWS cloud backend.

| Directory | Description |
|-----------|-------------|
| `irrigation-system-esp32` | ESP32 firmware (PlatformIO) — relay control, schedules, local HTTP API |
| `irrigation-system-mobile` | React Native / Expo app for local device control |
| `irrigation-system-aws` | AWS CDK backend — API Gateway, Lambda, IoT Core, DynamoDB |

See each subfolder's README for setup and usage.
