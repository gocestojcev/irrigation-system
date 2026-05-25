import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra?.irrigation ?? {};

export const irrigationConfig = {
  region: extra.region ?? 'eu-central-1',
  userPoolId: extra.userPoolId ?? 'eu-central-1_i66pYQHZR',
  userPoolClientId: extra.userPoolClientId ?? '5prg7oeq68ptkeqg3lc6qs50mq',
  defaultCloudBaseUrl: extra.cloudBaseUrl ?? 'https://fegc56wnv1.execute-api.eu-central-1.amazonaws.com/dev',
  defaultDeviceId: extra.defaultDeviceId ?? 'irrigation-dev-001',
  defaultServerIp: extra.defaultServerIp ?? '192.168.100.161',
};

export const normalizeCloudBaseUrl = (value) => value.trim().replace(/\/+$/, '');
