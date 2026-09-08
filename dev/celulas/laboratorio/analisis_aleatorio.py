import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report

X = np.load("X_39_200_aleatorio.npy")
y = np.load("y_39_200_aleatorio.npy")

print("="*60)
print("VALIDACIÓN CRUZADA (5 folds) - MUESTRA ALEATORIA")
print("="*60)
print(f"Shape: {X.shape}")
print(f"Clases: {np.bincount(y)}")

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
clf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, n_jobs=-1)
scores = cross_val_score(clf, X, y, cv=cv, scoring='accuracy')

print(f"\n✅ Accuracy en CV (5 folds):")
print(f"   Media: {scores.mean():.4f} (+/- {scores.std():.4f})")
print(f"   Folds: {scores}")
