import os
import sys
import time
import random
import json
import argparse
from datetime import datetime, timedelta
import math
import zlib
import struct
import urllib.request
import urllib.parse
import urllib.error

# Optional psycopg2 import
try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

# ==========================================
# CONFIGURATION
# ==========================================
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8082").rstrip("/")
DB_CONFIG = {
    "dbname": os.environ.get("DB_NAME", "ski_tracker"),
    "user": os.environ.get("DB_USER", "ski_tracker"),
    "password": os.environ.get("DB_PASSWORD", "ski_tracker"),
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5434"),
}
RESORT_TARGET = os.environ.get("RESORT_TARGET", "Valdesquí")

# Rider Profiles Configuration
RIDER_PROFILES = {
    "ski": {
        "role_name": "Esquiador",
        "emoji": "🎿",
        "activity_type": "ski",
        "email": os.environ.get("SKIER_EMAIL", os.environ.get("SEED_USER_EMAIL", "esquiador@admin.es")),
        "password": os.environ.get("SKIER_PASSWORD", os.environ.get("SEED_USER_PASSWORD", "adminadmin")),
        "display_name": os.environ.get("SKIER_DISPLAY_NAME", "Carlos Esquiador"),
        "first_name": "Carlos",
        "last_name": "Esquiador",
        # Turn physics: short-to-medium radius, crisp parallel carving
        "carve_period": 4.0,  # seconds per S-turn
        "carve_amp": 0.8,     # subtle lateral carving (meters)
        # Speed ranges per difficulty (m/s)
        "speeds": {
            "novice": (4.5, 8.0),        # ~16 - 29 km/h
            "easy": (7.0, 12.0),        # ~25 - 43 km/h
            "intermediate": (10.0, 16.0),# ~36 - 58 km/h
            "advanced": (13.5, 20.5),   # ~48 - 74 km/h
            "expert": (16.0, 24.0),     # ~57 - 86 km/h
            "freeride": (10.0, 17.5),
        },
        "flat_speed": 3.2,    # Skier skates and pushes with poles
        "summit_pause": (15, 30),  # Quick standing check: goggles & poles
    },
    "snowboard": {
        "role_name": "Snowboarder",
        "emoji": "🏂",
        "activity_type": "snowboard",
        "email": os.environ.get("SNOWBOARDER_EMAIL", "snowboarder@admin.es"),
        "password": os.environ.get("SNOWBOARDER_PASSWORD", "adminadmin"),
        "display_name": os.environ.get("SNOWBOARDER_DISPLAY_NAME", "Laura Snowboarder"),
        "first_name": "Laura",
        "last_name": "Snowboarder",
        # Turn physics: wider, flowing edge-to-edge S-turns
        "carve_period": 5.5,  # seconds per S-turn
        "carve_amp": 1.4,     # wider lateral carving (meters)
        # Speed ranges per difficulty (m/s)
        "speeds": {
            "novice": (4.0, 7.5),        # ~14 - 27 km/h
            "easy": (6.0, 10.5),        # ~21 - 38 km/h
            "intermediate": (8.5, 14.0),# ~30 - 50 km/h
            "advanced": (11.5, 17.5),   # ~41 - 63 km/h
            "expert": (14.0, 21.0),     # ~50 - 75 km/h
            "freeride": (9.0, 16.0),
        },
        "flat_speed": 2.2,    # Snowboarder skates on one foot, slower on flats
        "summit_pause": (40, 70),  # Sits down on snow, straps in back binding!
    }
}


# ==========================================
# UNIVERSAL HTTP CLIENT (ZERO EXTERNAL DEPS)
# ==========================================
class ResponseWrapper:
    def __init__(self, status_code, text, json_data=None):
        self.status_code = status_code
        self.text = text
        self._json = json_data

    def json(self):
        if self._json is not None:
            return self._json
        try:
            return json.loads(self.text)
        except Exception:
            return {}


