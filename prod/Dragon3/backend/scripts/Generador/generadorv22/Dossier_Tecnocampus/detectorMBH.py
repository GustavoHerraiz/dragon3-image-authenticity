import pandas as pd
import numpy as np
import hashlib
import sys

# ==========================================================
# CONFIGURACIÓN DEL FRANCOTIRADOR (17 Puntos de Oro)
# Basado en ingeniería inversa del bulto y sello d760
# ==========================================================
GOLDEN_POINTS = {
    48: 29, 154: 29,   # Los Maestros D (Anclas de la Firma)
    63: 27, 134: 27, 144: 27, 180: 27, 225: 27, 271: 27, 316: 27, # Picos 27
    37: 23, 107: 23, 129: 23, 159: 23, 202: 23, 247: 23, 293: 23, 338: 23 # Base 23
}

class DetectorMBH:
    def check_resonance(self, hash_autor, dni_obra):
        """
        ANALISIS DE INGENIERÍA INVERSA:
        Verifica la relación fractal 5/2 (Ratio 2.5) entre Autor y Obra.
        """
        val_autor = sum(int(c, 16) for c in hash_autor)
        val_obra = sum(int(c, 16) for c in dni_obra)
        
        ratio = val_obra / val_autor if val_autor != 0 else 0
        
        print(f"\n[EXTRA] ANÁLISIS DE RESONANCIA (INGENIERÍA INVERSA):")
        print(f"      Suma Hex Autor ('{hash_autor}'): {val_autor}")
        print(f"      Suma Hex Obra  ('{dni_obra}'): {val_obra}")
        print(f"      Ratio Crítico Detectado: {ratio:.2f}")
        
        # El ratio 2.5 es la huella dactilar de la armonía autor-lienzo
        if abs(ratio - 2.5) < 0.1:
            print(f"      ¡ALERTA! Resonancia Armónica 2.5 Detectada. Entrelazamiento confirmado.")
            return True
        else:
            print(f"      [INFO] Ratio fuera de rango estándar (Dif: {abs(ratio-2.5):.2f}).")
            return False

    def analyze(self, file_path, hash_autor="d760"):
        print(f"\n" + "🎯"*25)
        print(f" DETECTOR MBH FORENSE (V3.0) | MUESTRA: {file_path}")
        print("🎯"*25)

        try:
            df = pd.read_csv(file_path)
        except Exception as e:
            print(f"[ERROR] No se pudo leer el archivo: {e}")
            return

        print(f"\n[1/4] ESCANEANDO PUNTOS DE ORO (PRECISIÓN QUIRÚRGICA)...")
        
        aciertos = 0
        datos_bulto = ""

        for grado, esperado in GOLDEN_POINTS.items():
            linea = df[df['grado'] == int(grado)]
            
            if not linea.empty:
                real = linea.iloc[0]['hits']
                diff = abs(real - esperado)
                
                # Tolerancia de +-2 por el ruido natural del bulto
                if diff <= 2:
                    aciertos += 1
                    status = "✅ OK"
                else:
                    status = "❌ FALLO"
                
                print(f"      Grado {grado:3d}º | Teórico: {esperado} | Real: {real:2d} | {status}")
                datos_bulto += f"{grado}:{real}|"
            else:
                print(f"      Grado {grado:3d}º | [NO ENCONTRADO EN MUESTRA]")

        # 2. CÁLCULO DE EFECTIVIDAD
        print(f"\n[2/4] RESULTADO DE AUTENTICIDAD DEL SELLO")
        efectividad = (aciertos / len(GOLDEN_POINTS)) * 100
        print(f"      Puntos validados: {aciertos}/{len(GOLDEN_POINTS)}")
        print(f"      CONFIANZA DEL SELLO: {efectividad:.2f}%")
        
        # 3. GENERACIÓN DEL DNI DE OBRA
        print(f"\n[3/4] IDENTIFICACIÓN DEL ADN DEL LIENZO")
        if efectividad > 50:
            hash_obra = hashlib.md5(datos_bulto.encode()).hexdigest()[:10].upper()
            print(f"      DNI DE LA OBRA: {hash_obra}")
            
            # 4. PRUEBA DE RESONANCIA (Ingeniería Inversa)
            print(f"\n[4/4] PRUEBA DE BODA MATEMÁTICA (AUTOR-OBRA)")
            is_linked = self.check_resonance(hash_autor, hash_obra)
        else:
            hash_obra = None
            print(f"      [ALERTA] Señal insuficiente para generar ADN.")

        print("\n" + "="*50)
        if efectividad > 80:
            status_final = "ORIGINAL CERTIFICADO"
            if hash_obra and abs((sum(int(c, 16) for c in hash_obra)/sum(int(c, 16) for c in hash_autor)) - 2.5) < 0.1:
                status_final += " + RESONANCIA 5/2 OK"
            print(f" VERDICTO: {status_final}")
        elif efectividad > 40:
            print(" VERDICTO: COPIA O SELLO DEGRADADO")
        else:
            print(" VERDICTO: IMAGEN SIN SELLO / DESCONOCIDA")
        print("="*50 + "\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 detectorMBH.py archivo.csv [hash_autor]")
    else:
        autor = sys.argv[2] if len(sys.argv) > 2 else "d760"
        scanner = DetectorMBH()
        scanner.analyze(sys.argv[1], autor)