#!/usr/bin/env bash
set -e

# ==============================================================================
# Publish Expo OTA Update Script
# ==============================================================================
# Usage:
#   ./scripts/publish-ota.sh [options]
#
# Options:
#   -u, --url <api_url>        Target API Base URL (e.g. https://api-ski-tracker.viti-tech.es)
#   -s, --secret <secret>      OTA Publish Secret token (OTA_PUBLISH_SECRET)
#   -r, --runtime-version <v>  Override runtime version (Default: auto-detected from fingerprint / app.json)
#   -f, --force                Mark update as mandatory (forceUpdate = true)
#   -c, --changelog <text>     Changelog text for both ES and EN
#   -h, --help                 Show this help message
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values / Load from deploy/.env if present
API_URL=""
OTA_SECRET=""
RUNTIME_VERSION_OVERRIDE=""
FORCE_UPDATE="false"
CHANGELOG_TEXT=""
CHANGELOG_ES=()
CHANGELOG_EN=()

if [ -f "${ROOT_DIR}/deploy/.env" ]; then
    # shellcheck disable=SC1090
    API_URL="$(grep '^API_PUBLIC_URL=' "${ROOT_DIR}/deploy/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    OTA_SECRET="$(grep '^OTA_PUBLISH_SECRET=' "${ROOT_DIR}/deploy/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi

if [ -z "$API_URL" ] && [ -f "${ROOT_DIR}/apps/api/.env" ]; then
    API_URL="$(grep '^API_PUBLIC_URL=' "${ROOT_DIR}/apps/api/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [ -z "$OTA_SECRET" ] && [ -f "${ROOT_DIR}/apps/api/.env" ]; then
    OTA_SECRET="$(grep '^OTA_PUBLISH_SECRET=' "${ROOT_DIR}/apps/api/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi

# Fallback default API URL if still unset
API_URL="${API_URL:-https://api-ski-tracker.viti-tech.es}"

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -u|--url)
            API_URL="$2"
            shift 2
            ;;
        -s|--secret)
            OTA_SECRET="$2"
            shift 2
            ;;
        -r|--runtime-version)
            RUNTIME_VERSION_OVERRIDE="$2"
            shift 2
            ;;
        -f|--force)
            FORCE_UPDATE="true"
            shift
            ;;
        -c|--changelog)
            CHANGELOG_TEXT="$2"
            shift 2
            ;;
        --changelog-es|--es)
            CHANGELOG_ES+=("$2")
            shift 2
            ;;
        --changelog-en|--en)
            CHANGELOG_EN+=("$2")
            shift 2
            ;;
        -h|--help)
            echo -e "Usage: $0 [options]"
            echo -e "\nOptions:"
            echo -e "  -u, --url <api_url>           Target API Base URL (Default: ${API_URL})"
            echo -e "  -s, --secret <secret>         OTA Publish Secret token"
            echo -e "  -r, --runtime-version <v>     Override runtime version (Default: auto-detected)"
            echo -e "  -f, --force                   Mark update as mandatory (forceUpdate=true)"
            echo -e "  -c, --changelog <text>        Changelog description (or raw JSON)"
            echo -e "  --changelog-es, --es <text>   Changelog item in Spanish (repeatable or ';' separated)"
            echo -e "  --changelog-en, --en <text>   Changelog item in English (repeatable or ';' separated)"
            echo -e "  -h, --help                    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown parameter: $1${NC}"
            exit 1
            ;;
    esac
done

if [ -z "$OTA_SECRET" ]; then
    echo -e "${RED}Error: OTA_PUBLISH_SECRET is not set.${NC}"
    echo "Provide it via --secret <token> or set OTA_PUBLISH_SECRET in deploy/.env or apps/api/.env"
    exit 1
fi

# Strip trailing slash and /api/v1 if present to avoid duplicated paths
API_URL="${API_URL%/api/v1}"

# Ensure prerequisites
for cmd in node pnpm zip curl; do
    if ! command -v "$cmd" &> /dev/null; then
        echo -e "${RED}Error: '$cmd' is required but not installed in PATH.${NC}"
        exit 1
    fi
done

cd "${WEB_DIR}"

# 1. Detect app version
APP_VERSION="$(node -p "require('./app.json').expo.version")"

# 2. Detect runtimeVersion policy (fingerprint vs appVersion vs custom string)
if [ -n "$RUNTIME_VERSION_OVERRIDE" ]; then
    RUNTIME_VERSION="$RUNTIME_VERSION_OVERRIDE"
    echo -e "${BLUE}==>${NC} Runtime version (manually specified): ${GREEN}${RUNTIME_VERSION}${NC}"
