import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

/**
 * Hook to reliably detect online/offline network status.
 *
 * Prevents transient offline false-positives caused by screen lock/unlock,
 * Android power-saving states, or temporary socket reconnections.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        
        // If isConnected is strictly false OR isInternetReachable is strictly false
        const seemsOffline = state.isConnected === false || state.isInternetReachable === false;

        if (!seemsOffline) {
          // Definitely online - clear any pending offline triggers immediately
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          if (isMounted) {
            setIsOffline(false);
          }
        } else {
          // If it seems offline, don't immediately switch to offline mode.
          // Wait 2.5 seconds and verify again to avoid false-positives on screen on/off.
          if (!debounceTimerRef.current) {
            debounceTimerRef.current = setTimeout(async () => {
              if (!isMounted) return;
              try {
                const retryState = await Network.getNetworkStateAsync();
                const stillOffline = retryState.isConnected === false || retryState.isInternetReachable === false;
                if (isMounted) {
                  setIsOffline(stillOffline);
                }
              } catch {
                if (isMounted) {
                  setIsOffline(true);
                }
              } finally {
                debounceTimerRef.current = null;
              }
            }, 2500);
          }
        }
      } catch (err) {
        console.warn('Network check error:', err);
      }
    };

    // Initial check
    checkNetwork();

    // Periodic check every 5 seconds
    const interval = setInterval(checkNetwork, 5000);

    // Re-check whenever the app comes back to foreground (e.g. after unlocking screen)
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Small delay to allow the OS network interface to re-associate with Wi-Fi / Cellular
        setTimeout(checkNetwork, 1000);
      }
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      subscription.remove();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return isOffline;
}
