#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generador de dataset de 39 features (manuales de Dragon3) a partir de los JSONs de backup.
Lee los 5 archivos de forma perezosa con ijson, sin cargar todo en memoria.
Selecciona 100 muestras de clase 0 (humano) y 100 de clase 1 (IA).
Guarda X_39_200.npy e y_39_200.npy en el directorio actual.
"""

import os
import sys
import json
import ijson
import numpy as np
from pathlib import Path

# ============================================================
# 1. CONFIGURACIÓN
# ============================================================
BASE_DIR = "/opt/dragon3/dev/celulas"
BACKUP_DIR = os.path.join(BASE_DIR, "backup_datos")
LAB_DIR = os.path.join(BASE_DIR, "dev/celulas/laboratorio")

# Lista de archivos JSON de backup
JSON_FILES = [
    os.path.join(BACKUP_DIR, "descarga_1_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_2_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_3_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_4_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_5_combinado.json"),
]

# Nombres de las 39 features (orden exacto)
FEATURE_NAMES = [
    "varianzaLocalPromedio_art",
    "autocorrelacion_art",
    "correlacion_art",
    "diversidad_art",
    "variacionBrillo",
    "contraste",
    "gradienteLuz",
    "brilloSI",
    "brilloSD",
    "brilloII",
    "brilloID",
    "luzArriba",
    "iluminacionUniforme",
    "gradienteAnormal",
    "sombrasInconsistentes",
    "contrasteAnormal",
    "varianzaLocalPromedio_text",
    "entropia",
    "gradientePromedio",
    "varianzaRuido",
    "autocorrelacionNormalizada",
    "saturacionAprox",
    "dominancia",
    "variacionCromatica",
    "relacionRB",
    "porcentajePielIrreal",
    "temp_neutra",
    "temp_calida",
    "temp_fria",
    "autocorrelacion_forense",
    "hasExif",
    "hasICC",
    "hasDate",
    "hasXMP",
    "relacionRuidoTextura",
    "regularidad",
    "bordesRuido",
    "desequilibrioCromatico",
    "uniformidadBrillo"
]
NUM_FEATURES = len(FEATURE_NAMES)

# ============================================================
# 2. FUNCIÓN DE EXTRACCIÓN DE 39 FEATURES (a partir de datosCelulas)
# ============================================================
def extraer_39_features(datosCelulas):
    """
    Extrae las 39 features manuales a partir del diccionario datosCelulas.
    Esta función debe adaptarse a la estructura real de tus JSONs.
    Aquí se proporciona una implementación genérica que asume las claves
    típicas de las células de Dragon3.

    Parámetros:
        datosCelulas (dict): diccionario con resultados de las células.

    Retorna:
        list: lista de 39 valores (float/int) en el orden de FEATURE_NAMES.
    """
    # Inicializar diccionario de valores con 0.0 por defecto
    vals = {name: 0.0 for name in FEATURE_NAMES}

    # --- Extracción de métricas de las células ---
    # Se asume que cada célula tiene una clave en datosCelulas
    # y dentro de ella los campos correspondientes.

    # 1. Artefactos IA (detectar-artefactos-ia)
    art = datosCelulas.get("detectar-artefactos-ia", {})
    vals["varianzaLocalPromedio_art"] = art.get("varianzaLocalPromedio", 0.0)
    vals["autocorrelacion_art"] = art.get("autocorrelacion", 0.0)
    vals["correlacion_art"] = art.get("correlacion", 0.0)
    vals["diversidad_art"] = art.get("diversidad", 0.0)

    # 2. Sombreado (detectar-sombreado)
    som = datosCelulas.get("detectar-sombreado", {})
    vals["variacionBrillo"] = som.get("variacionBrillo", 0.0)
    vals["contraste"] = som.get("contraste", 0.0)
    vals["gradienteLuz"] = som.get("gradienteLuz", 0.0)
    vals["luzArriba"] = 1.0 if som.get("luzArriba", False) else 0.0
    vals["iluminacionUniforme"] = 1.0 if som.get("iluminacionUniforme", False) else 0.0
    vals["gradienteAnormal"] = 1.0 if som.get("gradienteAnormal", False) else 0.0
    vals["sombrasInconsistentes"] = 1.0 if som.get("sombrasInconsistentes", False) else 0.0
    vals["contrasteAnormal"] = 1.0 if som.get("contrasteAnormal", False) else 0.0

    # 3. Brillo por cuadrantes (brilloCuadrantes)
    bq = som.get("brilloCuadrantes", {})
    vals["brilloSI"] = bq.get("superiorIzquierda", 0.0)
    vals["brilloSD"] = bq.get("superiorDerecha", 0.0)
    vals["brilloII"] = bq.get("inferiorIzquierda", 0.0)
    vals["brilloID"] = bq.get("inferiorDerecha", 0.0)

    # 4. Textura y ruido (detectar-textura-ruido)
    tex = datosCelulas.get("detectar-textura-ruido", {})
    vals["varianzaLocalPromedio_text"] = tex.get("varianzaLocalPromedio", 0.0)
    vals["entropia"] = tex.get("entropia", 0.0)
    vals["gradientePromedio"] = tex.get("gradientePromedio", 0.0)
    vals["varianzaRuido"] = tex.get("varianzaRuido", 0.0)
    vals["autocorrelacionNormalizada"] = tex.get("autocorrelacionNormalizada", 0.0)

    # 5. Color (detectar-colores)
    col = datosCelulas.get("detectar-colores", {})
    vals["saturacionAprox"] = col.get("saturacionAprox", 0.0)
    vals["dominancia"] = col.get("dominancia", 0.0)
    vals["variacionCromatica"] = col.get("variacionCromatica", 0.0)
    vals["relacionRB"] = col.get("relacionRB", 0.0)
    vals["porcentajePielIrreal"] = col.get("porcentajePielIrreal", 0.0)
    # Temperaturas (dummies)
    temp = col.get("temperatura", {})
    vals["temp_neutra"] = 1.0 if temp.get("neutra", False) else 0.0
    vals["temp_calida"] = 1.0 if temp.get("calida", False) else 0.0
    vals["temp_fria"] = 1.0 if temp.get("fria", False) else 0.0

    # 6. Forense (detectar-patrones-forenses)
    fore = datosCelulas.get("detectar-patrones-forenses", {})
    vals["autocorrelacion_forense"] = fore.get("autocorrelacion", 0.0)

    # 7. Metadatos EXIF (extraer-metadatos-exif)
    exif = datosCelulas.get("extraer-metadatos-exif", {})
    vals["hasExif"] = 1.0 if exif.get("hasExif", False) else 0.0
    vals["hasICC"] = 1.0 if exif.get("hasICC", False) else 0.0
    vals["hasDate"] = 1.0 if exif.get("hasDate", False) else 0.0
    vals["hasXMP"] = 1.0 if exif.get("hasXMP", False) else 0.0

    # 8. Features derivadas (se calculan a partir de las anteriores)
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

    # Devolver los valores en el orden de FEATURE_NAMES
    return [vals[name] for name in FEATURE_NAMES]

# ============================================================
# 3. GENERACIÓN DEL DATASET (200 muestras balanceadas)
# ============================================================
def generar_dataset():
    print("=" * 80)
    print("GENERACIÓN DE DATASET DE 39 FEATURES (200 muestras balanceadas)")
    print("=" * 80)

    # Verificar que los archivos JSON existen
    for f in JSON_FILES:
        if not os.path.isfile(f):
            print(f"❌ ERROR: No se encuentra {f}")
            sys.exit(1)

    X_list = []
    y_list = []
    contador = 0

    for json_file in JSON_FILES:
        print(f"\n📂 Procesando: {os.path.basename(json_file)}")
        try:
            with open(json_file, 'rb') as f:
                # Iterar sobre cada documento sin cargar el JSON completo
                for doc in ijson.items(f, 'item'):
                    # Extraer target de comentarioFeedback
                    feedback = doc.get("comentarioFeedback", "")
                    if "IA" in feedback:
                        target = 1
                    elif "humano" in feedback:
                        target = 0
                    else:
                        # Si no es ninguno, se ignora
                        continue

                    # Extraer datosCelulas (donde están las métricas)
                    datosCelulas = doc.get("datosCelulas", {})
                    if not datosCelulas:
                        continue

                    # Extraer las 39 features
                    features = extraer_39_features(datosCelulas)

                    # Verificar que tenemos 39 valores
                    if len(features) != 39:
                        print(f"  ⚠️ Advertencia: se extrajeron {len(features)} features, se esperaban 39.")
                        continue

                    # Guardar si aún necesitamos muestras de esa clase
                    if target == 0 and len([y for y in y_list if y == 0]) < 100:
                        X_list.append(features)
                        y_list.append(0)
                        contador += 1
                        print(f"\r  Muestras recolectadas: {contador} / 200", end='')
                    elif target == 1 and len([y for y in y_list if y == 1]) < 100:
                        X_list.append(features)
                        y_list.append(1)
                        contador += 1
                        print(f"\r  Muestras recolectadas: {contador} / 200", end='')

                    # Si ya tenemos 200, terminamos
                    if len(X_list) >= 200:
                        print("\n  ✅ Dataset completo (200 muestras).")
                        break
        except Exception as e:
            print(f"\n  ❌ Error al procesar {json_file}: {e}")
            continue

        if len(X_list) >= 200:
            break

    if len(X_list) < 200:
        print(f"\n❌ No se pudieron recolectar 200 muestras. Se obtuvieron {len(X_list)}.")
        print("   Revisa que los JSONs tengan suficientes documentos de ambas clases.")
        sys.exit(1)

    # Convertir a arrays numpy
    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)

    print(f"\n✅ Dataset generado:")
    print(f"   X shape: {X.shape} (esperado (200,39))")
    print(f"   y shape: {y.shape} (esperado (200,))")
    print(f"   Distribución de clases: {np.bincount(y)} (0=Humano, 1=IA)")

    # ============================================================
    # 4. GUARDADO DE ARCHIVOS .NPY
    # ============================================================
    # Asegurar que el directorio laboratorio existe
    os.makedirs(LAB_DIR, exist_ok=True)

    X_path = os.path.join(LAB_DIR, "X_39_200.npy")
    y_path = os.path.join(LAB_DIR, "y_39_200.npy")

    np.save(X_path, X)
    np.save(y_path, y)

    print(f"\n💾 Archivos guardados en:")
    print(f"   {X_path}")
    print(f"   {y_path}")

    print("\n✅ ¡Listo! Ahora puedes ejecutar el análisis con:")
    print("   python analisis_39.py")

# ============================================================
# 5. EJECUCIÓN PRINCIPAL
# ============================================================
if __name__ == "__main__":
    generar_dataset()
