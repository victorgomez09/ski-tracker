import { AuthProvider } from 'context/auth.context';
import { Slot } from 'expo-router';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <AxiosInterceptor>
                    <Slot />
                </AxiosInterceptor>
            </AuthProvider>
        </SafeAreaProvider>
    );
}