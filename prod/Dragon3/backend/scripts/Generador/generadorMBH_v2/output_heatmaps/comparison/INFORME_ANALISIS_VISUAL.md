# 🔬 ANÁLISIS VISUAL DE SEÑAL DCT - Informe Comparativo
**Generado:** 16/2/2026, 19:49:16
**ID Sellado:** 55136 (d760)
---

## 📊 Resumen de Escalas Analizadas

| Factor | Dimensiones | Bloques | Energía Media | Diff Media | Energía Máx |
|--------|-------------|---------|---------------|------------|-------------|
| 100% | 1263x2000 | 157x250 | 31.6019 | -0.0378 | 669.8277 |
| 90% | 1137x1800 | 142x225 | 27.6531 | -0.0639 | 951.7126 |
| 75% | 947x1500 | 118x187 | 21.1409 | -0.0638 | 782.9677 |
| 66% | 834x1320 | 104x165 | 17.7020 | -0.1730 | 701.5565 |
| 50% | 632x1000 | 79x125 | 15.7994 | -0.2770 | 701.9074 |
| 33% | 417x660 | 52x82 | 16.1117 | -0.3964 | 513.6914 |
| 25% | 316x500 | 39x62 | 16.9297 | 1.0653 | 434.8835 |
| 133% | 1680x2660 | 210x332 | 42.3820 | 0.0906 | 718.7005 |
| 150% | 1895x3000 | 236x375 | 45.4788 | 0.0952 | 814.6816 |
| 200% | 2526x4000 | 315x500 | 47.8415 | -0.0189 | 498.8447 |

## 📈 Gráfica de Energía vs Escala

```
 100% |██████████████████████████ 31.6019
  90% |███████████████████████ 27.6531
  75% |██████████████████ 21.1409
  66% |███████████████ 17.7020
  50% |█████████████ 15.7994
  33% |█████████████ 16.1117
  25% |██████████████ 16.9297
 133% |███████████████████████████████████ 42.3820
 150% |██████████████████████████████████████ 45.4788
 200% |████████████████████████████████████████ 47.8415
```

## 🔍 Observaciones para Estrategia de Detección

### Cambios Relativos vs Original

| Escala | ΔEnergía | ΔDiff | ΔBloques/Fila |
|--------|----------|-------|---------------|
| 90% | -12.5% | 69.1% | -9.6% |
| 75% | -33.1% | 68.8% | -24.8% |
| 66% | -44.0% | 357.6% | -33.8% |
| 50% | -50.0% | 633.0% | -49.7% |
| 33% | -49.0% | 949.0% | -66.9% |
| 25% | -46.4% | -2919.0% | -75.2% |
| 133% | 34.1% | -339.8% | 33.8% |
| 150% | 43.9% | -352.0% | 50.3% |
| 200% | 51.4% | -50.1% | 100.6% |

### Ratio de Bloques (para sincronización)

| Escala | Bloques/Fila Original | Bloques/Fila Resize | Ratio Inverso |
|--------|-----------------------|---------------------|---------------|
| 90% | 157 | 142 | 1.1056 |
| 75% | 157 | 118 | 1.3305 |
| 66% | 157 | 104 | 1.5096 |
| 50% | 157 | 79 | 1.9873 |
| 33% | 157 | 52 | 3.0192 |
| 25% | 157 | 39 | 4.0256 |
| 133% | 157 | 210 | 0.7476 |
| 150% | 157 | 236 | 0.6653 |
| 200% | 157 | 315 | 0.4984 |

## 🎯 Recomendaciones

1. **Analizar mapas de calor** en `dct_differential/` para ver patrones de señal
2. **Comparar distribución de energía** entre escalas para identificar invariantes
3. **Verificar ratio de bloques** para ajustar algoritmo de sincronización
4. **Buscar frecuencias alternativas** si (1,1) y (2,2) se degradan mucho

## 📁 Archivos Generados

- `blue_channel/`: Mapas del canal azul completo
- `dct_energy/`: Energía total por bloque (|diff|)
- `dct_coeff_1_1/`: Coeficiente DCT(1,1)
- `dct_coeff_2_2/`: Coeficiente DCT(2,2)
- `dct_differential/`: **SEÑAL DIFERENCIAL** (1,1)-(2,2) ← CLAVE
- `images_resized/`: Imágenes reescaladas para referencia
