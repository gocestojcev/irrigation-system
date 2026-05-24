import { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';

export const json = (statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  },
  body: JSON.stringify(body),
});

type ApiGatewayEventLike = APIGatewayProxyEvent | APIGatewayProxyEventV2;

type ErrorJsonOptions = {
  details?: Record<string, unknown>;
  event?: ApiGatewayEventLike;
};

const getRequestId = (event?: ApiGatewayEventLike): string | undefined => {
  if (!event) return undefined;

  const requestContext = event.requestContext as { requestId?: string; requestIdLegacy?: string };
  return requestContext.requestId ?? requestContext.requestIdLegacy;
};

export const errorJson = (
  statusCode: number,
  errorCode: string,
  message: string,
  options?: ErrorJsonOptions,
): APIGatewayProxyResult => {
  const requestId = getRequestId(options?.event);

  return json(statusCode, {
    errorCode,
    message,
    ...(options?.details ? { details: options.details } : {}),
    ...(requestId ? { requestId } : {}),
    timestamp: new Date().toISOString(),
  });
};

export const getCallerSub = (event: ApiGatewayEventLike): string | null => {
  const requestContext = event.requestContext as {
    authorizer?: {
      claims?: Record<string, string>;
      jwt?: {
        claims?: Record<string, string | number | boolean | string[]>;
      };
    };
  };

  const v1Claims = (requestContext as APIGatewayProxyEvent['requestContext'])?.authorizer?.claims as
    | Record<string, string>
    | undefined;
  if (v1Claims?.sub) return v1Claims.sub;

  const v2Claims = (requestContext as APIGatewayProxyEventV2['requestContext'] & { authorizer?: { jwt?: { claims?: Record<string, string | number | boolean | string[]> } } })?.authorizer?.jwt?.claims as
    | Record<string, string | number | boolean | string[]>
    | undefined;

  const sub = v2Claims?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
};
