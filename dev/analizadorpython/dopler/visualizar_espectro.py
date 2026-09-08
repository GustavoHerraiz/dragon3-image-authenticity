import numpy as np
import matplotlib.pyplot as plt
import csv
import re

def cargar_matriz(archivo_csv):
    """Carga el CSV y extrae las 64 medias y la calidad para cada fila."""
    datos = []
    with open(archivo_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Extraer calidad del nombre del archivo (ej. 'prueba_100.jpg' -> 100)
            nombre = row['archivo']
            match = re.search(r'(\d+)\.jpg', nombre)
            if not match:
                continue
            calidad = int(match.group(1))
            # Extraer las 64 medias
            medias = [float(row[f'media_diff_{i:02d}']) for i in range(64)]
            datos.append((calidad, medias))
    # Ordenar por calidad descendente
    datos.sort(key=lambda x: x[0], reverse=True)
    return datos

def calcular_espectro(medias):
    """Calcula la magnitud de la FFT de las 64 medias (centrada)."""
    fft = np.fft.fft(medias)
    # Tomamos la magnitud, normalizamos por longitud
    magnitud = np.abs(fft) / 64.0
    # Frecuencias (0 a 63)
    freqs = np.fft.fftfreq(64)
    return freqs, magnitud

def graficar_espectros(datos_sellado, datos_control, calidades_a_mostrar=[100,80,60,40,20]):
    """Genera dos figuras: una comparativa para calidades seleccionadas y otra evolución del pico Nyquist."""
    
    # --- Figura 1: Espectros para calidades seleccionadas ---
    fig1, axes = plt.subplots(2, len(calidades_a_mostrar), figsize=(15, 6),
                              sharex='col', sharey='row')
    fig1.suptitle('Espectro de las 64 medias DCT (FFT)', fontsize=14)
    
    for idx, calidad in enumerate(calidades_a_mostrar):
        # Buscar la fila correspondiente en sellado
        medias_s = None
        for q, m in datos_sellado:
            if q == calidad:
                medias_s = m
                break
        if medias_s is not None:
            freqs, mag_s = calcular_espectro(medias_s)
            ax = axes[0, idx]
            ax.plot(freqs[:32], mag_s[:32], 'b-', label=f'Sellado Q{calidad}')
            ax.axvline(x=0.5, color='r', linestyle='--', alpha=0.5, label='Nyquist (0.5)')
            ax.set_title(f'Sellado Q{calidad}')
            ax.grid(True, alpha=0.3)
            if idx == 0:
                ax.set_ylabel('Magnitud')
            if calidad == calidades_a_mostrar[-1]:
                ax.set_xlabel('Frecuencia normalizada')
        
        # Buscar la fila en control
        medias_c = None
        for q, m in datos_control:
            if q == calidad:
                medias_c = m
                break
        if medias_c is not None:
            freqs, mag_c = calcular_espectro(medias_c)
            ax = axes[1, idx]
            ax.plot(freqs[:32], mag_c[:32], 'r-', label=f'Control Q{calidad}')
            ax.axvline(x=0.5, color='r', linestyle='--', alpha=0.5)
            ax.set_title(f'Control Q{calidad}')
            ax.grid(True, alpha=0.3)
            if idx == 0:
                ax.set_ylabel('Magnitud')
            if calidad == calidades_a_mostrar[-1]:
                ax.set_xlabel('Frecuencia normalizada')
    
    plt.tight_layout()
    plt.savefig('espectros_comparativos.png', dpi=150)
    print("Guardado: espectros_comparativos.png")
    
    # --- Figura 2: Evolución de la energía en Nyquist (índice 32) vs calidad ---
    fig2, ax = plt.subplots(figsize=(8, 5))
    calidades_s = []
    energia_nyquist_s = []
    for q, m in datos_sellado:
        _, mag = calcular_espectro(m)
        # La frecuencia Nyquist corresponde al índice 32 (freq=0.5)
        # En la magnitud centrada, el índice 32 es el segundo pico (freq 0.5)
        # Como solo tenemos 64 puntos, el bin 32 es el correspondiente a 0.5
        nyq_energy = mag[32]  # magnitud en esa frecuencia
        calidades_s.append(q)
        energia_nyquist_s.append(nyq_energy)
    
    calidades_c = []
    energia_nyquist_c = []
    for q, m in datos_control:
        _, mag = calcular_espectro(m)
        nyq_energy = mag[32]
        calidades_c.append(q)
        energia_nyquist_c.append(nyq_energy)
    
    # Ordenar por calidad ascendente para la línea
    order_s = np.argsort(calidades_s)
    calidades_s = np.array(calidades_s)[order_s]
    energia_nyquist_s = np.array(energia_nyquist_s)[order_s]
    
    order_c = np.argsort(calidades_c)
    calidades_c = np.array(calidades_c)[order_c]
    energia_nyquist_c = np.array(energia_nyquist_c)[order_c]
    
    ax.plot(calidades_s, energia_nyquist_s, 'b-o', label='Sellado', linewidth=2, markersize=6)
    ax.plot(calidades_c, energia_nyquist_c, 'r-s', label='Control', linewidth=2, markersize=6)
    ax.axhline(y=0.5, color='gray', linestyle='--', label='Umbral (0.5)')
    ax.set_xlabel('Calidad JPEG')
    ax.set_ylabel('Energía en frecuencia Nyquist (magnitud)')
    ax.set_title('Evolución del pico Nyquist con la compresión JPEG')
    ax.grid(True, alpha=0.3)
    ax.legend()
    ax.set_xlim(0, 105)
    ax.set_ylim(0, max(max(energia_nyquist_s), max(energia_nyquist_c)) * 1.1)
    plt.tight_layout()
    plt.savefig('evolucion_nyquist.png', dpi=150)
    print("Guardado: evolucion_nyquist.png")
    
    plt.show()

if __name__ == "__main__":
    # Cargar los datos desde los CSV generados previamente
    sellado = cargar_matriz('matriz_sellado.csv')
    control = cargar_matriz('matriz_control.csv')
    
    if not sellado or not control:
        print("Error: No se encontraron los archivos matriz_sellado.csv y matriz_control.csv")
        print("Primero ejecuta 'python extraer_toda_la_info.py' para generarlos.")
    else:
        graficar_espectros(sellado, control, calidades_a_mostrar=[100,80,60,40,20])