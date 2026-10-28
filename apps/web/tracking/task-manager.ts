import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18n';

import { batchSavePointsToLocalDB, savePointToLocalDB } from './database';

const LOCATION_TASK_NAME = 'ski-background-location-task';

let lastSavedCoord: { lat: number; lon: number; timestamp: number } | null = null;

function fastDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Tarea en segundo plano para registrar coordenadas GPS con optimización térmica y filtro de jitter.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('TaskManager error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    try {
      const resortId = await AsyncStorage.getItem('ACTIVE_RESORT_ID');

      // Filtrar puntos que representen ruido estacionario (deriva de GPS mientras se está quieto en cola o cafetería)
      const pointsToSave: Array<{
        lat: number;
        lon: number;
        alt: number;
        speed: number;
        pressure: number | null;
        resortId: string | null;
        timestamp: number;
      }> = [];

      for (const location of locations) {
        const lat = location.coords.latitude;
        const lon = location.coords.longitude;
        const speed = location.coords.speed || 0;
        const timestamp = location.timestamp;

        if (lastSavedCoord) {
          const dist = fastDistanceMeters(lastSavedCoord.lat, lastSavedCoord.lon, lat, lon);
          const timeElapsedMs = timestamp - lastSavedCoord.timestamp;

          // Si el usuario se ha desplazado menos de 2.5m, la velocidad es nula/baja (<1m/s ~ 3.6km/h) y han pasado menos de 30s,
          // se trata de fluctuación estática. Omitir para ahorrar escrituras en disco y batería.
          if (dist < 2.5 && speed < 1.0 && timeElapsedMs < 30000) {
            continue;
          }
        }

        lastSavedCoord = { lat, lon, timestamp };
        pointsToSave.push({
          lat,
          lon,
          alt: location.coords.altitude || 0,
          speed,
          pressure: null,
          resortId,
          timestamp,
        });
      }

      if (pointsToSave.length === 0) return;

      const database = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
      try {
        await batchSavePointsToLocalDB(pointsToSave, database);
      } finally {
        await database.closeAsync();
      }
    } catch (err) {
      console.error('Error guardando puntos en background:', err);
    }
  }
});

/**
 * Inicia el rastreo de ubicación en segundo plano con validación de permisos y Foreground Service.
 */
export const startTracking = async (
  resortId: string,
  trackingTime: number,
  distanceInterval: number = 0,
  activityType: string = 'ski'
): Promise<boolean> => {
  try {
    if (resortId) {
      await AsyncStorage.setItem('ACTIVE_RESORT_ID', resortId.toString());
    } else {
      await AsyncStorage.removeItem('ACTIVE_RESORT_ID');
    }

    if (activityType) {
      await AsyncStorage.setItem('ACTIVE_ACTIVITY_TYPE', activityType);
    }

    // 1. Solicitar permiso en primer plano
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.warn('Permiso de ubicación en primer plano denegado.');
      return false;
    }

    // 2. Solicitar permiso en segundo plano (Indispensable para Android 11+)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('Permiso de ubicación en segundo plano denegado.');
      return false;
    }

    // 3. Solicitar permiso de notificaciones (Requerido para Android 13+ e iOS)
    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    if (notificationStatus !== 'granted') {
      console.warn('Permiso de notificaciones denegado.');
    }

    // 4. Crear canal de notificaciones con alta importancia para mostrarlo en el lock screen (Solo Android)
    if (Platform.OS === 'android') {
      const channelId = `com.vira.skitracker:${LOCATION_TASK_NAME}`;
      await Notifications.setNotificationChannelAsync(channelId, {
        name: i18n.t('tracking', 'Seguimiento'),
        importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });
    }

    // 5. Verificar si la tarea ya está activa antes de volver a registrarla
    const isAlreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isAlreadyStarted) {
      console.log('El servicio de rastreo ya estaba iniciado.');
      return true;
    }

    // 6. Iniciar servicio en segundo plano
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: trackingTime,
      distanceInterval: distanceInterval,
      showsBackgroundLocationIndicator: true, // Solo aplica a iOS
      foregroundService: {
        notificationTitle: i18n.t('monitoring_session', 'Monitoreando tu sesión'),
        notificationBody: i18n.t('session_in_progress', 'Tu sesión está activa en segundo plano'),
        // killWithApp: false, // Evita que el servicio muera si el usuario desliza y cierra la app
      },
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error al iniciar startTracking:', err);

    if (message.indexOf('Foreground service permissions') !== -1) {
      throw new Error(
        'FOREGROUND_SERVICE_MISSING: El tracking en segundo plano requiere un build nativo con permisos de foreground service. ' +
        'No funciona en Expo Go. Ejecuta "npx expo run:android" para generar e instalar la app.'
      );
    }

    return false;
  }
};

