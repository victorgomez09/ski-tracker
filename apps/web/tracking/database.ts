import * as SQLite from 'expo-sqlite';

export interface TrackPoint {
  id?: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  pressure: number | null;
  resort_id: string | null;
  timestamp: number;
}

/**
 * Initializes the SQLite database by creating the necessary table for storing tracking points. This function should be called at the start of the application to ensure that the database is ready for use.
 */
export const initDB = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

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

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uri TEXT NOT NULL
    );
  `);
};

/**
 * Saves a location point to the local SQLite database.
 * @param location The location object containing latitude, longitude, altitude, and timestamp.
 */
export const savePointToLocalDB = async (
  lat: number,
  lon: number,
  alt: number,
  speed: number,
  pressure: number | null,
  resortId: string | null,
  timestamp: number,
  db: SQLite.SQLiteDatabase
) => {
  const query = 'INSERT INTO track_points (lat, lon, alt, speed, pressure, resort_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const params = [
    lat ?? 0,
    lon ?? 0,
    alt ?? 0,
    speed ?? 0,
    pressure ?? null,
    resortId ?? null,
    timestamp ?? Date.now(),
  ];

  try {
    await db.runAsync(query, params);
  } catch (err) {
    console.warn('savePointToLocalDB error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      await fallbackDb.runAsync(query, params);
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Saves multiple points to the local SQLite database in a single transaction.
 * Drastically reduces disk I/O, lock contention, and battery usage during background tracking.
 */
export const batchSavePointsToLocalDB = async (
  points: Array<{
    lat: number;
    lon: number;
    alt: number;
    speed: number;
    pressure: number | null;
    resortId: string | null;
    timestamp: number;
  }>,
  db: SQLite.SQLiteDatabase
) => {
  if (!points || points.length === 0) return;

  const insertQuery = 'INSERT INTO track_points (lat, lon, alt, speed, pressure, resort_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';

  const executeBatch = async (targetDb: SQLite.SQLiteDatabase) => {
    await targetDb.withTransactionAsync(async () => {
      for (const p of points) {
        await targetDb.runAsync(insertQuery, [
          p.lat ?? 0,
          p.lon ?? 0,
          p.alt ?? 0,
          p.speed ?? 0,
          p.pressure ?? null,
          p.resortId ?? null,
          p.timestamp ?? Date.now(),
        ]);
      }
    });
  };

  try {
    await executeBatch(db);
  } catch (err) {
    console.warn('batchSavePointsToLocalDB error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      await executeBatch(fallbackDb);
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Gets the total count of points recorded in the local SQLite database without loading all rows into JS.
 */
export const getPointsCount = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  const query = 'SELECT COUNT(*) as count FROM track_points';
  try {
    const row = await db.getFirstAsync<{ count: number }>(query);
    return row?.count ?? 0;
  } catch (err) {
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      const row = await fallbackDb.getFirstAsync<{ count: number }>(query);
      return row?.count ?? 0;
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Gets the latest recorded point from local SQLite.
 */
export const getLastPoint = async (db: SQLite.SQLiteDatabase): Promise<TrackPoint | null> => {
  const query = 'SELECT * FROM track_points ORDER BY timestamp DESC LIMIT 1';
  try {
    const row = await db.getFirstAsync<TrackPoint>(query);
    return row ?? null;
  } catch (err) {
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      const row = await fallbackDb.getFirstAsync<TrackPoint>(query);
      return row ?? null;
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Retrieves all location points from the local SQLite database, ordered by timestamp.
 */
export const getAllPoints = async (db: SQLite.SQLiteDatabase): Promise<TrackPoint[]> => {
  const query = 'SELECT * FROM track_points ORDER BY timestamp ASC';
  try {
    return (await db.getAllAsync(query)) as TrackPoint[];
  } catch (err) {
    console.warn('getAllPoints error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      return (await fallbackDb.getAllAsync(query)) as TrackPoint[];
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Retrieves all photos from the local SQLite database.
 */
export const getAllPhotos = async (db: SQLite.SQLiteDatabase): Promise<{ id: number; file_uri: string }[]> => {
  const query = 'SELECT * FROM photos';
  try {
    if (!db) return [];
    return await db.getAllAsync<{ id: number; file_uri: string }>(query);
  } catch (err) {
    console.warn('getAllPhotos error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      return await fallbackDb.getAllAsync<{ id: number; file_uri: string }>(query);
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Saves a photo file URI to the local SQLite database.
 */
export const savePhotoToLocalDB = async (fileUri: string, db: SQLite.SQLiteDatabase) => {
  if (!fileUri) return;
  const query = 'INSERT INTO photos (file_uri) VALUES (?)';
  try {
    if (!db) return;
    await db.runAsync(query, [fileUri]);
  } catch (err) {
    console.warn('savePhotoToLocalDB error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      await fallbackDb.runAsync(query, [fileUri]);
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};

/**
 * Clears all tracking points from the local SQLite database. This function should be called at the start of a new ski session.
 */
export const clearTrack = async (db: SQLite.SQLiteDatabase) => {
  try {
    await db.execAsync('DELETE FROM track_points; DELETE FROM photos;');
  } catch (err) {
    console.warn('clearTrack error on db context, trying with isolated connection:', err);
    const fallbackDb = await SQLite.openDatabaseAsync('ski_tracker.db', { useNewConnection: true });
    try {
      await fallbackDb.execAsync('DELETE FROM track_points; DELETE FROM photos;');
    } finally {
      await fallbackDb.closeAsync();
    }
  }
};