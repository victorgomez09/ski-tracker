import axios from 'axios';
import { API_BASE_URL } from 'constants/constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const api = axios.create({
  baseURL: API_BASE_URL
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token =
        Platform.OS === 'web'
          ? localStorage.getItem('jwt_key')
          : await SecureStore.getItemAsync('jwt_key');

      if (token) {
        if (config.headers && typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else {
          config.headers = config.headers || {};
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch (error) {
      console.error('Error al recuperar el token en el interceptor:', error);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;