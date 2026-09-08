# [CODE]
import sys
import numpy as np
from analizadorpython import db3_escanner_coherencia

def analizar_lote(files):
    print(f"{'Archivo':<20} | {'Media':<8} | {'Std':<8} | {'Max Z':<8} | {'Anomalías (>7.0)':<18}")
    print("-" * 75)
    
    for f in files:
        data = db3_escanner_coherencia(f)
        if data is None:
            print(f"{f:<20} | ERROR")
            continue
            
        m = data['matriz_curtosis']
        media, std = np.mean(m), np.std(m)
        z_scores = (m - media) / (std + 1e-5)
        max_z = np.max(z_scores)
        # Ajustamos umbral a 7.0 para ignorar el ruido natural de la piel/textura
        count = np.sum(z_scores > 7.0)
        
        print(f"{f:<20} | {media:<8.2f} | {std:<8.2f} | {max_z:<8.2f} | {count:<18}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        analizar_lote(sys.argv[1:])
    else:
        print("Uso: python3 test_comparativo.py prueba.jpg ai.jpg hibrida.jpg")