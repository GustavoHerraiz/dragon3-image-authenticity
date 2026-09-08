#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../engine" && pwd)"
MODEL_PATH="${ML_MODEL_PATH:-$ENGINE_DIR/laboratorio/modelo_xgboost_25000_optimizado.pkl}"
PYTHON_BIN="$ENGINE_DIR/laboratorio/venv_ml/bin/python"

mkdir -p "$ENGINE_DIR/laboratorio"

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Missing ML model: $MODEL_PATH" >&2
  echo "Provide ML_MODEL_PATH or install the model artifact outside Git." >&2
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  python3 -m venv "$ENGINE_DIR/laboratorio/venv_ml"
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r "$ENGINE_DIR/requirements-ml.txt"
fi

cd "$ENGINE_DIR"
npm ci --omit=dev
node --check agent-embassy.js
node --check orquestador.js

printf 'Production engine bootstrap complete.\n'
printf 'Engine: %s\n' "$ENGINE_DIR"
printf 'Model: %s\n' "$MODEL_PATH"
