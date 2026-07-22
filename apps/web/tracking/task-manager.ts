import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { Barometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { savePointToLocalDB } from './database';

const LOCATION_TASK_NAME = 'ski-background-location-task';

/**
 * Background location task for tracking ski sessions even when the app is in the background. This task is defined using Expo's TaskManager and will be triggered whenever the device's location changes based on the specified accuracy and intervals.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error(error);
    return;
  }
  if (data) {
    const resortId = await AsyncStorage.getItem('ACTIVE_RESORT_ID');
    const database = await SQLite.openDatabaseAsync('ski_tracker.db');
    const { locations } = data as { locations: Location.LocationObject[] };

    for (const location of locations) {
      console.log('Gps saved to sqlite:', location.coords.latitude, location.coords.longitude);
      await savePointToLocalDB(
        location.coords.latitude,
        location.coords.longitude,
        location.coords.altitude || 0,
        location.coords.speed || 0,
        null, // Barometer not read synchronously in background loop
        resortId,
        location.timestamp,
        database
      );
    }
  }
});

/**
 * Starts tracking the user's location in the background. This function requests the necessary permissions and initiates location updates with specified accuracy and intervals. It also configures a foreground service notification to inform the user that their ski session is being monitored.
 */
export const startTracking = async (resortId: string) => {
  await AsyncStorage.setItem('ACTIVE_RESORT_ID', resortId.toString());
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return;

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000, // Get updates every 5 seconds even if movement is minimal
    distanceInterval: 10, // Get updates every 10 meters
    showsBackgroundLocationIndicator: true, // Show indicator on iOS/Android
    foregroundService: {
      notificationTitle: "Monitoring your ski session",
      notificationBody: "Your ski session is in progress",
    },
  });
};

/**
 * Stops tracking the user's location in the background. This function checks if the background location task is registered and, if so, stops the location updates to conserve battery and resources.
 */
export const stopTracking = async () => {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
};

export const getCurrentLocation = async (): Promise<Location.LocationObject | null> => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.error('Location permission not granted');
    return null;
  }

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return location;
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
};