import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { Barometer } from 'expo-sensors';

import { savePointToLocalDB } from './database';

const LOCATION_TASK_NAME = 'background-location-task';

/**
 * Background location task for tracking ski sessions even when the app is in the background. This task is defined using Expo's TaskManager and will be triggered whenever the device's location changes based on the specified accuracy and intervals.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error(error);
    return;
  }
  if (data) {
    const database = await SQLite.openDatabaseAsync('ski_tracker.db');
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];

    let currentPressure: number | null = null;
    
    try {
      const baroData = await Barometer.getPermissionsAsync();
      if (baroData.granted) {
        const barometerSubscription = Barometer.addListener(data => {
          currentPressure = data.pressure;
          barometerSubscription.remove(); // Stop listening after getting the first reading
        });
      }
    } catch (e) {
      console.log('Barometer sensor not available in the background');
    }

    console.log('Gps saved to sqlite:', location.coords.latitude, location.coords.longitude);
    savePointToLocalDB(
      location.coords.latitude,
      location.coords.longitude,
      location.coords.altitude || 0,
      location.coords.speed || 0,
      currentPressure,
      location.timestamp,
      database
    );
  }
});

/**
 * Starts tracking the user's location in the background. This function requests the necessary permissions and initiates location updates with specified accuracy and intervals. It also configures a foreground service notification to inform the user that their ski session is being monitored.
 */
export const startTracking = async () => {
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