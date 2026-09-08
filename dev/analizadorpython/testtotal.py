# [CODE]
import time
import os
from analizadorpython import db3_escanner_coherencia

def test_comparativo_total():
    target_human = "prueba.jpg"
    target_ai = "ai.jpg"
    
    print("======================================================================")
    print("        DB3 FORENSICS V4.2: MOTOR CROSS-REGIONAL ADAPTATIVO           ")
    print("======================================================================")
    
    resultados = {}
    
    for tipo, archivo in [("HUMANA (MBH)", target_human), ("IA (SINTÉTICA)", target_ai)]:
        print(f"\n[+] PROCESANDO: {tipo} -> {archivo}")
        if not os.path.exists(archivo):
            print(f"    ERR: Archivo '{archivo}' ausente.")
            continue
            
        t0 = time.perf_counter()
        data = db3_escanner_coherencia(archivo)
        t1 = time.perf_counter()
        
        if data is None:
            print("    ERR: Fallo en procesamiento de matriz.")
            continue
            
        latencia_ms = (t1 - t0) * 1000
        resultados[tipo] = data
        
        print(f"    - Latencia de Cómputo : {latencia_ms:.2f} ms (P95 < 200ms: {'PASS' if latencia_ms < 200 else 'FAIL'})")
        print(f"    - Bloques Analizados  : {data['dimensiones'][0]}x{data['dimensiones'][1]}")
        print(f"    - Aleatoriedad Signo  : {data['aleatoriedad_espacial']:.6f}")
        print(f"    - Entropía de Signo   : {data['entropia_signo']:.6f}")
        print(f"    - Curtosis Residual   : {data['curtosis_residual']:.6f}")
        print(f"    - Var. Curtosis Local : {data['var_curtosis_local']:.6f}")
        print(f"    - Energía AC Media    : {data['energia_ac_media']:.6f}")
        print(f"    - Varianza Energía AC : {data['varianza_energia_ac']:.6f}")
        print(f"    - Ratio de Costuras   : {data['ratio_costuras']:.4f}")
    
    if len(resultados) == 2:
        h = resultados["HUMANA (MBH)"]
        a = resultados["IA (SINTÉTICA)"]
        
        print("\n======================================================================")
        print("                  TABLA DE DELTAS FORENSES V4 (CORREGIDA)              ")
        print("======================================================================")
        print(f"{'MÉTRICA':<22} | {'HUMANA (MBH)':<15} | {'IA (SINTÉTICA)':<15} | {'DELTA %':<10}")
        print("-" * 70)
        
        metrics = [
            ("Aleatoriedad Signo", "aleatoriedad_espacial"),
            ("Entropía de Signo", "entropia_signo"),
            ("Curtosis Residual", "curtosis_residual"),
            ("Var. Curtosis Local", "var_curtosis_local"),
            ("Energía AC Media", "energia_ac_media"),
            ("Varianza Energía AC", "varianza_energia_ac"),
            ("Ratio de Costuras", "ratio_costuras")
        ]
        
        for label, key in metrics:
            val_h = h[key]
            val_a = a[key]
            delta = ((val_h - val_a) / (val_a + 1e-5)) * 100
            print(f"{label:<22} | {val_h:<15.6f} | {val_a:<15.6f} | {delta:+.2f}%")
        
        print("======================================================================")
        
        # --- ANALIZADOR DE MATRIZ ADAPTATIVA CROSS-REFERENCE ---
        # Calculamos deltas críticos inter-muestras
        delta_curtosis_local = ((h['var_curtosis_local'] - a['var_curtosis_local']) / (a['var_curtosis_local'] + 1e-5)) * 100
        delta_costuras = ((a['ratio_costuras'] - h['ratio_costuras']) / (h['ratio_costuras'] + 1e-5)) * 100

        # 1. COMPUERTA RESTRICCION RUIDO IA (Ataque ChatGPT)
        if a['ratio_costuras'] > 1.15 and a['energia_ac_media'] < 35.0:
            diagnostico_final = "IA (SINTÉTICA) [Alerta: Ruido Inyectado]"
            
        # 2. VALIDACIÓN ASIMETRÍA ULTRA-LOCAL (Caso Móvil vs Nanobannana)
        # Si la textura humana destruye a la IA por más de un 300% de varianza,
        # y la IA muestra una rejilla de costuras superior a la humana, es un sensor físico real.
        elif delta_curtosis_local > 300.0 and a['ratio_costuras'] > 1.15:
            diagnostico_final = "MBH / SENSOR FÍSICO (Validación por Asimetría de Textura Móvil)"
            
        else:
            # 3. EVALUACIÓN ESTÁNDAR POR SUMA DE FACTORES COMPENSADA
            score_humano = 0
            if h['aleatoriedad_espacial'] > 0.91: score_humano += 2
            if h['entropia_signo'] > 1.00: score_humano += 2
            if delta_costuras > 10.0: score_humano += 2  # La IA tiene significativamente más costuras
            if h['var_curtosis_local'] > 1500.0: score_humano += 2

            if score_humano >= 4:
                diagnostico_final = "MBH / SENSOR FÍSICO (Validación cruzada regional)"
            else:
                diagnostico_final = "IA (SINTÉTICA)"
        
        print(f">> DIAGNÓSTICO FINAL: {diagnostico_final}")

if __name__ == "__main__":
    test_comparativo_total()