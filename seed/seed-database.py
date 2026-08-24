import time
import random
import json
from datetime import datetime, timedelta
import requests
import psycopg2
import math
import zlib
import struct

# ==========================================
# CONFIGURATION
# ==========================================
API_BASE_URL = "http://localhost:8082"
DB_CONFIG = {
    "dbname": "ski_tracker",
    "user": "ski_tracker",
    "password": "ski_tracker",
    "host": "localhost",
    "port": "5433",
}
RESORT_TARGET = "Valdesquí"
SEED_USER_EMAIL = "admin@admin.es"
SEED_USER_PASSWORD = "adminadmin"
SEED_USER_DISPLAY_NAME = "Seed User"
SEED_USER_FIRST_NAME = "Seed"
SEED_USER_LAST_NAME = "User"


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
            "geojson": row[4],  # psycopg2 maps jsonb values to Python dictionaries
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
            "geojson": row[3],
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
        return [(c[1], c[0]) for c in coords]  # Returns tuples in (lat, lon) format
    elif g_type == "MultiLineString":
        flat_coords = []
        for line in coords:
            for c in line:
                flat_coords.append((c[1], c[0]))
        return flat_coords
    return []


def create_or_login_user():
    """Creates a seed user in the API and returns its auth headers."""
    register_payload = {
        "email": SEED_USER_EMAIL,
        "password": SEED_USER_PASSWORD,
        "display_name": SEED_USER_DISPLAY_NAME,
        "first_name": SEED_USER_FIRST_NAME,
        "last_name": SEED_USER_LAST_NAME,
    }

    print("👤 Creating or reusing seed user...")
    register_resp = requests.post(f"{API_BASE_URL}/api/v1/auth/register", json=register_payload)
    if register_resp.status_code == 200:
        print("✅ Seed user created successfully.")
    elif register_resp.status_code in {400, 409, 422}:
        print("ℹ️ Seed user already exists; trying login instead.")
    else:
        print(f"⚠️ Registration returned {register_resp.status_code}: {register_resp.text}")

    login_resp = requests.post(
        f"{API_BASE_URL}/api/v1/auth/login",
        json={"email": SEED_USER_EMAIL, "password": SEED_USER_PASSWORD},
    )
    if login_resp.status_code != 200:
        raise RuntimeError(f"❌ Login failed: {login_resp.status_code} {login_resp.text}")

    auth_data = login_resp.json()
    access_token = auth_data.get("access_token")
    user_data = auth_data.get("user") or {}
    user_id = user_data.get("id")

    if not access_token or not user_id:
        raise RuntimeError(f"❌ Invalid auth response: {auth_data}")

    print(f"✅ Authenticated user: {user_id}")
    return user_id, {"Authorization": f"Bearer {access_token}"}


def generate_square_image():
    """Generates PNG bytes for a 120x120 image with a red square on a blue background using standard library."""
    width, height = 120, 120
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    # Width, Height, Bit depth (8), Color type (2 = RGB), Compression (0), Filter (0), Interlace (0)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    
    # Generate pixel data (RGB)
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter byte 0 (None) for the row
        for x in range(width):
            # Red square in the center (from 35 to 85)
            if 35 <= x < 85 and 35 <= y < 85:
                raw_data.extend(b'\xff\x00\x00') # Red
            else:
                raw_data.extend(b'\x3a\x9a\xe9') # Sky blue background
                
    # Compress the data
    idat_data = zlib.compress(raw_data)
    idat_chunk = struct.pack('>I', len(idat_data)) + b'IDAT' + idat_data + struct.pack('>I', zlib.crc32(b'IDAT' + idat_data))
    
    # IEND chunk
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    
    return png_signature + ihdr_chunk + idat_chunk + iend_chunk


# Generate the test image bytes
DUMMY_IMAGE = generate_square_image()


def get_distance_meters(p1, p2):
    """Calculates flat-earth distance between two (lat, lon) coordinates in meters."""
    lat1, lon1 = p1
    lat2, lon2 = p2
    lat_mid = (lat1 + lat2) / 2.0
    dy = (lat2 - lat1) * 111320.0
    dx = (lon2 - lon1) * 40075000.0 * math.cos(math.radians(lat_mid)) / 360.0
    return (dx**2 + dy**2)**0.5


