#!/usr/bin/env python3
"""
entrenar_modelo.py
==================
Script para entrenar el modelo Random Forest con el dataset completo de Dragon3.

VERSIÓN: 1.0.0
FECHA: 2026-08-30

FUNCIÓN:
--------
- Carga los 5 archivos JSON combinados (90,362 documentos)
- Extrae 41 features de cada documento (de las 9 células)
- Entrena un modelo Random Forest
- Guarda el modelo, scaler y lista de features

SALIDA:
-------
- meta-analizador/modelos/modelo_ml.pkl
- meta-analizador/modelos/scaler.pkl
- meta-analizador/modelos/features.json
- meta-analizador/modelos/metricas.txt

ESTRATEGIA:
-----------
- Features: 41 (de 9 células)
- Modelo: Random Forest (n_estimators=300, max_depth=20)
- KNN: 5 vecinos (para explicabilidad)
- Peso en veredicto: 0.6
"""

import json
import pickle
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import warnings
warnings.filterwarnings('ignore')

# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_DIR = Path(__file__).parent
DATASET_DIR = BASE_DIR.parent / 'backup_datos'
MODELOS_DIR = BASE_DIR / 'modelos'
MODELOS_DIR.mkdir(parents=True, exist_ok=True)

# Archivos de entrada
ARCHIVOS = [
    DATASET_DIR / 'descarga_1_combinado.json',
    DATASET_DIR / 'descarga_2_combinado.json',
    DATASET_DIR / 'descarga_3_combinado.json',
    DATASET_DIR / 'descarga_4_combinado.json',
    DATASET_DIR / 'descarga_5_combinado.json',
]

# ============================================================
# 1. CARGAR DATOS
# ============================================================

print("="*60)
print("🧠 ENTRENANDO RANDOM FOREST - DRAGON3")
print("="*60)
print("")

print("📂 Cargando dataset...")
datos = []
total_docs = 0

for archivo in ARCHIVOS:
    if not archivo.exists():
        print(f"   ⚠️  {archivo.name} no encontrado")
        continue
    print(f"   📄 Cargando {archivo.name}...")
    with open(archivo, 'r') as f:
        data = json.load(f)
        datos.extend(data)
        total_docs += len(data)

print(f"✅ Total documentos cargados: {total_docs}")
print("")

# ============================================================
# 2. DEFINIR FEATURES (41 en total)
# ============================================================

# Features de texto/ruido (5)
FEATURES_TEXTURA = [
    'varianzaLocalPromedio',
    'entropia',
    'gradientePromedio',
    'varianzaRuido',
    'autocorrelacionNormalizada'
]

# Features de color (4)
FEATURES_COLOR = [
    'saturacionAprox',
    'temperatura',
    'dominancia',
    'variacionCromatica'
]

# Features de sombreado (4)
FEATURES_SOMBRA = [
    'variacionBrillo',
    'contraste',
    'gradienteLuz',
    'iluminacionUniforme'
]

# Features de borde (2)
FEATURES_BORDE = [
    'nitidez',
    'desviacion'
]

# Features de decisión (9 células)
CELULAS = [
    'cargar-imagen',
    'detectar-sombreado',
    'detectar-textura-ruido',
    'detectar-colores',
    'detectar-patrones-forenses',
    'detectar-artefactos-ia',
    'extraer-metadatos-exif',
    'detectar-herramienta-ia',
    'detectar-sellos-autenticidad'
]

FEATURES_DECISION = [f'{c}_confianza' for c in CELULAS] + [f'{c}_esIA' for c in CELULAS]

# Features adicionales (3)
FEATURES_ADICIONALES = [
    'tamañoBytes',
    'tiempoTotalMs',
    'scoreHumano'
]

# Features adicionales 2 (5)
FEATURES_ADICIONALES_2 = [
    'decision',
    'puntuacionIA',
    'puntuacionHumano',
    'formato',
    'correccionHumana'
]

FEATURES_LIST = (
    FEATURES_TEXTURA +
    FEATURES_COLOR +
    FEATURES_SOMBRA +
    FEATURES_BORDE +
    FEATURES_DECISION +
    FEATURES_ADICIONALES +
    FEATURES_ADICIONALES_2
)

# Eliminar duplicados
FEATURES_LIST = list(dict.fromkeys(FEATURES_LIST))

# La etiqueta es 'correccionHumana'
TARGET = 'correccionHumana'

# Eliminar target de features
if TARGET in FEATURES_LIST:
    FEATURES_LIST.remove(TARGET)

print(f"📋 Features totales: {len(FEATURES_LIST)}")
print(f"🎯 Target: {TARGET}")
print("")

# ============================================================
# 3. EXTRAER FEATURES
# ============================================================

print("🔍 Extrayendo features...")

X = []
y = []
errores = 0

