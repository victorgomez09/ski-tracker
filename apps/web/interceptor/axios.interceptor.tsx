import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import api from './api';
import { useAuth } from 'context/auth.context';

export function AxiosInterceptor({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await signOut();
          router.replace('/login');
        }
        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptor);
  }, [signOut, router]);

  return <>{children}</>;
}