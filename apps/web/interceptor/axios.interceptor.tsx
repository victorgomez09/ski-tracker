import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import api from './api';
import { useAuth } from 'context/auth.context';

export function AxiosInterceptor({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const router = useRouter();

  const signOutRef = useRef(signOut);
  const routerRef = useRef(router);

  useEffect(() => {
    signOutRef.current = signOut;
    routerRef.current = router;
  }, [signOut, router]);

  useEffect(() => {
    console.log('🟢 [AxiosInterceptor] Interceptor registrado');

    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        console.log('🔴 [AxiosInterceptor] Error detectado:', {
          message: error.message,
          status: error.response?.status,
          hasResponse: !!error.response,
        });

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