def interpolate_track(coords, start_alt, end_alt, target_speed_range, is_lift=False, difficulty=None, time_step=2):
    """
    Interpolates a list of (lat, lon) coordinates to generate high-resolution points 
    sampled every `time_step` seconds, with speeds matching physical movement.
    """
    if not coords or len(coords) < 2:
        return []

    # Calculate segment lengths and cumulative distance
    segs = []
    tot_dist = 0.0
    for i in range(len(coords) - 1):
        d = get_distance_meters(coords[i], coords[i+1])
        segs.append(d)
        tot_dist += d

    if tot_dist == 0:
        return []

    points = []
    accum_dist = 0.0
    
    # Carving parameters (simulates slalom turns left and right)
    carve_period = 15.0  # seconds per full S-turn
    carve_amp = 0.0      # meters
    if not is_lift:
        # Normalize difficulty string
        diff = str(difficulty).lower() if difficulty else ""
        if "easy" in diff or "novice" in diff or "green" in diff:
            carve_amp = 1.5
            carve_period = 8.0
        elif "intermediate" in diff or "blue" in diff:
            carve_amp = 3.0
            carve_period = 6.0
        elif "advanced" in diff or "red" in diff:
            carve_amp = 4.0
            carve_period = 5.0
        elif "expert" in diff or "black" in diff:
            carve_amp = 5.0
            carve_period = 4.0
        else:
            carve_amp = 2.0
            carve_period = 6.0

    current_segment_idx = 0
    seg_start_dist = 0.0
    
    elapsed_time = 0.0
    v = (target_speed_range[0] + target_speed_range[1]) / 2.0  # starting speed

    while accum_dist < tot_dist:
        # Find current segment
        while current_segment_idx < len(segs) and accum_dist > (seg_start_dist + segs[current_segment_idx]):
            seg_start_dist += segs[current_segment_idx]
            current_segment_idx += 1
            
        if current_segment_idx >= len(segs):
            break

        # Interpolate position on segment
        seg_d = segs[current_segment_idx]
        p_ratio = 1.0 if seg_d == 0 else (accum_dist - seg_start_dist) / seg_d
            
        p1 = coords[current_segment_idx]
        p2 = coords[current_segment_idx + 1]
        
        lat = p1[0] + (p2[0] - p1[0]) * p_ratio
        lon = p1[1] + (p2[1] - p1[1]) * p_ratio
        
        # Altitude: linear interpolation over total distance
        ratio = accum_dist / tot_dist
        alt = start_alt + (end_alt - start_alt) * ratio
        
        # Add carving & noise
        if not is_lift and carve_amp > 0:
            # Perpendicular vector in degrees approx
            dy = p2[0] - p1[0]
            dx = p2[1] - p1[1]
            mag = (dx**2 + dy**2)**0.5
            if mag > 0:
                # Perpendicular unit vector
                ny = -dx / mag
                nx = dy / mag
                
                # Carving offset (sinusoidal carving path)
                phase = (elapsed_time / carve_period) * 2.0 * math.pi
                offset_m = carve_amp * math.sin(phase)
                
                # Convert meters to degrees offset
                offset_lat = (offset_m * ny) / 111320.0
                offset_lon = (offset_m * nx) / (111320.0 * math.cos(math.radians(lat)))
                
                lat += offset_lat
                lon += offset_lon
        
        # GPS noise: 0.5 meter random jitter
        lat += random.normalvariate(0, 0.5) / 111320.0
        lon += random.normalvariate(0, 0.5) / (111320.0 * math.cos(math.radians(lat)))

        points.append({
            "lat": lat,
            "lon": lon,
            "altitude": alt,
            "speed": v,
            "elapsed_seconds": elapsed_time
        })
        
        # Determine speed for next step
        if is_lift:
            v = random.uniform(target_speed_range[0], target_speed_range[1])
        else:
            # Physics/Slalom simulation: speed depends on slope, target difficulty, and minor noise
            target_v = random.uniform(target_speed_range[0], target_speed_range[1])
            # smooth transition
            v = 0.85 * v + 0.15 * target_v
            
        accum_dist += v * time_step
        elapsed_time += time_step

    return points


