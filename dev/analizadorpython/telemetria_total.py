# [CODE]
import sys
from analizadorpython import db3_escanner_coherencia

def dump_telemetria(files):
    # Definimos las métricas que el analizador ya está extrayendo
    metricas = [
        "aleatoriedad_espacial", "curtosis_residual", "var_curtosis_local",
        "skewness_residual", "energia_ac_media", "varianza_energia_ac",
        "entropia_signo", "ratio_costuras"
    ]
    
    # Cabecera dinámica
    header = f"{'Archivo':<15}"
    for m in metricas: header += f" | {m:<15}"
    print(header)
    print("-" * len(header))
    
    for f in files:
        data = db3_escanner_coherencia(f)
        if data is None:
            print(f"{f:<15} | ERROR")
            continue
            
        linea = f"{f:<15}"
        for m in metricas:
            val = data.get(m, 0.0)
            linea += f" | {val:<15.4f}"
        print(linea)

if __name__ == "__main__":
    dump_telemetria(["prueba.jpg", "ai.jpg", "hibrida.jpg"])