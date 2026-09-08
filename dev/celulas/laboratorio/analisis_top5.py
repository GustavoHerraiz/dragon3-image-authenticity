#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import confusion_matrix, classification_report

# Cargar datos
X = np.load("X_39_200.npy")
y = np.load("y_39_200.npy")

# Índices de las 5 features más importantes (según Gini)
# Orden: brilloID, desequilibrioCromatico, relacionRuidoTextura, brilloSD, relacionRB
top5_idx = [10, 37, 34, 8, 24]

# Seleccionar solo esas 5 columnas
X_top5 = X[:, top5_idx]

print("=" * 60)
print("ANÁLISIS RÁPIDO: TOP 5 FEATURES")
print("=" * 60)
print(f"Features seleccionadas:")
print("  1. brilloID")
print("  2. desequilibrioCromatico")
print("  3. relacionRuidoTextura")
print("  4. brilloSD")
print("  5. relacionRB")
print(f"\nShape de X_top5: {X_top5.shape}")
print(f"Distribución de clases: {np.bincount(y)} (0=Humano, 1=IA)")

# Validación cruzada estratificada de 5 folds
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
clf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, n_jobs=-1)

scores = cross_val_score(clf, X_top5, y, cv=cv, scoring='accuracy')
print(f"\n✅ Accuracy en validación cruzada (5 folds):")
print(f"   Media:  {scores.mean():.4f}")
print(f"   Desv.:  {scores.std():.4f}")
print(f"   Por fold: {scores}")

# Entrenar modelo final con todos los datos para ver matriz de confusión
clf.fit(X_top5, y)
y_pred = clf.predict(X_top5)
cm = confusion_matrix(y, y_pred)
print("\nMatriz de confusión (entrenamiento completo):")
print(cm)
print(f"Accuracy en entrenamiento: {np.mean(y_pred == y):.4f}")

# Reporte de clasificación detallado
print("\nReporte de clasificación:")
print(classification_report(y, y_pred, target_names=['Humano', 'IA']))

# Comparación con las 39 features (para referencia)
print("\n" + "=" * 60)
print("COMPARACIÓN CON 39 FEATURES (entrenamiento completo)")
print("=" * 60)
clf_39 = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, n_jobs=-1)
clf_39.fit(X, y)
y_pred_39 = clf_39.predict(X)
acc_39 = np.mean(y_pred_39 == y)
print(f"Accuracy con 39 features: {acc_39:.4f}")
print(f"Diferencia (39 - top5): {acc_39 - np.mean(y_pred == y):.4f}")

print("\n✅ Análisis completado. No se cargaron JSONs, solo los .npy existentes.")
