import { AuthProvider } from 'context/auth.context';
import { Slot } from 'expo-router';
import { useState, useEffect } from 'react';

export default function RootLayout() {
    const [theme, setTheme] = useState(
        JSON.parse(localStorage.getItem('theme') || '{}') || "winter"
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <AuthProvider>
            <Slot />
        </AuthProvider>
    );
}