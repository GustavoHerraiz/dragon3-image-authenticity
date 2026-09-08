import json
import numpy as np
import base64
import tempfile
import os
import random
from pathlib import Path
from extractor_features_corregido import extraer_features_corregido

BACKUP_PATH = Path('/opt/dragon3/dev/celulas/backup_datos/descarga_1_combinado.json')

print('📄 Cargando SOLO los primeros 5000 documentos...')
with open(BACKUP_PATH, 'r') as f:
    data = json.load(f)[:5000]  # Solo los primeros 5000

humanos = [d for d in data if 'humano' in d.get('comentarioFeedback', '')]
ias = [d for d in data if 'IA' in d.get('comentarioFeedback', '')]
print(f'✅ Humanos: {len(humanos)}, IA: {len(ias)} (de 5000)')

if len(humanos) < 100 or len(ias) < 100:
    print('⚠️ No hay suficientes, aumentando a 10000...')
    with open(BACKUP_PATH, 'r') as f:
        data = json.load(f)[:10000]
    humanos = [d for d in data if 'humano' in d.get('comentarioFeedback', '')]
    ias = [d for d in data if 'IA' in d.get('comentarioFeedback', '')]
    print(f'✅ Humanos: {len(humanos)}, IA: {len(ias)} (de 10000)')

random.seed(42)
humanos_100 = random.sample(humanos, 100)
ias_100 = random.sample(ias, 100)
muestra = humanos_100 + ias_100
random.shuffle(muestra)

print(f'🔍 Extrayendo features de {len(muestra)} imágenes...')
X, y = [], []
for i, doc in enumerate(muestra):
    b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
    if not b64: continue
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(base64.b64decode(b64)); temp = f.name
    try:
        feats = extraer_features_corregido(temp)
        vec = []
        for k in ['mean','median','std','min','max']: vec.append(feats['raw_pixels'][k])
        for c in ['r','g','b']: vec.extend(feats['color_histograms'][c])
        vec.extend([feats['dct']['mean_high'], feats['dct']['std_high'], feats['dct']['energy_high']])
        vec.extend([feats['hog']['mean'], feats['hog']['std'], feats['hog']['sum']])
        vec.extend(feats['lbp']['histogram'])
        vec.append(feats['lbp']['uniformity'])
        vec.append(feats['lbp']['entropy'])
        for k in ['contrast','dissimilarity','homogeneity','energy','correlation']:
            vec.append(feats['glcm'][k])
        for sub in ['cH1','cV1','cD1','cH2','cV2','cD2']:
            vec.append(feats['wavelet'][sub+'_mean'])
            vec.append(feats['wavelet'][sub+'_std'])
            vec.append(feats['wavelet'][sub+'_energy'])
        X.append(vec)
        y.append(1 if 'IA' in doc.get('comentarioFeedback','') else 0)
    finally:
        os.unlink(temp)
    if (i+1) % 20 == 0: print(f'   Procesadas {i+1}/{len(muestra)}')

X = np.array(X); y = np.array(y)
np.save('X_200_corregido.npy', X)
np.save('y_200_corregido.npy', y)
print(f'✅ Dataset guardado: {len(X)} muestras, {X.shape[1]} features')