else
    echo -e "${BLUE}==>${NC} Resolving runtime version according to app.json configuration..."
    RUNTIME_VERSION="$(node -e "
        const app = require('./app.json');
        const rv = app.expo.runtimeVersion;
        if (typeof rv === 'string') {
            process.stdout.write(rv);
        } else if (rv && rv.policy === 'fingerprint') {
            const { execSync } = require('child_process');
            try {
                const out = execSync('npx @expo/fingerprint .', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
                const parsed = JSON.parse(out);
                process.stdout.write(parsed.hash);
            } catch (e) {
                process.stdout.write(app.expo.version);
            }
        } else {
            process.stdout.write(app.expo.version);
        }
    ")"
fi

echo -e "${BLUE}==>${NC} App version (app.json): ${CYAN}${APP_VERSION}${NC}"
echo -e "${BLUE}==>${NC} Target Runtime Version: ${GREEN}${RUNTIME_VERSION}${NC}"
echo -e "${BLUE}==>${NC} Target API Server: ${YELLOW}${API_URL}${NC}"
echo -e "${BLUE}==>${NC} Force update: ${YELLOW}${FORCE_UPDATE}${NC}"

# 3. Run expo export
echo -e "\n${BLUE}==>${NC} Exporting Expo OTA bundle..."
rm -rf dist-ota bundle.zip
pnpm run export:ota

if [ ! -d "dist-ota" ]; then
    echo -e "${RED}Error: dist-ota directory was not generated.${NC}"
    exit 1
fi

# 4. Zip the bundle
echo -e "\n${BLUE}==>${NC} Compressing bundle..."
(cd dist-ota && zip -q -r ../bundle.zip .)

# 5. Prepare changelog JSON
ES_JSON_ARG="$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${CHANGELOG_ES[@]}")"
EN_JSON_ARG="$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${CHANGELOG_EN[@]}")"

CHANGELOG_JSON="$(node -e '
    const rawText = process.argv[1] || "";
    const esItems = JSON.parse(process.argv[2] || "[]");
    const enItems = JSON.parse(process.argv[3] || "[]");
    const appVersion = process.argv[4] || "";

    const splitItems = (list) => {
        const out = [];
        for (const item of list) {
            if (typeof item === "string") {
                const parts = item.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
                out.push(...parts);
            }
        }
        return out;
    };

    let es = splitItems(esItems);
    let en = splitItems(enItems);

    // If -c was passed with raw JSON object e.g. {"es":["..."],"en":["..."]}
    if (rawText.trim().startsWith("{") && rawText.trim().endsWith("}")) {
        try {
            const parsed = JSON.parse(rawText);
            if (parsed.es || parsed.en) {
                if (parsed.es && !es.length) es = Array.isArray(parsed.es) ? parsed.es : [parsed.es];
                if (parsed.en && !en.length) en = Array.isArray(parsed.en) ? parsed.en : [parsed.en];
            }
        } catch (e) {}
    }

    // If general text was passed but no specific language flags
    if (!es.length && !en.length && rawText) {
        const parts = splitItems([rawText]);
        es = [...parts];
        en = [...parts];
    } else if (es.length && !en.length) {
        en = [...es];
    } else if (en.length && !es.length) {
        es = [...en];
    }

    if (!es.length) es = [`Actualización v${appVersion}`];
    if (!en.length) en = [`Update v${appVersion}`];

    console.log(JSON.stringify({ es, en }));
' "$CHANGELOG_TEXT" "$ES_JSON_ARG" "$EN_JSON_ARG" "$APP_VERSION")"

echo -e "${BLUE}==>${NC} Changelog: ${CYAN}${CHANGELOG_JSON}${NC}"

# 6. Publish to backend API
echo -e "\n${BLUE}==>${NC} Uploading OTA update to ${API_URL}/api/v1/ota/publish..."
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/v1/ota/publish" \
    -H "Authorization: Bearer ${OTA_SECRET}" \
    -F "bundle=@bundle.zip" \
    -F "runtime_version=${RUNTIME_VERSION}" \
    -F "version=${APP_VERSION}" \
    -F "force_update=${FORCE_UPDATE}" \
    -F "changelog=${CHANGELOG_JSON}")

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)

# 7. Cleanup
rm -rf dist-ota bundle.zip

# 8. Check result
if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
    echo -e "\n${GREEN}✓ OTA update published successfully!${NC}"
    echo -e "${GREEN}Runtime Version:${NC} ${RUNTIME_VERSION}"
    echo -e "${GREEN}Response:${NC} ${HTTP_BODY}"
else
    echo -e "\n${RED}✗ Failed to publish OTA update (HTTP status: ${HTTP_STATUS})${NC}"
    echo -e "${RED}Response:${NC} ${HTTP_BODY}"
    exit 1
fi
