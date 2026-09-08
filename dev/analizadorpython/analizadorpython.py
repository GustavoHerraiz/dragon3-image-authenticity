# [CODE]
import cv2
import numpy as np

def db3_escanner_coherencia(filepath):
    img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
    if img is None: return None
    
    h, w = img.shape
    h_mod, w_mod = (h // 8) * 8, (w // 8) * 8
    img = img[:h_mod, :w_mod].astype(np.float32)
    
    # Submuestreo adaptativo estocástico para garantizar P95 < 200ms
    hb, wb = h_mod // 8, w_mod // 8
    max_macro = 64
    stride_h = max(1, hb // max_macro)
    stride_w = max(1, wb // max_macro)
    
    # Extracción por zancada conservando adyacencia espacial geométrica
    blocks = img.reshape(hb, 8, wb, 8).swapaxes(1, 2)
    blocks = blocks[::stride_h, ::stride_w]
    hb_s, wb_s = blocks.shape[0], blocks.shape[1]
    
    # Reconstrucción matricial rápida para evaluación de bordes y costuras
    img_min = blocks.swapaxes(1, 2).reshape(hb_s * 8, wb_s * 8)
    
    sobelx = cv2.Sobel(img_min, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(img_min, cv2.CV_32F, 0, 1, ksize=3)
    mag_bordes = np.sqrt(sobelx**2 + sobely**2)
    blocks_bordes = mag_bordes.reshape(hb_s, 8, wb_s, 8).swapaxes(1, 2)
    
    block_mean_lum = np.mean(blocks, axis=(2, 3))
    block_edge_den = np.mean(blocks_bordes, axis=(2, 3))
    
    # Máscara dinámica contra penumbra y áreas lavadas por compresión
    W = np.ones_like(block_mean_lum, dtype=np.float32)
    W[block_mean_lum < 45.0] *= 0.15
    W[block_edge_den < 6.0] *= 0.15
    if np.sum(W) == 0: W = np.ones_like(W, dtype=np.float32)
        
    D = np.zeros((8, 8), dtype=np.float32)
    for i in range(8):
        for j in range(8):
            if i == 0:
                D[i, j] = 1 / np.sqrt(8)
            else:
                D[i, j] = np.sqrt(2/8) * np.cos((2*j + 1) * i * np.pi / 16)
                
    dct_blocks = np.einsum('ij,kljm,mn->klin', D, blocks, D.T)
    
    ac1 = dct_blocks[:, :, 0, 1]
    ac2 = dct_blocks[:, :, 1, 0]
    
    diff_raw = ac1 - ac2
    diferencial = np.sign(diff_raw)
    
    # 1. Aleatoriedad Espacial Ponderada
    cambio_v = np.abs(np.diff(diferencial, axis=0))
    W_v = (W[:-1, :] + W[1:, :]) / 2.0
    aleatoriedad_v = np.sum(cambio_v * W_v) / (np.sum(W_v) + 1e-5)
    
    cambio_h = np.abs(np.diff(diferencial, axis=1))
    W_h = (W[:, :-1] + W[:, 1:]) / 2.0
    aleatoriedad_h = np.sum(cambio_h * W_h) / (np.sum(W_h) + 1e-5)
    aleatoriedad_espacial = (aleatoriedad_v + aleatoriedad_h) / 2.0
    
    # 2. Momentos Estadísticos globales
    mean_diff = np.sum(diff_raw * W) / np.sum(W)
    var_diff = np.sum(((diff_raw - mean_diff) ** 2) * W) / np.sum(W)
    std_diff = np.sqrt(var_diff) + 1e-5
    diff_norm = (diff_raw - mean_diff) / std_diff
    
    curtosis_global = np.sum((diff_norm ** 4) * W) / np.sum(W)
    skewness = np.sum((diff_norm ** 3) * W) / np.sum(W)
    
    # 3. Métrica de Control Regional: Varianza de Curtosis Local (Macrobloques 4x4)
    m_size = 4
    # Inicializamos la matriz para auditoría local
    grid_rows = hb_s // m_size
    grid_cols = wb_s // m_size
    matriz_curtosis = np.zeros((grid_rows, grid_cols), dtype=np.float32)
    
    curtosis_locales = []
    for r in range(0, hb_s - (hb_s % m_size), m_size):
        for c in range(0, wb_s - (wb_s % m_size), m_size):
            sub_diff = diff_norm[r:r+m_size, c:c+m_size]
            sub_W = W[r:r+m_size, c:c+m_size]
            s_W = np.sum(sub_W)
            if s_W > 0:
                k_loc = np.sum((sub_diff ** 4) * sub_W) / s_W
                curtosis_locales.append(k_loc)
                matriz_curtosis[r // m_size, c // m_size] = k_loc
            else:
                matriz_curtosis[r // m_size, c // m_size] = 0.0

    var_curtosis_local = np.var(curtosis_locales) if len(curtosis_locales) > 1 else 0.0
    
    # 4. Energía de altas frecuencias
    abs_diff = np.abs(diff_raw)
    energia_ac_media = np.sum(abs_diff * W) / np.sum(W)
    varianza_energia_ac = np.sum(((abs_diff - energia_ac_media) ** 2) * W) / np.sum(W)
    
    p_positivo = np.sum((diferencial == 1) * W) / np.sum(W)
    p_negativo = np.sum((diferencial == -1) * W) / np.sum(W)
    p_cero = np.sum((diferencial == 0) * W) / np.sum(W)
    
    entropia_signo = 0.0
    for p in [p_positivo, p_negativo, p_cero]:
        if p > 0: entropia_signo -= p * np.log2(p)
            
    # 5. Geometría de Rejilla (Costuras)
    costuras = np.abs(np.diff(img_min[7::8, :], axis=0))
    aristas = np.abs(np.diff(img_min, axis=0))[7::8, :]
    ratio_costuras = np.mean(costuras) / (np.mean(aristas) + 1e-5)
    
    return {
        "aleatoriedad_espacial": aleatoriedad_espacial,
        "curtosis_residual": curtosis_global,
        "var_curtosis_local": var_curtosis_local,
        "skewness_residual": skewness,
        "energia_ac_media": energia_ac_media,
        "varianza_energia_ac": varianza_energia_ac,
        "entropia_signo": entropia_signo,
        "ratio_costuras": ratio_costuras,
        "dimensiones": (hb_s, wb_s),
        "matriz_curtosis": matriz_curtosis
    }