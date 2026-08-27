import os
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
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8082").rstrip("/")
DB_CONFIG = {
    "dbname": os.environ.get("DB_NAME", "ski_tracker"),
    "user": os.environ.get("DB_USER", "ski_tracker"),
    "password": os.environ.get("DB_PASSWORD", "ski_tracker"),
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5433"),
}
RESORT_TARGET = os.environ.get("RESORT_TARGET", "Valdesquí")
SEED_USER_EMAIL = os.environ.get("SEED_USER_EMAIL", "admin@admin.es")
SEED_USER_PASSWORD = os.environ.get("SEED_USER_PASSWORD", "adminadmin")
SEED_USER_DISPLAY_NAME = os.environ.get("SEED_USER_DISPLAY_NAME", "Seed User")
SEED_USER_FIRST_NAME = os.environ.get("SEED_USER_FIRST_NAME", "Seed")
SEED_USER_LAST_NAME = os.environ.get("SEED_USER_LAST_NAME", "User")


# ==========================================
# GEOMETRY & MATH HELPERS
# ==========================================
def get_distance_meters(p1, p2):
    """Calculates ground distance between two (lat, lon) coordinates in meters."""
    lat1, lon1 = p1[0], p1[1]
    lat2, lon2 = p2[0], p2[1]
    lat_mid = (lat1 + lat2) / 2.0
    dy = (lat2 - lat1) * 111320.0
    dx = (lon2 - lon1) * 40075000.0 * math.cos(math.radians(lat_mid)) / 360.0
    return math.sqrt(dx * dx + dy * dy)


def extract_3d_coordinates(geojson_geom, tags=None):
    """
    Extracts a list of (lat, lon, ele) coordinates from GeoJSON and tags.
    """
    if not geojson_geom or "coordinates" not in geojson_geom:
        return []

    coords = geojson_geom["coordinates"]
    g_type = geojson_geom.get("type", "LineString")

    raw_coords = []
    if g_type == "LineString":
        raw_coords = coords
    elif g_type == "MultiLineString":
        for line in coords:
            raw_coords.extend(line)

    if not raw_coords:
        return []

    elevation_profile = None
    if tags and isinstance(tags, dict):
        elevation_profile = tags.get("elevationProfile", {}).get("heights", [])

    results = []
    for idx, c in enumerate(raw_coords):
        lon = float(c[0])
        lat = float(c[1])
        ele = None
        if len(c) >= 3 and isinstance(c[2], (int, float)):
            ele = float(c[2])
        elif elevation_profile and idx < len(elevation_profile) and isinstance(elevation_profile[idx], (int, float)):
            ele = float(elevation_profile[idx])
        results.append((lat, lon, ele))

    return results


# ==========================================
# DATABASE FETCH & TOPOLOGY BUILDER
# ==========================================
def get_resort_data_from_db(resort_name):
    """Connects to Postgres and fetches the resort, its lifts, and its named pistes."""
    print(f"🔍 Looking up resort '{resort_name}' in the database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # 1. Find the resort ID and metadata
    cur.execute("SELECT id, name, tags FROM ski_resorts WHERE name ILIKE %s LIMIT 1;", (f"%{resort_name}%",))
    resort = cur.fetchone()
    if not resort:
        print(f"❌ Resort '{resort_name}' was not found in the database.")
        cur.close()
        conn.close()
        return None, [], [], 1800.0, 2250.0

    resort_id, full_name, resort_tags = resort
    resort_tags = resort_tags or {}
    stats = resort_tags.get("statistics", {})
    min_elev = stats.get("minElevation") or stats.get("runs", {}).get("minElevation") or 1800.0
    max_elev = stats.get("maxElevation") or stats.get("runs", {}).get("maxElevation") or 2250.0

    print(f"✅ Resort found: {full_name} (ID: {resort_id}) [Elevation: {min_elev}m - {max_elev}m]")

    # 2. Get only pistes with a name and valid GeoJSON geometry
    cur.execute("""
        SELECT id, name, piste_type, difficulty, geometry_geojson, tags
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
            "geojson": row[4],
            "tags": row[5],
        })

    # 3. Get lifts
    cur.execute("""
        SELECT id, name, lift_type, geometry_geojson, tags
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
            "tags": row[4],
        })

    cur.close()
    conn.close()
    print(f"📊 Loaded {len(pistes)} named pistes and {len(lifts)} lifts.")
    return resort_id, pistes, lifts, float(min_elev), float(max_elev)


