#!/bin/bash

# ====================================================================
# DRAGON3 - DOCKER TRAINING SCRIPT
# ====================================================================

set -e
set -u

PROJECT_ROOT="/opt/dragon3/prod/Dragon3/backend"
MODELS_DIR="${PROJECT_ROOT}/servicios/redSuperior/models"
DOCKER_IMAGE="dragon3-training"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "🐉 Dragon3 - Training con Docker"
echo ""

# Validar directorio
if [ ! -f "package.json" ]; then
    log_error "Ejecuta desde /opt/dragon3/prod/Dragon3/backend"
    exit 1
fi

# Validar Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker no instalado"
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon no corriendo"
    exit 1
fi

log_success "Validaciones: OK"
echo ""

# Crear directorio models
log_info "Creando directorio models..."
mkdir -p "${MODELS_DIR}"
log_success "Directorio: ${MODELS_DIR}"
echo ""

# Backup modelos existentes
if [ -d "${MODELS_DIR}" ] && [ "$(ls -A ${MODELS_DIR} 2>/dev/null)" ]; then
    log_info "Creando backup modelos existentes..."
    BACKUP_DIR="${MODELS_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    cp -r "${MODELS_DIR}" "${BACKUP_DIR}"
    log_success "Backup: ${BACKUP_DIR}"
    echo ""
fi

# Build imagen Docker
log_info "🔨 Construyendo imagen Docker (2-5 min)..."
echo ""

if docker build -f Dockerfile.training -t "${DOCKER_IMAGE}:latest" . 2>&1; then
    echo ""
    log_success "Imagen construida exitosamente"
    IMAGE_SIZE=$(docker images "${DOCKER_IMAGE}:latest" --format "{{.Size}}")
    log_info "Tamaño: ${IMAGE_SIZE}"
else
    echo ""
    log_error "Error construyendo imagen Docker"
    exit 1
fi

echo ""

# Entrenar modelos
log_info "🚀 Entrenando modelos (2-5 min)..."
log_info "Logs de entrenamiento:"
echo ""
echo "================================================================"

if docker run --rm \
    -v "${MODELS_DIR}:/app/servicios/redSuperior/models" \
    "${DOCKER_IMAGE}:latest" 2>&1; then

    echo "================================================================"
    echo ""
    log_success "✅ Entrenamiento completado"
else
    echo "================================================================"
    echo ""
    log_error "❌ Error en entrenamiento"
    exit 1
fi

echo ""

# Verificar modelos
log_info "📊 Verificando modelos exportados..."

EXPECTED_MODELS=(
    "exif_camera.json"
    "exif_editing.json"
    "texture.json"
    "gan_artifacts.json"
    "diffusion_artifacts.json"
    "sharpness.json"
    "compression.json"
    "c2pa.json"
    "resolution.json"
    "metadata.json"
    "red_mayor.json"
    "training_summary.json"
)

MISSING=0
for model in "${EXPECTED_MODELS[@]}"; do
    if [ -f "${MODELS_DIR}/${model}" ]; then
        SIZE=$(stat -c%s "${MODELS_DIR}/${model}" 2>/dev/null || echo "?")
        log_success "✓ ${model} (${SIZE} bytes)"
    else
        log_error "✗ ${model} FALTANTE"
        MISSING=$((MISSING + 1))
    fi
done

echo ""

if [ $MISSING -eq 0 ]; then
    log_success "Todos los modelos exportados correctamente"
    log_info "📁 Ubicación: ${MODELS_DIR}"

    if [ -f "${MODELS_DIR}/training_summary.json" ]; then
        echo ""
        log_info "📊 Resumen: cat ${MODELS_DIR}/training_summary.json"
    fi

    echo ""
    log_success "✅ TRAINING COMPLETADO EXITOSAMENTE"
    echo ""
    log_info "🚀 Próximo paso: node server.js"

    exit 0
else
    log_error "${MISSING} modelos faltantes"
    exit 1
fi
