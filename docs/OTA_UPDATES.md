# Expo OTA Updates Architecture

This document describes the Over-The-Air (OTA) update system implemented for the Ski Tracker application. The system relies on a custom Golang backend (interacting with MinIO for storage) and an Expo client using `expo-updates`.

## Overview

The system allows you to bypass standard Expo Application Services (EAS) for OTA updates and host the update bundles on your own infrastructure. It supports:
- **Mandatory (Forced) vs. Optional Updates:** Controlled via a custom flag.
- **Multilingual Changelogs:** Sent securely from the backend to the frontend.
- **Rollbacks & Directives:** Supported by adhering to the `expo-updates` protocol.

## Backend: Golang API & MinIO Storage

The backend handles receiving new bundles, storing them, and serving them via the Expo Updates protocol.

### 1. Publishing an Update (`POST /api/v1/ota/publish`)

To release an update, the CI/CD or developer zips the output of `expo export` and uploads it to this endpoint along with metadata (`runtime_version`, `force_update`, `changelog`, `version`).

- **Extraction & Upload:** The server unzips the payload and uploads every file to a MinIO bucket under `updates/<runtime-version>/<timestamp>/`.
- **Metadata Generation:** A custom `info.json` is generated containing the changelog and the `forceUpdate` flag.

### 2. Serving the Manifest (`GET /api/v1/ota/manifest`)

When the Expo client checks for updates, it hits this endpoint.
- **Resolution:** The server finds the latest timestamp folder for the requested `runtimeVersion`.
- **Manifest Assembly:** It reads `metadata.json` (created by `expo export`) and the custom `info.json`.
- **Hashes:** The server calculates SHA256 and MD5 hashes for the launch bundle and assets.
- **Expo Protocol:** It formats the response based on the `expo-protocol-version` header, utilizing `multipart/mixed` responses for version 1+ to correctly pass directives (like rollback) and the manifest body.
- **Custom Payload (`extra`):** The `info.json` fields (`forceUpdate`, `changelog`, `version`) are injected into the manifest's `extra` object.

### 3. Serving Assets (`GET /api/v1/ota/assets`)

When the Expo client needs to download the JS bundle or images, it requests this endpoint with the `asset`, `runtimeVersion`, and `platform` queries. The backend streams the file directly from MinIO, setting appropriate `Content-Type` and `Cache-Control` headers.

## Frontend: Expo Client

The Expo client handles the update lifecycle using a custom React hook: `useOtaUpdates`.

### The `useOtaUpdates` Hook (`hooks/use-ota-updates.hook.tsx`)

This hook abstracts the complexity of the `expo-updates` API and manages the update state machine.

#### Update States (Phases)
- `idle`: Default state.
- `checking`: Actively pinging the server for a manifest.
- `downloading`: Fetching the bundle and assets.
- `mandatory`: A forced update is ready. The app will usually reload immediately.
- `optional`: A non-forced update is available. The UI can prompt the user.
- `none`: No updates available or not supported (e.g., in `__DEV__` or web).

#### Flow
1. **Check:** On mount, it calls `Updates.checkForUpdateAsync()`.
2. **Read Metadata:** If an update exists, it reads `manifest.extra` to extract `forceUpdate`, `version`, and `changelog`. It filters the changelog based on the active language (`i18n.language`).
3. **Action:**
   - If `forceUpdate` is true, it immediately calls `Updates.fetchUpdateAsync()` and `Updates.reloadAsync()`.
    - If false, it transitions to the `optional` phase, allowing the UI to show an update modal and call `applyUpdate()` when the user accepts.

## Local Testing Guide

By default, the OTA update checks are disabled in development mode (`__DEV__ = true`). To test the OTA update pipeline end-to-end on your local environment, follow these steps:

### 1. Run the Backend & Storage
Ensure your Golang API server (usually running on port `8082`) and MinIO instance are up and running.

### 2. Configure the OTA Update URL
In [`app.json`](file:///home/development/projects/ski-tracker/apps/web/app.json), make sure the `updates.url` points to your machine's accessible IP or localhost:
- **iOS Simulator / Machine Hosting API:** `"http://localhost:8082/api/v1/ota/manifest"`
- **Android Emulator:** `"http://10.0.2.2:8082/api/v1/ota/manifest"` (since `localhost` refers to the emulator itself)
- **Physical Device:** Use your local machine's IP address (e.g., `"http://192.168.1.50:8082/api/v1/ota/manifest"`).

### 3. Build & Publish Version A (Initial Build)
1. Export the initial production bundle:
   ```bash
   npm run export:ota
   ```
2. Compress the contents of the generated `dist-ota/` folder into a ZIP file (e.g., `dist-ota.zip`).
3. Publish this initial version to the local API:
   ```bash
   curl -X POST http://localhost:8082/api/v1/ota/publish \
     -F "bundle=@dist-ota.zip" \
     -F "runtime_version=0.0.1" \
     -F "version=0.0.1" \
     -F "force_update=false" \
     -F "changelog={\"en\":[\"Initial version\"],\"es\":[\"Versión inicial\"]}"
   ```
4. Build and run the app in **Release** mode so that `__DEV__` is set to `false`:
   - **Android:** `npx expo run:android --variant release`
   - **iOS:** `npx expo run:ios --configuration Release`

### 4. Build & Publish Version B (The Update)
1. Make a visible change in the app code (e.g., modify text or color).
2. Re-export the bundle:
   ```bash
   npm run export:ota
   ```
3. Re-zip the updated `dist-ota/` folder.
4. Publish the update with a new version number and changelog:
   ```bash
   curl -X POST http://localhost:8082/api/v1/ota/publish \
     -F "bundle=@dist-ota.zip" \
     -F "runtime_version=0.0.1" \
     -F "version=0.0.2" \
     -F "force_update=false" \
     -F "changelog={\"en\":[\"New features!\"],\"es\":[\"¡Nuevas funciones!\"]}"
   ```

### 5. Verify the Update Flow
Open the installed release app. It will query the local API for the manifest:
- If `force_update=false`, the custom OTA UI modal will show up, presenting the changelog in the device's language and allowing the user to trigger the update.
- If `force_update=true`, the app will automatically download and apply the update upon restarting.

## Performance & Improvement Considerations

- **Manifest Hashes (Backend):** Currently, `ota_service.go` downloads every asset into memory during the `buildManifest` call to calculate the `SHA256` and `MD5` hashes. For a large bundle or high traffic, this can cause memory spikes. 
  - *Recommendation:* Pre-calculate these hashes during the `POST /api/v1/ota/publish` phase and save them in a custom `hashes.json` in MinIO, so the manifest endpoint can just read the JSON instead of downloading all assets.


## To export OTA to server
```shell
make ota-publish ARGS='--es "Cambiar estilo en los detalles del tiempo" --en "Change styles inside weather forecast"'
```