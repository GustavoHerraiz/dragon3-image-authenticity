import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold

print("=" * 60)
print("VALIDACIÓN CRUZADA (5 folds) - 69 features, 5000 muestras")
print("=" * 60)

X = np.load("X_69_5000.npy")
y = np.load("y_69_5000.npy")

print(f"Shape: {X.shape}")
print(f"Clases: {np.bincount(y)} (0=Humano, 1=IA)")

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
clf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, n_jobs=-1)

scores = cross_val_score(clf, X, y, cv=cv, scoring='accuracy')

print(f"\n✅ Accuracy en CV (5 folds):")
print(f"   Media: {scores.mean():.4f} (+/- {scores.std():.4f})")
print(f"   Folds: {scores}")
