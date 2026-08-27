import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { savePointToLocalDB } from './database';

const LOCATION_TASK_NAME = 'ski-background-location-task';

/**
 * Tarea en segundo plano para registrar coordenadas GPS.
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
      // 1. Abrir base de datos y leer AsyncStorage UNA sola vez fuera del bucle
      const resortId = await AsyncStorage.getItem('ACTIVE_RESORT_ID');
      const database = await SQLite.openDatabaseAsync('ski_tracker.db');

      for (const location of locations) {
        console.log('GPS guardado en SQLite:', location.coords.latitude, location.coords.longitude);
        await savePointToLocalDB(
          location.coords.latitude,
          location.coords.longitude,
          location.coords.altitude || 0,
          location.coords.speed || 0,
          null, // Barómetro
          resortId,
          location.timestamp,
          database
        );
      }
    } catch (err) {
      console.error('Error guardando puntos en background:', err);
    }
  }
});

/**
 * Inicia el rastreo de ubicación en segundo plano con validación de permisos y Foreground Service.
 */
export const startTracking = async (resortId: string, trackingTime: number): Promise<boolean> => {
  try {
    await AsyncStorage.setItem('ACTIVE_RESORT_ID', resortId.toString());

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

    // 3. Verificar si la tarea ya está activa antes de volver a registrarla
    const isAlreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isAlreadyStarted) {
      console.log('El servicio de rastreo ya estaba iniciado.');
      return true;
    }

    // 4. Iniciar servicio en segundo plano
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: trackingTime,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true, // Solo aplica a iOS
      foregroundService: {
        notificationTitle: "Monitoreando tu sesión de esquí",
        notificationBody: "Tu sesión de esquí está activa en segundo plano",
        // killWithApp: false, // Evita que el servicio muera si el usuario desliza y cierra la app
      },
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error al iniciar startTracking:', err);

    if (message.includes('Foreground service permissions')) {
      throw new Error(
        'FOREGROUND_SERVICE_MISSING: El tracking en segundo plano requiere un build nativo con permisos de foreground service. ' +
        'No funciona en Expo Go. Ejecuta "npx expo run:android" para generar e instalar la app.'
      );
    }

    return false;
  }
};

/**
 * Detiene el rastreo de ubicación en segundo plano.
 */
export const stopTracking = async (): Promise<void> => {
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