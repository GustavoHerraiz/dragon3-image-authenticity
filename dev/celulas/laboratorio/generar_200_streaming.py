import ijson
import numpy as np
import base64
import tempfile
import os
import random
from pathlib import Path
from extractor_features_corregido import extraer_features_corregido

BACKUP_PATH = Path('/opt/dragon3/dev/celulas/backup_datos/descarga_1_combinado.json')

print('📄 Leyendo JSON en streaming (sin cargar todo)...')

humanos = []
ias = []

with open(BACKUP_PATH, 'rb') as f:
    parser = ijson.items(f, '')
    for doc in parser:
        comentario = doc.get('comentarioFeedback', '')
        if 'humano' in comentario and len(humanos) < 100:
            humanos.append(doc)
        elif 'IA' in comentario and len(ias) < 100:
            ias.append(doc)
        if len(humanos) >= 100 and len(ias) >= 100:
            break

print(f'✅ Humanos: {len(humanos)}, IA: {len(ias)}')

muestra = humanos + ias
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
