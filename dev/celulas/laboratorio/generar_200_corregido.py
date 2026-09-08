import json
import numpy as np
import base64
import tempfile
import os
import random
import time
from pathlib import Path
from extractor_features_corregido import extraer_features_corregido

BACKUP_PATH = Path('/opt/dragon3/dev/celulas/backup_datos/descarga_1_combinado.json')

print('📄 Cargando JSON de backup (18k documentos)...')
with open(BACKUP_PATH, 'r') as f:
    data = json.load(f)

humanos = [d for d in data if 'humano' in d.get('comentarioFeedback', '')]
ias = [d for d in data if 'IA' in d.get('comentarioFeedback', '')]
print(f'📊 Totales: Humanos={len(humanos)}, IA={len(ias)}')

random.seed(42)
humanos_100 = random.sample(humanos, 100)
ias_100 = random.sample(ias, 100)
muestra = humanos_100 + ias_100
random.shuffle(muestra)

print(f'✅ Muestra de {len(muestra)} imágenes seleccionada')

X = []
y = []
errores = 0

for i, doc in enumerate(muestra):
    buffer_b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
    if not buffer_b64:
        errores += 1
        continue
    
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(base64.b64decode(buffer_b64))
        temp_path = f.name
    
    try:
        features = extraer_features_corregido(temp_path)
        vector = []
        # raw_pixels (5)
        for k in ['mean','median','std','min','max']:
            vector.append(features['raw_pixels'][k])
        # color_histograms (24)
        for channel in ['r','g','b']:
            vector.extend(features['color_histograms'][channel])
        # dct (3)
        vector.append(features['dct']['mean_high'])
        vector.append(features['dct']['std_high'])
        vector.append(features['dct']['energy_high'])
        # hog (3)
        vector.append(features['hog']['mean'])
        vector.append(features['hog']['std'])
        vector.append(features['hog']['sum'])
        # lbp (10)
        vector.extend(features['lbp']['histogram'])
        vector.append(features['lbp']['uniformity'])
        vector.append(features['lbp']['entropy'])
        # glcm (5)
        for k in ['contrast','dissimilarity','homogeneity','energy','correlation']:
            vector.append(features['glcm'][k])
        # wavelet (18)
        for sub in ['cH1','cV1','cD1','cH2','cV2','cD2']:
            vector.append(features['wavelet'][sub+'_mean'])
            vector.append(features['wavelet'][sub+'_std'])
            vector.append(features['wavelet'][sub+'_energy'])
        
        comentario = doc.get('comentarioFeedback', '')
        target = 1 if 'IA' in comentario else 0
        X.append(vector)
        y.append(target)
        
        if (i+1) % 20 == 0:
            print(f'   Procesadas {i+1}/{len(muestra)} imágenes...')
        
    except Exception as e:
        print(f'   ❌ Error en documento {i}: {e}')
        errores += 1
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

X = np.array(X, dtype=np.float64)
y = np.array(y, dtype=np.int64)

print(f'\n📊 Dataset generado: {len(X)} muestras, {X.shape[1]} features')
print(f'   Errores: {errores}')
print(f'   Distribución: Humanas={sum(y==0)}, IA={sum(y==1)}')

np.save('X_200_corregido.npy', X)
np.save('y_200_corregido.npy', y)
print('✅ Dataset guardado')
