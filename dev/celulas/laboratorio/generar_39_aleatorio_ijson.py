#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import random
import ijson
import numpy as np
from decimal import Decimal

BASE_DIR = "/opt/dragon3/dev/celulas"
BACKUP_DIR = os.path.join(BASE_DIR, "backup_datos")
LAB_DIR = os.path.join(BASE_DIR, "dev/celulas/laboratorio")

JSON_FILES = [
    os.path.join(BACKUP_DIR, "descarga_1_combinado.json"),
    # Si necesitas más, añádelos
]

FEATURE_NAMES = [
    "varianzaLocalPromedio_art", "autocorrelacion_art", "correlacion_art",
    "diversidad_art", "variacionBrillo", "contraste", "gradienteLuz",
    "brilloSI", "brilloSD", "brilloII", "brilloID", "luzArriba",
    "iluminacionUniforme", "gradienteAnormal", "sombrasInconsistentes",
    "contrasteAnormal", "varianzaLocalPromedio_text", "entropia",
    "gradientePromedio", "varianzaRuido", "autocorrelacionNormalizada",
    "saturacionAprox", "dominancia", "variacionCromatica", "relacionRB",
    "porcentajePielIrreal", "temp_neutra", "temp_calida", "temp_fria",
    "autocorrelacion_forense", "hasExif", "hasICC", "hasDate", "hasXMP",
    "relacionRuidoTextura", "regularidad", "bordesRuido",
    "desequilibrioCromatico", "uniformidadBrillo"
]

def to_float(val):
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0

def extraer_39_features(datosCelulas):
    vals = {name: 0.0 for name in FEATURE_NAMES}
    # Artefactos
    art = datosCelulas.get("detectar-artefactos-ia", {})
    if not isinstance(art, dict):
        art = {}
    vals["varianzaLocalPromedio_art"] = to_float(art.get("varianzaLocalPromedio"))
    vals["autocorrelacion_art"] = to_float(art.get("autocorrelacion"))
    vals["correlacion_art"] = to_float(art.get("correlacion"))
    vals["diversidad_art"] = to_float(art.get("diversidad"))
    # Sombreado
    som = datosCelulas.get("detectar-sombreado", {})
    if not isinstance(som, dict):
        som = {}
    vals["variacionBrillo"] = to_float(som.get("variacionBrillo"))
    vals["contraste"] = to_float(som.get("contraste"))
    vals["gradienteLuz"] = to_float(som.get("gradienteLuz"))
    vals["luzArriba"] = 1.0 if som.get("luzArriba") else 0.0
    vals["iluminacionUniforme"] = 1.0 if som.get("iluminacionUniforme") else 0.0
    vals["gradienteAnormal"] = 1.0 if som.get("gradienteAnormal") else 0.0
    vals["sombrasInconsistentes"] = 1.0 if som.get("sombrasInconsistentes") else 0.0
    vals["contrasteAnormal"] = 1.0 if som.get("contrasteAnormal") else 0.0
    bq = som.get("brilloCuadrantes", {})
    if not isinstance(bq, dict):
        bq = {}
    vals["brilloSI"] = to_float(bq.get("superiorIzquierda"))
    vals["brilloSD"] = to_float(bq.get("superiorDerecha"))
    vals["brilloII"] = to_float(bq.get("inferiorIzquierda"))
    vals["brilloID"] = to_float(bq.get("inferiorDerecha"))
    # Textura
    tex = datosCelulas.get("detectar-textura-ruido", {})
    if not isinstance(tex, dict):
        tex = {}
    vals["varianzaLocalPromedio_text"] = to_float(tex.get("varianzaLocalPromedio"))
    vals["entropia"] = to_float(tex.get("entropia"))
    vals["gradientePromedio"] = to_float(tex.get("gradientePromedio"))
    vals["varianzaRuido"] = to_float(tex.get("varianzaRuido"))
    vals["autocorrelacionNormalizada"] = to_float(tex.get("autocorrelacionNormalizada"))
    # Color
    col = datosCelulas.get("detectar-colores", {})
    if not isinstance(col, dict):
        col = {}
    vals["saturacionAprox"] = to_float(col.get("saturacionAprox"))
    vals["dominancia"] = to_float(col.get("dominancia"))
    vals["variacionCromatica"] = to_float(col.get("variacionCromatica"))
    vals["relacionRB"] = to_float(col.get("relacionRB"))
    vals["porcentajePielIrreal"] = to_float(col.get("porcentajePielIrreal"))
    temp = col.get("temperatura", {})
    if isinstance(temp, dict):
        vals["temp_neutra"] = 1.0 if temp.get("neutra") else 0.0
        vals["temp_calida"] = 1.0 if temp.get("calida") else 0.0
        vals["temp_fria"] = 1.0 if temp.get("fria") else 0.0
    elif isinstance(temp, str):
        temp_str = temp.lower()
        vals["temp_neutra"] = 1.0 if temp_str == "neutra" else 0.0
        vals["temp_calida"] = 1.0 if temp_str == "calida" else 0.0
        vals["temp_fria"] = 1.0 if temp_str == "fria" else 0.0
    # Forense
    fore = datosCelulas.get("detectar-patrones-forenses", {})
    if not isinstance(fore, dict):
        fore = {}
    vals["autocorrelacion_forense"] = to_float(fore.get("autocorrelacion"))
    # EXIF
    exif = datosCelulas.get("extraer-metadatos-exif", {})
    if not isinstance(exif, dict):
        exif = {}
    vals["hasExif"] = 1.0 if exif.get("hasExif") else 0.0
    vals["hasICC"] = 1.0 if exif.get("hasICC") else 0.0
    vals["hasDate"] = 1.0 if exif.get("hasDate") else 0.0
    vals["hasXMP"] = 1.0 if exif.get("hasXMP") else 0.0
    # Derivadas
    v_ruido = vals["varianzaRuido"]
    v_textura = vals["varianzaLocalPromedio_text"]
    vals["relacionRuidoTextura"] = v_ruido / (v_textura + 0.001)
    autocorr_norm = vals["autocorrelacionNormalizada"]
    entropia = vals["entropia"]
    vals["regularidad"] = autocorr_norm / (entropia + 0.001)
    grad = vals["gradientePromedio"]
    vals["bordesRuido"] = grad / (v_ruido + 0.001)
    relacion_rb = vals["relacionRB"]
    vals["desequilibrioCromatico"] = relacion_rb - 1.0
    brillos = [vals["brilloSI"], vals["brilloSD"], vals["brilloII"], vals["brilloID"]]
    vals["uniformidadBrillo"] = max(brillos) - min(brillos)
    return [vals[name] for name in FEATURE_NAMES]

