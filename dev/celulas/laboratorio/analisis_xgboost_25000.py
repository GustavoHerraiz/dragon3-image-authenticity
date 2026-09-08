import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, classification_report

print("="*70)
print("XGBOOST CON 25000 MUESTRAS (69 features)")
print("="*70)

X = np.load("X_69_25000.npy")
y = np.load("y_69_25000.npy")
print(f"X shape: {X.shape}, clases: {np.bincount(y)}")

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
model = xgb.XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.1, subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1, eval_metric='logloss')
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
print(f"Accuracy en test: {accuracy_score(y_test, y_pred):.4f}")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=-1)
print(f"\nCV (5 folds): {scores.mean():.4f} (+/- {scores.std():.4f})")
print(f"Folds: {scores}")
