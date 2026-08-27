# Arquitectura de Actualizaciones OTA con Expo

Este documento describe el sistema de actualizaciones inalámbricas (Over-The-Air / OTA) implementado para la aplicación Ski Tracker. El sistema se basa en un backend propio en Golang (utilizando MinIO como almacenamiento de objetos) y un cliente Expo que utiliza `expo-updates`.

## Visión General

El sistema permite prescindir de los servicios estándar de Expo Application Services (EAS) para las actualizaciones OTA, alojando los paquetes de actualización en tu propia infraestructura. Soporta:
- **Actualizaciones obligatorias (forzadas) vs. opcionales:** Controladas mediante un flag personalizado.
- **Registros de cambios (changelogs) multilingües:** Enviados de forma segura desde el backend al frontend.
- **Rollbacks y directivas:** Compatibles con el protocolo oficial de `expo-updates`.

## Backend: API en Golang y Almacenamiento en MinIO

El backend se encarga de recibir los nuevos bundles, almacenarlos y servirlos mediante el protocolo de Expo Updates.

### 1. Publicar una actualización (`POST /api/v1/ota/publish`)

Para publicar una actualización, el pipeline de CI/CD o el desarrollador comprime en ZIP la salida de `expo export` y la sube a este endpoint junto con los metadatos correspondientes (`runtime_version`, `force_update`, `changelog`, `version`).

- **Extracción y subida:** El servidor descomprime el archivo y sube cada fichero al bucket de MinIO bajo la ruta `updates/<runtime-version>/<timestamp>/`.
- **Generación de metadatos:** Se genera un archivo `info.json` personalizado que contiene el changelog y el flag `forceUpdate`.

### 2. Servir el Manifiesto (`GET /api/v1/ota/manifest`)

Cuando el cliente Expo comprueba si hay actualizaciones, realiza una petición a este endpoint.
- **Resolución:** El servidor localiza la carpeta con la marca de tiempo más reciente para la `runtimeVersion` solicitada.
- **Construcción del manifiesto:** Lee el archivo `metadata.json` (generado por `expo export`) y el `info.json` personalizado.
- **Hashes:** El servidor calcula los hashes SHA256 y MD5 para el bundle de inicio y los assets.
- **Protocolo Expo:** Formatea la respuesta en función de la cabecera `expo-protocol-version`, utilizando respuestas `multipart/mixed` para la versión 1+ para enviar correctamente las directivas (como rollback) y el cuerpo del manifiesto.
- **Carga útil personalizada (`extra`):** Los campos de `info.json` (`forceUpdate`, `changelog`, `version`) se inyectan en el objeto `extra` del manifiesto.

### 3. Servir Assets (`GET /api/v1/ota/assets`)

Cuando el cliente Expo necesita descargar el bundle JS o imágenes, solicita este endpoint con los parámetros `asset`, `runtimeVersion` y `platform`. El backend transmite el archivo directamente desde MinIO, configurando las cabeceras `Content-Type` y `Cache-Control` adecuadas.

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

## Comando para Publicar OTA al Servidor
```shell
make ota-publish ARGS='--es "Cambiar estilo en los detalles del tiempo" --en "Change styles inside weather forecast"'
```