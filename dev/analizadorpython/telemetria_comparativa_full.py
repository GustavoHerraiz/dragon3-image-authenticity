# [CODE]
import sys
from analizadorpython import db3_escanner_coherencia

def dump_completo(files):
    # Lista de todas las variables que devuelve el objeto db3
    # Ignoramos el filtrado, queremos el vector de estado puro
    
    print(f"{'Archivo':<15} | {'Aleatoriedad':<12} | {'Curtosis_Res':<12} | {'Skewness':<12} | {'Energia_AC':<12} | {'Varianza_AC':<12} | {'Entropia':<12} | {'Ratio_Cost':<12}")
    print("-" * 115)
    
    for f in files:
        data = db3_escanner_coherencia(f)
        if data is None: continue
            
        print(f"{f:<15} | {data.get('aleatoriedad_espacial', 0):<12.4f} | {data.get('curtosis_residual', 0):<12.4f} | {data.get('skewness_residual', 0):<12.4f} | {data.get('energia_ac_media', 0):<12.4f} | {data.get('varianza_energia_ac', 0):<12.4f} | {data.get('entropia_signo', 0):<12.4f} | {data.get('ratio_costuras', 0):<12.4f}")

if __name__ == "__main__":
    dump_completo(["prueba.jpg", "ai.jpg", "hibrida.jpg"])