import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import type { User as UserType } from 'models/user.model';
import api from 'interceptor/api';
import { API_BASE_URL } from 'constants/constants';

const AuthContext = createContext<{
  token: string | null;
  user: UserType | null;
  isLoading: boolean;
  connectionRequiredError: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: UserType) => Promise<void>;
  refreshUser: () => Promise<void>;
  retryConnectionCheck: () => Promise<void>;
}>({
  token: null,
  user: null,
  isLoading: true,
  connectionRequiredError: false,
  signIn: async () => {},
  signOut: async () => {},
  updateUser: async () => {},
  refreshUser: async () => {},
  retryConnectionCheck: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionRequiredError, setConnectionRequiredError] = useState(false);

  const fetchUser = async (authToken: string) => {
    try {
      const response = await api.get<UserType>(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (response.status === 200 && response.data) {
        setUser(response.data);
        await AsyncStorage.setItem('user_profile', JSON.stringify(response.data));
      }
    } catch (error) {
      console.warn('Failed to fetch user profile, trying local storage:', error);
      const cachedUser = await AsyncStorage.getItem('user_profile');
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch (e) {
          console.error('Error parsing cached user:', e);
        }
      }
    }
  };

  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      setConnectionRequiredError(false);
      try {
        const networkState = await Network.getNetworkStateAsync();
        const isOnline = networkState.isConnected;

        const storedToken = Platform.OS === 'web'
          ? localStorage.getItem('jwt_key')
          : await SecureStore.getItemAsync('jwt_key');

        if (!isOnline) {
          const cachedUser = await AsyncStorage.getItem('user_profile');
          if (cachedUser) {
            setToken(storedToken || 'offline_token');
            try {
              setUser(JSON.parse(cachedUser));
            } catch (e) {
              console.error('Error parsing cached user:', e);
            }
          } else {
            setConnectionRequiredError(true);
          }
        } else {
          setToken(storedToken);
          if (storedToken) {
            await fetchUser(storedToken);
          }
        }
      } catch (error) {
        console.error('Error during checkAuth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [retryTrigger]);

  const signIn = async (newToken: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem('jwt_key', newToken);
    } else {
      await SecureStore.setItemAsync('jwt_key', newToken);
    }
    setToken(newToken);
    await fetchUser(newToken);
  };

  const signOut = async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem('jwt_key');
    } else {
      await SecureStore.deleteItemAsync('jwt_key');
    }
    await AsyncStorage.removeItem('user_profile');
    setToken(null);
    setUser(null);
    setConnectionRequiredError(false);
  };

  const updateUser = async (newUser: UserType) => {
    setUser(newUser);
    await AsyncStorage.setItem('user_profile', JSON.stringify(newUser));
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser(token);
    }
  };

  const retryConnectionCheck = async () => {
    setRetryTrigger(prev => prev + 1);
  };

  return (
    <AuthContext.Provider value={{
      token,
      user,
      isLoading,
      connectionRequiredError,
      signIn,
      signOut,
      updateUser,
      refreshUser,
      retryConnectionCheck
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);