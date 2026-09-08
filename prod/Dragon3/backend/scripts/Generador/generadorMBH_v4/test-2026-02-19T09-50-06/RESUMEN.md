# 🐉 DRAGON3 v4 — Test Suite

**Fecha:** Invalid Date
**Sello:** Blade Corporation - Muestra Control — "Test de Resiliencia Holográfica"
**Hash:** 000D760

---

## 📊 Estadísticas Globales

| Métrica | Valor |
|---------|-------|
| Total Pruebas | 23 |
| Exitosas | 17 ✅ |
| Fallidas | 6 ❌ |
| **Tasa de Éxito** | **74%** |
| Tiempo Total | 4302586ms |
| Tiempo Promedio | 187068.94ms |
| Tiempo Mínimo | 8690.12ms |
| Tiempo Máximo | 600032.29ms |

---

## 📈 Rendimiento por Categoría

| Categoría | Exitosas/Total | Tasa |
|-----------|----------------|------|
| CONTROL | 1/1 | 100% |
| JPEG | 9/10 | 90% |
| RESIZE | 5/9 | 56% |
| COMBO | 2/3 | 67% |

---

## 🔬 Resultados Detallados


### CONTROL_original ✅
- **Descripción:** Imagen original sellada (control)
- **Tiempo:** 9324.65ms
- **Estado:** PASS
- **Energía:** 63.993
- **Correlación:** 1.000
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q100 ✅
- **Descripción:** JPEG quality 100
- **Tiempo:** 9915.85ms
- **Estado:** PASS
- **Energía:** 40.345
- **Correlación:** 1.000
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q90 ✅
- **Descripción:** JPEG quality 90
- **Tiempo:** 9240.85ms
- **Estado:** PASS
- **Energía:** 30.392
- **Correlación:** 0.991
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q80 ✅
- **Descripción:** JPEG quality 80
- **Tiempo:** 9658.29ms
- **Estado:** PASS
- **Energía:** 25.811
- **Correlación:** 0.970
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q70 ✅
- **Descripción:** JPEG quality 70
- **Tiempo:** 9204.89ms
- **Estado:** PASS
- **Energía:** 20.362
- **Correlación:** 0.960
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q60 ✅
- **Descripción:** JPEG quality 60
- **Tiempo:** 10038.99ms
- **Estado:** PASS
- **Energía:** 16.007
- **Correlación:** 0.914
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q50 ✅
- **Descripción:** JPEG quality 50
- **Tiempo:** 9442.44ms
- **Estado:** PASS
- **Energía:** 16.210
- **Correlación:** 0.892
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q40 ✅
- **Descripción:** JPEG quality 40
- **Tiempo:** 9139.45ms
- **Estado:** PASS
- **Energía:** 11.291
- **Correlación:** 0.899
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q30 ✅
- **Descripción:** JPEG quality 30
- **Tiempo:** 8690.12ms
- **Estado:** PASS
- **Energía:** 2.564
- **Correlación:** 0.981
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q20 ✅
- **Descripción:** JPEG quality 20
- **Tiempo:** 9277.37ms
- **Estado:** PASS
- **Energía:** 1.165
- **Correlación:** 0.945
- **Nivel:** N0
- **Cliente:** Blade Corporation - Muestra Control


---

### JPEG_q10 ❌
- **Descripción:** JPEG quality 10
- **Tiempo:** 463472.47ms
- **Estado:** FAIL
- **Energía:** 2.385
- **Correlación:** 0.712
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: D5440A2

---

### RESIZE_0_25x ✅
- **Descripción:** Resize 0.25x + JPEG Q80 (732x1159)
- **Tiempo:** 59408.61ms
- **Estado:** PASS
- **Energía:** 2.587
- **Correlación:** 0.955
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### RESIZE_0_33x ❌
- **Descripción:** Resize 0.33x + JPEG Q80 (966x1530)
- **Tiempo:** 223747.58ms
- **Estado:** FAIL
- **Energía:** 8.239
- **Correlación:** 0.693
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: ED90E96

---

### RESIZE_0_5x ✅
- **Descripción:** Resize 0.5x + JPEG Q80 (1464x2318)
- **Tiempo:** 145677.81ms
- **Estado:** PASS
- **Energía:** 16.294
- **Correlación:** 0.972
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### RESIZE_0_66x ❌
- **Descripción:** Resize 0.66x + JPEG Q80 (1932x3059)
- **Tiempo:** 562429.1ms
- **Estado:** FAIL
- **Energía:** 3.939
- **Correlación:** 0.600
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: FC0E58F

---

### RESIZE_0_75x ✅
- **Descripción:** Resize 0.75x + JPEG Q80 (2195x3476)
- **Tiempo:** 183889.44ms
- **Estado:** PASS
- **Energía:** 34.897
- **Correlación:** 0.999
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### RESIZE_0_9x ❌
- **Descripción:** Resize 0.9x + JPEG Q80 (2634x4172)
- **Tiempo:** 544027.54ms
- **Estado:** FAIL
- **Energía:** 2.611
- **Correlación:** 0.636
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: 2836543

---

### RESIZE_1_33x ❌
- **Descripción:** Resize 1.33x + JPEG Q80 (3893x6165)
- **Tiempo:** 401486ms
- **Estado:** FAIL
- **Energía:** 4.770
- **Correlación:** 0.826
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: FDFBFCF

---

### RESIZE_1_5x ✅
- **Descripción:** Resize 1.5x + JPEG Q80 (4391x6953)
- **Tiempo:** 208265.44ms
- **Estado:** PASS
- **Energía:** 46.190
- **Correlación:** 1.000
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### RESIZE_2x ✅
- **Descripción:** Resize 2x + JPEG Q80 (5854x9270)
- **Tiempo:** 490076.4ms
- **Estado:** PASS
- **Energía:** 51.288
- **Correlación:** 1.000
- **Nivel:** N2
- **Cliente:** Blade Corporation - Muestra Control


---

### COMBO_0_5x_q80 ✅
- **Descripción:** Combo: Resize 0.5x + JPEG Q80
- **Tiempo:** 145198.71ms
- **Estado:** PASS
- **Energía:** 1.990
- **Correlación:** 0.959
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### COMBO_0_75x_q60 ✅
- **Descripción:** Combo: Resize 0.75x + JPEG Q60
- **Tiempo:** 180941.36ms
- **Estado:** PASS
- **Energía:** 3.619
- **Correlación:** 0.970
- **Nivel:** N1-RadarV20
- **Cliente:** Blade Corporation - Muestra Control


---

### COMBO_0_9x_q40 ❌
- **Descripción:** Combo: Resize 0.9x + JPEG Q40
- **Tiempo:** 600032.29ms
- **Estado:** FAIL
- **Energía:** 2.505
- **Correlación:** 0.618
- **Nivel:** N2
- **Cliente:** NO REGISTRADO
- **Error:** Hash esperado: 000D760, obtenido: 2836543


---

## 🎯 Conclusiones

⚠️ **6 TEST(S) FALLARON**

Revisar los casos fallidos en la sección de resultados detallados.
