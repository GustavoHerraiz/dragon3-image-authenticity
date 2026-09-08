import json
import numpy as np
import base64
import tempfile
import os
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent))
from extractor_features import extraer_features

# Cargar JSON de 10 imágenes
JSON_PATH = '/opt/dragon3/dev/celulas/test_mover/resultados/descarga_test.json'
print('📄 Cargando JSON de 10 imágenes...')
with open(JSON_PATH, 'r') as f:
    data = json.load(f)

print(f'✅ {len(data)} documentos cargados')

# Extraer features
X = []
y = []
targets = []

for i, doc in enumerate(data):
    comentario = doc.get('comentarioFeedback', '')
    target = 1 if 'IA' in comentario else 0
    targets.append(target)
    
    # Obtener buffer de la imagen
    buffer_b64 = doc.get('datosCelulas', {}).get('cargar-imagen', {}).get('buffer')
    if not buffer_b64:
        print(f'   ⚠️ Documento {i}: sin buffer')
        continue
    
    try:
        # Guardar imagen temporal
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(base64.b64decode(buffer_b64))
            temp_path = f.name
        
        # Extraer features usando el script Python
        features = extraer_features(temp_path)
        
        # Construir vector plano (orden fijo)
        vector = []
        # 1. raw_pixels (5)
        for k in ['mean', 'median', 'std', 'min', 'max']:
            vector.append(features['raw_pixels'][k])
        # 2. color_histograms (3*8=24)
        for channel in ['r', 'g', 'b']:
            vector.extend(features['color_histograms'][channel])
        # 3. dct (3)
        vector.extend([features['dct']['mean_high'], features['dct']['std_high'], features['dct']['energy_high']])
        # 4. hog (3)
        vector.extend([features['hog']['mean'], features['hog']['std'], features['hog']['sum']])
        # 5. lbp (histogram 9 + uniformity + entropy = 11)
        vector.extend(features['lbp']['histogram'])
        vector.append(features['lbp']['uniformity'])
        vector.append(features['lbp']['entropy'])
        # 6. glcm (5)
        for k in ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']:
            vector.append(features['glcm'][k])
        # 7. wavelet (18)
        for k, v in features['wavelet'].items():
            vector.append(v)
        
        X.append(vector)
        y.append(target)
        print(f'   ✅ Documento {i}: {comentario} → features extraídos')
        
        # Limpiar
        os.unlink(temp_path)
        
    except Exception as e:
        print(f'   ❌ Error en documento {i}: {e}')
        continue

# Guardar dataset
X = np.array(X)
y = np.array(y)
np.save('X_10_features.npy', X)
np.save('y_10_features.npy', y)

print(f'\n📊 Dataset guardado: {len(X)} muestras, {X.shape[1]} features')
print(f'   Clases: {np.unique(y)} (0=Humano, 1=IA)')
