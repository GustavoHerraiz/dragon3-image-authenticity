#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
ANÁLISIS PROFUNDO DE LAS 69 FEATURES PARA CLASIFICACIÓN IA/HUMANO
================================================================
Script diseñado para evaluar el poder discriminante de las 69 features
extraídas, identificar las más relevantes mediante importancia Gini y
permutación, seleccionar subconjuntos óptimos (top K), y explicar las
decisiones del modelo mediante SHAP.

Autor: (tu nombre)
Fecha: 2026-09-01
"""

import os
import sys
import time
import json
import pickle
import warnings
import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)
from sklearn.inspection import permutation_importance
from sklearn.preprocessing import StandardScaler
import shap

# Suprimir warnings no críticos
warnings.filterwarnings("ignore", category=UserWarning)

# ============================================================
# 1. CONFIGURACIÓN Y RUTAS
# ============================================================

BASE_DIR = "/opt/dragon3/dev/celulas/laboratorio"
X_PATH = os.path.join(BASE_DIR, "X_200_corregido.npy")
Y_PATH = os.path.join(BASE_DIR, "y_200_corregido.npy")
PRUEBA_IMG = "/opt/dragon3/dev/celulas/prueba.jpg"  # Opcional

# Directorio de resultados con timestamp
TIMESTAMP = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
RESULT_DIR = os.path.join(BASE_DIR, "resultados_analisis", TIMESTAMP)
os.makedirs(RESULT_DIR, exist_ok=True)

LOG_FILE = os.path.join(RESULT_DIR, "log_entrenamiento.txt")
RES_CSV = os.path.join(RESULT_DIR, "resultados_globales.csv")
IMP_CSV = os.path.join(RESULT_DIR, "importancia_features.csv")
FIG_DIR = os.path.join(RESULT_DIR, "figuras")
SHAP_DIR = os.path.join(RESULT_DIR, "shap_force_plots")
os.makedirs(FIG_DIR, exist_ok=True)
os.makedirs(SHAP_DIR, exist_ok=True)

# ============================================================
# FUNCIÓN AUXILIAR PARA ESCRIBIR EN LOG Y CONSOLA
# ============================================================
def log(msg, end="\n"):
    """Escribe mensaje en el archivo de log y en consola."""
    print(msg, end=end)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + end)

# ============================================================
# 2. VERIFICACIÓN DE EXISTENCIA DE LOS ARCHIVOS .NPY
# ============================================================
log("=" * 80)
log(f"INICIO DEL ANÁLISIS - {datetime.datetime.now().isoformat()}")
log("=" * 80)

if not os.path.isfile(X_PATH):
    log(f"ERROR: No se encuentra {X_PATH}")
    log("Espera a que termine la generación de las 200 muestras.")
    sys.exit(1)
if not os.path.isfile(Y_PATH):
    log(f"ERROR: No se encuentra {Y_PATH}")
    sys.exit(1)

log(f"✅ Archivos encontrados:")
log(f"   X: {X_PATH}")
log(f"   y: {Y_PATH}")

# ============================================================
# 3. CARGA DE DATOS
# ============================================================
log("\nCargando arrays...")
X = np.load(X_PATH)
y = np.load(Y_PATH)

log(f"   X shape: {X.shape} (esperado (200,69))")
log(f"   y shape: {y.shape} (esperado (200,))")
log(f"   Distribución de clases: {np.bincount(y)} (0=Humano, 1=IA)")

if X.shape[0] != 200 or X.shape[1] != 69:
    log(f"⚠️ ADVERTENCIA: shape inesperado. Se continuará de todos modos.")

# ============================================================
# 4. DIVISIÓN TRAIN/TEST ESTRATIFICADA
# ============================================================
log("\nDividiendo en train (80%) y test (20%) estratificado...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
log(f"   Train: {X_train.shape[0]} muestras ({np.bincount(y_train)[0]} Humano, {np.bincount(y_train)[1]} IA)")
log(f"   Test:  {X_test.shape[0]} muestras ({np.bincount(y_test)[0]} Humano, {np.bincount(y_test)[1]} IA)")

# ============================================================
# 5. DEFINICIÓN DE NOMBRES DE LAS FEATURES (automático)
# ============================================================
num_features = X.shape[1]
feature_names = [f"F{i:02d}" for i in range(num_features)]
log(f"\n✅ Nombres de features asignados automáticamente ({num_features} features).")

# Convertir a DataFrame para SHAP y manipulación
X_train_df = pd.DataFrame(X_train, columns=feature_names)
X_test_df = pd.DataFrame(X_test, columns=feature_names)

# ============================================================
# 6. ENTRENAMIENTO DEL MODELO BASE (TODAS LAS FEATURES)
# ============================================================
log("\n" + "=" * 80)
log("6. ENTRENAMIENTO DEL MODELO BASE (69 features)")
log("=" * 80)

start_time = time.time()
clf = RandomForestClassifier(
    n_estimators=100,
    max_depth=5,
    random_state=42,
    n_jobs=-1
)
clf.fit(X_train, y_train)
train_time = time.time() - start_time
log(f"Tiempo de entrenamiento: {train_time:.2f} segundos")

# Predicciones y métricas
y_pred = clf.predict(X_test)
y_proba = clf.predict_proba(X_test)[:, 1]  # Probabilidad de clase 1 (IA)

acc = accuracy_score(y_test, y_pred)
prec = precision_score(y_test, y_pred, average=None)
rec = recall_score(y_test, y_pred, average=None)
f1 = f1_score(y_test, y_pred, average=None)
macro_f1 = f1_score(y_test, y_pred, average='macro')
conf_matrix = confusion_matrix(y_test, y_pred)

log(f"\n--- Resultados en test (69 features) ---")
log(f"Accuracy:  {acc:.4f}")
log(f"Precisión (clase 0/1): {prec[0]:.4f} / {prec[1]:.4f}")
log(f"Recall    (clase 0/1): {rec[0]:.4f} / {rec[1]:.4f}")
log(f"F1        (clase 0/1): {f1[0]:.4f} / {f1[1]:.4f}")
log(f"Macro F1: {macro_f1:.4f}")
log(f"Confianza promedio de las predicciones: {np.mean(np.max(y_proba.reshape(-1,1), axis=1)):.4f}")

# Guardar matriz de confusión como figura
plt.figure(figsize=(5,4))
sns.heatmap(conf_matrix, annot=True, fmt='d', cmap='Blues', 
            xticklabels=['Humano', 'IA'], yticklabels=['Humano', 'IA'])
plt.title('Matriz de Confusión - 69 features')
plt.ylabel('Real')
plt.xlabel('Predicho')
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'confusion_matrix_69.png'), dpi=150)
plt.close()

# ============================================================
# 7. IMPORTANCIA DE FEATURES (GINI)
# ============================================================
log("\n" + "=" * 80)
log("7. IMPORTANCIA POR IMPUREZA (GINI)")
log("=" * 80)

importances = clf.feature_importances_
indices = np.argsort(importances)[::-1]  # Orden descendente
top_k = 20  # Mostrar top 20

log(f"Top {top_k} features según importancia Gini:")
for i in range(min(top_k, len(indices))):
    idx = indices[i]
    log(f"  {i+1:2d}. {feature_names[idx]:20s} : {importances[idx]:.6f}")

# Guardar todas las importancias en CSV
imp_df = pd.DataFrame({
    'feature': feature_names,
    'gini_importance': importances
})
imp_df = imp_df.sort_values('gini_importance', ascending=False)

# Figura: top 20
plt.figure(figsize=(10, 6))
top_features = imp_df.head(20)
plt.barh(top_features['feature'], top_features['gini_importance'], color='skyblue')
plt.xlabel('Importancia Gini')
plt.title('Top 20 features - Importancia por Impureza')
plt.gca().invert_yaxis()
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'top20_gini.png'), dpi=150)
plt.close()

log(f"✅ Figura guardada: top20_gini.png")

# ============================================================
# 8. IMPORTANCIA POR PERMUTACIÓN
# ============================================================
log("\n" + "=" * 80)
log("8. IMPORTANCIA POR PERMUTACIÓN")
log("=" * 80)

log("Calculando importancia por permutación (puede tardar unos segundos)...")
perm_start = time.time()
perm_importance = permutation_importance(
    clf, X_test, y_test,
    n_repeats=10,
    random_state=42,
    n_jobs=-1
)
perm_time = time.time() - perm_start
log(f"Tiempo de cálculo: {perm_time:.2f} segundos")

# Añadir al DataFrame de importancia
imp_df['perm_mean'] = perm_importance.importances_mean
imp_df['perm_std'] = perm_importance.importances_std

# Guardar CSV completo
imp_df.to_csv(IMP_CSV, index=False)
log(f"✅ Importancias guardadas en: {IMP_CSV}")

# Figura comparativa: Gini vs Permutación (top 20 por permutación)
top_perm = imp_df.nlargest(20, 'perm_mean')
plt.figure(figsize=(12, 6))
plt.barh(top_perm['feature'], top_perm['perm_mean'], xerr=top_perm['perm_std'], 
         color='lightcoral', edgecolor='black')
plt.xlabel('Importancia por Permutación (media ± std)')
plt.title('Top 20 features - Importancia por Permutación')
plt.gca().invert_yaxis()
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'top20_permutation.png'), dpi=150)
plt.close()

log(f"✅ Figura guardada: top20_permutation.png")

# ============================================================
# 9. SELECCIÓN DE FEATURES TOP K Y EVALUACIÓN
# ============================================================
log("\n" + "=" * 80)
log("9. SELECCIÓN DE FEATURES TOP K (según Gini)")
log("=" * 80)

K_values = [5, 10, 15, 20, 30, 50]
results = []

# Ya tenemos el modelo con 69 features, lo añadimos a resultados
results.append({
    'num_features': 69,
    'accuracy': acc,
    'precision_0': prec[0],
    'recall_0': rec[0],
    'f1_0': f1[0],
    'precision_1': prec[1],
    'recall_1': rec[1],
    'f1_1': f1[1],
    'macro_f1': macro_f1,
    'train_time': train_time,
    'confidence_mean': np.mean(np.max(y_proba.reshape(-1,1), axis=1))
})

# Para cada K, entrenar un modelo con las K features más importantes
for k in K_values:
    log(f"\n--- Entrenando modelo con top {k} features ---")
    top_idx = indices[:k]
    X_train_k = X_train[:, top_idx]
    X_test_k = X_test[:, top_idx]

    start_k = time.time()
    clf_k = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        random_state=42,
        n_jobs=-1
    )
    clf_k.fit(X_train_k, y_train)
    train_k_time = time.time() - start_k

    y_pred_k = clf_k.predict(X_test_k)
    y_proba_k = clf_k.predict_proba(X_test_k)[:, 1]

    acc_k = accuracy_score(y_test, y_pred_k)
    prec_k = precision_score(y_test, y_pred_k, average=None)
    rec_k = recall_score(y_test, y_pred_k, average=None)
    f1_k = f1_score(y_test, y_pred_k, average=None)
    macro_f1_k = f1_score(y_test, y_pred_k, average='macro')
    conf_mean_k = np.mean(np.max(y_proba_k.reshape(-1,1), axis=1))

    log(f"  Accuracy: {acc_k:.4f}")
    log(f"  Macro F1: {macro_f1_k:.4f}")
    log(f"  Tiempo entrenamiento: {train_k_time:.2f}s")

    results.append({
        'num_features': k,
        'accuracy': acc_k,
        'precision_0': prec_k[0],
        'recall_0': rec_k[0],
        'f1_0': f1_k[0],
        'precision_1': prec_k[1],
        'recall_1': rec_k[1],
        'f1_1': f1_k[1],
        'macro_f1': macro_f1_k,
        'train_time': train_k_time,
        'confidence_mean': conf_mean_k
    })

    # Guardar modelo de este K (opcional)
    model_path = os.path.join(RESULT_DIR, f"modelo_top{k}.pkl")
    with open(model_path, 'wb') as f:
        pickle.dump(clf_k, f)
    log(f"  Modelo guardado en: {model_path}")

# Guardar resultados globales en CSV
res_df = pd.DataFrame(results)
res_df.to_csv(RES_CSV, index=False)
log(f"\n✅ Resultados globales guardados en: {RES_CSV}")

# Figura: Accuracy vs número de features
plt.figure(figsize=(8,5))
plt.plot(res_df['num_features'], res_df['accuracy'], marker='o', linestyle='-', color='b')
plt.xlabel('Número de features')
plt.ylabel('Accuracy en test')
plt.title('Rendimiento vs Cantidad de Features (selección por Gini)')
plt.grid(True, linestyle='--', alpha=0.7)
plt.xlim(left=0)
plt.ylim(bottom=0.5, top=1.0)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'accuracy_vs_features.png'), dpi=150)
plt.close()
log("✅ Figura guardada: accuracy_vs_features.png")

# ============================================================
# 10. ANÁLISIS SHAP
# ============================================================
log("\n" + "=" * 80)
log("10. ANÁLISIS SHAP (explicabilidad)")
log("=" * 80)

# Crear explainer basado en el modelo base (69 features)
log("Creando explainer SHAP (TreeExplainer)...")
explainer = shap.TreeExplainer(clf)

# Calcular valores SHAP para el test set (puede tardar ~1-2 minutos)
log("Calculando valores SHAP para X_test... (puede tomar un minuto)")
shap_start = time.time()
shap_values = explainer.shap_values(X_test_df)
shap_time = time.time() - shap_start
log(f"Tiempo SHAP: {shap_time:.2f} segundos")

# Guardar valores SHAP en un archivo (por si luego se quieren reutilizar)
shap_path = os.path.join(RESULT_DIR, "shap_values.pkl")
with open(shap_path, 'wb') as f:
    pickle.dump(shap_values, f)
log(f"✅ Valores SHAP guardados en: {shap_path}")

# Summary plot (barras de importancia SHAP global)
log("Generando summary plot (top 20 features por SHAP)...")
plt.figure(figsize=(12, 8))
shap.summary_plot(shap_values, X_test_df, feature_names=feature_names, show=False)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'shap_summary.png'), dpi=150, bbox_inches='tight')
plt.close()
log("✅ Figura guardada: shap_summary.png")

# Summary plot de barras (versión más limpia)
plt.figure(figsize=(10, 6))
shap.summary_plot(shap_values, X_test_df, feature_names=feature_names, 
                  plot_type='bar', show=False)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, 'shap_summary_bar.png'), dpi=150, bbox_inches='tight')
plt.close()
log("✅ Figura guardada: shap_summary_bar.png")

# ============================================================
# 11. FORCE PLOTS PARA IMÁGENES INDIVIDUALES
# ============================================================
log("\nGenerando force plots para imágenes individuales del test...")

# Encontrar índices de test con predicciones correctas y erróneas
correct_idx = np.where(y_pred == y_test)[0]
wrong_idx = np.where(y_pred != y_test)[0]

# Elegir una correcta de clase 0 y una de clase 1 (si existen)
idx_humano_correcto = None
idx_ia_correcto = None
for idx in correct_idx:
    if y_test[idx] == 0 and idx_humano_correcto is None:
        idx_humano_correcto = idx
    if y_test[idx] == 1 and idx_ia_correcto is None:
        idx_ia_correcto = idx
    if idx_humano_correcto is not None and idx_ia_correcto is not None:
        break

# Elegir uno incorrecto (si existe)
idx_incorrecto = wrong_idx[0] if len(wrong_idx) > 0 else None

# Función para guardar force plot
def save_force_plot(idx, label, filename):
    """Genera y guarda force plot para una instancia del test."""
    shap_force = shap.force_plot(
        explainer.expected_value,
        shap_values[idx],
        X_test_df.iloc[idx, :],
        feature_names=feature_names,
        matplotlib=True,
        show=False
    )
    plt.savefig(os.path.join(SHAP_DIR, filename), dpi=150, bbox_inches='tight')
    plt.close()
    log(f"   Force plot guardado: {filename} (imagen test #{idx}, real={y_test[idx]}, pred={y_pred[idx]})")

if idx_humano_correcto is not None:
    save_force_plot(idx_humano_correcto, "Humano correcto", "force_humano_correcto.png")
if idx_ia_correcto is not None:
    save_force_plot(idx_ia_correcto, "IA correcto", "force_ia_correcto.png")
if idx_incorrecto is not None:
    save_force_plot(idx_incorrecto, "Error", "force_error.png")

log(f"✅ Force plots guardados en: {SHAP_DIR}")

# ============================================================
# 12. (OPCIONAL) PREDICCIÓN SOBRE PRUEBA.JPG
# ============================================================
log("\n" + "=" * 80)
log("12. EXTRACCIÓN Y PREDICCIÓN DE prueba.jpg (si existe)")
log("=" * 80)

if os.path.isfile(PRUEBA_IMG):
    try:
        # Importar el extractor de features (asumimos que está en el mismo directorio)
        sys.path.insert(0, BASE_DIR)
        from extractor_features_corregido import extraer_features_corregido

        log(f"Extrayendo features de {PRUEBA_IMG}...")
        start_ext = time.time()
        features_dict = extraer_features_corregido(PRUEBA_IMG)
        ext_time = time.time() - start_ext
        log(f"Tiempo de extracción: {ext_time:.3f} segundos")

        # Convertir a array en el orden de feature_names
        prueba_features = np.array([features_dict.get(name, 0.0) for name in feature_names]).reshape(1, -1)
        log(f"Features extraídas (shape): {prueba_features.shape}")

        # Predicción con el modelo base (69 features)
        proba = clf.predict_proba(prueba_features)[0]
        pred = clf.predict(prueba_features)[0]
        label = "IA" if pred == 1 else "Humano"
        log(f"Predicción: {label} (probabilidad IA={proba[1]:.4f}, humano={proba[0]:.4f})")

        # Guardar features de prueba en CSV (para referencia)
        prueba_df = pd.DataFrame([features_dict])
        prueba_df.to_csv(os.path.join(RESULT_DIR, "features_prueba.jpg.csv"), index=False)

    except Exception as e:
        log(f"⚠️ Error al procesar prueba.jpg: {e}")
else:
    log(f"⚠️ No se encontró {PRUEBA_IMG}, se omite.")

# ============================================================
# 13. RESUMEN FINAL Y RECOMENDACIÓN
# ============================================================
log("\n" + "=" * 80)
log("13. RESUMEN FINAL")
log("=" * 80)

best_row = res_df.loc[res_df['accuracy'].idxmax()]
mejor_acc = best_row['accuracy']
mejor_k = best_row['num_features']

log(f"Mejor accuracy obtenido: {mejor_acc:.4f} con {mejor_k} features.")
log(f"Comparación con modelo anterior (39 features, 200 muestras): 82.5%")

if mejor_acc > 0.85:
    log("\n✅ RECOMENDACIÓN: El modelo supera el 85% de precisión.")
    log("   Vale la pena escalar a más muestras (500 o 1000) para confirmar.")
    if mejor_k < 69:
        log(f"   El mejor rendimiento se logra con {mejor_k} features, no con las 69.")
        log("   En producción se puede usar solo ese subconjunto para acelerar.")
else:
    log("\n❌ RECOMENDACIÓN: El modelo no alcanza el 85%.")
    log("   Se sugiere descartar el enfoque ML con estas features.")
    log("   Alternativas: probar redes neuronales, transfer learning, o mantener Dragon3.")

log("\n" + "=" * 80)
log(f"FIN DEL ANÁLISIS - {datetime.datetime.now().isoformat()}")
log(f"Todos los resultados guardados en: {RESULT_DIR}")
log("=" * 80)

# ============================================================
# FIN DEL SCRIPT
# ============================================================