export const TRACKING_STORAGE_KEYS = {
  IS_ACTIVE: 'TRACKING_IS_ACTIVE',
  IS_PAUSED: 'TRACKING_IS_PAUSED',
  START_TIME: 'TRACKING_START_TIME',
  PAUSED_TIME: 'TRACKING_PAUSED_TIME',
  ACCUMULATED_PAUSED_MS: 'TRACKING_ACCUMULATED_PAUSED_MS',
  RESORT_ID: 'ACTIVE_RESORT_ID',
  ACTIVITY_TYPE: 'ACTIVE_ACTIVITY_TYPE',
};

export interface PersistedTrackingState {
  isActive: boolean;
  isPaused: boolean;
  startTime: number | null;
  pausedTime: number | null;
  accumulatedPausedMs: number;
  resortId: string | null;
  activityType: string | null;
  isServiceRunning: boolean;
}

export const getPersistedTrackingState = async (): Promise<PersistedTrackingState> => {
  try {
    const isServiceRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    const [
      isActiveStr,
      isPausedStr,
      startTimeStr,
      pausedTimeStr,
      accumulatedPausedMsStr,
      resortId,
      activityType,
    ] = await Promise.all([
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.IS_ACTIVE),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.IS_PAUSED),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.START_TIME),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.PAUSED_TIME),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.ACCUMULATED_PAUSED_MS),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.RESORT_ID),
      AsyncStorage.getItem(TRACKING_STORAGE_KEYS.ACTIVITY_TYPE),
    ]);

    const isActive = isActiveStr === 'true' || isServiceRunning;
    const isPaused = isPausedStr === 'true';
    const startTime = startTimeStr ? parseInt(startTimeStr, 10) : null;
    const pausedTime = pausedTimeStr ? parseInt(pausedTimeStr, 10) : null;
    const accumulatedPausedMs = accumulatedPausedMsStr ? parseInt(accumulatedPausedMsStr, 10) : 0;

    return {
      isActive,
      isPaused,
      startTime,
      pausedTime,
      accumulatedPausedMs,
      resortId,
      activityType,
      isServiceRunning,
    };
  } catch (err) {
    console.error('Error getting persisted tracking state:', err);
    return {
      isActive: false,
      isPaused: false,
      startTime: null,
      pausedTime: null,
      accumulatedPausedMs: 0,
      resortId: null,
      activityType: null,
      isServiceRunning: false,
    };
  }
};

export const persistTrackingStart = async (resortId?: string, activityType?: string) => {
  const now = Date.now().toString();
  await Promise.all([
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.IS_ACTIVE, 'true'),
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.IS_PAUSED, 'false'),
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.START_TIME, now),
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.ACCUMULATED_PAUSED_MS, '0'),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.PAUSED_TIME),
    resortId ? AsyncStorage.setItem(TRACKING_STORAGE_KEYS.RESORT_ID, resortId) : AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.RESORT_ID),
    activityType ? AsyncStorage.setItem(TRACKING_STORAGE_KEYS.ACTIVITY_TYPE, activityType) : AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.ACTIVITY_TYPE),
  ]);
};