def build_topological_network(raw_pistes, raw_lifts, default_min_alt, default_max_alt):
    """
    Normalizes lifts and pistes so that:
    - Every lift is oriented UPHILL (from bottom station to top station).
    - Every piste is oriented DOWNHILL (from top summit start to bottom base end).
    - Validates coordinates and ensures elevation gradients.
    """
    normalized_lifts = []
    normalized_pistes = []

    # 1. Process lifts
    for l in raw_lifts:
        coords_3d = extract_3d_coordinates(l.get("geojson"), l.get("tags"))
        if len(coords_3d) < 2:
            continue

        first_ele = coords_3d[0][2]
        last_ele = coords_3d[-1][2]

        # Determine if we need to reverse (lift must go UPHILL: bottom -> top)
        if first_ele is not None and last_ele is not None:
            if first_ele > last_ele:
                coords_3d = list(reversed(coords_3d))
                first_ele, last_ele = last_ele, first_ele
        else:
            first_ele = default_min_alt + random.uniform(0, 80)
            last_ele = first_ele + random.uniform(150, 350)

        elev_diff = last_ele - first_ele
        tot_d = sum(get_distance_meters(coords_3d[i], coords_3d[i+1]) for i in range(len(coords_3d)-1)) or 1.0
        acc_d = 0.0
        clean_coords = []
        for i in range(len(coords_3d)):
            if i > 0:
                acc_d += get_distance_meters(coords_3d[i-1], coords_3d[i])
            ele = coords_3d[i][2] if coords_3d[i][2] is not None else (first_ele + (acc_d / tot_d) * elev_diff)
            clean_coords.append((coords_3d[i][0], coords_3d[i][1], ele))

        normalized_lifts.append({
            "id": l["id"],
            "name": l["name"] or f"Remonte #{l['id'][:4]}",
            "type": l["type"] or "chair_lift",
            "coords": clean_coords,
            "bottom_pos": (clean_coords[0][0], clean_coords[0][1]),
            "bottom_alt": clean_coords[0][2],
            "top_pos": (clean_coords[-1][0], clean_coords[-1][1]),
            "top_alt": clean_coords[-1][2],
        })

    # 2. Process pistes
    for p in raw_pistes:
        coords_3d = extract_3d_coordinates(p.get("geojson"), p.get("tags"))
        if len(coords_3d) < 2:
            continue

        first_ele = coords_3d[0][2]
        last_ele = coords_3d[-1][2]

        # Determine if we need to reverse (piste must go DOWNHILL: top -> bottom)
        if first_ele is not None and last_ele is not None:
            if first_ele < last_ele:
                coords_3d = list(reversed(coords_3d))
                first_ele, last_ele = last_ele, first_ele
        else:
            first_ele = default_max_alt - random.uniform(0, 100)
            last_ele = max(default_min_alt, first_ele - random.uniform(150, 350))

        elev_diff = first_ele - last_ele
        tot_d = sum(get_distance_meters(coords_3d[i], coords_3d[i+1]) for i in range(len(coords_3d)-1)) or 1.0
        acc_d = 0.0
        clean_coords = []
        for i in range(len(coords_3d)):
            if i > 0:
                acc_d += get_distance_meters(coords_3d[i-1], coords_3d[i])
            ele = coords_3d[i][2] if coords_3d[i][2] is not None else (first_ele - (acc_d / tot_d) * elev_diff)
            clean_coords.append((coords_3d[i][0], coords_3d[i][1], ele))

        normalized_pistes.append({
            "id": p["id"],
            "name": p["name"] or f"Pista #{p['id'][:4]}",
            "type": p["type"] or "downhill",
            "difficulty": p["difficulty"] or "intermediate",
            "coords": clean_coords,
            "top_pos": (clean_coords[0][0], clean_coords[0][1]),
            "top_alt": clean_coords[0][2],
            "bottom_pos": (clean_coords[-1][0], clean_coords[-1][1]),
            "bottom_alt": clean_coords[-1][2],
        })

    return normalized_lifts, normalized_pistes


