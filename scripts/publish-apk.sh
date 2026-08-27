#!/usr/bin/env bash
set -e

# ==============================================================================
# Publish Native APK Release Script
# ==============================================================================
# Usage:
#   ./scripts/publish-apk.sh [options]
#
# Options:
#   -f, --file <path>          Path to .apk file (e.g. apps/web/app-prod.apk)
#   -u, --url <api_url>        Target API Base URL (e.g. https://api-ski-tracker.viti-tech.es)
#   -s, --secret <secret>      Publish Secret token (OTA_PUBLISH_SECRET)
#   -v, --version <v>          App version (Default: read from app.json)
#   -r, --runtime-version <v>  Runtime version (Default: read from app.json)
#   -b, --build-number <num>   Build number integer (Default: timestamp)
#   --force                    Force mandatory update (Default: true)
#   -c, --changelog <text>     Changelog description
#   --es <text>                Changelog item in Spanish
#   --en <text>                Changelog item in English
#   -h, --help                 Show this help message
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

APK_FILE=""
API_URL=""
SECRET=""
VERSION=""
RUNTIME_VERSION=""
BUILD_NUMBER=""
FORCE_UPDATE="true"
CHANGELOG_TEXT=""
CHANGELOG_ES=()
CHANGELOG_EN=()

if [ -f "${ROOT_DIR}/deploy/.env" ]; then
    API_URL="$(grep '^API_PUBLIC_URL=' "${ROOT_DIR}/deploy/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    SECRET="$(grep '^OTA_PUBLISH_SECRET=' "${ROOT_DIR}/deploy/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi

if [ -z "$API_URL" ] && [ -f "${ROOT_DIR}/apps/api/.env" ]; then
    API_URL="$(grep '^API_PUBLIC_URL=' "${ROOT_DIR}/apps/api/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [ -z "$SECRET" ] && [ -f "${ROOT_DIR}/apps/api/.env" ]; then
    SECRET="$(grep '^OTA_PUBLISH_SECRET=' "${ROOT_DIR}/apps/api/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
fi

API_URL="${API_URL:-https://api-ski-tracker.viti-tech.es}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -f|--file|--apk)
            APK_FILE="$2"
            shift 2
            ;;
        -u|--url)
            API_URL="$2"
            shift 2
            ;;
        -s|--secret)
            SECRET="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--runtime-version)
            RUNTIME_VERSION="$2"
            shift 2
            ;;
        -b|--build-number)
            BUILD_NUMBER="$2"
            shift 2
            ;;
        --force)
            FORCE_UPDATE="true"
            shift
            ;;
        -c|--changelog)
            CHANGELOG_TEXT="$2"
            shift 2
            ;;
        --es|--changelog-es)
            CHANGELOG_ES+=("$2")
            shift 2
            ;;
        --en|--changelog-en)
            CHANGELOG_EN+=("$2")
            shift 2
            ;;
        -h|--help)
            echo -e "Usage: $0 [options]"
            echo -e "\nOptions:"
            echo -e "  -f, --file <path>          Path to .apk file"
            echo -e "  -u, --url <api_url>        Target API Base URL (Default: ${API_URL})"
            echo -e "  -s, --secret <secret>      OTA Publish Secret token"
            echo -e "  -v, --version <v>          App version (Default: from app.json)"
            echo -e "  -r, --runtime-version <v>  Runtime version (Default: from app.json)"
            echo -e "  -b, --build-number <num>   Build number (Default: current timestamp)"
            echo -e "  --es <text>                Changelog item in Spanish"
            echo -e "  --en <text>                Changelog item in English"
            echo -e "  -h, --help                 Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown parameter: $1${NC}"
            exit 1
            ;;
    esac
done

if [ -z "$APK_FILE" ]; then
    if [ -f "${WEB_DIR}/app-prod.apk" ]; then
        APK_FILE="${WEB_DIR}/app-prod.apk"
    elif [ -f "${ROOT_DIR}/app-prod.apk" ]; then
        APK_FILE="${ROOT_DIR}/app-prod.apk"
    else
        echo -e "${RED}Error: No APK file provided and app-prod.apk not found.${NC}"
        echo "Use -f <path-to-apk>"
        exit 1
    fi
fi

if [ ! -f "$APK_FILE" ]; then
    echo -e "${RED}Error: APK file not found at: ${APK_FILE}${NC}"
    exit 1
fi

# Convert to absolute path before cd into WEB_DIR
APK_FILE="$(cd "$(dirname "$APK_FILE")" && pwd)/$(basename "$APK_FILE")"

if [ -z "$SECRET" ]; then
    echo -e "${RED}Error: OTA_PUBLISH_SECRET is not set.${NC}"
    echo "Provide it via --secret <token> or set OTA_PUBLISH_SECRET in deploy/.env or apps/api/.env"
    exit 1
fi

API_URL="${API_URL%/}"
API_URL="${API_URL%/api/v1}"

cd "${WEB_DIR}"

if [ -z "$VERSION" ]; then
    VERSION="$(node -p "require('./app.json').expo.version")"
fi

if [ -z "$RUNTIME_VERSION" ]; then
    RUNTIME_VERSION="$(node -p "require('./app.json').expo.runtimeVersion || require('./app.json').expo.version")"
fi

if [ -z "$BUILD_NUMBER" ]; then
    BUILD_NUMBER="$(date +%Y%m%d%H%M)"
fi

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

    if (!es.length && !en.length && rawText) {
        const parts = splitItems([rawText]);
        es = [...parts];
        en = [...parts];
    } else if (es.length && !en.length) {
        en = [...es];
    } else if (en.length && !es.length) {
        es = [...en];
    }

    if (!es.length) es = [`Nueva versión v${appVersion} con actualizaciones nativas`];
    if (!en.length) en = [`New release v${appVersion} with native updates`];

    console.log(JSON.stringify({ es, en }));
' "$CHANGELOG_TEXT" "$ES_JSON_ARG" "$EN_JSON_ARG" "$VERSION")"

echo -e "${BLUE}==>${NC} Publishing Native Release to backend..."
echo -e "${BLUE}==>${NC} APK File: ${CYAN}${APK_FILE}${NC}"
echo -e "${BLUE}==>${NC} Version: ${GREEN}${VERSION}${NC} (Runtime: ${GREEN}${RUNTIME_VERSION}${NC}, Build: ${CYAN}${BUILD_NUMBER}${NC})"
echo -e "${BLUE}==>${NC} API URL: ${YELLOW}${API_URL}${NC}"
echo -e "${BLUE}==>${NC} Changelog: ${CYAN}${CHANGELOG_JSON}${NC}"

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/v1/app/publish" \
    -H "Authorization: Bearer ${SECRET}" \
    -F "apk=@${APK_FILE}" \
    -F "version=${VERSION}" \
    -F "runtime_version=${RUNTIME_VERSION}" \
    -F "build_number=${BUILD_NUMBER}" \
    -F "platform=android" \
    -F "force_update=${FORCE_UPDATE}" \
    -F "changelog=${CHANGELOG_JSON}")

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
    echo -e "\n${GREEN}✓ Native APK release published successfully!${NC}"
    echo -e "${GREEN}Response:${NC} ${HTTP_BODY}"
else
    echo -e "\n${RED}✗ Failed to publish APK release (HTTP status: ${HTTP_STATUS})${NC}"
    echo -e "${RED}Response:${NC} ${HTTP_BODY}"
    exit 1
fi
