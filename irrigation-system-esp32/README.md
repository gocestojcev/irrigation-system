# irrigation-system-esp32

ESP32 firmware for the irrigation controller — relay control, schedules, local HTTP API, and AWS IoT MQTT/shadow sync.

## Quick start

1. Copy `secrets/wifi_secrets.h.example` → `secrets/wifi_secrets.h` (WiFi credentials).
2. Provision IoT credentials (generates `secrets/iot_secrets.h`):

   ```powershell
   cd ../irrigation-system-aws
   npm run provision:device -- --device-id=irrigation-dev-001 --stage=dev --profile=goce
   ```

3. Build, flash, monitor:

   ```powershell
   pio run -t upload
   pio device monitor
   ```

Full steps: [../DEPLOYMENT.md](../DEPLOYMENT.md#2-esp32-firmware--flash-and-monitor).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) | LAN HTTP endpoint reference |
| [docs/MOBILE_API.md](docs/MOBILE_API.md) | LAN API integration guide (mobile + firmware) |
| [docs/FIRMWARE_DYNAMIC_LINES.md](docs/FIRMWARE_DYNAMIC_LINES.md) | `LineCount` and adding relay lines |
| [docs/iot-implementation.md](docs/iot-implementation.md) | MQTT, Thing Shadow, command handling |

Cloud architecture and deployment: [../DEPLOYMENT.md](../DEPLOYMENT.md), [../irrigation-system-aws/IMPLEMENTATION_PLAN.md](../irrigation-system-aws/IMPLEMENTATION_PLAN.md).