# ==========================================
# AUTH & USER CREATION
# ==========================================
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
        print("ℹ️ Seed user already exists; logging in...")
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
    """Generates PNG bytes for a 120x120 test photo."""
    width, height = 120, 120
    png_signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)
        for x in range(width):
            if 35 <= x < 85 and 35 <= y < 85:
                raw_data.extend(b'\xff\x44\x44')
            else:
                raw_data.extend(b'\x3a\x9a\xe9')
                
    idat_data = zlib.compress(raw_data)
    idat_chunk = struct.pack('>I', len(idat_data)) + b'IDAT' + idat_data + struct.pack('>I', zlib.crc32(b'IDAT' + idat_data))
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return png_signature + ihdr_chunk + idat_chunk + iend_chunk

DUMMY_IMAGE = generate_square_image()


# ==========================================
# TRACK SAMPLING & SMOOTHING ENGINE
# ==========================================
def interpolate_smooth_path(coords_3d, speed_range, is_lift=False, difficulty=None, time_step=2.0, is_transition=False):
    """
    Interpolates 3D coordinates into a continuous sequence of GPS points.
    Applies realistic physics, carving S-turns on downhill pistes, and gentle GPS noise.
    """
    if not coords_3d or len(coords_3d) < 2:
        return []

    segs = []
    tot_dist = 0.0
    for i in range(len(coords_3d) - 1):
        d = get_distance_meters(coords_3d[i], coords_3d[i+1])
        segs.append(d)
        tot_dist += d

    if tot_dist < 0.1:
        return []

    points = []
    accum_dist = 0.0

    carve_amp = 0.0
    carve_period = 6.0
    if not is_lift and not is_transition:
        diff = str(difficulty).lower() if difficulty else ""
        if "easy" in diff or "novice" in diff or "green" in diff:
            carve_amp = 1.2
            carve_period = 8.0
        elif "intermediate" in diff or "blue" in diff:
            carve_amp = 2.5
            carve_period = 6.0
        elif "advanced" in diff or "red" in diff:
            carve_amp = 3.5
            carve_period = 5.0
        elif "expert" in diff or "black" in diff:
            carve_amp = 4.5
            carve_period = 4.0
        else:
            carve_amp = 2.0
            carve_period = 6.0

    current_segment_idx = 0
    seg_start_dist = 0.0
    elapsed_time = 0.0
    v = (speed_range[0] + speed_range[1]) / 2.0

    while accum_dist <= tot_dist:
        while current_segment_idx < len(segs) and accum_dist > (seg_start_dist + segs[current_segment_idx]):
            seg_start_dist += segs[current_segment_idx]
            current_segment_idx += 1

        if current_segment_idx >= len(segs):
            p_final = coords_3d[-1]
            points.append({
                "lat": p_final[0],
                "lon": p_final[1],
                "altitude": p_final[2],
                "speed": max(0.5, v),
                "elapsed_seconds": elapsed_time
            })
            break

        seg_d = segs[current_segment_idx]
        ratio = 1.0 if seg_d == 0 else (accum_dist - seg_start_dist) / seg_d

        p1 = coords_3d[current_segment_idx]
        p2 = coords_3d[current_segment_idx + 1]

        lat = p1[0] + (p2[0] - p1[0]) * ratio
        lon = p1[1] + (p2[1] - p1[1]) * ratio
        alt = p1[2] + (p2[2] - p1[2]) * ratio

        # Apply subtle carving turns if skiing downhill
        if not is_lift and not is_transition and carve_amp > 0:
            dy = p2[0] - p1[0]
            dx = p2[1] - p1[1]
            mag = math.sqrt(dx * dx + dy * dy)
            if mag > 0:
                ny = -dx / mag
                nx = dy / mag
                phase = (elapsed_time / carve_period) * 2.0 * math.pi
                offset_m = carve_amp * math.sin(phase)
                lat += (offset_m * ny) / 111320.0
                lon += (offset_m * nx) / (111320.0 * math.cos(math.radians(lat)))

        # Subtle GPS jitter (0.2 - 0.4 meters)
        lat += random.normalvariate(0, 0.3) / 111320.0
        lon += random.normalvariate(0, 0.3) / (111320.0 * math.cos(math.radians(lat)))

        points.append({
            "lat": lat,
            "lon": lon,
            "altitude": alt,
            "speed": max(0.5, v),
            "elapsed_seconds": elapsed_time
        })

        if is_lift:
            v = random.uniform(speed_range[0], speed_range[1])
        elif is_transition:
            v = random.uniform(speed_range[0], speed_range[1])
        else:
            target_v = random.uniform(speed_range[0], speed_range[1])
            v = 0.80 * v + 0.20 * target_v

        step_dist = max(1.0, v * time_step)
        accum_dist += step_dist
        elapsed_time += time_step

    return points


