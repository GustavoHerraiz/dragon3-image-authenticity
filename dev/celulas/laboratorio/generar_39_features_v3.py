#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import ijson
import numpy as np

BASE_DIR = "/opt/dragon3/dev/celulas"
BACKUP_DIR = os.path.join(BASE_DIR, "backup_datos")
LAB_DIR = os.path.join(BASE_DIR, "dev/celulas/laboratorio")

JSON_FILES = [
    os.path.join(BACKUP_DIR, "descarga_1_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_2_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_3_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_4_combinado.json"),
    os.path.join(BACKUP_DIR, "descarga_5_combinado.json"),
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
    vals = {name: 0.0 for name in FEATURE_NAMES}
    # Artefactos
    art = datosCelulas.get("detectar-artefactos-ia", {})
    vals["varianzaLocalPromedio_art"] = art.get("varianzaLocalPromedio", 0.0)
    vals["autocorrelacion_art"] = art.get("autocorrelacion", 0.0)
    vals["correlacion_art"] = art.get("correlacion", 0.0)
    vals["diversidad_art"] = art.get("diversidad", 0.0)
    # Sombreado
    som = datosCelulas.get("detectar-sombreado", {})
    vals["variacionBrillo"] = som.get("variacionBrillo", 0.0)
    vals["contraste"] = som.get("contraste", 0.0)
    vals["gradienteLuz"] = som.get("gradienteLuz", 0.0)
    vals["luzArriba"] = 1.0 if som.get("luzArriba", False) else 0.0
    vals["iluminacionUniforme"] = 1.0 if som.get("iluminacionUniforme", False) else 0.0
    vals["gradienteAnormal"] = 1.0 if som.get("gradienteAnormal", False) else 0.0
    vals["sombrasInconsistentes"] = 1.0 if som.get("sombrasInconsistentes", False) else 0.0
    vals["contrasteAnormal"] = 1.0 if som.get("contrasteAnormal", False) else 0.0
    bq = som.get("brilloCuadrantes", {})
    vals["brilloSI"] = bq.get("superiorIzquierda", 0.0)
    vals["brilloSD"] = bq.get("superiorDerecha", 0.0)
    vals["brilloII"] = bq.get("inferiorIzquierda", 0.0)
    vals["brilloID"] = bq.get("inferiorDerecha", 0.0)
    # Textura
    tex = datosCelulas.get("detectar-textura-ruido", {})
    vals["varianzaLocalPromedio_text"] = tex.get("varianzaLocalPromedio", 0.0)
    vals["entropia"] = tex.get("entropia", 0.0)
    vals["gradientePromedio"] = tex.get("gradientePromedio", 0.0)
    vals["varianzaRuido"] = tex.get("varianzaRuido", 0.0)
    vals["autocorrelacionNormalizada"] = tex.get("autocorrelacionNormalizada", 0.0)
    # Color
    col = datosCelulas.get("detectar-colores", {})
    vals["saturacionAprox"] = col.get("saturacionAprox", 0.0)
    vals["dominancia"] = col.get("dominancia", 0.0)
    vals["variacionCromatica"] = col.get("variacionCromatica", 0.0)
    vals["relacionRB"] = col.get("relacionRB", 0.0)
    vals["porcentajePielIrreal"] = col.get("porcentajePielIrreal", 0.0)
    temp = col.get("temperatura", {})
    vals["temp_neutra"] = 1.0 if temp.get("neutra", False) else 0.0
    vals["temp_calida"] = 1.0 if temp.get("calida", False) else 0.0
    vals["temp_fria"] = 1.0 if temp.get("fria", False) else 0.0
    # Forense
    fore = datosCelulas.get("detectar-patrones-forenses", {})
    vals["autocorrelacion_forense"] = fore.get("autocorrelacion", 0.0)
    # EXIF
    exif = datosCelulas.get("extraer-metadatos-exif", {})
    vals["hasExif"] = 1.0 if exif.get("hasExif", False) else 0.0
    vals["hasICC"] = 1.0 if exif.get("hasICC", False) else 0.0
    vals["hasDate"] = 1.0 if exif.get("hasDate", False) else 0.0
    vals["hasXMP"] = 1.0 if exif.get("hasXMP", False) else 0.0
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

def generar_dataset():
    print("=" * 80)
    print("GENERACIÓN DE DATASET DE 39 FEATURES (200 muestras) con ijson")
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
                # Usamos 'item' porque es un array en la raíz
                for doc in ijson.items(f, 'item'):
                    # Asegurarse de que doc es dict
                    if not isinstance(doc, dict):
                        continue
                    feedback = doc.get("comentarioFeedback", "")
                    if "IA" in feedback:
                        target = 1
                    elif "humano" in feedback:
                        target = 0
                    else:
                        continue

                    datosCelulas = doc.get("datosCelulas", {})
                    if not datosCelulas:
                        continue

                    features = extraer_39_features(datosCelulas)
                    if len(features) != 39:
                        continue

                    # Contar cuántos de cada clase tenemos
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
            print(f"\n  ❌ Error: {e}")
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
