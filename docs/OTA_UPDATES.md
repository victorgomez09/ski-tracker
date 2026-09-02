# Arquitectura de Actualizaciones OTA con Expo

Este documento describe el sistema de actualizaciones inalámbricas (Over-The-Air / OTA) implementado para la aplicación Ski Tracker. El sistema se basa en un backend propio en Golang (utilizando MinIO como almacenamiento de objetos) y un cliente Expo que utiliza `expo-updates`.

## Visión General

El sistema permite prescindir de los servicios estándar de Expo Application Services (EAS) para las actualizaciones OTA, alojando los paquetes de actualización en tu propia infraestructura. Soporta:
- **Actualizaciones obligatorias (forzadas) vs. opcionales:** Controladas mediante un flag personalizado.
- **Registros de cambios (changelogs) multilingües:** Enviados de forma segura desde el backend al frontend.
- **Canales de actualización (`stable` vs `beta`):** Soporte multi-canal para tener la v1 estable y la v2 beta conviviendo sobre el mismo servidor. Por defecto, cualquier petición sin canal especificado consulta el canal `stable`.
- **Rollback a binario embebido (`rollBackToEmbedded`):** Directiva oficial para ordenar a la app descartar bundles descargados y volver al código JavaScript nativo original del APK/IPA.
- **Rollbacks y directivas:** Compatibles con el protocolo oficial de `expo-updates`.

## Backend: API en Golang y Almacenamiento en MinIO

El backend se encarga de recibir los nuevos bundles, almacenarlos y servirlos mediante el protocolo de Expo Updates.

### Estructura de almacenamiento en MinIO
Los bundles se organizan por versión de runtime y canal:
```
updates/<runtime-version>/<channel>/<timestamp>/
  ├── metadata.json
  ├── info.json
  ├── hashes.json
  └── ... (assets y bundles JS)
```
*Si una app solicita el canal `stable` y aún no existen bundles bajo `updates/<runtime-version>/stable/`, el sistema retrocede de forma transparente a la ruta heredada `updates/<runtime-version>/<timestamp>/` para preservar retrocompatibilidad.*

### 1. Publicar una actualización (`POST /api/v1/ota/publish`)

Para publicar una actualización, el pipeline de CI/CD o el desarrollador comprime en ZIP la salida de `expo export` y la sube a este endpoint junto con los metadatos correspondientes (`runtime_version`, `channel`, `force_update`, `changelog`, `version`).

- **Canal opcional:** Parámetro `channel` (`stable` o `beta`). Si se omite, se asigna `stable` automáticamente.
- **Extracción y subida:** El servidor descomprime el archivo y sube cada fichero al bucket de MinIO bajo la ruta `updates/<runtime-version>/<channel>/<timestamp>/`.
- **Generación de metadatos:** Se genera un archivo `info.json` personalizado que contiene el changelog y el flag `forceUpdate`.

### 2. Activar Rollback a Embebido (`POST /api/v1/ota/rollback`)

Para ordenar a todos los clientes de un canal que descarten el bundle descargado y regresen al código JS empaquetado en el APK nativo:
- **Parámetros:** `runtime_version` y `channel` (por defecto `stable`).
- **Mecanismo:** El servidor crea una nueva entrada con timestamp actual y un archivo marcador `rollback`. Al tener la marca de tiempo más reciente, los clientes recibirán la directiva oficial de Expo:
  ```json
  {
    "type": "rollBackToEmbedded",
    "parameters": {
      "commitTime": "2026-09-02T15:40:00Z"
    }
  }
  ```

### 3. Servir el Manifiesto (`GET /api/v1/ota/manifest`)

Cuando el cliente Expo comprueba si hay actualizaciones, realiza una petición a este endpoint.
- **Resolución de Canal:** Extrae el canal desde `?channel=...`, el header `Expo-Channel-Name` o `Expo-Extra-Params` (inyectado por `Updates.setExtraParamAsync('channel', ...)`). Si no se proporciona ninguno, **por defecto usa `stable`**.
- **Resolución:** El servidor localiza la carpeta con la marca de tiempo más reciente para la `runtimeVersion` y `channel` solicitados.
- **Verificación de Rollback:** Si la carpeta más reciente contiene el marcador `rollback`, emite la directiva `rollBackToEmbedded` (o `noUpdateAvailable` si el cliente ya está en la versión embebida).
- **Construcción del manifiesto:** Lee el archivo `metadata.json` y el `info.json` personalizado.
- **Hashes:** El servidor calcula los hashes SHA256 y MD5 para el bundle de inicio y los assets.
- **Protocolo Expo:** Formatea la respuesta en función de la cabecera `expo-protocol-version`, utilizando respuestas `multipart/mixed` para la versión 1+.
- **Carga útil personalizada (`extra`):** Los campos de `info.json` (`forceUpdate`, `changelog`, `version`) se inyectan en el objeto `extra` del manifiesto.

### 4. Servir Assets (`GET /api/v1/ota/assets`)

Cuando el cliente Expo necesita descargar el bundle JS o imágenes, solicita este endpoint con los parámetros `asset`, `runtimeVersion`, `channel` y `platform`. El backend transmite el archivo directamente desde MinIO con las cabeceras `Content-Type` y `Cache-Control` adecuadas.

## Frontend: Cliente Expo

El cliente Expo gestiona el ciclo de vida de las actualizaciones mediante un hook personalizado de React: `useOtaUpdates`.

### El Hook `useOtaUpdates` (`hooks/use-ota-updates.hook.tsx`)

Este hook abstrae la complejidad de la API de `expo-updates` y gestiona la máquina de estados de actualización.

