# [CODE]
import sys
import os
import numpy as np
from analizadorpython import db3_escanner_coherencia

def test_ciego(filepath):
    print("======================================================================")
    print("        DB3 FORENSICS: MODO FRAGMENTACIÓN FORENSE V4.4 (ISOLATOR)     ")
    print("======================================================================")
    
    if not os.path.exists(filepath):
        print(f"ERR: Archivo '{filepath}' no encontrado.")
        return

    # Ejecución del motor forense
    data = db3_escanner_coherencia(filepath)
    if data is None:
        print("ERR: Fallo en procesamiento de matriz.")
        return

    # DETECCIÓN DE DISPARIDAD (Nueva lógica de detección de parches)
    # Calculamos el ratio entre varianza local y residual. 
    # Un parche de IA inyectado rompe la coherencia estadística (Outlier Detection)
    # Umbral de Disparidad Crítica: 5.5 (Factor de divergencia)
    
    disparidad = (data['var_curtosis_local'] / (data['curtosis_residual'] + 1e-5))
    
    is_compromised = disparidad > 5.5 or data['ratio_costuras'] > 1.15
    
    # LÓGICA DE DECISIÓN
    if is_compromised:
        diagnostico = "IA (SINTÉTICA) - Inconsistencia estructural detectada (Parche localizado)"
    else:
        score = 0
        if data['var_curtosis_local'] > 1500.0: score += 4
        if data['aleatoriedad_espacial'] > 0.91: score += 2
        if data['ratio_costuras'] < 1.10: score += 3
        
        if score >= 5:
            diagnostico = "MBH / SENSOR FÍSICO (Certificado)"
        else:
            diagnostico = "IA (SINTÉTICA) - Firma de ruido sintético detectada"

    print(f"ARCHIVO: {filepath}")
    print(f"DIAGNÓSTICO: {diagnostico}")
    print(f"DEBUG: Disparidad Forense: {disparidad:.2f} | Ratio: {data['ratio_costuras']:.4f}")
    print("======================================================================")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_ciego(sys.argv[1])
    else:
        print("Uso: python3 test_ciego.py <archivo>")