def generar_dataset_aleatorio():
    print("=" * 80)
    print("GENERACIÓN ALEATORIA DE 200 MUESTRAS (39 features) con ijson")
    print("=" * 80)

    # Primera pasada: recolectar TODOS los documentos (solo los necesarios)
    humanos = []
    ias = []

    for json_file in JSON_FILES:
        if not os.path.isfile(json_file):
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
                # Para no cargar demasiado, paramos cuando tengamos suficientes
                if len(humanos) >= 500 and len(ias) >= 500:
                    break
        if len(humanos) >= 500 and len(ias) >= 500:
            break

    print(f"\n✅ Recolectados: {len(humanos)} humanos, {len(ias)} IA")

    # Seleccionar 100 de cada aleatoriamente (misma semilla que el script original)
    random.seed(42)
    humanos_sel = random.sample(humanos, 100)
    ias_sel = random.sample(ias, 100)
    muestra = humanos_sel + ias_sel
    random.shuffle(muestra)

    # Extraer features
    X_list = []
    y_list = []

    for doc in muestra:
        datosCelulas = doc.get("datosCelulas", {})
        if not datosCelulas:
            continue
        features = extraer_39_features(datosCelulas)
        if len(features) == 39:
            target = 1 if "IA" in doc.get("comentarioFeedback", "") else 0
            X_list.append(features)
            y_list.append(target)

    print(f"Extraídas: {len(X_list)} muestras")

    if len(X_list) < 200:
        print("❌ No se llegó a 200 muestras.")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)

    print(f"\n✅ Dataset generado:")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")
    print(f"   Distribución: {np.bincount(y)} (0=Humano, 1=IA)")

    os.makedirs(LAB_DIR, exist_ok=True)
    np.save(os.path.join(LAB_DIR, "X_39_200_aleatorio.npy"), X)
    np.save(os.path.join(LAB_DIR, "y_39_200_aleatorio.npy"), y)

    print("\n💾 Archivos guardados como:")
    print(f"   {os.path.join(LAB_DIR, 'X_39_200_aleatorio.npy')}")
    print(f"   {os.path.join(LAB_DIR, 'y_39_200_aleatorio.npy')}")

if __name__ == "__main__":
    generar_dataset_aleatorio()