#### Estados de Actualización (Fases)
- `idle`: Estado por defecto.
- `checking`: Comprobando activamente con el servidor si existe un nuevo manifiesto.
- `downloading`: Descargando el bundle y los assets.
- `mandatory`: Actualización obligatoria lista. La aplicación se recargará inmediatamente.
- `optional`: Actualización no obligatoria disponible. La interfaz puede consultar al usuario.
- `none`: No hay actualizaciones disponibles o no está soportado (por ejemplo, en modo `__DEV__` o web).

#### Flujo de Ejecución
1. **Comprobación:** Al montarse, ejecuta `Updates.checkForUpdateAsync()`.
2. **Lectura de metadatos:** Si existe una actualización, lee `manifest.extra` para extraer `forceUpdate`, `version` y `changelog`. Filtra el changelog según el idioma activo (`i18n.language`).
3. **Acción:**
   - Si `forceUpdate` es verdadero, llama inmediatamente a `Updates.fetchUpdateAsync()` y `Updates.reloadAsync()`.
   - Si es falso, transiciona a la fase `optional`, permitiendo a la UI mostrar un modal de actualización y ejecutar `applyUpdate()` cuando el usuario acepte.

## Guía de Pruebas en Local

Por defecto, las comprobaciones de actualizaciones OTA están deshabilitadas en modo de desarrollo (`__DEV__ = true`). Para probar el flujo completo de actualizaciones OTA en tu entorno local, sigue estos pasos:

### 1. Iniciar Backend y Almacenamiento
Asegúrate de que el servidor API en Golang (habitualmente en el puerto `8082`) y la instancia de MinIO estén en ejecución.

### 2. Configurar la URL de Actualizaciones OTA
En [`app.json`](file:///home/development/projects/ski-tracker/apps/web/app.json), verifica que `updates.url` apunte a la IP accesible de tu máquina o a localhost:
- **Simulador iOS / Máquina local:** `"http://localhost:8082/api/v1/ota/manifest"`
- **Emulador Android:** `"http://10.0.2.2:8082/api/v1/ota/manifest"` (ya que `localhost` apunta al propio emulador)
- **Dispositivo físico:** Usa la dirección IP local de tu ordenador (ej. `"http://192.168.1.50:8082/api/v1/ota/manifest"`).

### 3. Compilar y Publicar la Versión A (Build Inicial)
1. Exportar el bundle inicial de producción:
   ```bash
   npm run export:ota
   ```
2. Comprimir el contenido de la carpeta generada `dist-ota/` en un archivo ZIP (ej. `dist-ota.zip`).
3. Publicar esta versión inicial en la API local:
   ```bash
   curl -X POST http://localhost:8082/api/v1/ota/publish \
     -F "bundle=@dist-ota.zip" \
     -F "runtime_version=0.0.1" \
     -F "version=0.0.1" \
     -F "force_update=false" \
     -F "changelog={\"en\":[\"Initial version\"],\"es\":[\"Versión inicial\"]}"
   ```
4. Compilar y ejecutar la app en modo **Release** para que `__DEV__` sea `false`:
   - **Android:** `npx expo run:android --variant release`
   - **iOS:** `npx expo run:ios --configuration Release`

### 4. Compilar y Publicar la Versión B (La Actualización)
1. Realiza un cambio visible en el código de la app (ej. modificar un texto o color).
2. Vuelve a exportar el bundle:
   ```bash
   npm run export:ota
   ```
3. Vuelve a comprimir la carpeta `dist-ota/` actualizada.
4. Publica la actualización con un nuevo número de versión y changelog:
   ```bash
   curl -X POST http://localhost:8082/api/v1/ota/publish \
     -F "bundle=@dist-ota.zip" \
     -F "runtime_version=0.0.1" \
     -F "version=0.0.2" \
     -F "force_update=false" \
     -F "changelog={\"en\":[\"New features!\"],\"es\":[\"¡Nuevas funciones!\"]}"
   ```

### 5. Verificar el Flujo de Actualización
Abre la app instalada en versión Release. Consultará la API local en busca del manifiesto:
- Si `force_update=false`, aparecerá el modal de actualización personalizada presentando el changelog en el idioma del dispositivo y permitiendo al usuario aplicar la actualización.
- Si `force_update=true`, la app descargará y aplicará automáticamente la actualización al reiniciarse.

## Consideraciones de Rendimiento y Mejoras

- **Hashes del Manifiesto (Backend):** Actualmente, `ota_service.go` descarga cada asset a memoria durante la llamada `buildManifest` para calcular los hashes `SHA256` y `MD5`. En bundles grandes o con tráfico elevado, esto puede ocasionar picos de uso de memoria.
  - *Recomendación:* Precalcular estos hashes durante la fase `POST /api/v1/ota/publish` y guardarlos en un archivo `hashes.json` en MinIO, de modo que el endpoint del manifiesto simplemente lea el JSON sin tener que descargar todos los assets.

## Comandos para Publicar y Gestionar OTA

### Publicar en Canal Estable (v1)
```shell
make ota-publish ARGS='--channel stable --es "Correcciones de estabilidad" --en "Stability fixes"'
```

### Publicar en Canal Beta (v2)
```shell
make ota-publish ARGS='--channel beta --es "Nuevas funciones de tracking v2" --en "New v2 tracking features"'
```

### Rollback a Binario Embebido
Para forzar a que las aplicaciones de un canal descarten las OTAs y vuelvan a la versión compilada en el APK/IPA:
```shell
# Rollback en canal beta
make ota-rollback ARGS='--channel beta'

# Rollback en canal estable
make ota-rollback ARGS='--channel stable'
```