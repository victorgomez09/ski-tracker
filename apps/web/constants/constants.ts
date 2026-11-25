import Constants from 'expo-constants';
import { Platform } from 'react-native';

const resolveDevHost = (): string => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  }
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return host;
  }
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
};

const DEV_HOST = resolveDevHost();

export const API_BASE_URL = `http://${DEV_HOST}:8082/api/v1`;
// export const API_BASE_URL = "https://api-ski-tracker.viti-tech.es/api/v1";
export const EXPLORER_URL = `http://${DEV_HOST}:5174`;
// export const EXPLORER_URL = "https://explorer-ski-tracker.viti-tech.es";