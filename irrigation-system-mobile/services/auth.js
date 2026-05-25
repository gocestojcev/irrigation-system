import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';
import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { irrigationConfig } from './config';
import { clearAuthTokens, getAuthTokens, setAuthTokens, setCloudUsername } from './storage';

let userPool;

function getUserPool() {
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: irrigationConfig.userPoolId,
      ClientId: irrigationConfig.userPoolClientId,
      Storage: AsyncStorage,
    });
  }
  return userPool;
}

async function resolveCognitoUser() {
  const pool = getUserPool();
  const current = pool.getCurrentUser();
  if (current) return current;

  const username = await getCloudUsername();
  if (!username) return null;

  return new CognitoUser({ Username: username, Pool: pool });
}

async function refreshStoredSession() {
  const user = await resolveCognitoUser();
  if (!user) return null;

  try {
    const session = await new Promise((resolve, reject) => {
      user.getSession((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!session?.isValid()) return null;
    return storeSession(session);
  } catch {
    await clearAuthTokens();
    return null;
  }
}

async function getCachedSessionToken(tokenKey) {
  const cached = await getAuthTokens();
  const token = cached?.[tokenKey];
  if (token && cached.expiresAt > Date.now() + 30_000) {
    return token;
  }

  const tokens = await refreshStoredSession();
  return tokens?.[tokenKey] ?? null;
}

function storeSession(session) {
  const tokens = {
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
    expiresAt: session.getIdToken().getExpiration() * 1000,
  };
  return setAuthTokens(tokens).then(() => tokens);
}

export async function signIn(username, password) {
  const pool = getUserPool();
  const user = new CognitoUser({ Username: username, Pool: pool });
  const authDetails = new AuthenticationDetails({
    Username: username,
    Password: password,
  });

  const session = await new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });

  await storeSession(session);
  await setCloudUsername(username);
  return session;
}

export async function signOut() {
  const pool = getUserPool();
  const current = pool.getCurrentUser();
  if (current) current.signOut();
  await clearAuthTokens();
}

export async function getAccessToken() {
  return getCachedSessionToken('accessToken');
}

/** API Gateway Cognito authorizer expects the ID token, not the access token. */
export async function getIdToken() {
  return getCachedSessionToken('idToken');
}

export async function isSignedIn() {
  const token = await getIdToken();
  return Boolean(token);
}