class HttpClient:
    @staticmethod
    def get(url, headers=None):
        headers = headers or {}
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                text = resp.read().decode("utf-8")
                return ResponseWrapper(resp.status, text)
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", errors="ignore")
            return ResponseWrapper(e.code, text)
        except Exception as e:
            return ResponseWrapper(500, str(e))

    @staticmethod
    def post(url, headers=None, json_data=None, files=None):
        headers = dict(headers or {})
        if files:
            boundary = f"----WebKitFormBoundary{random.randint(1000000000, 9999999999)}"
            body = bytearray()
            for key, val in files.items():
                filename, content, content_type = val
                body.extend(f"--{boundary}\r\n".encode("utf-8"))
                if filename is None:
                    body.extend(f'Content-Disposition: form-data; name="{key}"\r\n'.encode("utf-8"))
                    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
                    body.extend(content.encode("utf-8") if isinstance(content, str) else content)
                    body.extend(b"\r\n")
                else:
                    body.extend(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'.encode("utf-8"))
                    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
                    body.extend(content if isinstance(content, bytes) else content.encode("utf-8"))
                    body.extend(b"\r\n")
            body.extend(f"--{boundary}--\r\n".encode("utf-8"))
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            data_bytes = bytes(body)
        elif json_data is not None:
            headers["Content-Type"] = "application/json"
            data_bytes = json.dumps(json_data).encode("utf-8")
        else:
            data_bytes = b""

        req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8")
                return ResponseWrapper(resp.status, text)
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", errors="ignore")
            return ResponseWrapper(e.code, text)
        except Exception as e:
            return ResponseWrapper(500, str(e))

http_client = HttpClient()


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


def extract_single_continuous_track(geojson_geom, tags=None):
    """
    Extracts a clean, single, strictly continuous sequence of (lat, lon, ele) coordinates.
    CRITICAL: Never blindly concatenate disconnected MultiLineString lines.
    Picks the longest continuous line segment of the piste/lift, preventing shortcuts
    across the mountain.
    """
    if not geojson_geom or "coordinates" not in geojson_geom:
        return []

    coords = geojson_geom["coordinates"]
    g_type = geojson_geom.get("type", "LineString")

    elevation_profile = None
    if tags and isinstance(tags, dict):
        elevation_profile = tags.get("elevationProfile", {}).get("heights", [])

    if g_type == "LineString":
        lines = [coords]
    elif g_type == "MultiLineString":
        lines = coords
    else:
        return []

    if not lines:
        return []

    # Pick the longest continuous line segment (the main trunk)
    best_line = max(lines, key=lambda l: len(l))
    if len(best_line) < 2:
        return []

    results = []
    for idx, c in enumerate(best_line):
        lon = float(c[0])
        lat = float(c[1])
        ele = None
        if len(c) >= 3 and isinstance(c[2], (int, float)):
            ele = float(c[2])
        elif elevation_profile and idx < len(elevation_profile) and isinstance(elevation_profile[idx], (int, float)):
            ele = float(elevation_profile[idx])
        results.append((lat, lon, ele))

    # Clean any micro-duplicates (< 0.5m)
    clean = [results[0]]
    for p in results[1:]:
        if get_distance_meters(clean[-1], p) >= 0.5:
            clean.append(p)

    return clean if len(clean) >= 2 else []


# ==========================================
# RESORT DATA FETCH (DB OR API FALLBACK)
# ==========================================
def get_resort_data_from_db(resort_name):
    """Connects to Postgres directly if available and fetches the resort data."""
    if not HAS_PSYCOPG2:
        raise RuntimeError("psycopg2 is not installed.")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("SELECT id, name, tags FROM ski_resorts WHERE name ILIKE %s LIMIT 1;", (f"%{resort_name}%",))
    resort = cur.fetchone()
    if not resort:
        cur.close()
        conn.close()
        raise RuntimeError(f"Resort '{resort_name}' not found in DB.")

    resort_id, full_name, resort_tags = resort
    resort_tags = resort_tags or {}
    stats = resort_tags.get("statistics", {})
    min_elev = stats.get("minElevation") or stats.get("runs", {}).get("minElevation") or 1800.0
    max_elev = stats.get("maxElevation") or stats.get("runs", {}).get("maxElevation") or 2250.0

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
    return resort_id, pistes, lifts, float(min_elev), float(max_elev)


def get_resort_data(resort_name, auth_headers=None):
    """
    Fetches resort pistes and lifts using Postgres if available,
    or falls back to the backend API transparently (zero DB requirement).
    """
    if HAS_PSYCOPG2:
        try:
            return get_resort_data_from_db(resort_name)
        except Exception as e:
            print(f"ℹ️ Conexión directa a base de datos no disponible ({e}), consultando API...")

    print(f"🔍 Consultando estación '{resort_name}' a través de la API ({API_BASE_URL})...")
    encoded_name = urllib.parse.quote(resort_name)
    resp = http_client.get(f"{API_BASE_URL}/api/v1/resorts/by-name?name={encoded_name}", headers=auth_headers)
    if resp.status_code != 200:
        print(f"❌ Error al buscar estación en la API: {resp.status_code} {resp.text}")
        return None, [], [], 1800.0, 2250.0

    resorts_list = resp.json().get("data") or resp.json()
    if not resorts_list or not isinstance(resorts_list, list):
        print(f"❌ Estación '{resort_name}' no encontrada en la API.")
        return None, [], [], 1800.0, 2250.0

    resort_item = resorts_list[0]
    resort_id = resort_item.get("id") or resort_item.get("ID")
    full_name = resort_item.get("name") or resort_item.get("Name")

    detail_resp = http_client.get(f"{API_BASE_URL}/api/v1/resorts/by-id/{resort_id}", headers=auth_headers)
    if detail_resp.status_code != 200:
        print(f"❌ Error al obtener detalles de la estación en la API: {detail_resp.status_code}")
        return None, [], [], 1800.0, 2250.0

    detail_data = detail_resp.json().get("data") or detail_resp.json()
    tags = detail_data.get("tags") or detail_data.get("Tags") or {}
    stats = tags.get("statistics", {}) or {}
    min_elev = stats.get("minElevation") or stats.get("runs", {}).get("minElevation") or 1800.0
    max_elev = stats.get("maxElevation") or stats.get("runs", {}).get("maxElevation") or 2250.0

    raw_pistes = []
    pistes_src = detail_data.get("pistes") or detail_data.get("Pistes") or []
    for p in pistes_src:
        p_name = p.get("name") or p.get("Name")
        if not p_name:
            continue
        raw_pistes.append({
            "id": p.get("id") or p.get("ID"),
            "name": p_name,
            "type": p.get("piste_type") or p.get("PisteType") or "downhill",
            "difficulty": p.get("difficulty") or p.get("Difficulty") or "intermediate",
            "geojson": p.get("geometry_geojson") or p.get("GeometryGeoJSON"),
            "tags": p.get("tags") or p.get("Tags"),
        })

    raw_lifts = []
    lifts_src = detail_data.get("lifts") or detail_data.get("Lifts") or []
    for l in lifts_src:
        raw_lifts.append({
            "id": l.get("id") or l.get("ID"),
            "name": l.get("name") or l.get("Name"),
            "type": l.get("lift_type") or l.get("LiftType") or "chair_lift",
            "geojson": l.get("geometry_geojson") or l.get("GeometryGeoJSON"),
            "tags": l.get("tags") or l.get("Tags"),
        })

    print(f"✅ Estación cargada desde API: {full_name} (ID: {resort_id}) [{len(raw_pistes)} pistas, {len(raw_lifts)} remontes]")
    return resort_id, raw_pistes, raw_lifts, float(min_elev), float(max_elev)


# ==========================================
# TOPOLOGY BUILDER & ACCURATE ORIENTATION
# ==========================================
def build_topological_network(raw_pistes, raw_lifts, default_min_alt, default_max_alt):
    """
    Normalizes lifts and pistes with strict topological orientation:
    - Every lift is strictly oriented UPHILL (from bottom station to top station).
    - Every piste is strictly oriented DOWNHILL (from summit start to base end).
    - Resolves 2D OSM direction using topological proximity to lift bases & summits.
    """
    normalized_lifts = []

    # 1. Process and orient lifts UPHILL (bottom station -> top summit)
    for l in raw_lifts:
        coords = extract_single_continuous_track(l.get("geojson"), l.get("tags"))
        if len(coords) < 2:
            continue

        first_ele = coords[0][2]
        last_ele = coords[-1][2]

        if first_ele is not None and last_ele is not None and abs(first_ele - last_ele) > 2.0:
            if first_ele > last_ele:
                coords = list(reversed(coords))
                first_ele, last_ele = last_ele, first_ele
        else:
            first_ele = default_min_alt + random.uniform(0, 50)
            last_ele = first_ele + random.uniform(180, 380)

        tot_d = sum(get_distance_meters(coords[i], coords[i+1]) for i in range(len(coords)-1)) or 1.0
        acc_d = 0.0
        clean_lift = []
        for i in range(len(coords)):
            if i > 0:
                acc_d += get_distance_meters(coords[i-1], coords[i])
            ele = coords[i][2] if coords[i][2] is not None else (first_ele + (acc_d / tot_d) * (last_ele - first_ele))
            clean_lift.append((coords[i][0], coords[i][1], ele))

        normalized_lifts.append({
            "id": l["id"],
            "name": l["name"] or f"Remonte #{str(l['id'])[:4]}",
            "type": l["type"] or "chair_lift",
            "coords": clean_lift,
            "bottom_pos": (clean_lift[0][0], clean_lift[0][1]),
            "bottom_alt": clean_lift[0][2],
            "top_pos": (clean_lift[-1][0], clean_lift[-1][1]),
            "top_alt": clean_lift[-1][2],
        })

    if not normalized_lifts:
        return [], []

    # Collect known lift bases (bottom stations) and lift summits (top stations)
    lift_bases = [l["bottom_pos"] for l in normalized_lifts]
    lift_summits = [l["top_pos"] for l in normalized_lifts]

    # 2. Process and orient pistes DOWNHILL (summit start -> base end)
    normalized_pistes = []
    for p in raw_pistes:
        coords = extract_single_continuous_track(p.get("geojson"), p.get("tags"))
        if len(coords) < 2:
            continue

        c0 = (coords[0][0], coords[0][1])
        c1 = (coords[-1][0], coords[-1][1])

        first_ele = coords[0][2]
        last_ele = coords[-1][2]
        must_reverse = False

        # Check 1: Explicit 3D elevations
        if first_ele is not None and last_ele is not None and abs(first_ele - last_ele) > 2.0:
            if first_ele < last_ele:
                must_reverse = True
        else:
            # Check 2: Tags elevation profile
            tags = p.get("tags") or {}
            heights = tags.get("elevationProfile", {}).get("heights", [])
            if len(heights) >= 2 and abs(heights[0] - heights[-1]) > 2.0:
                if heights[-1] > heights[0]:
                    must_reverse = True
            else:
                # Check 3: Topological Lift Proximity (crucial for 2D OSM ways)
                # If coords[0] is close to lift bases and coords[-1] is close to lift summits,
                # the piste was digitized bottom-to-top in OSM. Reverse it so it flows downhill!
                d_base_0 = min(get_distance_meters(c0, b) for b in lift_bases)
                d_summit_0 = min(get_distance_meters(c0, s) for s in lift_summits)
                d_base_1 = min(get_distance_meters(c1, b) for b in lift_bases)
                d_summit_1 = min(get_distance_meters(c1, s) for s in lift_summits)

                if d_base_0 < d_summit_0 and d_summit_1 < d_base_1:
                    must_reverse = True

        if must_reverse:
            coords = list(reversed(coords))
            first_ele, last_ele = last_ele, first_ele

        # Calculate smooth downhill elevation gradient
        first_ele = first_ele or (default_max_alt - random.uniform(0, 60))
        last_ele = last_ele or max(default_min_alt, first_ele - random.uniform(160, 360))
        elev_drop = first_ele - last_ele

        tot_d = sum(get_distance_meters(coords[i], coords[i+1]) for i in range(len(coords)-1)) or 1.0
        acc_d = 0.0
        clean_piste = []
        for i in range(len(coords)):
            if i > 0:
                acc_d += get_distance_meters(coords[i-1], coords[i])
            ele = coords[i][2] if coords[i][2] is not None else (first_ele - (acc_d / tot_d) * elev_drop)
            clean_piste.append((coords[i][0], coords[i][1], ele))

        normalized_pistes.append({
            "id": p["id"],
            "name": p["name"] or f"Pista #{str(p['id'])[:4]}",
            "type": p["type"] or "downhill",
            "difficulty": p["difficulty"] or "intermediate",
            "coords": clean_piste,
            "top_pos": (clean_piste[0][0], clean_piste[0][1]),
            "top_alt": clean_piste[0][2],
            "bottom_pos": (clean_piste[-1][0], clean_piste[-1][1]),
            "bottom_alt": clean_piste[-1][2],
        })

    return normalized_lifts, normalized_pistes


# ==========================================
# AUTH & USER CREATION
# ==========================================
def create_or_login_user(profile):
    """Creates a rider user in the API and returns its auth headers."""
    email = profile["email"]
    password = profile["password"]
    register_payload = {
        "email": email,
        "password": password,
        "display_name": profile["display_name"],
        "first_name": profile["first_name"],
        "last_name": profile["last_name"],
    }

    print(f"👤 Registrando o iniciando sesión para {profile['role_name']} ({email})...")
    register_resp = http_client.post(f"{API_BASE_URL}/api/v1/auth/register", json_data=register_payload)
    if register_resp.status_code == 200:
        print(f"✅ Usuario '{profile['display_name']}' registrado correctamente.")
    elif register_resp.status_code in {400, 409, 422}:
        print("ℹ️ El usuario ya existe; iniciando sesión...")
    else:
        print(f"⚠️ Registro devolvió código {register_resp.status_code}: {register_resp.text}")

    login_resp = http_client.post(
        f"{API_BASE_URL}/api/v1/auth/login",
        json_data={"email": email, "password": password},
    )
    if login_resp.status_code != 200:
        raise RuntimeError(f"❌ Error al iniciar sesión: {login_resp.status_code} {login_resp.text}")

    auth_data = login_resp.json()
    access_token = auth_data.get("access_token")
    user_data = auth_data.get("user") or {}
    user_id = user_data.get("id")

    if not access_token or not user_id:
        raise RuntimeError(f"❌ Respuesta de login inválida: {auth_data}")

    print(f"✅ Autenticado como {profile['role_name']} (User ID: {user_id})")
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
def interpolate_smooth_path(coords_3d, speed_range, is_lift=False, time_step=2.0, is_transition=False, rider_profile=None):
    """
    Interpolates 3D coordinates into a continuous sequence of GPS points.
    Strictly follows the piste geometry without bizarre spikes or large lateral offsets.
    Applies gentle carving micro-sway and realistic speed variation.
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
    carve_period = 4.5
    if not is_lift and not is_transition and rider_profile:
        carve_amp = rider_profile.get("carve_amp", 0.8)
        carve_period = rider_profile.get("carve_period", 4.5)

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

        # Subtle, smooth carving turns on downhill pistes
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

        # Natural GPS jitter (0.10 - 0.20 meters)
        lat += random.normalvariate(0, 0.15) / 111320.0
        lon += random.normalvariate(0, 0.15) / (111320.0 * math.cos(math.radians(lat)))

        points.append({
            "lat": lat,
            "lon": lon,
            "altitude": alt,
            "speed": max(0.5, v),
            "elapsed_seconds": elapsed_time
        })

        if is_lift or is_transition:
            v = random.uniform(speed_range[0], speed_range[1])
        else:
            target_v = random.uniform(speed_range[0], speed_range[1])
            v = 0.85 * v + 0.15 * target_v

        step_dist = max(1.0, v * time_step)
        accum_dist += step_dist
        elapsed_time += time_step

    return points


def create_smooth_transition_track(from_3d, to_3d, speed=2.5, time_step=2.0):
    """
    Creates a direct glide/walk transition between two nearby points (e.g. lift exit to piste start,
    or piste bottom to lift entry), ensuring ZERO teleportation and no weird detours.
    """
    d = get_distance_meters(from_3d, to_3d)
    if d < 1.0:
        return []

    coords = [from_3d, to_3d]
    return interpolate_smooth_path(coords, (speed * 0.9, speed * 1.1), is_lift=False, time_step=time_step, is_transition=True)


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
        resp = http_client.post(
            f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/points",
            headers=auth_headers,
            files=files,
        )
        if resp.status_code != 200:
            print(f"⚠️ Error al enviar lote de puntos: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"⚠️ Excepción al enviar puntos: {e}")


# ==========================================
# CIRCUIT ROUTING HELPERS
# ==========================================
def find_pistes_accessible_from_lift(current_lift, pistes, recent_piste_ids=None):
    """
    Finds pistes whose top start (top_pos) is accessible from the summit exit of the current lift.
    Prioritizes pistes genuinely connected to this summit (< 250m) and promotes variety.
    """
    recent_piste_ids = recent_piste_ids or []
    lift_top = current_lift["top_pos"]

    candidates = []
    for p in pistes:
        d = get_distance_meters(lift_top, p["top_pos"])
        candidates.append((d, p))

    candidates.sort(key=lambda x: x[0])

    # 1. Pistes starting close (< 250m) that have not been skied recently
    close_fresh = [p for d, p in candidates if d <= 250.0 and p["id"] not in recent_piste_ids]
    if close_fresh:
        return close_fresh

    # 2. Any piste starting close (< 300m)
    close_any = [p for d, p in candidates if d <= 300.0]
    if close_any:
        return close_any

    # 3. Fallback: take the single closest piste to this lift summit
    return [candidates[0][1]]


def find_closest_connecting_lift(current_pos, lifts):
    """
    ALWAYS selects the lift whose bottom station (bottom_pos) is closest to where
    the piste just ended. This guarantees the skier boards the lift directly at the bottom
    of the skied piste, without walking across the mountain.
    """
    candidates = []
    for l in lifts:
        d = get_distance_meters(current_pos, l["bottom_pos"])
        candidates.append((d, l))

    candidates.sort(key=lambda x: x[0])

    # Return the closest lift
    closest_dist, closest_lift = candidates[0]
    return closest_lift, closest_dist


# ==========================================
# SIMULATION ENGINE FOR A RIDER DAY
# ==========================================
def simulate_rider_day(rider_key, resort_name=RESORT_TARGET, total_runs=8):
    profile = RIDER_PROFILES.get(rider_key, RIDER_PROFILES["ski"])
    role_name = profile["role_name"]
    emoji = profile["emoji"]

    print("\n" + "=" * 70)
    print(f"{emoji} SIMULANDO JORNADA DE {role_name.upper()} EN {resort_name.upper()}")
    print(f"   Modo: Circuito estricto (Sube remonte ➔ Baja pista ➔ Sube remonte más cercano)")
    print("=" * 70)

    # 1. Authenticate user
    user_id, auth_headers = create_or_login_user(profile)

    # 2. Get and orient resort data
    resort_id, raw_pistes, raw_lifts, min_alt, max_alt = get_resort_data(resort_name, auth_headers=auth_headers)
    if not raw_pistes or not raw_lifts:
        print("❌ No se encontraron pistas o remontes para esta estación.")
        return

    lifts, pistes = build_topological_network(raw_pistes, raw_lifts, min_alt, max_alt)
    if not lifts or not pistes:
        print("❌ No se pudo construir la red topológica de la estación.")
        return

    print(f"🌐 Topología verificada: {len(lifts)} remontes de subida y {len(pistes)} pistas de bajada orientadas.")

    # 3. Start Session in API
    print(f"\n🚀 Iniciando sesión de {role_name} en la API...")
    session_payload = {
        "resortId": str(resort_id),
        "activityType": profile["activity_type"]
    }
    resp = http_client.post(
        f"{API_BASE_URL}/api/v1/ski-sessions",
        headers=auth_headers,
        json_data=session_payload,
    )
    if resp.status_code != 201:
        print(f"❌ Error al iniciar sesión en API: {resp.text}")
        return

    session_data = resp.json()
    session_id = session_data.get("sessionId")
    print(f"✅ Sesión iniciada con ID: {session_id} (Activity: {profile['activity_type']})")

    # Start time of day: 09:30 AM
    current_time = datetime.now().replace(hour=9, minute=30, second=0, microsecond=0)

    # 4. Arrival at the Lowest Base of the Resort (Cota Baja)
    base_lift = min(lifts, key=lambda l: l["bottom_alt"])
    current_lift = base_lift
    current_pos_3d = current_lift["coords"][0]

    print(f"\n🚗 {profile['display_name']} llega a la cota baja de la estación: remonte base '{current_lift['name']}' ({current_lift['bottom_alt']:.0f}m)")

    recent_pistes = []
    photo_runs = {2, 5}

    for run_num in range(1, total_runs + 1):
        is_last_run = (run_num == total_runs)
        print(f"\n{'-'*60}")
        print(f"{emoji} RONDA #{run_num}/{total_runs} - Hora: {current_time.strftime('%H:%M')} - Cota actual: {current_pos_3d[2]:.0f}m")
        print(f"{'-'*60}")

        # -------------------------------------------------------------
        # PASO 1: Cola y embarque en el remonte
        # -------------------------------------------------------------
        queue_sec = random.randint(25, 55)
        print(f"[{current_time.strftime('%H:%M')}] ⏱️ Esperando turno en la cola del remonte '{current_lift['name']}' ({queue_sec}s)...")
        queue_pts = []
        for _ in range(0, queue_sec, 5):
            queue_pts.append({
                "lat": current_pos_3d[0] + random.normalvariate(0, 0.08) / 111320.0,
                "lon": current_pos_3d[1] + random.normalvariate(0, 0.08) / (111320.0 * math.cos(math.radians(current_pos_3d[0]))),
                "altitude": current_pos_3d[2],
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=5)
        send_points_batch(session_id, queue_pts, auth_headers)

        # -------------------------------------------------------------
        # PASO 2: Subida obligatoria en remonte (Cota baja ➔ Cota alta)
        # -------------------------------------------------------------
        l_type = current_lift["type"].lower()
        if "telecabina" in l_type or "gondola" in l_type:
            lift_speed = (4.5, 6.0)
        elif "telesilla" in l_type or "chair" in l_type:
            lift_speed = (2.6, 3.8)
        else:
            lift_speed = (2.0, 2.8)

        print(f"[{current_time.strftime('%H:%M')}] 🚠 Subiendo en '{current_lift['name']}' ({current_lift['bottom_alt']:.0f}m ➔ {current_lift['top_alt']:.0f}m)...")
        lift_pts_raw = interpolate_smooth_path(current_lift["coords"], lift_speed, is_lift=True, time_step=3.0)

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
        time.sleep(0.03)

        current_pos_3d = current_lift["coords"][-1]

        # -------------------------------------------------------------
        # PASO 3: Llegada a la cima, pausa según perfil y elección de pista
        # -------------------------------------------------------------
        min_p, max_p = profile["summit_pause"]
        summit_sec = random.randint(min_p, max_p)

        if rider_key == "snowboard":
            print(f"[{current_time.strftime('%H:%M')}] 🏂 Pausa en la cima ({current_pos_3d[2]:.0f}m): sentándose en la nieve y abrochándose la fijación trasera ({summit_sec}s)...")
        else:
            print(f"[{current_time.strftime('%H:%M')}] 🎿 Pausa en la cima ({current_pos_3d[2]:.0f}m): revisando gafas y bastones ({summit_sec}s)...")

        summit_pts = []
        for _ in range(0, summit_sec, 8):
            summit_pts.append({
                "lat": current_pos_3d[0] + random.normalvariate(0, 0.08) / 111320.0,
                "lon": current_pos_3d[1] + random.normalvariate(0, 0.08) / (111320.0 * math.cos(math.radians(current_pos_3d[0]))),
                "altitude": current_pos_3d[2],
                "speed": 0.0,
                "timestamp": current_time.isoformat() + "Z",
            })
            current_time += timedelta(seconds=8)

        photo_bytes = None
        photo_name = None
        if run_num in photo_runs:
            print(f"📸 Tomando foto panorámica desde la cima (Ronda #{run_num})...")
            photo_bytes = DUMMY_IMAGE
            photo_name = f"{rider_key}_summit_view_{run_num}.png"

        send_points_batch(session_id, summit_pts, auth_headers, photo_bytes=photo_bytes, photo_name=photo_name)

        # Seleccionar pista que nazca estrictamente en la cima alcanzada por este remonte
        accessible_pistes = find_pistes_accessible_from_lift(current_lift, pistes, recent_pistes)
        chosen_piste = random.choice(accessible_pistes)

        recent_pistes.append(chosen_piste["id"])
        if len(recent_pistes) > 3:
            recent_pistes.pop(0)

        # Transición corta y suave desde la salida del remonte al inicio de la pista
        piste_top_3d = chosen_piste["coords"][0]
        trans_dist = get_distance_meters(current_pos_3d, piste_top_3d)
        if trans_dist > 1.5:
            trans_raw = create_smooth_transition_track(current_pos_3d, piste_top_3d, speed=profile["flat_speed"], time_step=2.0)
            trans_points = []
            for p in trans_raw:
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

        # -------------------------------------------------------------
        # PASO 4: Bajada obligatoria por la pista (Cota alta ➔ Cota baja)
        # -------------------------------------------------------------
        diff = str(chosen_piste["difficulty"]).lower()
        diff_key = "intermediate"
        if "easy" in diff or "novice" in diff or "green" in diff:
            diff_key = "easy"
        elif "advanced" in diff or "red" in diff:
            diff_key = "advanced"
        elif "expert" in diff or "black" in diff:
            diff_key = "expert"
        elif "freeride" in diff:
            diff_key = "freeride"

        downhill_speed = profile["speeds"].get(diff_key, profile["speeds"]["intermediate"])

        print(f"[{current_time.strftime('%H:%M')}] {emoji} Bajando pista: '{chosen_piste['name']}' [{chosen_piste['difficulty']}] ({chosen_piste['top_alt']:.0f}m ➔ {chosen_piste['bottom_alt']:.0f}m)...")
        piste_pts_raw = interpolate_smooth_path(
            chosen_piste["coords"],
            downhill_speed,
            is_lift=False,
            time_step=2.0,
            rider_profile=profile
        )

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
        time.sleep(0.03)

        current_pos_3d = chosen_piste["coords"][-1]

        # -------------------------------------------------------------
        # PASO 5: Llegada a la base de la pista y subida en el remonte MÁS CERCANO
        # -------------------------------------------------------------
        if is_last_run:
            print(f"[{current_time.strftime('%H:%M')}] 🏁 Última bajada del día completada en la base ({current_pos_3d[2]:.0f}m).")
            # If not already at base lift, glide gently to main base
            dist_to_base = get_distance_meters(current_pos_3d, base_lift["coords"][0])
            if dist_to_base > 2.0 and dist_to_base < 300.0:
                base_trans_raw = create_smooth_transition_track(current_pos_3d, base_lift["coords"][0], speed=profile["flat_speed"], time_step=2.0)
                base_trans_pts = []
                for p in base_trans_raw:
                    base_trans_pts.append({
                        "lat": p["lat"],
                        "lon": p["lon"],
                        "altitude": p["altitude"],
                        "speed": p["speed"],
                        "timestamp": current_time.isoformat() + "Z",
                    })
                    current_time += timedelta(seconds=2)
                send_points_batch(session_id, base_trans_pts, auth_headers)
                current_pos_3d = base_lift["coords"][0]
        else:
            # Seleccionar ESTRICTAMENTE el remonte más cercano a donde acaba de terminar la pista
            next_lift, dist_to_lift = find_closest_connecting_lift(current_pos_3d, lifts)

            print(f"[{current_time.strftime('%H:%M')}] 🔄 Fin de pista. Remonte más cercano a {dist_to_lift:.0f}m: '{next_lift['name']}'...")
            lift_bot_3d = next_lift["coords"][0]
            if dist_to_lift > 1.5:
                base_trans_raw = create_smooth_transition_track(current_pos_3d, lift_bot_3d, speed=profile["flat_speed"], time_step=2.0)
                base_trans_pts = []
                for p in base_trans_raw:
                    base_trans_pts.append({
                        "lat": p["lat"],
                        "lon": p["lon"],
                        "altitude": p["altitude"],
                        "speed": p["speed"],
                        "timestamp": current_time.isoformat() + "Z",
                    })
                    current_time += timedelta(seconds=2)
                send_points_batch(session_id, base_trans_pts, auth_headers)

            current_pos_3d = lift_bot_3d
            current_lift = next_lift

    # -------------------------------------------------------------
    # PASO 6: Finalizar y cerrar sesión en la API
    # -------------------------------------------------------------
    print(f"\n🏁 Jornada de {role_name} finalizada a las {current_time.strftime('%H:%M')}. Cerrando sesión en API...")
    resp = http_client.post(
        f"{API_BASE_URL}/api/v1/ski-sessions/{session_id}/finish",
        headers=auth_headers,
    )
    if resp.status_code == 200:
        print(f"🎉 ¡Sesión de {role_name} cerrada con éxito!")
        print(f"   Bajadas completadas: {total_runs}")
        print(f"   Pistas recorridas: {len(set(recent_pistes))}")
    else:
        print(f"❌ Error al cerrar sesión: {resp.text}")


# ==========================================
# MAIN ENTRYPOINT
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Simulador de jornada realista de esquí y snowboard en Ski Tracker")
    parser.add_argument(
        "--rider",
        choices=["ski", "snowboard", "both"],
        default=os.environ.get("SIMULATE_RIDER", "both"),
        help="Tipo de usuario a simular: 'ski' (esquiador), 'snowboard' (snowboarder) o 'both' (ambos)"
    )
    parser.add_argument(
        "--resort",
        default=os.environ.get("RESORT_TARGET", RESORT_TARGET),
        help="Nombre de la estación de esquí a simular (por defecto: Valdesquí)"
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=int(os.environ.get("SIMULATED_RUNS", "8")),
        help="Número de bajadas a simular por jornada (por defecto: 8)"
    )

    args = parser.parse_args()

    print("=" * 70)
    print("🎿 SKI TRACKER - SIMULADOR DE JORNADA REALISTA DE MONTAÑA")
    print(f"   Estación objetivo: {args.resort}")
    print(f"   Modo de usuario: {args.rider}")
    print(f"   Bajadas por usuario: {args.runs}")
    print("=" * 70)

    if args.rider in {"ski", "both"}:
        simulate_rider_day("ski", resort_name=args.resort, total_runs=args.runs)

    if args.rider in {"snowboard", "both"}:
        simulate_rider_day("snowboard", resort_name=args.resort, total_runs=args.runs)

    print("\n" + "=" * 70)
    print("✨ SIMULACIÓN COMPLETA FINALIZADA")
    print("   Las sesiones han quedado registradas con detección de pistas y remontes.")
    print("=" * 70)


if __name__ == "__main__":
    main()
