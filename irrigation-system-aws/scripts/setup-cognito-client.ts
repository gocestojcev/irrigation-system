/**
 * Legacy helper for externally managed Cognito pools.
 * CDK now creates the User Pool and app client — use stack outputs instead.
 */
import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  ListUserPoolClientsCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? 'eu-central-1_i66pYQHZR';
const CLIENT_NAME = 'irrigation-system-mobile';
const REGION = process.env.AWS_REGION ?? 'eu-central-1';

const main = async (): Promise<void> => {
  const client = new CognitoIdentityProviderClient({ region: REGION });
  const existing = await client.send(
    new ListUserPoolClientsCommand({
      UserPoolId: USER_POOL_ID,
      MaxResults: 60,
    }),
  );

  const found = existing.UserPoolClients?.find((entry) => entry.ClientName === CLIENT_NAME);
  if (found?.ClientId) {
    console.log(JSON.stringify({ ok: true, clientId: found.ClientId, clientName: CLIENT_NAME, created: false }, null, 2));
    return;
  }

  const created = await client.send(
    new CreateUserPoolClientCommand({
      UserPoolId: USER_POOL_ID,
      ClientName: CLIENT_NAME,
      GenerateSecret: false,
      ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
    }),
  );

  if (!created.UserPoolClient?.ClientId) {
    throw new Error('Failed to create Cognito app client.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        clientId: created.UserPoolClient.ClientId,
        clientName: CLIENT_NAME,
        userPoolId: USER_POOL_ID,
        region: REGION,
        created: true,
      },
      null,
      2,
    ),
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});
