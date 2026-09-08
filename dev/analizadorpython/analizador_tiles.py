# [CODE]
# analizador_tiles.py - Escaneo de precisión (Híbrida Tile-a-Tile)
import sys
import numpy as np
from analizadorpython import db3_escanner_coherencia

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 analizador_tiles.py hibrida.jpg")
        return

    filepath = sys.argv[1]
    data = db3_escanner_coherencia(filepath)
    
    if data is None or 'matriz_curtosis' not in data:
        print("Error: Datos insuficientes.")
        return

    m = data['matriz_curtosis']
    h, w = m.shape
    
    print(f"ANÁLISIS TILE A TILE: {filepath}")
    print(f"Dimensiones: {h}x{w} (Tiles)")
    print("-" * (w * 8))
    
    # Imprimir matriz como grid de valores para detectar el salto de fase (costura)
    for i in range(h):
        row_str = ""
        for j in range(w):
            val = m[i, j]
            # Resaltar valores anómalos (> promedio + 2 std) que indican costura
            if val > (np.mean(m) + 2 * np.std(m)):
                row_str += f"[{val:5.1f}] "
            else:
                row_str += f" {val:5.1f}  "
        print(row_str)

if __name__ == "__main__":
    main()