def get_distance(p1, p2):
    """Calculates Euclidean distance between two (lat, lon) coordinates."""
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def send_points_batch(session_id, points, auth_headers, photo_bytes=None, photo_name=None):
    """Sends a batch of points to the Go API, optionally with a photo."""
    if not points:
        return

    payload = {"points": points}
    files = {
        "points": (None, json.dumps(payload), "application/json")
    }
    if photo_bytes and photo_name:
        files["photos"] = (photo_name, photo_bytes, "image/png")

    try:
        resp = requests.post(
            f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/points",
            headers=auth_headers,
            files=files,
        )
        if resp.status_code != 200:
            print(f"⚠️ Error sending points: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"⚠️ HTTP exception while sending points: {e}")


def simulate_full_day():
    resort_id, pistes, lifts = get_resort_data_from_db(RESORT_TARGET)
    if not pistes or not lifts:
        print("❌ No pistes or lifts available to simulate. Make sure you imported data into PostGIS.")
        return

    # Filter out empty elements
    valid_lifts = []
    for l in lifts:
        c = extract_coordinates_from_geojson(l["geojson"])
        if len(c) > 1:
            valid_lifts.append({"id": l["id"], "name": l["name"], "coords": c})

    valid_pistes = []
    for p in pistes:
        c = extract_coordinates_from_geojson(p["geojson"])
        if len(c) > 1:
            valid_pistes.append({"id": p["id"], "name": p["name"], "difficulty": p["difficulty"], "coords": c})

    if not valid_lifts or not valid_pistes:
        print("❌ Not enough valid lifts or pistes to build a continuous trace.")
        return

    user_id, auth_headers = create_or_login_user()

    # 1. Start a session in the Go API (include resortId)
    print("\n🚀 Starting ski session in the API...")
    resp = requests.post(
        f"{API_BASE_URL}/api/v1/ski-sessions",
        headers=auth_headers,
        json={"resortId": str(resort_id)},
    )
    if resp.status_code != 201:
        print(f"❌ Error starting backend session: {resp.text}")
        return

    session_data = resp.json()
    session_id = session_data.get("sessionId")
    print(f"✅ Session started for user {user_id} with ID: {session_id} (resort: {resort_id})")

    # Day schedule configuration (10:00 to 16:00, simulated in accelerated time)
    current_time = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = current_time.replace(hour=16, minute=0)

    simulated_runs = 0
    current_lift = random.choice(valid_lifts)
    current_alt = 1800.0

    recent_pistes = []
    recent_lifts = [current_lift["id"]]

    # Select 3 random runs to take a photo during the day
    photo_runs = sorted(random.sample(range(1, 9), 3))

    print(f"\n⛷️ Starting day at {RESORT_TARGET} at {current_time.strftime('%H:%M')}...")

    while current_time < end_time and simulated_runs < 8:
        simulated_runs += 1

        # ---------------------------------------------------------
        # STEP A: Simulate chairlift ascent using real lift coordinates
        # ---------------------------------------------------------
        lift_coords = current_lift["coords"]
        top_alt = current_alt + random.uniform(200, 300)

        print(f"\n[Day {current_time.strftime('%H:%M')}] 🚠 Riding lift '{current_lift['name']}' up...")
        
        # Decide speed range based on name/type
        lift_name = current_lift["name"].lower()
        if "telesilla" in lift_name or "chair" in lift_name:
            lift_speed_range = (2.5, 3.5)
        elif "telecabina" in lift_name or "gondola" in lift_name:
            lift_speed_range = (4.0, 5.5)
        else:
            lift_speed_range = (2.0, 3.0)

        lift_points_raw = interpolate_track(
            lift_coords, current_alt, top_alt, lift_speed_range, is_lift=True, time_step=3
        )
        
        lift_points = []
        for p in lift_points_raw:
            lift_points.append({
                "lat": p["lat"],
                "lon": p["lon"],
                "altitude": p["altitude"],
                "speed": p["speed"],
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=3)

        send_points_batch(session_id, lift_points, auth_headers)
        time.sleep(0.05)

        current_pos = lift_coords[-1]
        current_alt = top_alt

        # ---------------------------------------------------------
        # STEP B: Short pause at the summit
        # ---------------------------------------------------------
        print(f"[{current_time.strftime('%H:%M')}] ☕ Short break at the summit...")
        pause_points = []
        # Pause duration: random between 60 and 150 seconds, sampled every 10 seconds
        pause_duration = random.randint(60, 150)
        for _ in range(0, pause_duration, 10):
            pause_points.append({
                "lat": current_pos[0] + random.normalvariate(0, 0.2) / 111320.0,
                "lon": current_pos[1] + random.normalvariate(0, 0.2) / (111320.0 * math.cos(math.radians(current_pos[0]))),
                "altitude": current_alt,
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=10)
        
        photo_bytes = None
        photo_name = None
        if simulated_runs in photo_runs:
            print(f"📸 Taking a photo at the summit of run {simulated_runs}...")
            photo_bytes = DUMMY_IMAGE
            photo_name = f"summit_view_run_{simulated_runs}.png"

        send_points_batch(session_id, pause_points, auth_headers, photo_bytes=photo_bytes, photo_name=photo_name)

        # ---------------------------------------------------------
        # STEP C: Choose a real piste starting near the summit
        # ---------------------------------------------------------
        # Find candidates starting near the summit (sorted by distance)
        sorted_pistes = sorted(valid_pistes, key=lambda p: get_distance(p["coords"][0], current_pos))
        
        # Select from the top 5 closest pistes, avoiding recently visited ones if possible
        piste_candidates = [p for p in sorted_pistes[:5] if p["id"] not in recent_pistes]
        if not piste_candidates:
            piste_candidates = sorted_pistes[:3]
        chosen_piste = random.choice(piste_candidates)

        # Update history
        recent_pistes.append(chosen_piste["id"])
        if len(recent_pistes) > 3:
            recent_pistes.pop(0)

        print(f"[{current_time.strftime('%H:%M')}] 🏂 Descending piste: '{chosen_piste['name']}' (Difficulty: {chosen_piste['difficulty']})")

        piste_coords = chosen_piste["coords"]
        bottom_alt = max(1500.0, current_alt - random.uniform(200, 300))
        
        diff = str(chosen_piste["difficulty"]).lower() if chosen_piste["difficulty"] else ""
        if "easy" in diff or "novice" in diff or "green" in diff:
            speed_range = (4.5, 9.0)
        elif "intermediate" in diff or "blue" in diff:
            speed_range = (8.0, 14.0)
        elif "advanced" in diff or "red" in diff:
            speed_range = (12.0, 19.0)
        elif "expert" in diff or "black" in diff:
            speed_range = (16.0, 26.0)
        else:
            speed_range = (9.0, 15.0)

        # Sample every 2 seconds for high resolution and realistic physics
        run_points_raw = interpolate_track(
            piste_coords, current_alt, bottom_alt, speed_range, is_lift=False, difficulty=chosen_piste["difficulty"], time_step=2
        )
        
        run_points = []
        for p in run_points_raw:
            run_points.append({
                "lat": p["lat"],
                "lon": p["lon"],
                "altitude": p["altitude"],
                "speed": p["speed"],
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=2)

        send_points_batch(session_id, run_points, auth_headers)
        time.sleep(0.05)

        current_pos = piste_coords[-1]
        current_alt = bottom_alt

        # ---------------------------------------------------------
        # STEP D: Short pause at the base before next lift
        # ---------------------------------------------------------
        print(f"[{current_time.strftime('%H:%M')}] 🥤 Short break / lift queue at the base...")
        base_points = []
        # Queue/break duration: random between 45 and 120 seconds
        base_duration = random.randint(45, 120)
        for _ in range(0, base_duration, 10):
            base_points.append({
                "lat": current_pos[0] + random.normalvariate(0, 0.2) / 111320.0,
                "lon": current_pos[1] + random.normalvariate(0, 0.2) / (111320.0 * math.cos(math.radians(current_pos[0]))),
                "altitude": current_alt,
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=10)
        send_points_batch(session_id, base_points, auth_headers)

        # Find the next lift starting near current position (sorted by distance)
        sorted_lifts = sorted(valid_lifts, key=lambda l: get_distance(l["coords"][0], current_pos))
        
        # Select from the top 3 closest lifts, avoiding recently visited ones if possible
        lift_candidates = [l for l in sorted_lifts[:3] if l["id"] not in recent_lifts]
        if not lift_candidates:
            lift_candidates = sorted_lifts[:2]
        current_lift = random.choice(lift_candidates)

        # Update history
        recent_lifts.append(current_lift["id"])
        if len(recent_lifts) > 2:
            recent_lifts.pop(0)

    # 2. Finish session
    print(f"\n🏁 Day finished. Closing session in the API...")
    resp = requests.post(
        f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/finish",
        headers=auth_headers,
    )
    if resp.status_code == 200:
        print("✅ Session closed successfully.")
        print("✨ Check your Go server logs to verify run-detection and map-matching.")
    else:
        print(f"❌ Error closing session: {resp.text}")


if __name__ == "__main__":
    simulate_full_day()
