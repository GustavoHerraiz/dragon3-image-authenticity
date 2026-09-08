# [CODE]
# analizador_maestro.py - Diagnóstico Total (Multicapa + Heatmap + Sobel Edge Detector)
import sys
import os
import numpy as np
import cv2
from analizadorpython import db3_escanner_coherencia

def compute_aristas(f):
    """
    Procesado forense: Sobel Operator para detección de discontinuidad.
    Indispensable para identificar costuras de IA.
    """
    img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return np.zeros((64, 64))
    img = cv2.resize(img, (64, 64))
    grad_x = cv2.Sobel(img, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(img, cv2.CV_64F, 0, 1, ksize=3)
    mag = np.sqrt(grad_x**2 + grad_y**2)
    return mag / (np.max(mag) + 1e-6)

def get_forensic_metrics(data):
    m = data.get('matriz_curtosis', np.zeros((1,1)))
    grad_y, grad_x = np.gradient(m)
    mag_grad = np.sqrt(grad_x**2 + grad_y**2)
    idx = np.argmax(mag_grad)
    seam_loc = np.unravel_index(idx, mag_grad.shape)
    return {
        "Forensic_MaxGrad": np.max(mag_grad),
        "Forensic_SeamLoc": seam_loc,
        "Forensic_SkewK": np.mean((m.flatten() - np.mean(m))**3) / (np.std(m)**3 + 1e-6)
    }

def get_vogel_metrics(data):
    edges = data.get('aristas_struct', np.zeros((1,1)))
    # Vogel_EdgeCoherence: Mide simetría y continuidad
    vogel_score = np.sum(np.abs(np.diff(edges, axis=0))) / (np.prod(edges.shape) + 1e-6)
    return {
        "Vogel_EdgeCoherence": vogel_score,
        "Vogel_Distorsion": np.std(edges)
    }

def print_heatmap(name, m):
    print(f"\n[HEATMAP] {name}")
    h, w = m.shape
    for i in range(h):
        row_str = " ".join([f"{val:6.1f}" if val > 20 else "    .   " for val in m[i, :]])
        print(row_str)

def main():
    files = sys.argv[1:]
    if not files: return
    
    dataset = {}
    all_keys = set()
    
    # Proceso de carga robusto
    for f in files:
        if not os.path.exists(f):
            print(f"[ERROR] Archivo no accesible: {f}")
            continue
            
        data = db3_escanner_coherencia(f)
        if data:
            # INYECCIÓN FORENSE: Sobel si aristas_struct está comprometido
            if 'aristas_struct' not in data or np.all(data['aristas_struct'] == 0):
                data['aristas_struct'] = compute_aristas(f)
            
            data.update(get_forensic_metrics(data))
            data.update(get_vogel_metrics(data))
            dataset[f] = data
            all_keys.update(data.keys())
    
    if not dataset: return

    # Exclusión de matrices del dump de tabla
    keys_to_exclude = {'matriz_curtosis', 'aristas_struct'}
    sorted_keys = [k for k in sorted(list(all_keys)) if k not in keys_to_exclude]
    
    # Header dinámico
    header = f"{'PARAMETRO':<25}"
    for f in files: 
        if f in dataset:
            header += f" | {f:<15}"
    print(header)
    print("-" * len(header))
    
    # Impresión de métricas con control de existencia
    for k in sorted_keys:
        row = f"{k:<25}"
        for f in files:
            val = dataset.get(f, {}).get(k, "N/A")
            if isinstance(val, (float, np.float32, np.float64)):
                row += f" | {val:<15.4f}"
            elif isinstance(val, np.ndarray):
                row += f" | μ{val.mean():.2f}"
            else:
                row += f" | {str(val):<15}"
        print(row)
        
    # Volcado de mapas de calor para auditoría
    for f in files:
        if f in dataset and 'matriz_curtosis' in dataset[f]:
            print_heatmap(f, dataset[f]['matriz_curtosis'])

if __name__ == "__main__":
    main()