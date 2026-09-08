# [CODE]
import os
from PIL import Image

def convertir_png_a_jpg():
    ruta_base = "/opt/dragon3/dev/analizadorpython/convertir"
    origen = os.path.join(ruta_base, "ai.png")
    destino = os.path.join(ruta_base, "ai.jpg")
    
    # Telemetria P95 < 200ms
    print("[TELEMETRIA] Inicio conversion.")
    
    if not os.path.exists(origen):
        print(f"[ERROR] No se encuentra {origen}")
        return

    try:
        with Image.open(origen) as img:
            # Conversion forzada a RGB (elimina canal Alfa del sello MBH)
            rgb_img = img.convert("RGB")
            rgb_img.save(destino, "JPEG", quality=95)
        print(f"[OK] Generado: {destino} (Copia para analisis Canal Azul / DB3)")
    except Exception as e:
        print(f"[ERROR] {str(e)}")

if __name__ == "__main__":
    convertir_png_a_jpg()