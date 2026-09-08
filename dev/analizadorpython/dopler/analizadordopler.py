import cv2
import numpy as np
import time

def detectar_stardust(canal_azul):
    """
    Detecta la marca Stardust mediante tres criterios ciegos:
    1. Score total (suma de |media_diff|) > 10.0
    2. Pares complementarios >= 25
    3. Energía normalizada en frecuencia Nyquist > 0.5
    Retorna (True/False, score, pares_ok, energia_alternante)
    """
    h, w = canal_azul.shape
    if h < 8 or w < 8:
        return False, 0.0, 0, 0.0

    suma_diff = np.zeros(64, dtype=np.float64)
    contador = np.zeros(64, dtype=np.int64)

    for y in range(0, h - 7, 8):
        pos = 0
        for x in range(0, w - 7, 8):
            bloque = canal_azul[y:y+8, x:x+8].astype(np.float32) - 128.0
            dct = cv2.dct(bloque)
            diff = dct[1, 1] - dct[2, 2]
            suma_diff[pos] += diff
            contador[pos] += 1
            pos = (pos + 1) % 64

    media_diff = suma_diff / contador
    score = np.sum(np.abs(media_diff))

    bits = (media_diff > 0).astype(int)
    pares_ok = np.sum(bits[0::2] != bits[1::2])

    # Energía en frecuencia Nyquist (componente alternante)
    fft = np.fft.fft(media_diff)
    nyquist_power = np.abs(fft[32])          # índice 32 corresponde a la frecuencia más alta
    energia_total = np.sum(media_diff ** 2)
    energia_alternante = (nyquist_power ** 2) / energia_total if energia_total > 0 else 0.0

    # Umbrales empíricos (basados en los datos de las matrices)
    if score > 10.0 and pares_ok >= 25 and energia_alternante > 0.5:
        return True, score, pares_ok, energia_alternante
    else:
        return False, score, pares_ok, energia_alternante

def analizar_nucleo_fase(canal):
    """
    Función original de telemetría (no influye en el veredicto).
    Se conserva para compatibilidad con la salida esperada.
    """
    vacio = {"densidad": 0.0, "puntos_totales": 0, "puntos_costura": 0, "aristas_descartadas": 0, "max_resonancia": 0.0}
    if canal is None:
        return vacio

    mascara = cv2.imread("mapa_azul_prueba.png", 0)
    if mascara is None:
        return vacio

    if mascara.shape != canal.shape:
        mascara = cv2.resize(mascara, (canal.shape[1], canal.shape[0]))

    kernel_g0 = np.array([[-1, 2, -1]], dtype=np.float32)
    resonancia = np.abs(cv2.filter2D(canal.astype(np.float32), -1, kernel_g0))
    aristas = cv2.Canny(canal, 50, 150)

    puntos_mascara = mascara > 128
    mask_aristas = aristas > 0

    puntos_costura = puntos_mascara & ~mask_aristas
    aristas_descartadas = puntos_mascara & mask_aristas

    num_costura = np.sum(puntos_costura)
    if num_costura == 0:
        return vacio

    valores_costura = resonancia[puntos_costura]

    return {
        "densidad": float(np.mean(valores_costura)),
        "puntos_totales": int(np.sum(puntos_mascara)),
        "puntos_costura": int(num_costura),
        "aristas_descartadas": int(np.sum(aristas_descartadas)),
        "max_resonancia": float(np.max(valores_costura))
    }

def certificar(path):
    t_inicio = time.perf_counter()
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return "ERROR", False, False, 0.0, {}

    azul = img[:, :, 0]
    ok, score, pares, energia = detectar_stardust(azul)

    telemetria = analizar_nucleo_fase(azul)
    telemetria["score_dct"] = score
    telemetria["pares_complementarios"] = pares
    telemetria["energia_alternante"] = energia

    t_final = time.perf_counter()
    tiempo_ms = (t_final - t_inicio) * 1000.0

    if ok:
        return "ORIGINAL MBH", False, True, tiempo_ms, telemetria
    else:
        return "SIN SELLO", False, False, tiempo_ms, telemetria