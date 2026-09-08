#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Predictor XGBoost persistente para la célula ML de Dragon3."""

import sys
import os
import json
import base64
import tempfile
import time
import pickle
import numpy as np
import xgboost as xgb

# Asegurar que el directorio del laboratorio está en el path para importar el extractor
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAB_DIR = os.environ.get("DRAGON3_LAB_DIR", os.path.join(BASE_DIR, "laboratorio"))
sys.path.insert(0, LAB_DIR)

from extractor_features_corregido import extraer_features_corregido

# Ruta al modelo optimizado
MODEL_PATH = os.environ.get(
    "ML_MODEL_PATH",
    os.path.join(LAB_DIR, "modelo_xgboost_25000_optimizado.pkl")
)

# Nombres de las 69 features en el orden exacto (definido en generar_69_*.py)
FEATURE_NAMES = [
    "mean", "median", "std", "min", "max",
    "r0","r1","r2","r3","r4","r5","r6","r7",
    "g0","g1","g2","g3","g4","g5","g6","g7",
    "b0","b1","b2","b3","b4","b5","b6","b7",
    "dct_mean", "dct_std", "dct_energy",
    "hog_mean", "hog_std", "hog_sum",
    "lbp0","lbp1","lbp2","lbp3","lbp4","lbp5","lbp6","lbp7",
    "lbp_uniformity", "lbp_entropy",
    "glcm_contrast", "glcm_dissim", "glcm_homog", "glcm_energy", "glcm_corr",
    "cH1_mean","cH1_std","cH1_energy",
    "cV1_mean","cV1_std","cV1_energy",
    "cD1_mean","cD1_std","cD1_energy",
    "cH2_mean","cH2_std","cH2_energy",
    "cV2_mean","cV2_std","cV2_energy",
    "cD2_mean","cD2_std","cD2_energy"
]

def extraer_vector_features(feats):
    """Convierte el diccionario de features en un vector de 69 elementos (orden exacto)."""
    vec = []
    # raw_pixels
    for k in ['mean', 'median', 'std', 'min', 'max']:
        vec.append(feats['raw_pixels'][k])
    # color_histograms
    for c in ['r', 'g', 'b']:
        vec.extend(feats['color_histograms'][c])
    # dct
    vec.extend([feats['dct']['mean_high'], feats['dct']['std_high'], feats['dct']['energy_high']])
    # hog
    vec.extend([feats['hog']['mean'], feats['hog']['std'], feats['hog']['sum']])
    # lbp
    vec.extend(feats['lbp']['histogram'])
    vec.append(feats['lbp']['uniformity'])
    vec.append(feats['lbp']['entropy'])
    # glcm
    for k in ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']:
        vec.append(feats['glcm'][k])
    # wavelet
    for sub in ['cH1', 'cV1', 'cD1', 'cH2', 'cV2', 'cD2']:
        vec.append(feats['wavelet'][sub + '_mean'])
        vec.append(feats['wavelet'][sub + '_std'])
        vec.append(feats['wavelet'][sub + '_energy'])
    return vec

def cargar_modelo():
    with open(MODEL_PATH, 'rb') as f:
        return pickle.load(f)


def analizar(input_data, model):
    try:
        if not input_data:
            raise ValueError("No se recibió entrada")

        # Decodificar base64 a bytes
        try:
            img_bytes = base64.b64decode(input_data)
        except Exception as e:
            raise ValueError(f"Error decodificando base64: {e}")

        # Escribir imagen temporal
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(img_bytes)
            temp_path = f.name

        # Extraer features
        t_extract_start = time.time()
        try:
            feats = extraer_features_corregido(temp_path)
        except Exception as e:
            raise RuntimeError(f"Error en la extracción de features: {e}")
        finally:
            os.unlink(temp_path)

        if feats is None:
            raise RuntimeError("El extractor devolvió None")

        # Construir vector
        vec = extraer_vector_features(feats)
        X = np.array(vec, dtype=np.float64).reshape(1, -1)

        t_extract = (time.time() - t_extract_start) * 1000  # ms

        # Predecir
        t_pred_start = time.time()
        proba = model.predict_proba(X)[0]  # [prob_humano, prob_ia]
        pred_class = int(model.predict(X)[0])
        t_pred = (time.time() - t_pred_start) * 1000

        es_ia = (pred_class == 1)
        confianza = float(proba[1] if es_ia else proba[0])

        # Respuesta JSON
        respuesta = {
            "exito": True,
            "esIA": es_ia,
            "confianza": confianza,
            "tiempoExtraccionMs": round(t_extract, 2),
            "tiempoCargaModeloMs": 0,
            "tiempoPrediccionMs": round(t_pred, 2),
            "tiempoTotalMs": round(t_extract + t_pred, 2)
        }
        return respuesta

    except Exception as e:
        # Devolver error en JSON
        respuesta = {
            "exito": False,
            "error": str(e)
        }
        return respuesta


def main():
    try:
        model = cargar_modelo()
    except Exception as e:
        print(json.dumps({"exito": False, "error": f"Error cargando el modelo: {e}"}), flush=True)
        return 1

    for linea in sys.stdin:
        respuesta = analizar(linea.strip(), model)
        print(json.dumps(respuesta), flush=True)

    return 0

if __name__ == "__main__":
    sys.exit(main())
