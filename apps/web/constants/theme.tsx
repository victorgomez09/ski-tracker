import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LIGHT_COLORS = {
    // Primary/Brand
    primary: '#3B76F6', // More intense, professional blue
    primaryLight: '#EBF2FF', // Very soft blue highlight
    primaryDark: '#2557C7',
    
    // Secondary/Accent
    accent: '#82CBB2', // Soft pastel mint/green
    accentLight: '#E8F5F1',
    
    // Backgrounds
    background: '#F8FAFC', // Crisp, soft gray-blue
    card: '#FFFFFF', // Clean white cards
    surface: '#F1F5F9', // Slightly darker soft background
    
    // Statuses
    success: '#66BB6A', // Soft pastel green
    warning: '#FFA726', // Soft pastel orange/amber
    danger: '#EF5350', // Soft pastel red
    info: '#29B6F6', // Soft pastel blue info
    
    // Text
    textPrimary: '#1E293B', // Deep charcoal
    textSecondary: '#64748B', // Soft gray
    textLight: '#94A3B8', // Very light gray (borders/placeholders)
    textOnPrimary: '#FFFFFF',
    
    // Borders
    border: '#E2E8F0', // Soft divider color
};

export const DARK_COLORS = {
    // Primary/Brand
    primary: '#3B76F6', // Consistent primary blue
    primaryLight: '#1E293B', // Soft dark primary background
    primaryDark: '#5C93FF',
    
    // Secondary/Accent
    accent: '#82CBB2', // Consistent accent
    accentLight: '#1A2E26',
    
    // Backgrounds
    background: '#0F172A', // Deep slate dark background
    card: '#1E293B', // Dark card background
    surface: '#334155', // Lighter slate surface
    
    // Statuses
    success: '#81C784', 
    warning: '#FFB74D', 
    danger: '#E57373', 
    info: '#4FC3F7',
    
    // Text
    textPrimary: '#F8FAFC', // Crisp white/light gray
    textSecondary: '#94A3B8', // Soft gray
    textLight: '#475569', // Muted gray
    textOnPrimary: '#FFFFFF',
    
    // Borders
    border: '#334155', // Slate dark borders
};

export const COLORS = LIGHT_COLORS;

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const BORDER_RADIUS = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    round: 9999,
};

export const SHADOWS = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
        elevation: 3,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
};

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    themeMode: ThemeMode;
    isDark: boolean;
    colors: typeof LIGHT_COLORS;
    setThemeMode: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = 'ski_tracker_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemScheme = useColorScheme();
    const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
                    setThemeModeState(savedTheme);
                }
            } catch (e) {
                console.error('Failed to load theme mode preference:', e);
            }
        };
        loadTheme();
    }, []);

    const setThemeMode = async (mode: ThemeMode) => {
        setThemeModeState(mode);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch (e) {
            console.error('Failed to save theme mode preference:', e);
        }
    };

    const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';
    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

    const toggleTheme = () => {
        setThemeMode(isDark ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ themeMode, isDark, colors, setThemeMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export function useThemeColors() {
    const context = useContext(ThemeContext);
    // Fall back to system theme colors if ThemeProvider is not mounted yet
    const systemScheme = useColorScheme();
    if (!context) {
        return systemScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    }
    return context.colors;
}
