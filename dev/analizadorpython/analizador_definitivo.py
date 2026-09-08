# [CODE]
# analizador_definitivo.py - Diagnóstico basado en Prioridad de VarK (Hard Gate) - v.ajustada
import sys
import os
import numpy as np
import cv2
from analizadorpython import db3_escanner_coherencia

# CONSTANTES DE CALIBRACIÓN - UMBRALES AJUSTADOS (Nivel Crítico)
MAX_VKL = 10000.0
MAX_CR  = 30.0
MAX_FMG = 800.0
MAX_EAC = 100.0

# UMBRALES DE SEGURIDAD (Hard Gates)
UMBRAL_VAR_K_HUMANA = 2000.0  # Suelo para sensores de alta fidelidad
UMBRAL_VAR_K_MOVIL  = 1000.0  # Suelo absoluto para procesamiento móvil agresivo

def compute_aristas(f):
    img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    if img is None: return np.zeros((64, 64))
    img = cv2.resize(img, (64, 64))
    grad_x = cv2.Sobel(img, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(img, cv2.CV_64F, 0, 1, ksize=3)
    mag = np.sqrt(grad_x**2 + grad_y**2)
    return mag / (np.max(mag) + 1e-6)

def get_forensic_metrics(data):
    m = data.get('matriz_curtosis', np.zeros((1,1)))
    grad_y, grad_x = np.gradient(m)
    mag_grad = np.sqrt(grad_x**2 + grad_y**2)
    return {
        "Forensic_MaxGrad": np.max(mag_grad),
        "Forensic_SkewK": np.mean((m.flatten() - np.mean(m))**3) / (np.std(m)**3 + 1e-6)
    }

def clasificar_imagen(data):
    vark = data.get('var_curtosis_local', 0)
    
    # 1. HARD GATE: Prioridad absoluta a la VarK
    if vark >= UMBRAL_VAR_K_HUMANA:
        return "HUMANA", vark
    
    if vark >= UMBRAL_VAR_K_MOVIL:
        return "HUMANA (MÓVIL)", vark

    # 2. SISTEMA DE RESPALDO (Si VarK es baja, calculamos Score)
    n_cr  = data.get('curtosis_residual', 0) / MAX_CR
    n_fmg = data.get('Forensic_MaxGrad', 0) / MAX_FMG
    n_eac = 1.0 - (data.get('energia_ac_media', 25) / MAX_EAC)
    
    score = (n_cr * 0.4) + (n_fmg * 0.4) + (n_eac * 0.2)
    
    if score >= 0.45:
        return "REVISIÓN", vark
    else:
        return "SINTÉTICA/AI", vark

def main():
    files = sys.argv[1:]
    if not files: return
    
    print(f"{'ARCHIVO':<20} | {'VEREDICTO':<20} | {'VarK (Principal)'}")
    print("-" * 65)
    
    for f in files:
        if not os.path.exists(f):
            print(f"{f:<20} | {'[ERROR]':<20} | N/A")
            continue
            
        data = db3_escanner_coherencia(f)
        if data:
            if 'aristas_struct' not in data: data['aristas_struct'] = compute_aristas(f)
            data.update(get_forensic_metrics(data))
            
            veredicto, vark_val = clasificar_imagen(data)
            print(f"{f:<20} | {veredicto:<20} | {vark_val:.0f}")

if __name__ == "__main__":
    main()