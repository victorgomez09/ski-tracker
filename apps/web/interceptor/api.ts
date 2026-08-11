import axios from 'axios';
import { API_BASE_URL } from 'constants/constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const api = axios.create({
  baseURL: API_BASE_URL
});

// Interceptor de petición: adjunta el token automáticamente
api.interceptors.request.use(async (config) => {
  const token =
    Platform.OS === 'web'
      ? localStorage.getItem('jwt_key')
      : await SecureStore.getItemAsync('jwt_key');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;