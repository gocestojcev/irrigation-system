import { IoTDataPlaneClient, UpdateThingShadowCommand } from '@aws-sdk/client-iot-data-plane';

const iot = new IoTDataPlaneClient({});

type ShadowDesired = Record<string, unknown>;

export const updateDesiredShadow = async (thingName: string, desired: ShadowDesired): Promise<void> => {
  await iot.send(
    new UpdateThingShadowCommand({
      thingName,
      payload: Buffer.from(
        JSON.stringify({
          state: {
            desired,
          },
        }),
      ),
    }),
  );
};
