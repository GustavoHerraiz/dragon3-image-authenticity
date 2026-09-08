# [CODE]
import sys
import numpy as np
from analizadorpython import db3_escanner_coherencia

def detectar_parche_local(filepath):
    data = db3_escanner_coherencia(filepath)
    if data is None: return

    matriz = data['matriz_curtosis']
    # Umbral de planitud (30% de la media)
    is_flat = matriz < (np.mean(matriz) * 0.3)
    
    # Detección de conectividad (8-vecinos)
    has_neighbor = np.zeros_like(is_flat, dtype=bool)
    for dr in [-1, 0, 1]:
        for dc in [-1, 0, 1]:
            if dr == 0 and dc == 0: continue
            shift = np.roll(is_flat, shift=(dr, dc), axis=(0, 1))
            has_neighbor |= (is_flat & shift)
    
    # Contamos tiles que forman parte de un grupo (cluster)
    num_clusters = np.sum(has_neighbor)
    
    # Umbral: si hay más de 10 tiles conectados, es un parche, no ruido.
    if num_clusters > 10:
        print(f"ALERTA: {num_clusters} tiles conectados detectados (Posible IA).")
    else:
        print("ESTADO: MBH CERTIFICADO.")

if __name__ == "__main__":
    detectar_parche_local(sys.argv[1])