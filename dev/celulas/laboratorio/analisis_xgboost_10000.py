#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report
)
import time

print("=" * 70)
print("XGBOOST CON 10000 MUESTRAS (69 features)")
print("=" * 70)

# 1. Cargar datos
print("\n📂 Cargando dataset...")
X = np.load("X_69_10000.npy")
y = np.load("y_69_10000.npy")
print(f"   X shape: {X.shape}")
print(f"   y shape: {y.shape}")
print(f"   Clases: {np.bincount(y)} (0=Humano, 1=IA)")

# 2. Dividir en train/test (80/20) estratificado
print("\n📊 Dividiendo en train (80%) y test (20%)...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
print(f"   Train: {X_train.shape[0]} muestras")
print(f"   Test:  {X_test.shape[0]} muestras")

# 3. Entrenar XGBoost
print("\n🚀 Entrenando XGBoost...")
start_time = time.time()
model = xgb.XGBClassifier(
    n_estimators=100,
    max_depth=5,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1,
    eval_metric='logloss',
    use_label_encoder=False
)
model.fit(X_train, y_train)
train_time = time.time() - start_time
print(f"   Tiempo de entrenamiento: {train_time:.2f} segundos")

# 4. Evaluación en test
print("\n📊 Evaluación en test:")
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
prec = precision_score(y_test, y_pred, average=None)
rec = recall_score(y_test, y_pred, average=None)
f1 = f1_score(y_test, y_pred, average=None)
macro_f1 = f1_score(y_test, y_pred, average='macro')

print(f"   Accuracy:  {acc:.4f}")
print(f"   Precisión (clase 0/1): {prec[0]:.4f} / {prec[1]:.4f}")
print(f"   Recall    (clase 0/1): {rec[0]:.4f} / {rec[1]:.4f}")
print(f"   F1        (clase 0/1): {f1[0]:.4f} / {f1[1]:.4f}")
print(f"   Macro F1: {macro_f1:.4f}")

# Matriz de confusión
cm = confusion_matrix(y_test, y_pred)
print("\n   Matriz de confusión:")
print(f"   [[{cm[0,0]:4d} {cm[0,1]:4d}]")
print(f"    [{cm[1,0]:4d} {cm[1,1]:4d}]]")

# Reporte detallado
print("\n   Reporte de clasificación:")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

# 5. Validación cruzada (5 folds) para comparar con Random Forest
print("\n🔄 Validación cruzada (5 folds) sobre todo el dataset...")
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=-1)

print(f"   Accuracy en CV (5 folds):")
print(f"   Media: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
print(f"   Folds: {cv_scores}")

# 6. Comparativa con Random Forest (usando el dataset guardado)
print("\n" + "=" * 70)
print("COMPARACIÓN CON RANDOM FOREST (mismo dataset)")
print("=" * 70)

# Cargar los resultados de Random Forest si existen (del script anterior)
try:
    rf_scores = [0.8385, 0.853, 0.841, 0.837, 0.854]  # Resultados de tu ejecución
    rf_mean = np.mean(rf_scores)
    rf_std = np.std(rf_scores)
    print(f"Random Forest (10000 muestras):")
    print(f"   Media CV: {rf_mean:.4f} (+/- {rf_std:.4f})")
    print(f"XGBoost (10000 muestras):")
    print(f"   Media CV: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    diff = cv_scores.mean() - rf_mean
    print(f"Diferencia (XGBoost - RF): {diff:+.4f}  ({diff*100:+.2f} puntos porcentuales)")
except:
    print("⚠️ No se encontraron resultados de Random Forest para comparar.")

print("\n" + "=" * 70)
print("✅ FIN DEL ANÁLISIS")
print("=" * 70)