export const persistTrackingPause = async () => {
  const now = Date.now().toString();
  await Promise.all([
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.IS_PAUSED, 'true'),
    AsyncStorage.setItem(TRACKING_STORAGE_KEYS.PAUSED_TIME, now),
  ]);
};

export const persistTrackingResume = async () => {
  try {
    const pausedTimeStr = await AsyncStorage.getItem(TRACKING_STORAGE_KEYS.PAUSED_TIME);
    const accumulatedPausedMsStr = await AsyncStorage.getItem(TRACKING_STORAGE_KEYS.ACCUMULATED_PAUSED_MS);

    let accumulated = accumulatedPausedMsStr ? parseInt(accumulatedPausedMsStr, 10) : 0;
    if (pausedTimeStr) {
      const pausedTime = parseInt(pausedTimeStr, 10);
      accumulated += (Date.now() - pausedTime);
    }

    await Promise.all([
      AsyncStorage.setItem(TRACKING_STORAGE_KEYS.IS_PAUSED, 'false'),
      AsyncStorage.setItem(TRACKING_STORAGE_KEYS.ACCUMULATED_PAUSED_MS, accumulated.toString()),
      AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.PAUSED_TIME),
    ]);
  } catch (e) {
    console.error('Error persisting tracking resume:', e);
  }
};

export const persistTrackingClear = async () => {
  lastSavedCoord = null;
  await Promise.all([
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.IS_ACTIVE),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.IS_PAUSED),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.START_TIME),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.PAUSED_TIME),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.ACCUMULATED_PAUSED_MS),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.RESORT_ID),
    AsyncStorage.removeItem(TRACKING_STORAGE_KEYS.ACTIVITY_TYPE),
  ]);
};

/**
 * Actualiza dinámicamente el intervalo de muestreo GPS en caliente sin reiniciar la sesión.
 * Permite reducir drásticamente el consumo cuando el usuario está estático o en cola de remontes.
 */
export const updateTrackingInterval = async (
  trackingTime: number,
  distanceInterval: number = 0
): Promise<boolean> => {
  try {
    const isAlreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (!isAlreadyStarted) return false;

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: trackingTime,
      distanceInterval: distanceInterval,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: i18n.t('monitoring_session', 'Monitoreando tu sesión'),
        notificationBody: i18n.t('session_in_progress', 'Tu sesión está activa en segundo plano'),
      },
    });
    return true;
  } catch (err) {
    console.warn('Error al actualizar intervalo dinámico de tracking:', err);
    return false;
  }
};

/**
 * Detiene el rastreo de ubicación en segundo plano.
 */
export const stopTracking = async (): Promise<void> => {
  lastSavedCoord = null;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('Rastreo de ubicación detenido.');
    }
  } catch (err) {
    console.error('Error al detener tracking:', err);
  }
};

export const getCurrentLocation = async (): Promise<Location.LocationObject | null> => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.error('Permiso de ubicación no concedido.');
    return null;
  }

  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch (error) {
    console.error('Error obteniendo la ubicación actual:', error);
    return null;
  }
};

 export const getInitialCurrentLocation = async (): Promise<Location.LocationObject | null> => {                                                                                        
      const { status } = await Location.getForegroundPermissionsAsync();                                                                                                            
      if (status !== 'granted') return null;                                                                                                                                        
                                                                                                                                                                                    
      try {                                                                                                                                                                         
        const lastKnown = await Location.getLastKnownPositionAsync();                                                                                                               
        if (lastKnown) return lastKnown;                                                                                                                                            
                                                                                                                                                                                    
        return await Location.getCurrentPositionAsync({                                                                                                                             
          accuracy: Location.Accuracy.High,                                                                                                                                     
        });                                                                                                                                                                         
      } catch (error) {                                                                                                                                                             
        console.error('Error obteniendo ubicación:', error);                                                                                                                        
        return null;                                                                                                                                                                
      }                                                                                                                                                                             
    };           