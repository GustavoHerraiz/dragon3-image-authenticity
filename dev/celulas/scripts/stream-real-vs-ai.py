#!/usr/bin/env python3
"""
Streaming del dataset real-vs-ai-corpus.
Descarga imágenes sobre la marcha y las envía a las carpetas calientes.
"""

import os
import time
import base64
from io import BytesIO
from PIL import Image
from datasets import load_dataset
import requests

# ============================================
# CONFIGURACIÓN
# ============================================

BASE_DIR = "/opt/dragon3/dev/celulas/dataset"
HOT_HUMANAS = os.path.join(BASE_DIR, "hot", "humanas")
HOT_IA = os.path.join(BASE_DIR, "hot", "ia")

MAX_IMAGENES = 1000  # Cambiar a 0 para infinito
MAX_POR_LOTE = 100
PAUSA_ENTRE_LOTES = 10

# ============================================
# FUNCIONES
# ============================================

def guardar_imagen(image, label):
    carpeta = HOT_HUMANAS if label == "real" else HOT_IA
    timestamp = int(time.time() * 1000)
    filename = f"stream_{label}_{timestamp}.jpg"
    filepath = os.path.join(carpeta, filename)
    image.save(filepath, "JPEG", quality=85)
    return filepath

def main():
    print("🚀 Iniciando streaming de real-vs-ai-corpus...")
    print(f"📂 Humanas: {HOT_HUMANAS}")
    print(f"📂 IA: {HOT_IA}")
    print("")

    print("⏳ Cargando dataset en streaming...")
    ds = load_dataset(
        "Zitacron/real-vs-ai-corpus",
        streaming=True,
        split="train"
    )

    print("✅ Dataset cargado. Comenzando procesamiento...")
    print("")

    total = 0
    real_count = 0
    ai_count = 0

    for i, example in enumerate(ds):
        if MAX_IMAGENES > 0 and i >= MAX_IMAGENES:
            break

        try:
            image = example["image"]
            # ✅ CORREGIDO: 0 = real, 1 = ai
            label = "real" if example["label"] == 0 else "ai"

            guardar_imagen(image, label)

            if label == "real":
                real_count += 1
            else:
                ai_count += 1
            total += 1

            if total % 100 == 0:
                print(f"�� Procesadas: {total} (Real: {real_count}, AI: {ai_count})")

        except Exception as e:
            print(f"⚠️ Error en imagen {i}: {e}")
            continue

    print("")
    print("✅ Procesamiento completado")
    print(f"📊 Total: {total} (Real: {real_count}, AI: {ai_count})")

if __name__ == "__main__":
    main()