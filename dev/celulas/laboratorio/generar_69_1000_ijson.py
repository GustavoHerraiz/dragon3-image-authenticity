#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import random
import tempfile
import base64
import ijson
import numpy as np
from pathlib import Path
from extractor_features_corregido import extraer_features_corregido

BASE_DIR = "/opt/dragon3/dev/celulas"
BACKUP_DIR = os.path.join(BASE_DIR, "backup_datos")
LAB_DIR = "/opt/dragon3/dev/celulas/laboratorio"

JSON_FILES = [
    os.path.join(BACKUP_DIR, "descarga_1_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_2_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_3_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_4_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_5_combinado.json"),
]

def extraer_vector_features(feats):
    """Convierte el diccionario de features en un vector de 69 elementos (orden exacto)."""
    vec = []
    # raw_pixels: mean, median, std, min, max
    for k in ['mean', 'median', 'std', 'min', 'max']:
        vec.append(feats['raw_pixels'][k])
    # color_histograms: r0..r7, g0..g7, b0..b7
    for c in ['r', 'g', 'b']:
        vec.extend(feats['color_histograms'][c])
    # dct: mean_high, std_high, energy_high
    vec.extend([feats['dct']['mean_high'], feats['dct']['std_high'], feats['dct']['energy_high']])
    # hog: mean, std, sum
    vec.extend([feats['hog']['mean'], feats['hog']['std'], feats['hog']['sum']])
    # lbp: histogram (8 bins) + uniformity + entropy
    vec.extend(feats['lbp']['histogram'])
    vec.append(feats['lbp']['uniformity'])
    vec.append(feats['lbp']['entropy'])
    # glcm: 5 propiedades
    for k in ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']:
        vec.append(feats['glcm'][k])
    # wavelet: 6 subbandas × 3 estadísticos = 18
    for sub in ['cH1', 'cV1', 'cD1', 'cH2', 'cV2', 'cD2']:
        vec.append(feats['wavelet'][sub + '_mean'])
        vec.append(feats['wavelet'][sub + '_std'])
        vec.append(feats['wavelet'][sub + '_energy'])
    return vec

def generar_dataset():
    print("=" * 80)
    print("GENERACIÓN DE 1000 MUESTRAS (69 features) CON ijson")
    print("=" * 80)

    humanos = []
    ias = []

    for json_file in JSON_FILES:
        if not os.path.isfile(json_file):
            print(f"⚠️ No se encuentra {json_file}, omitiendo...")
            continue
        print(f"\n📂 Leyendo: {os.path.basename(json_file)}")
        with open(json_file, 'rb') as f:
            for doc in ijson.items(f, 'item'):
                if not isinstance(doc, dict):
                    continue
                feedback = doc.get("comentarioFeedback", "")
                if "IA" in feedback:
                    ias.append(doc)
                elif "humano" in feedback:
                    humanos.append(doc)
                # Para no consumir memoria, paramos cuando tengamos suficientes
                if len(humanos) >= 500 and len(ias) >= 500:
                    break
        if len(humanos) >= 500 and len(ias) >= 500:
            break

    print(f"\n✅ Recolectados: {len(humanos)} humanos, {len(ias)} IA")

    if len(humanos) < 500 or len(ias) < 500:
        print("❌ No hay suficientes muestras. Se necesitan 500 de cada clase.")
        sys.exit(1)

    # Seleccionar 500 de cada aleatoriamente (semilla 42, como el original)
    random.seed(42)
    humanos_sel = random.sample(humanos, 500)
    ias_sel = random.sample(ias, 500)
    muestra = humanos_sel + ias_sel
    random.shuffle(muestra)

    print(f"🔍 Extrayendo features de {len(muestra)} imágenes...")
    X_list = []
    y_list = []

    for i, doc in enumerate(muestra):
        b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
        if not b64:
            continue

        # Escribir imagen temporal
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(base64.b64decode(b64))
            temp_path = f.name

        try:
            feats = extraer_features_corregido(temp_path)
            if feats is None:
                continue
            vec = extraer_vector_features(feats)
            X_list.append(vec)
            y_list.append(1 if "IA" in doc.get("comentarioFeedback", "") else 0)
        except Exception as e:
            print(f"\n  ⚠️ Error en imagen {i+1}: {e}")
            continue
        finally:
            os.unlink(temp_path)

        if (i + 1) % 50 == 0:
            print(f"   Procesadas {i+1}/{len(muestra)} (ok: {len(X_list)})")

    print(f"\n✅ Extraídas: {len(X_list)} muestras")

    if len(X_list) < 1000:
        print(f"❌ Solo se obtuvieron {len(X_list)} muestras (<1000).")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)

    print(f"\n📊 Dataset generado:")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")
    print(f"   Distribución: {np.bincount(y)} (0=Humano, 1=IA)")

    os.makedirs(LAB_DIR, exist_ok=True)
    X_path = os.path.join(LAB_DIR, "X_69_1000.npy")
    y_path = os.path.join(LAB_DIR, "y_69_1000.npy")
    np.save(X_path, X)
    np.save(y_path, y)

    print(f"\n💾 Archivos guardados en:")
    print(f"   {X_path}")
    print(f"   {y_path}")

    print("\n✅ Ahora ejecuta: python analisis_69_1000.py")
    print("   (Script que hará validación cruzada de 5 folds)")

if __name__ == "__main__":
    generar_dataset()
