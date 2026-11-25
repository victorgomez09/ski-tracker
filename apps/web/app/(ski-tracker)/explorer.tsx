import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { API_BASE_URL, EXPLORER_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';

export default function Explorer3DScreen() {
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { token, user } = useAuth();
  const isWeb = Platform.OS === 'web';

  const apiRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const playerName = user?.display_name || user?.email?.split('@')[0] || 'Esquiador';

  const explorerSrc = React.useMemo(() => {
    const params = new URLSearchParams();
    if (token) {
      params.set('token', token);
      params.set('apiBaseUrl', apiRoot);
      params.set('playerName', playerName);
    }
    const qs = params.toString();
    return qs ? `${EXPLORER_URL}?${qs}` : EXPLORER_URL;
  }, [token, apiRoot, playerName]);

  const authPayload = token
    ? JSON.stringify({
        type: 'SET_MULTIPLAYER_AUTH',
        payload: {
          apiBaseUrl: apiRoot,
          token,
          playerName,
        },
      })
    : null;

  useEffect(() => {
    if (!isWeb) return;
    const onMsg = (ev: MessageEvent) => {
      try {
        const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (msg?.type === 'EXPLORER_READY' && authPayload && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(authPayload, '*');
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [isWeb, authPayload]);

  const handleIframeLoad = (e: any) => {
    setLoading(false);
    if (authPayload && e?.target?.contentWindow) {
      e.target.contentWindow.postMessage(authPayload, '*');
    }
  };

  const handleNativeLoad = () => {
    setLoading(false);
    if (authPayload) {
      webViewRef.current?.postMessage(authPayload);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.content}>
        {isWeb ? (
          <iframe
            ref={iframeRef}
            src={explorerSrc}
            style={styles.webview as any}
            title="Ski Tracker 3D Explorer"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            onLoad={handleIframeLoad}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: explorerSrc }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onLoadEnd={handleNativeLoad}
          />
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.loadingText}>Cargando Explorador 3D...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderWidth: 0,
    backgroundColor: '#090d16',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 13, 22, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
});
