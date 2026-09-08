#!/bin/bash

# ====================================================================
# DRAGON3 - SCRIPT DE ENTRENAMIENTO CON DOCKER
# ====================================================================
#
# Archivo: scripts/train-docker.sh
# Proyecto: Dragon3 - Sistema Autentificación IA Enterprise
# Versión: 1.0.0-FAANG-Docker
# Fecha: 2025-04-15
# Autor: Gustavo Herráiz (@GustavoHerraiz) - Lead Architect
#
# PROPÓSITO:
# Script automatizado para entrenar Red Superior usando Docker.
# Construye imagen, entrena modelos, exporta JSON al host.
#
# USO:
# cd /opt/dragon3/prod/Dragon3/backend
# chmod +x scripts/train-docker.sh
# ./scripts/train-docker.sh
#
# ====================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

PROJECT_ROOT="/opt/dragon3/prod/Dragon3/backend"
MODELS_DIR="${PROJECT_ROOT}/servicios/redSuperior/models"
DOCKER_IMAGE="dragon3-training"
DOCKER_TAG="latest"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# VALIDACIONES PRE-ENTRENAMIENTO
# ============================================================================

log_info "🐉 Dragon3 - Training con Docker (GitHub Consensus)"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    log_error "package.json no encontrado. Ejecuta desde /opt/dragon3/prod/Dragon3/backend"
    exit 1
fi

# Verificar que Docker está instalado
if ! command -v docker &> /dev/null; then
    log_error "Docker no está instalado. Instala con: sudo apt-get install docker.io"
    exit 1
fi

# Verificar que Docker está corriendo
if ! docker info &> /dev/null; then
    log_error "Docker daemon no está corriendo. Inicia con: sudo systemctl start docker"
    exit 1
fi

log_success "Validaciones pre-entrenamiento: OK"
echo ""

# ============================================================================
# CREAR DIRECTORIO MODELS
# ============================================================================

log_info "Creando directorio de modelos..."
mkdir -p "${MODELS_DIR}"
log_success "Directorio creado: ${MODELS_DIR}"
echo ""

# ============================================================================
# BACKUP DE MODELOS EXISTENTES
# ============================================================================

if [ -d "${MODELS_DIR}" ] && [ "$(ls -A ${MODELS_DIR})" ]; then
    log_warning "Modelos existentes detectados. Creando backup..."
    BACKUP_DIR="${MODELS_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    cp -r "${MODELS_DIR}" "${BACKUP_DIR}"
    log_success "Backup creado: ${BACKUP_DIR}"
    echo ""
fi

# ============================================================================
# BUILD DOCKER IMAGE
# ============================================================================

log_info "🔨 Construyendo imagen Docker (esto puede tardar 2-5 minutos)..."
echo ""

if docker build -f Dockerfile.training -t "${DOCKER_IMAGE}:${DOCKER_TAG}" .; then
    log_success "Imagen Docker construida exitosamente"

    # Mostrar tamaño de imagen
    IMAGE_SIZE=$(docker images "${DOCKER_IMAGE}:${DOCKER_TAG}" --format "{{.Size}}")
    log_info "Tamaño de imagen: ${IMAGE_SIZE}"
else
    log_error "Error construyendo imagen Docker"
    exit 1
fi

echo ""

# ============================================================================
# ENTRENAR MODELOS
# ============================================================================

log_info "🚀 Iniciando entrenamiento (esto puede tardar 2-5 minutos)..."
log_info "Los logs de entrenamiento se mostrarán a continuación:"
echo ""
echo "================================================================"

# Ejecutar contenedor con volume montado para exportar modelos
if docker run --rm \
    -v "${MODELS_DIR}:/app/servicios/redSuperior/models" \
    "${DOCKER_IMAGE}:${DOCKER_TAG}"; then

    echo "================================================================"
    echo ""
    log_success "✅ Entrenamiento completado exitosamente"
else
    echo "================================================================"
    echo ""
    log_error "❌ Error durante el entrenamiento"
    exit 1
fi

echo ""

# ============================================================================
# VERIFICAR MODELOS EXPORTADOS
# ============================================================================

log_info "Verificando modelos exportados..."

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

MISSING_MODELS=()

for model in "${EXPECTED_MODELS[@]}"; do
    if [ -f "${MODELS_DIR}/${model}" ]; then
        SIZE=$(stat -f%z "${MODELS_DIR}/${model}" 2>/dev/null || stat -c%s "${MODELS_DIR}/${model}" 2>/dev/null || echo "?")
        log_success "✓ ${model} (${SIZE} bytes)"
    else
        log_error "✗ ${model} NO ENCONTRADO"
        MISSING_MODELS+=("${model}")
    fi
done

echo ""

if [ ${#MISSING_MODELS[@]} -eq 0 ]; then
    log_success "Todos los modelos exportados correctamente"
else
    log_error "${#MISSING_MODELS[@]} modelos faltantes"
    exit 1
fi

echo ""

# ============================================================================
# MOSTRAR RESUMEN DE ENTRENAMIENTO
# ============================================================================

if [ -f "${MODELS_DIR}/training_summary.json" ]; then
    log_info "📊 Resumen de entrenamiento:"
    echo ""

    # Extraer métricas principales con jq (si está instalado)
    if command -v jq &> /dev/null; then
        RED_MAYOR_ACCURACY=$(jq -r '.training.redMayor.testAccuracy' "${MODELS_DIR}/training_summary.json")
        TOTAL_DURATION=$(jq -r '.totalDuration' "${MODELS_DIR}/training_summary.json")

        echo "  • Accuracy Red Mayor: ${RED_MAYOR_ACCURACY}"
        echo "  • Duración total: ${TOTAL_DURATION}"
    else
        log_warning "Instala 'jq' para ver resumen detallado: sudo apt-get install jq"
        echo "  • Ver resumen completo: cat ${MODELS_DIR}/training_summary.json"
    fi

    echo ""
fi

# ============================================================================
# LIMPIEZA OPCIONAL
# ============================================================================

read -p "¿Eliminar imagen Docker para liberar espacio? (s/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ss]$ ]]; then
    log_info "Eliminando imagen Docker..."
    docker rmi "${DOCKER_IMAGE}:${DOCKER_TAG}"
    log_success "Imagen eliminada. Puedes reconstruirla ejecutando este script nuevamente."
else
    log_info "Imagen Docker conservada: ${DOCKER_IMAGE}:${DOCKER_TAG}"
    log_info "Para eliminarla manualmente: docker rmi ${DOCKER_IMAGE}:${DOCKER_TAG}"
fi

echo ""

# ============================================================================
# RESUMEN FINAL
# ============================================================================

log_success "================================================================"
log_success "🎉 ENTRENAMIENTO COMPLETADO EXITOSAMENTE"
log_success "================================================================"
echo ""
log_info "📁 Modelos guardados en: ${MODELS_DIR}"
log_info "📊 Resumen: ${MODELS_DIR}/training_summary.json"
echo ""
log_info "🚀 Próximo paso: Arrancar servidor producción con modelos pre-entrenados"
log_info "   cd /opt/dragon3/prod/Dragon3/backend"
log_info "   node server.js"
echo ""
log_success "✅ Servidor producción usará Brain.js CPU-only (sin build tools)"
echo ""
