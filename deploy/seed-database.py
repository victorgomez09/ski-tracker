import time
import json
import random
from datetime import datetime, timedelta
import requests
import psycopg2

# ==========================================
# CONFIGURATION
# ==========================================
API_BASE_URL = "http://localhost:8080"
DB_CONFIG = {
    "dbname": "ski_tracker",
    "user": "user",
    "password": "password",
    "host": "localhost",
    "port": "5432"
}
RESORT_TARGET = "Valdesquí"
USER_ID = "00000000-0000-0000-0000-000000000001"

def get_resort_data_from_db(resort_name):
    """Connects to Postgres and fetches the resort, its lifts, and its named pistes."""
    print(f"🔍 Looking up resort '{resort_name}' in the database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # 1. Find the resort ID
    cur.execute("SELECT id, name FROM ski_resorts WHERE name ILIKE %s LIMIT 1;", (f"%{resort_name}%",))
    resort = cur.fetchone()
    if not resort:
        print(f"❌ Resort '{resort_name}' was not found in the database.")
        cur.close()
        conn.close()
        return None, [], []

    resort_id, full_name = resort
    print(f"✅ Resort found: {full_name} (ID: {resort_id})")

    # 2. Get only pistes with a name and valid GeoJSON geometry
    cur.execute("""
        SELECT id, name, piste_type, difficulty, geometry_geojson 
        FROM ski_pistes 
        WHERE resort_id = %s AND name IS NOT NULL AND name != '';
    """, (resort_id,))
    
    pistes = []
    for row in cur.fetchall():
        pistes.append({
            "id": row[0],
            "name": row[1],
            "type": row[2],
            "difficulty": row[3],
            "geojson": row[4] # psycopg2 maps jsonb values to Python dictionaries
        })

    # 3. Get lifts to simulate realistic ascents
    cur.execute("""
        SELECT id, name, lift_type, geometry_geojson 
        FROM ski_lifts 
        WHERE resort_id = %s;
    """, (resort_id,))
    
    lifts = []
    for row in cur.fetchall():
        lifts.append({
            "id": row[0],
            "name": row[1],
            "type": row[2],
            "geojson": row[3]
        })

    cur.close()
    conn.close()
    print(f"📊 Loaded {len(pistes)} named pistes and {len(lifts)} lifts.")
    return resort_id, pistes, lifts

def extract_coordinates_from_geojson(geojson_geom):
    """Extracts [lon, lat] coordinates from a GeoJSON LineString or MultiLineString."""
    if not geojson_geom or "coordinates" not in geojson_geom:
        return []
    
    coords = geojson_geom["coordinates"]
    g_type = geojson_geom.get("type", "LineString")

    if g_type == "LineString":
        return [(c[1], c[0]) for c in coords] # Returns tuples in (lat, lon) format
    elif g_type == "MultiLineString":
        flat_coords = []
        for line in coords:
            for c in line:
                flat_coords.append((c[1], c[0]))
        return flat_coords
    return []

def send_points_batch(session_id, points):
    """Sends a batch of points to the Go API."""
    if not points:
        return
    payload = {"points": points}
    try:
        resp = requests.post(f"{API_BASE_URL}/ski-sessions/{session_id}/points", json=payload)
        if resp.status_code != 200:
            print(f"⚠️ Error sending points: {resp.text}")
    except Exception as e:
        print(f"⚠️ HTTP exception while sending points: {e}")

def simulate_full_day():
    resort_id, pistes, lifts = get_resort_data_from_db(RESORT_TARGET)
    if not pistes:
        print("❌ No pistes available to simulate. Make sure you imported data into PostGIS.")
        return

    # 1. Start a session in the Go API
    print("\n🚀 Starting ski session in the API...")
    resp = requests.post(f"{API_BASE_URL}/ski-sessions", json={"userId": USER_ID})
    if resp.status_code != 201:
        print(f"❌ Error starting backend session: {resp.text}")
        return
    
    session_data = resp.json()
    session_id = session_data.get("sessionId")
    print(f"✅ Session started with ID: {session_id}")

    # Day schedule configuration (10:00 to 16:00, simulated in accelerated time)
    current_time = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = current_time.replace(hour=16, minute=0)

    simulated_runs = 0
    
    print(f"\n⛷️ Starting day at {RESORT_TARGET} at {current_time.strftime('%H:%M')}...")

    while current_time < end_time and simulated_runs < 8:
        simulated_runs += 1
        
        # ---------------------------------------------------------
        # STEP A: Simulate chairlift ascent
        # ---------------------------------------------------------
        print(f"\n[Day {current_time.strftime('%H:%M')}] 🚠 Riding the lift up...")
        current_alt = 1800.0 # Approximate base altitude in Sierra de Madrid
        
        # Generate simulated ascent points (around 10 points)
        lift_points = []
        base_lat, base_lon = 40.800, -3.880
        for i in range(12):
            base_lat += 0.00015
            base_lon += 0.0001
            current_alt += 25.0 # Elevation gain
            
            lift_points.append({
                "lat": base_lat,
                "lon": base_lon,
                "altitude": current_alt,
                "speed": 2.5, # Slow lift speed
                "timestamp": current_time.isoformat() + "Z"
            })
            current_time += timedelta(seconds=30)
        
        send_points_batch(session_id, lift_points)
        time.sleep(0.1) # Small execution pause for the script

        # ---------------------------------------------------------
        # STEP B: Short pause at the summit (lodge)
        # ---------------------------------------------------------
        print(f"[{current_time.strftime('%H:%M')}] ☕ Short break at the lodge/summit...")
        pause_points = []
        for i in range(4):
            pause_points.append({
                "lat": base_lat,
                "lon": base_lon,
                "altitude": current_alt,
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z"
            })
            current_time += timedelta(seconds=30)
        send_points_batch(session_id, pause_points)

        # ---------------------------------------------------------
        # STEP C: Choose a real piste from the database and descend it
        # ---------------------------------------------------------
        chosen_piste = random.choice(pistes)
        print(f"[{current_time.strftime('%H:%M')}] 🏂 Descending piste: '{chosen_piste['name']}' (Difficulty: {chosen_piste['difficulty']})")
        
        # Extract real coordinates from the piste GeoJSON geometry
        piste_coords = extract_coordinates_from_geojson(chosen_piste["geojson"])
        
        run_points = []
        if len(piste_coords) > 5:
            # Use them if detailed real geometries are available
            step = max(1, len(piste_coords) // 15) # Sample representative points
            for idx in range(0, len(piste_coords), step):
                lat, lon = piste_coords[idx]
                current_alt = max(1500, current_alt - 30.0) # Altitude descent
                speed = random.uniform(8.0, 22.0) # Ski speed between ~30 and 80 km/h
                
                run_points.append({
                    "lat": lat,
                    "lon": lon,
                    "altitude": current_alt,
                    "speed": speed,
                    "timestamp": current_time.isoformat() + "Z"
                })
                current_time += timedelta(seconds=10)
        else:
            # Fallback if the piste has too few GeoJSON points
            for i in range(15):
                base_lat -= 0.00025
                base_lon -= 0.00015
                current_alt -= 40.0
                run_points.append({
                    "lat": base_lat,
                    "lon": base_lon,
                    "altitude": current_alt,
                    "speed": random.uniform(10.0, 18.0),
                    "timestamp": current_time.isoformat() + "Z"
                })
                current_time += timedelta(seconds=10)

        send_points_batch(session_id, run_points)
        time.sleep(0.1)

    # 2. Finish session (triggers the Go goroutine for map matching and metrics computation)
    print(f"\n🏁 Day finished. Closing session in the API...")
    resp = requests.post(f"{API_BASE_URL}/ski-sessions/{session_id}/finish")
    if resp.status_code == 200:
        print("✅ Session closed successfully.")
        print("✨ Check your Go server logs: you should see noise filtering, segmentation, and how the map-matching algorithm assigns each descent to its real OpenStreetMap piste.")
    else:
        print(f"❌ Error closing session: {resp.text}")

if __name__ == "__main__":
    simulate_full_day()