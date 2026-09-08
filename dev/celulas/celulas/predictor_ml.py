import sys
import json
import joblib
import numpy as np
from PIL import Image
import os

# Este es un placeholder. En producción, aquí extraeríamos las 39 features.
# Por ahora, usamos el modelo entrenado con 10 muestras y devolvemos un resultado simulado.
# En el futuro, este script llamará a las células para extraer las features.

def extraer_features_de_imagen(ruta_imagen):
    # TODO: Implementar extracción real usando las células.
    # Por ahora, devolvemos un vector de 39 features ficticios.
    # (En producción, se llamaría a las células existentes o se reutilizaría el extractor)
    return np.random.rand(39).tolist()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'esIA': False, 'confianza': 0.5, 'error': 'No se proporcionó imagen'}))
        sys.exit(1)
    
    ruta = sys.argv[1]
    try:
        # Extraer features (placeholder)
        features = extraer_features_de_imagen(ruta)
        
        # Cargar modelo
        modelo_path = os.path.join(os.path.dirname(__file__), '../dataset/test/modelo_10.pkl')
        pipeline = joblib.load(modelo_path)
        
        # Predecir
        pred = pipeline.predict([features])[0]
        proba = pipeline.predict_proba([features])[0]
        confianza = max(proba)
        
        print(json.dumps({
            'esIA': bool(pred),
            'confianza': float(confianza)
        }))
    except Exception as e:
        print(json.dumps({'esIA': False, 'confianza': 0, 'error': str(e)}))