for i, doc in enumerate(datos):
    if i % 10000 == 0:
        print(f"   Procesando documento {i}/{total_docs}...")

    try:
        # Obtener features de datosCelulas
        datos_celulas = doc.get('datosCelulas', {})
        
        # Construir vector de features
        features = {}
        
        # 1. Textura/Ruido (de la primera célula que tenga los datos)
        for celula in CELULAS:
            if celula in datos_celulas:
                celda = datos_celulas[celula]
                for feat in FEATURES_TEXTURA:
                    if feat in celda:
                        features[feat] = celda[feat]
                break
        
        # 2. Color (de la primera célula que tenga los datos)
        for celula in CELULAS:
            if celula in datos_celulas:
                celda = datos_celulas[celula]
                for feat in FEATURES_COLOR:
                    if feat in celda:
                        features[feat] = celda[feat]
                break
        
        # 3. Sombra (de la primera célula que tenga los datos)
        for celula in CELULAS:
            if celula in datos_celulas:
                celda = datos_celulas[celula]
                for feat in FEATURES_SOMBRA:
                    if feat in celda:
                        features[feat] = celda[feat]
                break
        
        # 4. Borde (de la primera célula que tenga los datos)
        for celula in CELULAS:
            if celula in datos_celulas:
                celda = datos_celulas[celula]
                for feat in FEATURES_BORDE:
                    if feat in celda:
                        features[feat] = celda[feat]
                break
        
        # 5. Decisiones y confianzas de cada célula
        for celula in CELULAS:
            if celula in datos_celulas:
                celda = datos_celulas[celula]
                features[f'{celula}_confianza'] = celda.get('confianza', 0)
                features[f'{celula}_esIA'] = 1 if celda.get('esIA', False) else 0
            else:
                features[f'{celula}_confianza'] = 0
                features[f'{celula}_esIA'] = 0
        
        # 6. Features adicionales
        features['tamañoBytes'] = doc.get('tamañoBytes', 0)
        features['tiempoTotalMs'] = doc.get('tiempoTotalMs', 0)
        features['scoreHumano'] = doc.get('scoreHumano', 0)
        
        # 7. Features adicionales 2
        veredicto = doc.get('veredicto', {})
        features['decision'] = 1 if veredicto.get('esIA', False) else 0
        features['puntuacionIA'] = veredicto.get('confianza', 0)
        features['puntuacionHumano'] = 1 - veredicto.get('confianza', 0)
        features['formato'] = 1 if doc.get('formato', '') == 'jpg' else 0
        
        # Target
        target = doc.get(TARGET)
        if target is None:
            continue
        
        # Construir vector X
        vector = []
        for feat in FEATURES_LIST:
            vector.append(features.get(feat, 0))
        
        X.append(vector)
        y.append(1 if target else 0)
        
    except Exception as e:
        errores += 1
        continue

print(f"✅ Features extraídos: {len(X)} documentos")
print(f"⚠️ Errores: {errores}")
print("")

# ============================================================
# 4. ENTRENAR MODELO
# ============================================================

print("🧠 Entrenando modelo...")

X = np.array(X)
y = np.array(y)

# Dividir en entrenamiento y prueba
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"📊 Entrenamiento: {len(X_train)} muestras")
print(f"📊 Prueba: {len(X_test)} muestras")
print("")

# Normalizar
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Entrenar Random Forest
modelo = RandomForestClassifier(
    n_estimators=300,
    max_depth=20,
    min_samples_split=5,
    min_samples_leaf=2,
    random_state=42,
    n_jobs=-1,
    class_weight='balanced'
)

modelo.fit(X_train_scaled, y_train)

# ============================================================
# 5. EVALUAR
# ============================================================

print("📊 Evaluando modelo...")

y_pred = modelo.predict(X_test_scaled)

accuracy = accuracy_score(y_test, y_pred)
print(f"✅ Accuracy: {accuracy:.4f}")
print("")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

# ============================================================
# 6. GUARDAR MODELO
# ============================================================

print("💾 Guardando modelo...")

# Guardar modelo
with open(MODELOS_DIR / 'modelo_ml.pkl', 'wb') as f:
    pickle.dump(modelo, f)

# Guardar scaler
with open(MODELOS_DIR / 'scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)

# Guardar features
with open(MODELOS_DIR / 'features.json', 'w') as f:
    json.dump(FEATURES_LIST, f, indent=2)

# Guardar métricas
with open(MODELOS_DIR / 'metricas.txt', 'w') as f:
    f.write("="*60 + "\n")
    f.write("📊 MÉTRICAS DEL MODELO RANDOM FOREST\n")
    f.write("="*60 + "\n\n")
    f.write(f"Total documentos: {len(X)}\n")
    f.write(f"Features: {len(FEATURES_LIST)}\n")
    f.write(f"Accuracy: {accuracy:.4f}\n\n")
    f.write(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

print("✅ Modelo guardado en:", MODELOS_DIR)
print("")
print("="*60)
print("🎉 ENTRENAMIENTO COMPLETADO")
print("="*60)
