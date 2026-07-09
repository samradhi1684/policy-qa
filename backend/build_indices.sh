#!/bin/bash
set -euo pipefail

# ========================================================
# Chatai - Build/Update Indices Script
# Location: backend/build_indices.sh
# ========================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSWERING_DIR="${PROJECT_ROOT}/app/answering"
INDICES_DIR="${ANSWERING_DIR}/indices"

TRIPLETS_FILE="triplets_zeroshot.json"
CREATE_SCRIPT="z_entity_create.py"

BACKEND_SERVICE="backend"

echo "=== Chatai - Build Indices Validation & Runner ==="
echo "Project Root  : ${PROJECT_ROOT}"
echo "Answering Dir : ${ANSWERING_DIR}"
echo "Indices Dir   : ${INDICES_DIR}"
echo "----------------------------------------"

# === VALIDATION PHASE ===
echo "🔍 Validating setup..."

ERROR=0

# Check directories
if [[ ! -d "${ANSWERING_DIR}" ]]; then
    echo "❌ ERROR: answering directory not found at ${ANSWERING_DIR}"
    ERROR=1
fi

if [[ ! -d "${INDICES_DIR}" ]]; then
    echo "⚠️  indices subdirectory not found (will be used for output)"
fi

# Check required files in answering/
if [[ -f "${ANSWERING_DIR}/${TRIPLETS_FILE}" ]]; then
    echo "✅ ${TRIPLETS_FILE} found in answering/"
else
    echo "❌ ${TRIPLETS_FILE} missing in answering/"
    ERROR=1
fi

if [[ -f "${ANSWERING_DIR}/${CREATE_SCRIPT}" ]]; then
    echo "✅ ${CREATE_SCRIPT} found in answering/"
else
    echo "❌ ${CREATE_SCRIPT} missing in answering/"
    ERROR=1
fi

if [[ ${ERROR} -eq 1 ]]; then
    echo ""
    echo "❌ Some files are missing. Please place them correctly."
    echo ""
    echo "Required structure:"
    echo "backend/app/answering/"
    echo "├── triplets_zeroshot.json"
    echo "├── z_entity_create.py"
    echo "├── z_entity_query.py"
    echo "└── indices/"
    echo "    ├── Z_chunk_index.joblib     (will be created)"
    echo "    ├── Z_entity_index.joblib    (will be created)"
    echo "    └── Z_tfidf_data.joblib      (will be created)"
    exit 1
fi

echo ""
echo "🎉 All checks passed! Setup looks correct."
echo ""

# If user passes --build flag, actually run it
if [[ "${1:-}" == "--build" ]]; then
    echo "🚀 Starting index build..."
    
    # Run from answering directory
    cd "${ANSWERING_DIR}"
    
    # Backup old indices
    BACKUP_DIR="${INDICES_DIR}/backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "${BACKUP_DIR}"
    cp -v "${INDICES_DIR}"/Z_*.joblib ./*.json "${BACKUP_DIR}/" 2>/dev/null || true
    
    # Run the creation script
    python3 "${CREATE_SCRIPT}"
    
    echo "✅ Build completed."
    
    # Restart backend
    echo "Restarting backend service..."
    cd "${PROJECT_ROOT}"
    docker compose restart "${BACKEND_SERVICE}"
    
    echo "🎉 Done!"
else
    echo "To actually build the indices, run:"
    echo "   ./build_indices.sh --build"
fi