import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { X, ExternalLink, Mountain } from 'lucide-react-native';

interface ResortExplorerModalProps {
  visible: boolean;
  onClose: () => void;
  resortName: string;
  summitAltitude?: number | null;
  baseAltitude?: number | null;
  pistesKm?: string | number | null;
  explorerUrl?: string;
  resortData?: any;
}

export const ResortExplorerModal: React.FC<ResortExplorerModalProps> = ({
  visible,
  onClose,
  resortName,
  summitAltitude,
  baseAltitude,
  pistesKm,
  explorerUrl = 'http://localhost:5174',
  resortData,
}) => {
  const [loading, setLoading] = useState(true);

  // Construir URL con parámetros
  const params = new URLSearchParams({
    resort: resortName,
    resortId: String(resortData?.id || resortData?.ID || ''),
    summit: String(summitAltitude || 2280),
    base: String(baseAltitude || 1860),
    pistes: String(pistesKm || 22.3),
  });
  const fullUrl = `${explorerUrl}?${params.toString()}`;

  const isWeb = Platform.OS === 'web';

  const handleIframeLoad = (e: any) => {
    setLoading(false);
    try {
      if (resortData && e?.target?.contentWindow) {
        const payload = {
          id: resortData.id || resortData.ID || 'valdesqui',
          name: resortData.name || resortData.Name || resortName,
          country: resortData.country || resortData.Country,
          latitude: resortData.latitude || resortData.Latitude,
          longitude: resortData.longitude || resortData.Longitude,
          base_altitude: baseAltitude || 1860,
          summit_altitude: summitAltitude || 2280,
          pistes: (resortData.pistes || []).map((p: any) => ({
            id: p.id || p.ID,
            name: p.name || p.Name,
            difficulty: p.difficulty || p.Difficulty,
            piste_type: p.piste_type || p.PisteType,
            geometry_geojson: p.geometry_geojson || p.GeometryGeoJSON,
          })),
          lifts: (resortData.lifts || []).map((l: any) => ({
            id: l.id || l.ID,
            name: l.name || l.Name,
            lift_type: l.lift_type || l.LiftType,
            geometry_geojson: l.geometry_geojson || l.GeometryGeoJSON,
          })),
        };

        e.target.contentWindow.postMessage(
          JSON.stringify({
            type: 'SET_RESORT_DATA',
            payload,
          }),
          '*'
        );
      }
    } catch (err) {
      console.warn('Error syncing resort data with 3D explorer:', err);
    }
  };

  const handleOpenBrowser = async () => {
    try {
      await Linking.openURL(fullUrl);
    } catch (e) {
      console.warn('Error abriendo navegador:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Barra superior / Header */}
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Mountain size={20} color="#38bdf8" />
            <Text style={styles.headerTitle}>{resortName} · 3D Explorer</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleOpenBrowser}
              style={styles.iconButton}
              accessibilityLabel="Abrir en pestaña nueva"
            >
              <ExternalLink size={18} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.iconButton, styles.closeButton]}
              accessibilityLabel="Cerrar"
            >
              <X size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Contenido WebGL */}
        <View style={styles.content}>
          {isWeb ? (
            <iframe
              src={fullUrl}
              style={styles.iframe as any}
              title={`Explorador 3D - ${resortName}`}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              onLoad={handleIframeLoad}
            />
          ) : (
            <View style={styles.nativeFallback}>
              <Mountain size={48} color="#38bdf8" style={{ marginBottom: 16 }} />
              <Text style={styles.fallbackTitle}>Simulador 3D de {resortName}</Text>
              <Text style={styles.fallbackText}>
                Explora las pistas y remontes en 3D interactivo en el navegador con aceleración por hardware.
              </Text>
              <TouchableOpacity style={styles.openBtn} onPress={handleOpenBrowser}>
                <Text style={styles.openBtnText}>Abrir Simulador 3D</Text>
              </TouchableOpacity>
            </View>
          )}

          {isWeb && loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Cargando relieve 3D...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    height: 54,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  closeButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  iframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  nativeFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  fallbackTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  openBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  openBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
