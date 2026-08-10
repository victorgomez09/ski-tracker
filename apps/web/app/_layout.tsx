import { AuthProvider } from 'context/auth.context';
import { Slot } from 'expo-router';

export default function RootLayout() {
    return (
        <AuthProvider>
            <Slot />
        </AuthProvider>
    );
}