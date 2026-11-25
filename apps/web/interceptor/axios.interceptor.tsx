import axios from 'axios';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Network from 'expo-network';

import api from './api';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';
import { API_BASE_URL } from 'constants/constants';
import { isTrackingSessionActive } from 'tracking/task-manager';

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

export function AxiosInterceptor({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const signOutRef = useRef(signOut);
  const routerRef = useRef(router);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    signOutRef.current = signOut;
    routerRef.current = router;
    showToastRef.current = showToast;
  }, [signOut, router, showToast]);

  useEffect(() => {
    console.log('🟢 [AxiosInterceptor] Interceptor registrado');

    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.message === 'canceled') {
          return Promise.reject(error);
        }

        const originalRequest = error.config;
        const status = error.response?.status;
        const url = originalRequest?.url || '';

        console.log('🔴 [AxiosInterceptor] Error detectado:', {
          message: error.message,
          status,
          url,
          hasResponse: !!error.response,
        });

        // Detectar si estamos sin conexión o si hay una sesión de rastreo activa
        let trackingActive = false;
        try {
          trackingActive = await isTrackingSessionActive();
        } catch {}

        let isOffline = false;
        try {
          const net = await Network.getNetworkStateAsync();
          isOffline = net.isConnected === false || net.isInternetReachable === false;
        } catch {
          isOffline = !error.response || error.message === 'Network Error';
        }

        // 1. If 401 and not already retrying, attempt to refresh token
        const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');
        if (status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
          // Si no se tiene conexión o se tiene una sesión en activo, NO comprobar si el token ha expirado ni desloguear
          if (isOffline || trackingActive) {
            console.log('🔒 [AxiosInterceptor] 401 omitido: modo offline o sesión activa en curso');
            return Promise.reject(error);
          }

          originalRequest._retry = true;

          const storedRefreshToken = Platform.OS === 'web'
            ? localStorage.getItem('jwt_refresh_key')
            : await SecureStore.getItemAsync('jwt_refresh_key');

          if (storedRefreshToken) {
            if (!isRefreshing) {
              isRefreshing = true;
              try {
                const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                  refresh_token: storedRefreshToken,
                });

                if (refreshResponse.status === 200 && refreshResponse.data?.access_token) {
                  const newAccessToken = refreshResponse.data.access_token;
                  const newRefreshToken = refreshResponse.data.refresh_token || storedRefreshToken;

                  if (Platform.OS === 'web') {
                    localStorage.setItem('jwt_key', newAccessToken);
                    localStorage.setItem('jwt_refresh_key', newRefreshToken);
                  } else {
                    await SecureStore.setItemAsync('jwt_key', newAccessToken);
                    await SecureStore.setItemAsync('jwt_refresh_key', newRefreshToken);
                  }

                  isRefreshing = false;
                  onTokenRefreshed(newAccessToken);

                  // Retry the original request
                  if (originalRequest.headers) {
                    originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                  }
                  return api(originalRequest);
                }
              } catch (refreshErr: any) {
                console.error('🔒 [AxiosInterceptor] Error al renovar token:', refreshErr);
                isRefreshing = false;
                onRefreshFailed();

                // Si falló por red/conectividad (común en montaña), no cerrar sesión
                const isNetworkFailure = !refreshErr.response || refreshErr.message === 'Network Error';
                if (isNetworkFailure) {
                  return Promise.reject(error);
                }
              }
            } else {
              // Wait for refresh in progress
              return new Promise((resolve, reject) => {
                refreshSubscribers.push((newToken: string) => {
                  if (originalRequest.headers) {
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                  }
                  resolve(api(originalRequest));
                });
              });
            }
          }

          // Si hay una sesión activa o estamos offline, nunca desloguear
          if (trackingActive || isOffline) {
            return Promise.reject(error);
          }

          // If refresh token doesn't exist or refresh failed:
          console.log('🔒 [AxiosInterceptor] 401 no recuperable - Redirigiendo a login...');
          showToastRef.current('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.', 'error');
          await signOutRef.current();
          routerRef.current.replace('/login');
          return Promise.reject(error);
        }

        // Determine error message for other errors or failed auth
        let errorMessage = 'Ha ocurrido un error inesperado';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Show toast notification only for non-401 or auth endpoint errors, and suppress while offline / tracking
        if (!isAuthEndpoint && !isOffline && !trackingActive && status !== 401 && error?.message !== 'Network Error') {
          showToastRef.current(errorMessage, 'error');
        }

        return Promise.reject(error);
      }
    );

    return () => {
      console.log('🟡 [AxiosInterceptor] Interceptor eliminado (eject)');
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  return <>{children}</>;
}