import { Slot } from 'expo-router';
import 'i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from 'context/auth.context';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';

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