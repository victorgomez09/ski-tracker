import axios from 'axios';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import api from './api';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';

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

        console.log('🔴 [AxiosInterceptor] Error detectado:', {
          message: error.message,
          status: error.response?.status,
          hasResponse: !!error.response,
        });

        // Determine error message
        let errorMessage = 'Ha ocurrido un error inesperado';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Show toast notification
        showToastRef.current(errorMessage, 'error');

        if (error.response?.status === 401) {
          console.log('🔒 [AxiosInterceptor] 401 Detectado - Cerrando sesión...');
          await signOutRef.current();
          routerRef.current.replace('/login');
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