import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';
import 'react-native-get-random-values';

import { irrigationConfig } from './config';
import { clearAuthTokens, getAuthTokens, setAuthTokens, setCloudUsername } from './storage';

let userPool;

function getUserPool() {
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: irrigationConfig.userPoolId,
      ClientId: irrigationConfig.userPoolClientId,
    });
  }
  return userPool;
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
  const cached = await getAuthTokens();
  if (cached?.accessToken && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const pool = getUserPool();
  const current = pool.getCurrentUser();
  if (!current) return null;

  const session = await new Promise((resolve, reject) => {
    current.getSession((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  if (!session?.isValid()) return null;
  const tokens = await storeSession(session);
  return tokens.accessToken;
}

export async function isSignedIn() {
  const token = await getAccessToken();
  return Boolean(token);
}
