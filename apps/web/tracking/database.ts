import * as SQLite from 'expo-sqlite';

export interface TrackPoint {
  id?: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  pressure: number | null;
  timestamp: number;
}

/**
 * Initializes the SQLite database by creating the necessary table for storing tracking points. This function should be called at the start of the application to ensure that the database is ready for use.
 */
export const initDB = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS track_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL,
      lon REAL,
      alt REAL,
      speed REAL,
      pressure REAL,
      resort_id TEXT,
      timestamp INTEGER
    );
  `);
};

/**
 * Saves a location point to the local SQLite database.
 * @param location The location object containing latitude, longitude, altitude, and timestamp.
 */
export const savePointToLocalDB = async (lat: number, 
  lon: number, 
  alt: number, 
  speed: number,
  pressure: number | null,
  resortId: string | null,
  timestamp: number, db: SQLite.SQLiteDatabase) => {
  await db.runAsync(
    'INSERT INTO track_points (lat, lon, alt, speed, pressure, resort_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [lat, lon, alt, speed, pressure, resortId, timestamp]
  );
};

/**
 * Retrieves all location points from the local SQLite database, ordered by timestamp.
 */
export const getAllPoints = async (db: SQLite.SQLiteDatabase) => {
  return await db.getAllAsync('SELECT * FROM track_points ORDER BY timestamp ASC') as TrackPoint[];
};

/**
 * Clears all tracking points from the local SQLite database. This function should be called at the start of a new ski session.
 */
export const clearTrack = async (db: SQLite.SQLiteDatabase) => {
  // await db.runAsync('DROP TABLE IF EXISTS track_points');
  await db.execAsync('DELETE FROM track_points');
};