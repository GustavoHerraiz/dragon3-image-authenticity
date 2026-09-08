import numpy as np
import pickle
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

print("=" * 70)
print("VALIDACIÓN FINAL DEL MODELO OPTIMIZADO (test 20%)")
print("=" * 70)

X = np.load("X_69_25000.npy")
y = np.load("y_69_25000.npy")
print(f"X shape: {X.shape}, clases: {np.bincount(y)}")

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

# Cargar el mejor modelo
with open("modelo_xgboost_25000_optimizado.pkl", "rb") as f:
    model = pickle.load(f)

y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"\n✅ Accuracy en test (20% de 25,000): {acc:.4f}")
print("\nReporte de clasificación:")
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))
print("\nMatriz de confusión:")
print(confusion_matrix(y_test, y_pred))
