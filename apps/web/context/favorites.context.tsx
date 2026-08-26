import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import api from 'interceptor/api';
import { Resort } from 'models/ski-resort.model';

interface FavoritesContextType {
  favorites: Resort[];
  isFavorite: (resortId: number | string) => boolean;
  toggleFavorite: (resort: Resort) => Promise<void>;
  addFavorite: (resort: Resort) => Promise<void>;
  removeFavorite: (resortId: number | string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  isLoadingFavorites: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [favorites, setFavorites] = useState<Resort[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  const fetchFavorites = useCallback(async () => {
    if (!token) {
      setFavorites([]);
      setIsLoadingFavorites(false);
      return;
    }

    setIsLoadingFavorites(true);
    try {
      const response = await api.get<Resort[]>(`${API_BASE_URL}/resorts/favorites`);
      if (response.status === 200 && Array.isArray(response.data)) {
        setFavorites(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch favorite resorts from database:', e);
    } finally {
      setIsLoadingFavorites(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const favoriteIds = useMemo(() => {
    return new Set(favorites.map((f) => String(f.ID)));
  }, [favorites]);

  const isFavorite = useCallback(
    (resortId: number | string) => {
      return favoriteIds.has(String(resortId));
    },
    [favoriteIds]
  );

  const addFavorite = useCallback(
    async (resort: Resort) => {
      const resortIdStr = String(resort.ID);
      if (favoriteIds.has(resortIdStr)) return;

      // Optimistic update
      const prevFavorites = favorites;
      setFavorites([resort, ...prevFavorites]);

      try {
        await api.post(`${API_BASE_URL}/resorts/favorites/${resort.ID}`);
      } catch (e) {
        console.error('Failed to add favorite to database:', e);
        // Rollback on error
        setFavorites(prevFavorites);
      }
    },
    [favorites, favoriteIds]
  );

  const removeFavorite = useCallback(
    async (resortId: number | string) => {
      const resortIdStr = String(resortId);
      if (!favoriteIds.has(resortIdStr)) return;

      // Optimistic update
      const prevFavorites = favorites;
      setFavorites(prevFavorites.filter((f) => String(f.ID) !== resortIdStr));

      try {
        await api.delete(`${API_BASE_URL}/resorts/favorites/${resortId}`);
      } catch (e) {
        console.error('Failed to remove favorite from database:', e);
        // Rollback on error
        setFavorites(prevFavorites);
      }
    },
    [favorites, favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (resort: Resort) => {
      if (isFavorite(resort.ID)) {
        await removeFavorite(resort.ID);
      } else {
        await addFavorite(resort);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        addFavorite,
        removeFavorite,
        refreshFavorites: fetchFavorites,
        isLoadingFavorites,
      }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