def create_smooth_transition_track(from_3d, to_3d, speed=2.0, time_step=2.0):
    """
    Creates a gentle glide/walk transition between two points (e.g. lift exit to piste start),
    ensuring 0m teleportation.
    """
    d = get_distance_meters(from_3d, to_3d)
    if d < 1.0:
        return []

    coords = [from_3d, to_3d]
    return interpolate_smooth_path(coords, (speed * 0.8, speed * 1.2), is_lift=False, time_step=time_step, is_transition=True)


def send_points_batch(session_id, points, auth_headers, photo_bytes=None, photo_name=None):
    """Sends a batch of points to the backend API, optionally with a photo."""
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
            print(f"⚠️ Error sending points batch: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"⚠️ HTTP exception while sending points: {e}")


# ==========================================
# MAIN REALISTIC SKI DAY SIMULATION
# ==========================================
def simulate_full_day():
    print("=" * 65)
    print("🎿 STARTING REALISTIC SKI DAY SIMULATION (NO OFF-PISTE / NO TELEPORT)")
    print("=" * 65)

    resort_id, raw_pistes, raw_lifts, min_alt, max_alt = get_resort_data_from_db(RESORT_TARGET)
    if not raw_pistes or not raw_lifts:
        print("❌ No pistes or lifts found for the resort.")
        return

    lifts, pistes = build_topological_network(raw_pistes, raw_lifts, min_alt, max_alt)
    if not lifts or not pistes:
        print("❌ Could not build topological network.")
        return

    print(f"🌐 Topology ready: {len(lifts)} uphill lifts, {len(pistes)} downhill pistes.")

    user_id, auth_headers = create_or_login_user()

    # 1. Start Session in API
    print("\n🚀 Starting ski session in API...")
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
    print(f"✅ Ski session started with ID: {session_id}")

    # Start time: 09:45 AM
    current_time = datetime.now().replace(hour=9, minute=45, second=0, microsecond=0)
    end_time = current_time.replace(hour=16, minute=15)

    # 2. Skier arrives at the Base of the Resort (lowest lift bottom station)
    base_lift = min(lifts, key=lambda l: l["bottom_alt"])
    current_lift = base_lift
    current_pos_3d = current_lift["coords"][0]

    print(f"\n🚗 Skier arrives at base lift: '{current_lift['name']}' ({current_lift['bottom_alt']:.0f}m)")

    recent_pistes = []
    simulated_runs = 0
    photo_runs = {2, 5, 8}

    while current_time < end_time and simulated_runs < 10:
        simulated_runs += 1
        print(f"\n{'='*50}")
        print(f"🎿 RUN #{simulated_runs} - Time: {current_time.strftime('%H:%M')}")
        print(f"{'='*50}")

        # -------------------------------------------------------------
        # STEP 1: Lift Queue & Boarding
        # -------------------------------------------------------------
        queue_duration = random.randint(30, 75)
        print(f"[{current_time.strftime('%H:%M')}] ⏱️ Waiting in lift line at '{current_lift['name']}' ({queue_duration}s)...")
        queue_points = []
        for _ in range(0, queue_duration, 5):
            queue_points.append({
                "lat": current_pos_3d[0] + random.normalvariate(0, 0.15) / 111320.0,
                "lon": current_pos_3d[1] + random.normalvariate(0, 0.15) / (111320.0 * math.cos(math.radians(current_pos_3d[0]))),
                "altitude": current_pos_3d[2],
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=5)
        send_points_batch(session_id, queue_points, auth_headers)

        # -------------------------------------------------------------
        # STEP 2: Lift Ascent (Bottom -> Top strictly on lift line)
        # -------------------------------------------------------------
        l_type = current_lift["type"].lower()
        if "telesilla" in l_type or "chair" in l_type:
            speed_range = (2.6, 3.6)
        elif "telecabina" in l_type or "gondola" in l_type:
            speed_range = (4.5, 6.0)
        else:
            speed_range = (2.0, 2.8)

        print(f"[{current_time.strftime('%H:%M')}] 🚠 Riding lift '{current_lift['name']}' ({current_lift['bottom_alt']:.0f}m ➔ {current_lift['top_alt']:.0f}m)...")
        lift_pts_raw = interpolate_smooth_path(current_lift["coords"], speed_range, is_lift=True, time_step=3.0)
        
        lift_points = []
        for p in lift_pts_raw:
            lift_points.append({
                "lat": p["lat"],
                "lon": p["lon"],
                "altitude": p["altitude"],
                "speed": p["speed"],
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=3)

        send_points_batch(session_id, lift_points, auth_headers)
        time.sleep(0.04)

        current_pos_3d = current_lift["coords"][-1]

        # -------------------------------------------------------------
        # STEP 3: Summit Arrival & Piste Selection
        # -------------------------------------------------------------
        # Find candidate pistes whose top start is reachable from this lift exit (sorted by distance)
        sorted_pistes = sorted(pistes, key=lambda p: get_distance_meters(p["top_pos"], current_pos_3d))
        
        piste_pool = [p for p in sorted_pistes[:4] if p["id"] not in recent_pistes]
        if not piste_pool:
            piste_pool = sorted_pistes[:2]
        chosen_piste = random.choice(piste_pool)

        recent_pistes.append(chosen_piste["id"])
        if len(recent_pistes) > 3:
            recent_pistes.pop(0)

        # Smooth transition from lift exit to piste top start (ZERO teleportation)
        piste_top_3d = chosen_piste["coords"][0]
        trans_dist = get_distance_meters(current_pos_3d, piste_top_3d)
        if trans_dist > 2.0:
            trans_pts_raw = create_smooth_transition_track(current_pos_3d, piste_top_3d, speed=2.2, time_step=2.0)
            trans_points = []
            for p in trans_pts_raw:
                trans_points.append({
                    "lat": p["lat"],
                    "lon": p["lon"],
                    "altitude": p["altitude"],
                    "speed": p["speed"],
                    "timestamp": current_time.isoformat() + "Z",
                })
                current_time += timedelta(seconds=2)
            send_points_batch(session_id, trans_points, auth_headers)

        current_pos_3d = piste_top_3d

        # Short summit pause / photo
        pause_duration = random.randint(20, 60)
        print(f"[{current_time.strftime('%H:%M')}] 🏔️ Summit break at {current_pos_3d[2]:.0f}m ({pause_duration}s)...")
        summit_pause_points = []
        for _ in range(0, pause_duration, 10):
            summit_pause_points.append({
                "lat": current_pos_3d[0] + random.normalvariate(0, 0.1) / 111320.0,
                "lon": current_pos_3d[1] + random.normalvariate(0, 0.1) / (111320.0 * math.cos(math.radians(current_pos_3d[0]))),
                "altitude": current_pos_3d[2],
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=10)

        photo_bytes = None
        photo_name = None
        if simulated_runs in photo_runs:
            print(f"📸 Taking summit photo #{simulated_runs}...")
            photo_bytes = DUMMY_IMAGE
            photo_name = f"summit_view_run_{simulated_runs}.png"

        send_points_batch(session_id, summit_pause_points, auth_headers, photo_bytes=photo_bytes, photo_name=photo_name)

        # -------------------------------------------------------------
        # STEP 4: Piste Descent (Top -> Bottom strictly on piste line)
        # -------------------------------------------------------------
        diff = str(chosen_piste["difficulty"]).lower()
        if "easy" in diff or "novice" in diff or "green" in diff:
            downhill_speed = (5.0, 9.5)
        elif "intermediate" in diff or "blue" in diff:
            downhill_speed = (8.5, 15.0)
        elif "advanced" in diff or "red" in diff:
            downhill_speed = (12.0, 20.0)
        elif "expert" in diff or "black" in diff:
            downhill_speed = (16.0, 25.0)
        else:
            downhill_speed = (9.0, 16.0)

        print(f"[{current_time.strftime('%H:%M')}] 🏂 Skiing down piste: '{chosen_piste['name']}' [{chosen_piste['difficulty']}] ({chosen_piste['top_alt']:.0f}m ➔ {chosen_piste['bottom_alt']:.0f}m)...")
        piste_pts_raw = interpolate_smooth_path(chosen_piste["coords"], downhill_speed, is_lift=False, difficulty=chosen_piste["difficulty"], time_step=2.0)

        piste_points = []
        for p in piste_pts_raw:
            piste_points.append({
                "lat": p["lat"],
                "lon": p["lon"],
                "altitude": p["altitude"],
                "speed": p["speed"],
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=2)

        send_points_batch(session_id, piste_points, auth_headers)
        time.sleep(0.04)

        current_pos_3d = chosen_piste["coords"][-1]

        # -------------------------------------------------------------
        # STEP 5: Bottom Base Transition to Closest Connecting Lift
        # -------------------------------------------------------------
        sorted_next_lifts = sorted(lifts, key=lambda l: get_distance_meters(l["bottom_pos"], current_pos_3d))
        
        next_lift = sorted_next_lifts[0]
        if len(sorted_next_lifts) > 1 and random.random() < 0.35:
            if get_distance_meters(sorted_next_lifts[1]["bottom_pos"], current_pos_3d) < 120.0:
                next_lift = sorted_next_lifts[1]

        # Smooth transition to lift bottom station (ZERO teleportation)
        lift_bot_3d = next_lift["coords"][0]
        trans_base_dist = get_distance_meters(current_pos_3d, lift_bot_3d)
        if trans_base_dist > 2.0:
            base_trans_pts_raw = create_smooth_transition_track(current_pos_3d, lift_bot_3d, speed=2.0, time_step=2.0)
            base_trans_points = []
            for p in base_trans_pts_raw:
                base_trans_points.append({
                    "lat": p["lat"],
                    "lon": p["lon"],
                    "altitude": p["altitude"],
                    "speed": p["speed"],
                    "timestamp": current_time.isoformat() + "Z",
                })
                current_time += timedelta(seconds=2)
            send_points_batch(session_id, base_trans_points, auth_headers)

        current_pos_3d = lift_bot_3d
        current_lift = next_lift

    # -------------------------------------------------------------
    # STEP 6: Finish Day & Close Session
    # -------------------------------------------------------------
    print(f"\n🏁 Ski day finished at {current_time.strftime('%H:%M')}. Closing session in API...")
    resp = requests.post(
        f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/finish",
        headers=auth_headers,
    )
    if resp.status_code == 200:
        print("🎉 Session closed successfully! All runs and lifts recorded cleanly.")
        print("✨ Open the web app or mobile app to view the session and detected runs!")
    else:
        print(f"❌ Error closing session: {resp.text}")


if __name__ == "__main__":
    simulate_full_day()

