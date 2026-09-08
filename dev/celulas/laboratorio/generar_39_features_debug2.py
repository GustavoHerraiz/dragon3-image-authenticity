#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import traceback
import ijson
import numpy as np

BASE_DIR = "/opt/dragon3/dev/celulas"
BACKUP_DIR = os.path.join(BASE_DIR, "backup_datos")
LAB_DIR = os.path.join(BASE_DIR, "dev/celulas/laboratorio")

JSON_FILES = [
    os.path.join(BACKUP_DIR, "descarga_1_combinado.json"),
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

def extraer_39_features(datosCelulas):
    """Versión con verificación de tipos para depurar"""
    vals = {name: 0.0 for name in FEATURE_NAMES}
    
    # ---- Artefactos ----
    art = datosCelulas.get("detectar-artefactos-ia", {})
    if not isinstance(art, dict):
        print(f"  ⚠️ 'detectar-artefactos-ia' es {type(art)} en lugar de dict. Valor: {repr(art)}")
        art = {}
    vals["varianzaLocalPromedio_art"] = art.get("varianzaLocalPromedio", 0.0)
    vals["autocorrelacion_art"] = art.get("autocorrelacion", 0.0)
    vals["correlacion_art"] = art.get("correlacion", 0.0)
    vals["diversidad_art"] = art.get("diversidad", 0.0)

    # ---- Sombreado ----
    som = datosCelulas.get("detectar-sombreado", {})
    if not isinstance(som, dict):
        print(f"  ⚠️ 'detectar-sombreado' es {type(som)} en lugar de dict. Valor: {repr(som)}")
        som = {}
    vals["variacionBrillo"] = som.get("variacionBrillo", 0.0)
    vals["contraste"] = som.get("contraste", 0.0)
    vals["gradienteLuz"] = som.get("gradienteLuz", 0.0)
    vals["luzArriba"] = 1.0 if som.get("luzArriba", False) else 0.0
    vals["iluminacionUniforme"] = 1.0 if som.get("iluminacionUniforme", False) else 0.0
    vals["gradienteAnormal"] = 1.0 if som.get("gradienteAnormal", False) else 0.0
    vals["sombrasInconsistentes"] = 1.0 if som.get("sombrasInconsistentes", False) else 0.0
    vals["contrasteAnormal"] = 1.0 if som.get("contrasteAnormal", False) else 0.0
    bq = som.get("brilloCuadrantes", {})
    if not isinstance(bq, dict):
        print(f"  ⚠️ 'brilloCuadrantes' es {type(bq)} en lugar de dict. Valor: {repr(bq)}")
        bq = {}
    vals["brilloSI"] = bq.get("superiorIzquierda", 0.0)
    vals["brilloSD"] = bq.get("superiorDerecha", 0.0)
    vals["brilloII"] = bq.get("inferiorIzquierda", 0.0)
    vals["brilloID"] = bq.get("inferiorDerecha", 0.0)

    # ---- Textura ----
    tex = datosCelulas.get("detectar-textura-ruido", {})
    if not isinstance(tex, dict):
        print(f"  ⚠️ 'detectar-textura-ruido' es {type(tex)} en lugar de dict. Valor: {repr(tex)}")
        tex = {}
    vals["varianzaLocalPromedio_text"] = tex.get("varianzaLocalPromedio", 0.0)
    vals["entropia"] = tex.get("entropia", 0.0)
    vals["gradientePromedio"] = tex.get("gradientePromedio", 0.0)
    vals["varianzaRuido"] = tex.get("varianzaRuido", 0.0)
    vals["autocorrelacionNormalizada"] = tex.get("autocorrelacionNormalizada", 0.0)

    # ---- Color ----
    col = datosCelulas.get("detectar-colores", {})
    if not isinstance(col, dict):
        print(f"  ⚠️ 'detectar-colores' es {type(col)} en lugar de dict. Valor: {repr(col)}")
        col = {}
    vals["saturacionAprox"] = col.get("saturacionAprox", 0.0)
    vals["dominancia"] = col.get("dominancia", 0.0)
    vals["variacionCromatica"] = col.get("variacionCromatica", 0.0)
    vals["relacionRB"] = col.get("relacionRB", 0.0)
    vals["porcentajePielIrreal"] = col.get("porcentajePielIrreal", 0.0)
    temp = col.get("temperatura", {})
    if not isinstance(temp, dict):
        print(f"  ⚠️ 'temperatura' es {type(temp)} en lugar de dict. Valor: {repr(temp)}")
        temp = {}
    vals["temp_neutra"] = 1.0 if temp.get("neutra", False) else 0.0
    vals["temp_calida"] = 1.0 if temp.get("calida", False) else 0.0
    vals["temp_fria"] = 1.0 if temp.get("fria", False) else 0.0

    # ---- Forense ----
    fore = datosCelulas.get("detectar-patrones-forenses", {})
    if not isinstance(fore, dict):
        print(f"  ⚠️ 'detectar-patrones-forenses' es {type(fore)} en lugar de dict. Valor: {repr(fore)}")
        fore = {}
    vals["autocorrelacion_forense"] = fore.get("autocorrelacion", 0.0)

    # ---- EXIF ----
    exif = datosCelulas.get("extraer-metadatos-exif", {})
    if not isinstance(exif, dict):
        print(f"  ⚠️ 'extraer-metadatos-exif' es {type(exif)} en lugar de dict. Valor: {repr(exif)}")
        exif = {}
    vals["hasExif"] = 1.0 if exif.get("hasExif", False) else 0.0
    vals["hasICC"] = 1.0 if exif.get("hasICC", False) else 0.0
    vals["hasDate"] = 1.0 if exif.get("hasDate", False) else 0.0
    vals["hasXMP"] = 1.0 if exif.get("hasXMP", False) else 0.0

    # ---- Derivadas ----
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

def generar_dataset():
    print("=" * 80)
    print("GENERACIÓN DE DATASET DE 39 FEATURES (200 muestras) con DEPURACIÓN AVANZADA")
    print("=" * 80)

    X_list = []
    y_list = []

    for json_file in JSON_FILES:
        if not os.path.isfile(json_file):
            print(f"❌ No se encuentra {json_file}")
            continue

        print(f"\n📂 Procesando: {os.path.basename(json_file)}")
        try:
            with open(json_file, 'rb') as f:
                for doc in ijson.items(f, 'item'):
                    if not isinstance(doc, dict):
                        print(f"⚠️ Elemento no es dict: {type(doc)}")
                        continue

                    feedback = doc.get("comentarioFeedback", "")
                    if "IA" in feedback:
                        target = 1
                    elif "humano" in feedback:
                        target = 0
                    else:
                        continue

                    datosCelulas = doc.get("datosCelulas", {})
                    if not datosCelulas or not isinstance(datosCelulas, dict):
                        continue

                    # Llamamos a la función de extracción con manejo de errores
                    try:
                        features = extraer_39_features(datosCelulas)
                    except Exception as e:
                        print(f"\n❌ Error extrayendo features: {e}")
                        traceback.print_exc()
                        continue

                    if len(features) != 39:
                        continue

                    count_humano = sum(1 for y in y_list if y == 0)
                    count_ia = sum(1 for y in y_list if y == 1)

                    if target == 0 and count_humano < 100:
                        X_list.append(features)
                        y_list.append(0)
                    elif target == 1 and count_ia < 100:
                        X_list.append(features)
                        y_list.append(1)

                    total = len(X_list)
                    print(f"\r  Muestras recolectadas: {total} / 200", end='')
                    if total >= 200:
                        print()
                        break
        except Exception as e:
            print(f"\n❌ Error en el archivo: {e}")
            traceback.print_exc()
            continue

        if len(X_list) >= 200:
            break

    if len(X_list) < 200:
        print(f"\n❌ Solo se obtuvieron {len(X_list)} muestras.")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.int64)

    print(f"\n✅ Dataset generado:")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")
    print(f"   Distribución: {np.bincount(y)} (0=Humano, 1=IA)")

    os.makedirs(LAB_DIR, exist_ok=True)
    np.save(os.path.join(LAB_DIR, "X_39_200.npy"), X)
    np.save(os.path.join(LAB_DIR, "y_39_200.npy"), y)

    print("\n💾 Archivos guardados en:")
    print(f"   {os.path.join(LAB_DIR, 'X_39_200.npy')}")
    print(f"   {os.path.join(LAB_DIR, 'y_39_200.npy')}")
    print("\n✅ Ahora ejecuta: python analisis_39.py")

if __name__ == "__main__":
    generar_dataset()
