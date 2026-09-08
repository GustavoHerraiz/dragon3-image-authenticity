#!/usr/bin/env python3
"""
entrenar_modelo_streaming.py
============================
Entrena Random Forest procesando los archivos uno por uno (streaming).
No carga todos los JSON en memoria a la vez.
"""

import json
import pickle
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import warnings
warnings.filterwarnings('ignore')

# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_DIR = Path(__file__).parent
DATASET_DIR = BASE_DIR.parent / 'backup_datos'
MODELOS_DIR = BASE_DIR / 'modelos'
MODELOS_DIR.mkdir(parents=True, exist_ok=True)

ARCHIVOS = [
    DATASET_DIR / 'descarga_1_combinado.json',
    DATASET_DIR / 'descarga_2_combinado.json',
    DATASET_DIR / 'descarga_3_combinado.json',
    DATASET_DIR / 'descarga_4_combinado.json',
    DATASET_DIR / 'descarga_5_combinado.json',
]

CELULAS = [
    'cargar-imagen', 'detectar-sombreado', 'detectar-textura-ruido',
    'detectar-colores', 'detectar-patrones-forenses', 'detectar-artefactos-ia',
    'extraer-metadatos-exif', 'detectar-herramienta-ia', 'detectar-sellos-autenticidad'
]

FEATURES_TEXTURA = ['varianzaLocalPromedio', 'entropia', 'gradientePromedio', 'varianzaRuido', 'autocorrelacionNormalizada']
FEATURES_COLOR = ['saturacionAprox', 'temperatura', 'dominancia', 'variacionCromatica']
FEATURES_SOMBRA = ['variacionBrillo', 'contraste', 'gradienteLuz', 'iluminacionUniforme']
FEATURES_BORDE = ['nitidez', 'desviacion']
FEATURES_ADICIONALES = ['tamañoBytes', 'tiempoTotalMs']

# ✅ SOLO formato, sin decision/puntuacionIA/puntuacionHumano
FEATURES_ADICIONALES_2 = ['formato']

FEATURES_LIST = (
    FEATURES_TEXTURA + FEATURES_COLOR + FEATURES_SOMBRA + FEATURES_BORDE +
    [f'{c}_confianza' for c in CELULAS] + [f'{c}_esIA' for c in CELULAS] +
    FEATURES_ADICIONALES + FEATURES_ADICIONALES_2
)
FEATURES_LIST = list(dict.fromkeys(FEATURES_LIST))
TARGET = 'correccionHumana'
if TARGET in FEATURES_LIST:
    FEATURES_LIST.remove(TARGET)

print(f"📋 Features: {len(FEATURES_LIST)}")
print("")

# ============================================================
# 1. PROCESAR ARCHIVOS UNO POR UNO (STREAMING) - CORREGIDO
# ============================================================

X = []
y = []
total_docs = 0
features_faltantes = {}  # Para depuración

