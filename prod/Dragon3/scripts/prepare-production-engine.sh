#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SOURCE="$ROOT/dev/celulas"
TARGET="$ROOT/prod/Dragon3/engine"

if [[ ! -d "$SOURCE" ]]; then
  echo "Source runtime not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$TARGET" "$TARGET/celulas" "$TARGET/planes" "$TARGET/servicios" \
  "$TARGET/telemetria" "$TARGET/scripts" "$TARGET/laboratorio" "$TARGET/modelos"

runtime_files=(
  agent-embassy.js catalogo.js cola.js defensa.js generador-plan.js
  orquestador.js planificador.js configuracion.json package.json package-lock.json
)
for file in "${runtime_files[@]}"; do
  cp "$SOURCE/$file" "$TARGET/$file"
done

rsync -a --delete --exclude='node_modules' "$SOURCE/celulas/" "$TARGET/celulas/"
rsync -a --delete "$SOURCE/planes/" "$TARGET/planes/"
rsync -a --delete "$SOURCE/servicios/" "$TARGET/servicios/"
rsync -a --delete --exclude='historial.json*' "$SOURCE/telemetria/" "$TARGET/telemetria/"
rsync -a --delete "$SOURCE/scripts/" "$TARGET/scripts/"

ml_files=(
  extractor_features_corregido.py modelo_xgboost_25000_optimizado.pkl
)
for file in "${ml_files[@]}"; do
  cp "$SOURCE/laboratorio/$file" "$TARGET/laboratorio/$file"
done
cp "$SOURCE/celulas/predictor_xgboost.py" "$TARGET/celulas/predictor_xgboost.py"
cp "$SOURCE/requirements-ml.txt" "$TARGET/requirements-ml.txt"
if [[ -d "$SOURCE/laboratorio/venv_ml" ]]; then
  rm -rf "$TARGET/laboratorio/venv_ml"
  cp -a "$SOURCE/laboratorio/venv_ml" "$TARGET/laboratorio/venv_ml"
fi

if [[ -d "$SOURCE/modelos" ]]; then
  rsync -a --delete "$SOURCE/modelos/" "$TARGET/modelos/"
fi

# Keep only runtime assets in the production copy.
rm -rf "$TARGET/planes/archivados" "$TARGET/celulas/__pycache__"
find "$TARGET/planes" -type f -name 'evolucion-*.json' -delete
find "$TARGET/celulas" -type f \( -name '*.backup_*' -o -name 'README*' -o -name '*.code-workspace' \) -delete
rm -f "$TARGET/celulas/celula-ml.mjs" "$TARGET/celulas/predictor_ml.py"
rm -f "$TARGET/scripts/ejecutar-agente.sh" "$TARGET/scripts/evolucionar.js" "$TARGET/scripts/stream-real-vs-ai.py"

# Rewrite runtime paths inside the isolated production copy only.
sed -i 's#/opt/dragon3/dev/celulas#/opt/dragon3/prod/Dragon3/engine#g' \
  "$TARGET"/planes/*.json
sed -i "s#path.resolve(__dirname, '../../prod/Dragon3/backend/.env')#path.resolve(__dirname, '../backend/.env')#" \
  "$TARGET/agent-embassy.js" "$TARGET/cola.js"
sed -i "s#path.resolve(__dirname, '../../prod/Dragon3/backend/.env')#path.resolve(__dirname, '../../backend/.env')#" \
  "$TARGET/scripts/watcher-dataset.js"
printf 'Production engine prepared at %s\n' "$TARGET"
printf 'Source remains untouched at %s\n' "$SOURCE"
