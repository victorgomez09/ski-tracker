import { AuthProvider } from 'context/auth.context';
import { Slot } from 'expo-router';
import { AxiosInterceptor } from 'interceptor/axios.interceptor';

export default function RootLayout() {
    return (
        <AuthProvider>
            <AxiosInterceptor>
                <Slot />
            </AxiosInterceptor>
        </AuthProvider>
    );
}