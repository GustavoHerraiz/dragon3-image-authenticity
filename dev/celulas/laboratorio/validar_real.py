import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

print("=" * 70)
print("VALIDACIÓN REAL DEL MODELO (sin fuga de datos)")
print("=" * 70)

X = np.load("X_69_25000.npy")
y = np.load("y_69_25000.npy")

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

# Mejores parámetros encontrados (copia exacta de la optimización)
best_params = {
    'colsample_bytree': 0.9771,
    'gamma': 0.2994,
    'learning_rate': 0.2184,
    'max_depth': 6,
    'min_child_weight': 2,
    'n_estimators': 219,
    'reg_alpha': 0.8081,
    'reg_lambda': 0.6334,
    'subsample': 0.9486,
    'random_state': 42,
    'n_jobs': -1,
    'eval_metric': 'logloss',
    'use_label_encoder': False
}

model = xgb.XGBClassifier(**best_params)
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"\n✅ Accuracy en test (20% de 25,000): {acc:.4f}")
print("\nReporte de clasificación:")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))
print("\nMatriz de confusión:")
print(confusion_matrix(y_test, y_pred))
