# [CODE]
import sys
import numpy as np
from analizadorpython import db3_escanner_coherencia

def test_batch(files):
    print(f"{'Archivo':<15} | {'Media':<10} | {'Clustering Score':<20} | {'Diagnóstico'}")
    print("-" * 75)
    
    for f in files:
        data = db3_escanner_coherencia(f)
        if data is None: continue
            
        m = data['matriz_curtosis']
        # Umbral dinámico: 15% más plano de la imagen
        threshold = np.percentile(m, 15)
        # Coordenadas de zonas silenciosas
        y_silencio, x_silencio = np.where(m < threshold)
        
        if len(y_silencio) == 0:
            print(f"{f:<15} | {np.mean(m):<10.2f} | 0.00 | MBH CERTIFICADO")
            continue
            
        # Medimos la dispersión (std dev de las posiciones)
        # Un score bajo significa que están muy juntas (agrupadas)
        dispersion_y = np.std(y_silencio)
        dispersion_x = np.std(x_silencio)
        clustering_score = (dispersion_y + dispersion_x) / 2
        
        # Umbral de agrupamiento: Si la dispersión es baja, están agrupadas
        if clustering_score < 10.0: # Ajuste según rejilla
            diag = "IA (PARCHE DETECTADO)"
        else:
            diag = "MBH CERTIFICADO"
            
        print(f"{f:<15} | {np.mean(m):<10.2f} | {clustering_score:<20.2f} | {diag}")

if __name__ == "__main__":
    test_batch(["prueba.jpg", "ai.jpg", "hibrida.jpg"])