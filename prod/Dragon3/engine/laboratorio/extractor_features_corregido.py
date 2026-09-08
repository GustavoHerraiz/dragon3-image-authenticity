import sys
import json
import numpy as np
import cv2
from skimage import feature, exposure, color
from skimage.feature import graycomatrix, graycoprops
import pywt
import time
import os

def extraer_features_corregido(ruta_imagen):
    """
    Extrae 7 grupos de features de una imagen, con validaciones para garantizar
    que todos los valores son numéricos, no nulos, y en rangos esperados.

    Features:
    1. Raw pixels: media, mediana, desviación, min, max.
    2. Color histograms: histogramas RGB normalizados (8 bins cada canal).
    3. DCT: media, desviación, energía de los coeficientes de alta frecuencia.
    4. HOG: media, desviación, suma.
    5. LBP: histograma (8 bins), uniformidad (proporción de patrones uniformes), entropía.
    6. GLCM: contraste, disimilitud, homogeneidad, energía, correlación.
    7. Wavelet: para 6 subbandas (cH1, cV1, cD1, cH2, cV2, cD2): media, desviación, energía.

    TODAS las features son números reales, sin NaN, sin Inf, y en rangos que se pueden
    escalar posteriormente.
    """
    t0 = time.time()

    # 1. Cargar imagen
    img = cv2.imread(ruta_imagen)
    if img is None:
        raise ValueError("No se pudo leer la imagen")

    # Convertir a RGB y escala de grises
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img_gray.shape
    total_pixels = h * w

    features = {}
    tiempos = {}

    # ============================================================
    # 1. RAW PIXELS
    # ============================================================
    t1 = time.time()
    pixels = img_gray.flatten().astype(np.float64)
    features['raw_pixels'] = {
        'mean': float(np.mean(pixels)),
        'median': float(np.median(pixels)),
        'std': float(np.std(pixels)),
        'min': int(np.min(pixels)),
        'max': int(np.max(pixels))
    }
    tiempos['raw_pixels'] = time.time() - t1

    # ============================================================
    # 2. COLOR HISTOGRAMS (normalizados)
    # ============================================================
    t1 = time.time()
    # Histogramas con 8 bins por canal
    hist_r = np.histogram(img_rgb[:,:,0], bins=8, range=(0,255))[0].astype(np.float64)
    hist_g = np.histogram(img_rgb[:,:,1], bins=8, range=(0,255))[0].astype(np.float64)
    hist_b = np.histogram(img_rgb[:,:,2], bins=8, range=(0,255))[0].astype(np.float64)
    # Normalizar por el número total de píxeles
    hist_r = hist_r / total_pixels
    hist_g = hist_g / total_pixels
    hist_b = hist_b / total_pixels
    features['color_histograms'] = {
        'r': hist_r.tolist(),
        'g': hist_g.tolist(),
        'b': hist_b.tolist()
    }
    tiempos['color_histograms'] = time.time() - t1

    # ============================================================
    # 3. DCT (coeficientes de alta frecuencia)
    # ============================================================
    t1 = time.time()
    block_size = 8
    # Redimensionar a múltiplo de 8 para bloques completos
    h2 = (h // block_size) * block_size
    w2 = (w // block_size) * block_size
    if h2 > 0 and w2 > 0:
        img_dct = img_gray[:h2, :w2].astype(np.float32)
        dct_coeffs = []
        for y in range(0, h2, block_size):
            for x in range(0, w2, block_size):
                block = img_dct[y:y+block_size, x:x+block_size]
                dct_block = cv2.dct(block)
                # Coeficientes de alta frecuencia (mitad inferior derecha)
                high_freq = dct_block[4:, 4:].flatten()
                dct_coeffs.extend(high_freq)
        dct_coeffs = np.array(dct_coeffs, dtype=np.float64)
        if len(dct_coeffs) > 0:
            features['dct'] = {
                'mean_high': float(np.mean(dct_coeffs)),
                'std_high': float(np.std(dct_coeffs)),
                'energy_high': float(np.sum(dct_coeffs**2))
            }
        else:
            features['dct'] = {'mean_high': 0.0, 'std_high': 0.0, 'energy_high': 0.0}
    else:
        features['dct'] = {'mean_high': 0.0, 'std_high': 0.0, 'energy_high': 0.0}
    tiempos['dct'] = time.time() - t1

    # ============================================================
    # 4. HOG
    # ============================================================
    t1 = time.time()
    # Redimensionar a 128x128 para consistencia
    if h > 0 and w > 0:
        img_hog = cv2.resize(img_gray, (128, 128))
        hog_features = feature.hog(img_hog, orientations=9, pixels_per_cell=(8,8),
                                   cells_per_block=(2,2), visualize=False)
        if len(hog_features) > 0:
            features['hog'] = {
                'mean': float(np.mean(hog_features)),
                'std': float(np.std(hog_features)),
                'sum': float(np.sum(hog_features))
            }
        else:
            features['hog'] = {'mean': 0.0, 'std': 0.0, 'sum': 0.0}
    else:
        features['hog'] = {'mean': 0.0, 'std': 0.0, 'sum': 0.0}
    tiempos['hog'] = time.time() - t1

    # ============================================================
    # 5. LBP (Uniform LBP)
    # ============================================================
    t1 = time.time()
    P = 8
    R = 1
    lbp = feature.local_binary_pattern(img_gray, P=P, R=R, method='uniform')
    # lbp tiene valores 0..P+1, donde P+1 es el código para no uniforme
    # El histograma de 0..P+1 (9 bins en este caso: 0..8)
    hist_lbp, _ = np.histogram(lbp.ravel(), bins=np.arange(0, P+2), range=(0, P+1))
    hist_lbp = hist_lbp.astype(np.float64) / total_pixels  # normalizar
    # Uniformidad: proporción de píxeles con lbp < P+1 (es decir, uniformes)
    uniform_mask = (lbp < P+1)
    uniformity = np.sum(uniform_mask) / total_pixels if total_pixels > 0 else 0.0
    # Entropía del histograma (solo para píxeles uniformes, o sobre todo el histograma)
    # Usamos el histograma normalizado de todos los valores (0..P+1)
    # Para evitar log(0), añadimos un pequeño epsilon
    eps = 1e-10
    entropy = -np.sum(hist_lbp * np.log2(hist_lbp + eps))

    features['lbp'] = {
        'histogram': hist_lbp.tolist(),
        'uniformity': float(uniformity),
        'entropy': float(entropy)
    }
    tiempos['lbp'] = time.time() - t1

    # ============================================================
    # 6. GLCM
    # ============================================================
    t1 = time.time()
    # Reducir resolución para acelerar
    if h > 0 and w > 0:
        img_small = cv2.resize(img_gray, (64, 64))
        # Asegurar que los valores son enteros y en rango 0-255
        img_small = np.clip(img_small, 0, 255).astype(np.uint8)
        # Calcular GLCM para 4 ángulos
        try:
            glcm = graycomatrix(img_small, distances=[1], angles=[0, np.pi/4, np.pi/2, 3*np.pi/4],
                                levels=256, symmetric=True, normed=True)
            # Propiedades
            props = ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']
            glcm_features = {}
            for prop in props:
                val = graycoprops(glcm, prop)[0]
                # Asegurar que todos los valores son no negativos y finitos
                val = np.nan_to_num(val, nan=0.0, posinf=0.0, neginf=0.0)
                # Para energy, puede ser muy pequeño pero nunca negativo
                if prop == 'energy':
                    val = np.maximum(val, 0.0)  # forzar no negativo
                glcm_features[prop] = float(np.mean(val))
            features['glcm'] = glcm_features
        except Exception as e:
            # Si falla, devolver ceros
            features['glcm'] = {p: 0.0 for p in ['contrast','dissimilarity','homogeneity','energy','correlation']}
    else:
        features['glcm'] = {p: 0.0 for p in ['contrast','dissimilarity','homogeneity','energy','correlation']}
    tiempos['glcm'] = time.time() - t1

    # ============================================================
    # 7. Wavelet (db4, nivel 2)
    # ============================================================
    t1 = time.time()
    try:
        coeffs = pywt.wavedec2(img_gray, 'db4', level=2)
        # Extraer estadísticos de los coeficientes de detalle
        # coeffs = [cA, (cH1, cV1, cD1), (cH2, cV2, cD2)]
        cA, (cH1, cV1, cD1), (cH2, cV2, cD2) = coeffs
        wavelet_features = {}
        for name, arr in [('cH1', cH1), ('cV1', cV1), ('cD1', cD1),
                          ('cH2', cH2), ('cV2', cV2), ('cD2', cD2)]:
            arr = arr.astype(np.float64)
            wavelet_features[name + '_mean'] = float(np.mean(arr))
            wavelet_features[name + '_std'] = float(np.std(arr))
            wavelet_features[name + '_energy'] = float(np.sum(arr**2))
        features['wavelet'] = wavelet_features
    except Exception as e:
        # Si falla, devolver ceros para todas las subbandas
        wavelet_features = {}
        for name in ['cH1','cV1','cD1','cH2','cV2','cD2']:
            wavelet_features[name + '_mean'] = 0.0
            wavelet_features[name + '_std'] = 0.0
            wavelet_features[name + '_energy'] = 0.0
        features['wavelet'] = wavelet_features
    tiempos['wavelet'] = time.time() - t1

    # ============================================================
    # TELEMETRÍA
    # ============================================================
    features['_telemetria'] = {
        'tiempo_total': time.time() - t0,
        'tiempos_por_feature': tiempos,
        'dimensiones_imagen': [h, w, img.shape[2] if len(img.shape)==3 else 1],
        'total_pixels': total_pixels
    }

    # Validación final: asegurar que no hay NaN ni Inf en ninguna feature
    # Recorremos recursivamente y reemplazamos si es necesario
    def clean_values(obj):
        if isinstance(obj, dict):
            return {k: clean_values(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_values(v) for v in obj]
        elif isinstance(obj, float):
            if np.isnan(obj) or np.isinf(obj):
                return 0.0
            return obj
        else:
            return obj

    features = clean_values(features)

    return features

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Se requiere ruta de imagen"}))
        sys.exit(1)
    ruta = sys.argv[1]
    try:
        features = extraer_features_corregido(ruta)
        print(json.dumps(features, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