for archivo in ARCHIVOS:
    print(f"📄 Procesando {archivo.name}...")
    try:
        with open(archivo, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"   ❌ Error cargando {archivo.name}: {e}")
        continue
    
    docs_procesados = 0
    for doc in data:
        try:
            dc = doc.get('datosCelulas', {})
            features = {}
            
            # ============================================================
            # 1. TEXTURA Y RUIDO (de TODAS las células)
            # ============================================================
            for celula in CELULAS:
                if celula in dc:
                    celda = dc[celula]
                    for feat in FEATURES_TEXTURA:
                        if feat in celda and feat not in features:
                            features[feat] = celda[feat]
            
            # ============================================================
            # 2. COLOR (de TODAS las células)
            # ============================================================
            for celula in CELULAS:
                if celula in dc:
                    celda = dc[celula]
                    for feat in FEATURES_COLOR:
                        if feat in celda and feat not in features:
                            features[feat] = celda[feat]
            
            # ============================================================
            # 3. SOMBRA (de TODAS las células)
            # ============================================================
            for celula in CELULAS:
                if celula in dc:
                    celda = dc[celula]
                    for feat in FEATURES_SOMBRA:
                        if feat in celda and feat not in features:
                            features[feat] = celda[feat]
            
            # ============================================================
            # 4. BORDE (de TODAS las células)
            # ============================================================
            for celula in CELULAS:
                if celula in dc:
                    celda = dc[celula]
                    for feat in FEATURES_BORDE:
                        if feat in celda and feat not in features:
                            features[feat] = celda[feat]
            
            # ============================================================
            # 5. CONFIANZA Y DECISIÓN DE CADA CÉLULA
            # ============================================================
            for celula in CELULAS:
                if celula in dc:
                    celda = dc[celula]
                    features[f'{celula}_confianza'] = celda.get('confianza', 0)
                    features[f'{celula}_esIA'] = 1 if celda.get('esIA', False) else 0
                else:
                    features[f'{celula}_confianza'] = 0
                    features[f'{celula}_esIA'] = 0
            
            # ============================================================
            # 6. FEATURES ADICIONALES
            # ============================================================
            features['tamañoBytes'] = doc.get('tamañoBytes', 0)
            features['tiempoTotalMs'] = doc.get('tiempoTotalMs', 0)
            
            # ============================================================
            # 7. SOLO FORMATO (sin decision/puntuacionIA/puntuacionHumano)
            # ============================================================
            features['formato'] = 1 if doc.get('formato', '') == 'jpg' else 0
            
            # ============================================================
            # 8. TARGET (veredicto final)
            # ============================================================
            v = doc.get('veredicto', {})
            target = 1 if v.get('esIA', False) else 0
            
            # ============================================================
            # 9. CONSTRUIR VECTOR DE FEATURES
            # ============================================================
            vector = []
            for feat in FEATURES_LIST:
                valor = features.get(feat, 0)
                vector.append(valor)
                # Depuración: contar features faltantes
                if valor == 0 and feat not in features:
                    if feat not in features_faltantes:
                        features_faltantes[feat] = 0
                    features_faltantes[feat] += 1
            
            X.append(vector)
            y.append(target)
            total_docs += 1
            docs_procesados += 1
            
        except Exception as e:
            continue
    
    print(f"   ✅ {docs_procesados} documentos procesados")
    # Limpiar memoria
    del data

print(f"\n✅ Total: {len(X)} documentos")

# ============================================================
# 10. MOSTRAR ESTADÍSTICAS DE FEATURES FALTANTES
# ============================================================
print("\n📊 FEATURES CON MÁS VALORES FALTANTES:")
faltantes_ordenados = sorted(features_faltantes.items(), key=lambda x: x[1], reverse=True)
for feat, count in faltantes_ordenados[:10]:
    pct = (count / total_docs * 100) if total_docs > 0 else 0
    print(f"   {feat}: {count} ({pct:.1f}%)")

print("")

# ============================================================
# 2. ENTRENAR MODELO
# ============================================================

X = np.array(X)
y = np.array(y)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

print(f"📊 Entrenamiento: {len(X_train)}")
print(f"📊 Prueba: {len(X_test)}")
print("")

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

modelo = RandomForestClassifier(
    n_estimators=200,
    max_depth=15,
    random_state=42,
    n_jobs=1,
    class_weight='balanced'
)

print("🧠 Entrenando Random Forest...")
modelo.fit(X_train, y_train)

# ============================================================
# 3. EVALUAR
# ============================================================

from sklearn.metrics import classification_report, accuracy_score
y_pred = modelo.predict(X_test)
print(f"✅ Accuracy: {accuracy_score(y_test, y_pred):.4f}")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

# ============================================================
# 4. GUARDAR
# ============================================================

with open(MODELOS_DIR / 'modelo_ml.pkl', 'wb') as f:
    pickle.dump(modelo, f)

with open(MODELOS_DIR / 'scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)

with open(MODELOS_DIR / 'features.json', 'w') as f:
    json.dump(FEATURES_LIST, f, indent=2)

print("✅ Modelo guardado en:", MODELOS_DIR)
print("🎉 Entrenamiento completado")