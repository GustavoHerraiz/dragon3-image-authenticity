#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import numpy as np
import xgboost as xgb
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from sklearn.metrics import accuracy_score, classification_report
import time
import pickle
import pandas as pd
from scipy.stats import uniform, randint

print("=" * 70)
print("OPTIMIZACIÓN DE HIPERPARÁMETROS XGBOOST (25000 muestras)")
print("=" * 70)

# Cargar datos
X = np.load("X_69_25000.npy")
y = np.load("y_69_25000.npy")
print(f"X shape: {X.shape}, clases: {np.bincount(y)}")

# Definir el modelo base
model = xgb.XGBClassifier(
    random_state=42,
    n_jobs=-1,
    eval_metric='logloss',
    use_label_encoder=False
)

# Espacio de búsqueda de hiperparámetros
param_dist = {
    'n_estimators': randint(50, 300),
    'max_depth': randint(3, 10),
    'learning_rate': uniform(0.01, 0.3),
    'subsample': uniform(0.6, 0.4),
    'colsample_bytree': uniform(0.6, 0.4),
    'min_child_weight': randint(1, 10),
    'gamma': uniform(0, 0.5),
    'reg_alpha': uniform(0, 1),
    'reg_lambda': uniform(0, 1),
}

# Validación cruzada estratificada (3 folds para ser rápido)
cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

# RandomizedSearchCV (30 combinaciones)
print("\n🔍 Iniciando búsqueda aleatoria (30 combinaciones, 3 folds)...")
start_time = time.time()

random_search = RandomizedSearchCV(
    estimator=model,
    param_distributions=param_dist,
    n_iter=30,
    cv=cv,
    scoring='accuracy',
    n_jobs=-1,
    random_state=42,
    verbose=1
)

random_search.fit(X, y)

elapsed_time = time.time() - start_time
print(f"\n✅ Búsqueda completada en {elapsed_time:.2f} segundos")

# Mejores parámetros y rendimiento
best_params = random_search.best_params_
best_score = random_search.best_score_

print("\n" + "=" * 70)
print("MEJORES HIPERPARÁMETROS ENCONTRADOS")
print("=" * 70)
for key, value in best_params.items():
    print(f"   {key}: {value}")
print(f"\nMejor accuracy en CV (3 folds): {best_score:.4f}")

# Entrenar el mejor modelo con todos los datos para evaluación final
print("\n🚀 Entrenando el mejor modelo con todos los datos...")
best_model = random_search.best_estimator_
best_model.fit(X, y)

# Guardar el mejor modelo
model_path = "/opt/dragon3/dev/celulas/laboratorio/modelo_xgboost_25000_optimizado.pkl"
with open(model_path, 'wb') as f:
    pickle.dump(best_model, f)
print(f"✅ Modelo guardado en: {model_path}")

# Evaluación en todo el dataset (para referencia)
y_pred = best_model.predict(X)
acc_all = accuracy_score(y, y_pred)
print(f"\nAccuracy en todo el dataset: {acc_all:.4f}")

# Guardar resultados de la búsqueda en CSV
results_df = pd.DataFrame(random_search.cv_results_)
results_df.to_csv("/opt/dragon3/dev/celulas/laboratorio/optimizacion_xgboost_25000.csv", index=False)
print("✅ Resultados de la búsqueda guardados en: optimizacion_xgboost_25000.csv")

# Mostrar las 5 mejores combinaciones
print("\n🏆 TOP 5 COMBINACIONES:")
top5 = results_df.nlargest(5, 'mean_test_score')[['params', 'mean_test_score', 'std_test_score']]
for i, row in top5.iterrows():
    print(f"\n  {i+1}. Score: {row['mean_test_score']:.4f} (±{row['std_test_score']:.4f})")
    print(f"     Parámetros: {row['params']}")

print("\n" + "=" * 70)
print("✅ FIN DE LA OPTIMIZACIÓN")
print("=" * 70)
