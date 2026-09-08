import numpy as np
import joblib
import time
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

print('📊 Cargando dataset de 200 muestras...')
X = np.load('X_200_corregido.npy')
y = np.load('y_200_corregido.npy')
print(f'   X shape: {X.shape}, y shape: {y.shape}')
print(f'   Humanas: {sum(y==0)}, IA: {sum(y==1)}')

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
print(f'\n📊 División: Train={len(X_train)}, Test={len(X_test)}')

print('\n🧠 Entrenando Random Forest (100 árboles, profundidad 5)...')
t0 = time.time()
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('rf', RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, n_jobs=1))
])
pipeline.fit(X_train, y_train)
tiempo_entrenamiento = time.time() - t0
print(f'   ✅ Entrenado en {tiempo_entrenamiento:.2f} segundos')

y_pred = pipeline.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f'\n🎯 Accuracy en test: {acc:.2%}')
print('\n📊 Reporte de clasificación:')
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

cm = confusion_matrix(y_test, y_pred)
print('\n📊 Matriz de confusión:')
print(cm)

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring='accuracy')
print(f'\n📊 Validación cruzada (5 folds):')
print(f'   Media: {cv_scores.mean():.2%}')
print(f'   Desviación: {cv_scores.std():.2%}')
print(f'   Scores: {cv_scores}')

# Importancia de features
importances = pipeline.named_steps['rf'].feature_importances_
feature_names = []
# raw_pixels (5)
feature_names += ['raw_mean','raw_median','raw_std','raw_min','raw_max']
# color_histograms (24)
for c in ['r','g','b']:
    feature_names += [f'{c}{i}' for i in range(8)]
# dct (3)
feature_names += ['dct_mean','dct_std','dct_energy']
# hog (3)
feature_names += ['hog_mean','hog_std','hog_sum']
# lbp (10)
feature_names += [f'lbp_hist{i}' for i in range(8)] + ['lbp_uniformity','lbp_entropy']
# glcm (5)
feature_names += ['glcm_contrast','glcm_dissim','glcm_homog','glcm_energy','glcm_corr']
# wavelet (18)
for sub in ['cH1','cV1','cD1','cH2','cV2','cD2']:
    feature_names += [f'{sub}_mean', f'{sub}_std', f'{sub}_energy']

idx = np.argsort(importances)[::-1]
print('\n📊 Top 10 features (importancia Gini):')
for i in range(10):
    print(f'   {i+1}. {feature_names[idx[i]]}: {importances[idx[i]]:.4f}')

joblib.dump(pipeline, '/opt/dragon3/dev/celulas/modelos/modelo_7features_200.pkl')
print('\n✅ Modelo guardado en /opt/dragon3/dev/celulas/modelos/modelo_7features_200.pkl')

# Guardar métricas en CSV
resultados = {
    'modelo': '7features_200',
    'accuracy_test': acc,
    'cv_mean': cv_scores.mean(),
    'cv_std': cv_scores.std(),
    'tiempo_entrenamiento': tiempo_entrenamiento,
    'n_muestras': len(X),
    'n_features': X.shape[1],
    'train_size': len(X_train),
    'test_size': len(X_test)
}
df = pd.DataFrame([resultados])
df.to_csv('resultados_200_7features.csv', index=False)
print('📁 Métricas guardadas en resultados_200_7features.csv')
