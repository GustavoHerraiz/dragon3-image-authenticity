import sys
import json
import numpy as np
import cv2
from skimage import feature, exposure, color
from skimage.feature import graycomatrix, graycoprops
import pywt
import os
import time

def extraer_features(ruta_imagen):
    t0 = time.time()
    
    # 1. Cargar imagen
    img = cv2.imread(ruta_imagen)
    if img is None:
        raise ValueError("No se pudo leer la imagen")
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    img_gray = img_gray.astype(np.uint8)
    
    features = {}
    tiempos = {}
    
    # ======================
    # 1. RAW PIXELS (estadísticos básicos)
    # ======================
    t1 = time.time()
    pixels = img_gray.flatten()
    features['raw_pixels'] = {
        'mean': float(np.mean(pixels)),
        'median': float(np.median(pixels)),
        'std': float(np.std(pixels)),
        'min': int(np.min(pixels)),
        'max': int(np.max(pixels))
    }
    tiempos['raw_pixels'] = time.time() - t1
    
    # ======================
    # 2. COLOR HISTOGRAMS (RGB, 8 bins cada canal)
    # ======================
    t1 = time.time()
    hist_r = np.histogram(img_rgb[:,:,0], bins=8, range=(0,255))[0].tolist()
    hist_g = np.histogram(img_rgb[:,:,1], bins=8, range=(0,255))[0].tolist()
    hist_b = np.histogram(img_rgb[:,:,2], bins=8, range=(0,255))[0].tolist()
    features['color_histograms'] = {
        'r': hist_r,
        'g': hist_g,
        'b': hist_b
    }
    tiempos['color_histograms'] = time.time() - t1
    
    # ======================
    # 3. DCT (coeficientes de alta frecuencia)
    # ======================
    t1 = time.time()
    # DCT en bloques de 8x8
    block_size = 8
    h, w = img_gray.shape
    dct_coeffs = []
    for y in range(0, h - block_size + 1, block_size):
        for x in range(0, w - block_size + 1, block_size):
            block = img_gray[y:y+block_size, x:x+block_size]
            dct_block = cv2.dct(np.float32(block))
            # Coeficientes de alta frecuencia (esquina inferior derecha)
            high_freq = dct_block[4:, 4:].flatten()
            dct_coeffs.extend(high_freq)
    if len(dct_coeffs) > 0:
        dct_coeffs = np.array(dct_coeffs)
        features['dct'] = {
            'mean_high': float(np.mean(dct_coeffs)),
            'std_high': float(np.std(dct_coeffs)),
            'energy_high': float(np.sum(dct_coeffs**2))
        }
    else:
        features['dct'] = {'mean_high': 0, 'std_high': 0, 'energy_high': 0}
    tiempos['dct'] = time.time() - t1
    
    # ======================
    # 4. HOG (Histogram of Oriented Gradients)
    # ======================
    t1 = time.time()
    # Redimensionar a 128x128 para consistencia
    img_resized = cv2.resize(img_gray, (128, 128))
    hog_features = feature.hog(img_resized, orientations=9, pixels_per_cell=(8,8),
                               cells_per_block=(2,2), visualize=False)
    features['hog'] = {
        'mean': float(np.mean(hog_features)),
        'std': float(np.std(hog_features)),
        'sum': float(np.sum(hog_features))
    }
    tiempos['hog'] = time.time() - t1
    
    # ======================
    # 5. LBP (Local Binary Patterns)
    # ======================
    t1 = time.time()
    lbp = feature.local_binary_pattern(img_gray, P=8, R=1, method='uniform')
    (hist_lbp, _) = np.histogram(lbp.ravel(), bins=np.arange(0, 10), range=(0, 9))
    features['lbp'] = {
        'histogram': hist_lbp.tolist(),
        'uniformity': float(np.mean(lbp)),
        'entropy': float(-np.sum(hist_lbp * np.log2(hist_lbp + 1e-10)))
    }
    tiempos['lbp'] = time.time() - t1
    
    # ======================
    # 6. GLCM (Gray-Level Co-occurrence Matrix)
    # ======================
    t1 = time.time()
    # Reducir resolución para acelerar
    img_small = cv2.resize(img_gray, (64, 64))
    glcm = graycomatrix(img_small, distances=[1], angles=[0, np.pi/4, np.pi/2, 3*np.pi/4],
                        levels=256, symmetric=True, normed=True)
    # Propiedades: contraste, disimilitud, homogeneidad, energía, correlación
    props = ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']
    glcm_features = {}
    for prop in props:
        val = graycoprops(glcm, prop)[0]
        glcm_features[prop] = float(np.mean(val))
    features['glcm'] = glcm_features
    tiempos['glcm'] = time.time() - t1
    
    # ======================
    # 7. Wavelet (coeficientes)
    # ======================
    t1 = time.time()
    coeffs = pywt.wavedec2(img_gray, 'db4', level=2)
    # Extraer estadísticos de los coeficientes de detalle (cA, cH, cV, cD)
    cA, (cH1, cV1, cD1), (cH2, cV2, cD2) = coeffs
    wavelet_features = {}
    for name, arr in [('cH1', cH1), ('cV1', cV1), ('cD1', cD1),
                      ('cH2', cH2), ('cV2', cV2), ('cD2', cD2)]:
        wavelet_features[name + '_mean'] = float(np.mean(arr))
        wavelet_features[name + '_std'] = float(np.std(arr))
        wavelet_features[name + '_energy'] = float(np.sum(arr**2))
    features['wavelet'] = wavelet_features
    tiempos['wavelet'] = time.time() - t1
    
    # Telemetría
    features['_telemetria'] = {
        'tiempo_total': time.time() - t0,
        'tiempos_por_feature': tiempos,
        'tamaño_imagen': img.shape,
        'canales': img.shape[2] if len(img.shape)==3 else 1
    }
    
    return features

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Se requiere ruta de imagen"}))
        sys.exit(1)
    ruta = sys.argv[1]
    try:
        features = extraer_features(ruta)
        print(json.dumps(features, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
