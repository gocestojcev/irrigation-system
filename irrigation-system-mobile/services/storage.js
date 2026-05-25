import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  serverIP: '@irrigation/serverIP',
  deviceId: '@irrigation/deviceId',
  apiMode: '@irrigation/apiMode',
  authTokens: '@irrigation/authTokens',
  cloudUsername: '@irrigation/cloudUsername',
  cloudBaseUrl: '@irrigation/cloudBaseUrl',
};

export async function getServerIP(fallback) {
  const value = await AsyncStorage.getItem(KEYS.serverIP);
  return value || fallback;
}

export async function setServerIP(value) {
  await AsyncStorage.setItem(KEYS.serverIP, value);
}

export async function getDeviceId(fallback) {
  const value = await AsyncStorage.getItem(KEYS.deviceId);
  return value || fallback;
}

export async function setDeviceId(value) {
  await AsyncStorage.setItem(KEYS.deviceId, value);
}

export async function getApiMode(fallback = 'lan') {
  const value = await AsyncStorage.getItem(KEYS.apiMode);
  if (value === 'lan' || value === 'cloud') return value;
  return fallback;
}

export async function setApiMode(value) {
  await AsyncStorage.setItem(KEYS.apiMode, value === 'lan' ? 'lan' : 'cloud');
}

export async function getAuthTokens() {
  const raw = await AsyncStorage.getItem(KEYS.authTokens);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setAuthTokens(tokens) {
  await AsyncStorage.setItem(KEYS.authTokens, JSON.stringify(tokens));
}

export async function clearAuthTokens() {
  await AsyncStorage.removeItem(KEYS.authTokens);
}

export async function getCloudUsername() {
  return AsyncStorage.getItem(KEYS.cloudUsername);
}

export async function setCloudUsername(username) {
  await AsyncStorage.setItem(KEYS.cloudUsername, username);
}

export async function getCloudBaseUrl(fallback) {
  const value = await AsyncStorage.getItem(KEYS.cloudBaseUrl);
  return value || fallback;
}

export async function setCloudBaseUrl(value) {
  const normalized = value.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(KEYS.cloudBaseUrl, normalized);
}
