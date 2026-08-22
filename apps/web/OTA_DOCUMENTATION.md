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

## Performance & Improvement Considerations

- **Manifest Hashes (Backend):** Currently, `ota_service.go` downloads every asset into memory during the `buildManifest` call to calculate the `SHA256` and `MD5` hashes. For a large bundle or high traffic, this can cause memory spikes. 
  - *Recommendation:* Pre-calculate these hashes during the `POST /api/v1/ota/publish` phase and save them in a custom `hashes.json` in MinIO, so the manifest endpoint can just read the JSON instead of downloading all assets.
