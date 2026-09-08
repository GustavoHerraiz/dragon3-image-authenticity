#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import random
import tempfile
import base64
import ijson
import numpy as np
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
    vec = []
    for k in ['mean', 'median', 'std', 'min', 'max']:
        vec.append(feats['raw_pixels'][k])
    for c in ['r', 'g', 'b']:
        vec.extend(feats['color_histograms'][c])
    vec.extend([feats['dct']['mean_high'], feats['dct']['std_high'], feats['dct']['energy_high']])
    vec.extend([feats['hog']['mean'], feats['hog']['std'], feats['hog']['sum']])
    vec.extend(feats['lbp']['histogram'])
    vec.append(feats['lbp']['uniformity'])
    vec.append(feats['lbp']['entropy'])
    for k in ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']:
        vec.append(feats['glcm'][k])
    for sub in ['cH1', 'cV1', 'cD1', 'cH2', 'cV2', 'cD2']:
        vec.append(feats['wavelet'][sub + '_mean'])
        vec.append(feats['wavelet'][sub + '_std'])
        vec.append(feats['wavelet'][sub + '_energy'])
    return vec

def generar_dataset():
    print("=" * 80)
    print("GENERACIÓN DE 40000 MUESTRAS (69 features) CON ijson")
    print("=" * 80)

    humanos = []
    ias = []
    TARGET = 20000

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
                # Log cada 1000 documentos recolectados
                total_actual = len(humanos) + len(ias)
                if total_actual % 1000 == 0:
                    print(f"\r   Recolectados: {len(humanos)} humanos, {len(ias)} IA", end='')
                if len(humanos) >= TARGET and len(ias) >= TARGET:
                    break
        if len(humanos) >= TARGET and len(ias) >= TARGET:
            break

    print(f"\n✅ Recolectados: {len(humanos)} humanos, {len(ias)} IA")

    if len(humanos) < TARGET or len(ias) < TARGET:
        print("❌ No hay suficientes muestras. Se necesitan 20000 de cada clase.")
        sys.exit(1)

    random.seed(42)
    humanos_sel = random.sample(humanos, TARGET)
    ias_sel = random.sample(ias, TARGET)
    muestra = humanos_sel + ias_sel
    random.shuffle(muestra)

    print(f"🔍 Extrayendo features de {len(muestra)} imágenes...")
    X_list = []
    y_list = []

    for i, doc in enumerate(muestra):
        b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
        if not b64:
            continue

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

        if (i + 1) % 1000 == 0:
            print(f"   Procesadas {i+1}/{len(muestra)} (ok: {len(X_list)})")

    print(f"\n✅ Extraídas: {len(X_list)} muestras")

    if len(X_list) < 40000:
        print(f"❌ Solo se obtuvieron {len(X_list)} muestras (<40000).")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)

    print(f"\n📊 Dataset generado:")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")
    print(f"   Distribución: {np.bincount(y)} (0=Humano, 1=IA)")

    os.makedirs(LAB_DIR, exist_ok=True)
    np.save(os.path.join(LAB_DIR, "X_69_40000.npy"), X)
    np.save(os.path.join(LAB_DIR, "y_69_40000.npy"), y)

    print("\n💾 Archivos guardados en:")
    print(f"   {os.path.join(LAB_DIR, 'X_69_40000.npy')}")
    print(f"   {os.path.join(LAB_DIR, 'y_69_40000.npy')}")
    print("\n✅ Ahora ejecuta: python analisis_xgboost_40000.py")

if __name__ == "__main__":
    generar_dataset()
