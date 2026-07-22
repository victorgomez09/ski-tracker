import time
import random
from datetime import datetime, timedelta
import requests
import psycopg2

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


def send_points_batch(session_id, points, auth_headers):
    """Sends a batch of points to the Go API."""
    if not points:
        return

    payload = {"points": points}
    try:
        resp = requests.post(
            f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/points",
            headers=auth_headers,
            json=payload,
        )
        if resp.status_code != 200:
            print(f"⚠️ Error sending points: {resp.text}")
    except Exception as e:
        print(f"⚠️ HTTP exception while sending points: {e}")


def get_distance(p1, p2):
    """Calculates Euclidean distance between two (lat, lon) coordinates."""
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def interpolate_altitudes(start_alt, end_alt, num_points):
    """Linearly interpolates altitudes between a start and end value."""
    if num_points <= 1:
        return [start_alt] * num_points
    step = (end_alt - start_alt) / (num_points - 1)
    return [start_alt + i * step for i in range(num_points)]


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

    print(f"\n⛷️ Starting day at {RESORT_TARGET} at {current_time.strftime('%H:%M')}...")

    while current_time < end_time and simulated_runs < 8:
        simulated_runs += 1

        # ---------------------------------------------------------
        # STEP A: Simulate chairlift ascent using real lift coordinates
        # ---------------------------------------------------------
        lift_coords = current_lift["coords"]
        top_alt = current_alt + random.uniform(200, 300)

        print(f"\n[Day {current_time.strftime('%H:%M')}] 🚠 Riding lift '{current_lift['name']}' up...")
        lift_points = []
        lift_alts = interpolate_altitudes(current_alt, top_alt, len(lift_coords))

        for idx, (lat, lon) in enumerate(lift_coords):
            lift_points.append({
                "lat": lat,
                "lon": lon,
                "altitude": lift_alts[idx],
                "speed": 2.5,  # Slow lift speed
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=20)

        send_points_batch(session_id, lift_points, auth_headers)
        time.sleep(0.05)

        current_pos = lift_coords[-1]
        current_alt = top_alt

        # ---------------------------------------------------------
        # STEP B: Short pause at the summit
        # ---------------------------------------------------------
        print(f"[{current_time.strftime('%H:%M')}] ☕ Short break at the summit...")
        pause_points = []
        for _ in range(4):
            pause_points.append({
                "lat": current_pos[0],
                "lon": current_pos[1],
                "altitude": current_alt,
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=30)
        send_points_batch(session_id, pause_points, auth_headers)

        # ---------------------------------------------------------
        # STEP C: Choose a real piste starting near the summit
        # ---------------------------------------------------------
        chosen_piste = min(valid_pistes, key=lambda p: get_distance(p["coords"][0], current_pos))
        print(f"[{current_time.strftime('%H:%M')}] 🏂 Descending piste: '{chosen_piste['name']}' (Difficulty: {chosen_piste['difficulty']})")

        piste_coords = chosen_piste["coords"]
        bottom_alt = max(1500.0, current_alt - random.uniform(200, 300))
        run_points = []
        piste_alts = interpolate_altitudes(current_alt, bottom_alt, len(piste_coords))

        for idx, (lat, lon) in enumerate(piste_coords):
            speed = random.uniform(8.0, 20.0)  # Ski speed
            run_points.append({
                "lat": lat,
                "lon": lon,
                "altitude": piste_alts[idx],
                "speed": speed,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=10)

        send_points_batch(session_id, run_points, auth_headers)
        time.sleep(0.05)

        current_pos = piste_coords[-1]
        current_alt = bottom_alt

        # ---------------------------------------------------------
        # STEP D: Short pause at the base before next lift
        # ---------------------------------------------------------
        print(f"[{current_time.strftime('%H:%M')}] 🥤 Short break at the base...")
        base_points = []
        for _ in range(3):
            base_points.append({
                "lat": current_pos[0],
                "lon": current_pos[1],
                "altitude": current_alt,
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=30)
        send_points_batch(session_id, base_points, auth_headers)

        # Find the next lift starting near current position
        current_lift = min(valid_lifts, key=lambda l: get_distance(l["coords"][0], current_pos))

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
