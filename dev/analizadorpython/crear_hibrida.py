# [CODE]
# Generación de muestra híbrida para estrés forense
import cv2
import numpy as np

def crear_muestra_estres(base_path, output_path):
    img = cv2.imread(base_path)
    # Introducimos un bloque de "ruido sintético" de 100x100
    h, w = img.shape[:2]
    patch = np.random.normal(128, 50, (100, 100, 3)).astype(np.uint8) # Ruido gausiano (sintético)
    img[0:100, 0:100] = patch
    cv2.imwrite(output_path, img)
    print(f"[ESTRÉS] Muestra híbrida generada en {output_path}")

crear_muestra_estres("prueba.jpg", "hibrida.jpg")