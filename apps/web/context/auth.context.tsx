import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AuthContext = createContext<{
  token: string | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}>({
  token: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedToken = Platform.OS === 'web'
          ? localStorage.getItem('jwt_key')
          : await SecureStore.getItemAsync('jwt_key');
        setToken(storedToken);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signIn = async (newToken: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem('jwt_key', newToken);
    } else {
      await SecureStore.setItemAsync('jwt_key', newToken);
    }
    setToken(newToken);
  };

  const signOut = async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem('jwt_key');
    } else {
      await SecureStore.deleteItemAsync('jwt_key');
    }
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);