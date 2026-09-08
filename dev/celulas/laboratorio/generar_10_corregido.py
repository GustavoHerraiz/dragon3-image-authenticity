import json
import numpy as np
import base64
import tempfile
import os
import random
from pathlib import Path

# Importar el extractor corregido
from extractor_features_corregido import extraer_features_corregido

# Ruta al JSON de 10 imágenes (el que usamos antes)
JSON_PATH = Path('/opt/dragon3/dev/celulas/test_mover/resultados/descarga_test.json')

print('📄 Cargando JSON de 10 imágenes...')
with open(JSON_PATH, 'r') as f:
    data = json.load(f)

print(f'✅ {len(data)} documentos cargados')

# Extraer features de cada documento
X = []
y = []
targets_text = []

for i, doc in enumerate(data):
    buffer_b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
    if not buffer_b64:
        print(f'   ⚠️ Documento {i} sin buffer, saltando')
        continue
    
    # Guardar buffer en archivo temporal
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(base64.b64decode(buffer_b64))
        temp_path = f.name
    
    try:
        # Extraer features con el extractor corregido
        features = extraer_features_corregido(temp_path)
        
        # Construir vector plano (orden fijo)
        vector = []
        
        # 1. raw_pixels (5)
        for k in ['mean','median','std','min','max']:
            vector.append(features['raw_pixels'][k])
        
        # 2. color_histograms (24)
        for channel in ['r','g','b']:
            vector.extend(features['color_histograms'][channel])
        
        # 3. dct (3)
        vector.append(features['dct']['mean_high'])
        vector.append(features['dct']['std_high'])
        vector.append(features['dct']['energy_high'])
        
        # 4. hog (3)
        vector.append(features['hog']['mean'])
        vector.append(features['hog']['std'])
        vector.append(features['hog']['sum'])
        
        # 5. lbp (10)
        vector.extend(features['lbp']['histogram'])  # 8 bins
        vector.append(features['lbp']['uniformity'])
        vector.append(features['lbp']['entropy'])
        
        # 6. glcm (5)
        for k in ['contrast','dissimilarity','homogeneity','energy','correlation']:
            vector.append(features['glcm'][k])
        
        # 7. wavelet (18)
        for sub in ['cH1','cV1','cD1','cH2','cV2','cD2']:
            vector.append(features['wavelet'][sub+'_mean'])
            vector.append(features['wavelet'][sub+'_std'])
            vector.append(features['wavelet'][sub+'_energy'])
        
        # Target
        comentario = doc.get('comentarioFeedback', '')
        target = 1 if 'IA' in comentario else 0
        
        X.append(vector)
        y.append(target)
        targets_text.append(comentario)
        
        print(f'   ✅ Documento {i}: {comentario} → features extraídos')
        
    except Exception as e:
        print(f'   ❌ Error en documento {i}: {e}')
    finally:
        # Limpiar archivo temporal
        if os.path.exists(temp_path):
            os.unlink(temp_path)

X = np.array(X, dtype=np.float64)
y = np.array(y, dtype=np.int64)

print(f'\n📊 Dataset guardado: {len(X)} muestras, {X.shape[1]} features')
print(f'   Clases: {np.unique(y)} (0=Humano, 1=IA)')
print(f'   Targets reales: {targets_text}')

# Guardar
np.save('X_10_corregido.npy', X)
np.save('y_10_corregido.npy', y)

# Mostrar estadísticas básicas
print('\n📊 ESTADÍSTICOS DE CADA FEATURE (media, std):')
for i in range(min(5, X.shape[1])):
    print(f'   Feature {i}: media={X[:,i].mean():.4f}, std={X[:,i].std():.4f}, min={X[:,i].min():.4f}, max={X[:,i].max():.4f}')

print('\n✅ Dataset generado correctamente')
