# Roadmap: Ski Tracking and Run Detection System

## 🏗️ 1. System Architecture

The data flow is divided into three main layers: mobile capture, ingestion, and geospatial/analytical processing.
```
+-------------------------------------------------------------+
|               APP FRONTEND (React / Expo)                   |
|  - Background GPS capture (expo-location)                   |
|  - Local buffer temporary storage                           |
|  - Batch synchronization (Batch POST)                       |
+-------------------------------------------------------------+
|
| [POST /sessions & POST /points]
v
+-------------------------------------------------------------+
|               BACKEND API (Node.js / Express)               |
|  - Raw points ingestion                                     |
|  - Storage in raw coordinates table                         |
+-------------------------------------------------------------+
|
| [On session finish / Trigger]
v
+-------------------------------------------------------------+
|             ANALYSIS & GIS ENGINE (Backend)                 |
|  ├─ 1. Noise filtering and altimetric smoothing             |
|  ├─ 2. Segmentation (Lifts vs. Runs Heuristic)             |
|  └─ 3. Geospatial Map Matching with Ski Runs (PostGIS)     |
+-------------------------------------------------------------+
```

---

## 🗺️ 2. Implementation Phases (Roadmap)

### Phase 1: Client Telemetry Capture (Frontend / Expo)
*Objective: Record user GPS coordinates efficiently with low battery consumption.*

*   [ ] **Background Service:** Implement location tracking using Expo-compatible libraries (e.g., `expo-location` with `startLocationUpdatesAsync`).
*   [ ] **Precision Configuration:** Set optimal intervals (e.g., update every 5-10 meters or every 3-5 seconds) to avoid draining the battery or overwhelming the server.
*   [ ] **Local Buffer & Retries:** Temporarily store points in local storage (`AsyncStorage` or SQLite) in case the skier loses mountain coverage, sending them once connection is restored.
*   [ ] **UI Session Controls:** Screen or floating button for "Start Activity", "Pause/Resume", and "Finish Session".

---

### Phase 2: Backend Ingestion and Storage
*Objective: Receive and securely store massive coordinate streams.*

*   [ ] **Session Endpoints:**
    *   `POST /ski-sessions` (Starts a new ski session).
    *   `POST /ski-sessions/{id}/points` (Receives coordinate batches: `[ {lat, lon, altitude, speed, timestamp}, ... ]`).
    *   `POST /ski-sessions/{id}/finish` (Closes the session and triggers background processing).
*   [ ] **Database Schema:**
    *   `ski_sessions` table: ID, user, start, end, global metrics.
    *   `session_points` table: ID, session_id, geographic point (type `GEOMETRY(Point, 4326)` or lat/lon), altitude, speed, timestamp.

---

### Phase 3: Run Detection Algorithm (Backend Core)
*Objective: Translate an unordered list of GPS points into separate "Runs" (descents) separated from "Lifts" (ascents).*

*   [ ] **GPS Noise Filtering:** Apply a smoothing filter (such as a *Kalman Filter* or moving averages) to eliminate erroneous position jumps caused by signal bouncing in the mountains.
*   [ ] **Altitude and Slope Detection (Heuristics):**
    *   **Ascent (Lift):** If the altitude trend is sustained positively over time, label the segment as `lift`.
    *   **Descent (Run):** If the altitude trend is downward and speed exceeds a minimum threshold, label as a potential descent.
*   [ ] **Inactivity / Pause Cutoff:** If the user stops moving (speed close to 0 at a lodge or base) for more than X minutes, close the current run and start a new one when movement resumes.

---

### Phase 4: Geospatial Enrichment & Run Matching
*Objective: Accurately determine which ski runs the user traversed during their descent.*

*   [ ] **Spatial Indexing (PostGIS / GIS Engine):** Load the resort's ski trail polygons/lines (`pistesGeoJSON`) into the geospatial database.
*   [ ] **Map Matching:** Cross-reference the points of each detected run with the ski trail layer to identify which trail ID or resort matches the user's path.
*   [ ] **Final Metrics Calculation:**
    *   Total run distance.
    *   Maximum and average speed.
    *   Cumulative elevation gain/loss (positive and negative).
    *   Predominant run difficulty (based on the matched trails).

---

### Phase 5: Frontend Results Visualization
*Objective: Display a detailed summary of the day and each individual run to the user.*

*   [ ] **Session History Screen:** Chronologically grouped list of runs (Run 1, Run 2, etc.).
*   [ ] **Map Trace Rendering:** Render the exact path line of the run over your `InteractiveSkiMap` component with distinct or highlighted colors.
*   [ ] **Statistics Panel:** Show speed vs. altitude graphs for each selected run.