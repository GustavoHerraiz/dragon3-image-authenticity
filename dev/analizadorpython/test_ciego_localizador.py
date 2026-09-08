# [CODE]
import sys
import os
import numpy as np
from analizadorpython import db3_escanner_coherencia

def test_ciego_localizador(filepath):
    print("======================================================================")
    print("      DB3 FORENSICS: MODO DISPARIDAD DUAL (SPOTS vs FLAT) V4.6        ")
    print("======================================================================")
    
    if not os.path.exists(filepath):
        print(f"ERR: Archivo '{filepath}' no encontrado.")
        return

    data = db3_escanner_coherencia(filepath)
    if data is None or 'matriz_curtosis' not in data:
        print("ERR: Matriz de curtosis no disponible.")
        return

    matriz = data['matriz_curtosis']
    media_global = np.mean(matriz)
    std_global = np.std(matriz)
    
    # TELEMETRÍA GLOBAL
    print(f"TELEMETRÍA GLOBAL: Media={media_global:.4f}, Std={std_global:.4f}")
    
    # UMBRALES DE DISCRIMINACIÓN
    # Z > 3.5: Textura real (Spikes)
    # Z < -1.0: Aplanamiento sintético (Cold Spots)
    umbral_spike = 3.5 
    umbral_flat = -1.0
    
    tiles_spike = []
    tiles_flat = []
    
    for r in range(matriz.shape[0]):
        for c in range(matriz.shape[1]):
            val = matriz[r,c]
            z_score = (val - media_global) / (std_global + 1e-5)
            
            if z_score > umbral_spike:
                tiles_spike.append((r, c, val, z_score))
            elif z_score < umbral_flat:
                tiles_flat.append((r, c, val, z_score))
                # Alertamos de puntos fríos para estudio
                print(f"ALERTA TILE [{r},{c}]: Punto Frío (Z={z_score:.2f}) - Posible IA")

    # LÓGICA DE DECISIÓN FORENSE
    print("\n--- RESUMEN FORENSE ---")
    print(f"Spikes (Textura Real) detectados: {len(tiles_spike)}")
    print(f"Cold Spots (Planitud IA) detectados: {len(tiles_flat)}")
    
    # Diagnóstico: Una imagen real tiene muchos Spikes y pocos Cold Spots.
    # Una imagen IA tiene muchos Cold Spots (aplana) y pocos Spikes.
    if len(tiles_flat) > (len(tiles_spike) * 1.5) and len(tiles_flat) > 5:
        print("DIAGNÓSTICO: IA (SINTÉTICA) - Inconsistencia de aplanamiento detectada.")
    elif len(tiles_flat) > 0 and len(tiles_flat) > (len(tiles_spike) / 4):
        print("DIAGNÓSTICO: HÍBRIDA / PARCHE - Se detectaron intrusiones sintéticas.")
    else:
        print("DIAGNÓSTICO: MBH / SENSOR FÍSICO (Certificado, estructura coherente).")

    print("======================================================================")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_ciego_localizador(sys.argv[1])