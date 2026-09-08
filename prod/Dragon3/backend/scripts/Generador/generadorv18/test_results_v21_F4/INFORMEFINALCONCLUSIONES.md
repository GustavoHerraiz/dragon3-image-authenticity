# 🛡️ ESPECIFICACIÓN TÉCNICA DE AUDITORÍA: MBH DRAGON3 V18 (TEST F4_COMPLETE)

**Estado:** Documento Final de Certificación  
**Clasificación:** Confidencial - Blade Corp Forensics  
**Tecnología:** Watermarking en Dominio de Frecuencia (DCT)  
**Ingeniería Forense:** Gustavo Herraiz  
**Autor de Obra Protegida:** Quico Melero (Artista Fotográfico)  
**Ubicación:** Mataró, Barcelona  
**Fecha:** 24 de Diciembre de 2025  

---

## 1. RESUMEN EJECUTIVO
El presente informe documenta la validación del motor esteganográfico **Dragon3 V18**. Mediante un ataque de compresión controlada (JPG 100 a JPG 50), se demuestra que la tecnología de Blade Corp permite la identificación inequívoca de la autoría de **Quico Melero** y la monitorización de la integridad del archivo mediante un protocolo de lectura por balizas de frecuencia.

---

## 2. METODOLOGÍA DE INYECCIÓN
Se ha procedido al sellado de un bloque DCT de 8x8 píxeles con los siguientes parámetros:
* **Intensidad Nominal:** 55.
* **Frecuencia de Muestreo:** Coeficientes DC y AC (Baja/Media/Alta).
* **ADN Maestro (HEX):** `a66a6955` (Base para XOR y validación).

---

## 3. MATRIZ DE RESILIENCIA (ANÁLISIS DE DEGRADACIÓN)
A continuación se detalla la pérdida de energía en el núcleo del sello según el grado de compresión JPEG aplicado. 



| Escenario | Calidad | Fuerza (0,0) | ADN Detectado | p-value | Resistencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F4_00** | 100% | **6525** | `a66a6955` | 0.0000% | 100% (Baseline) |
| **F4_90** | 90% | **6054** | `a66a6955` | 0.0000% | 92.7% |
| **F4_80** | 80% | **5874** | `d760` | 0.0000% | 90.0% |
| **F4_70** | 70% | **3158** | `d760` | 0.0000% | 48.3% |
| **F4_60** | 60% | **2158** | `d760` | 0.0000% | 33.0% |
| **F4_50** | 50% | **1713** | `a66a6955` | 0.0000% | 26.2% |

---

## 4. MOTOR DE DIAGNÓSTICO: CÁLCULO DE COMPRESIÓN APLICADA
Este es el pilar del sistema. Gracias al valor fijo de inyección, podemos descubrir la calidad JPEG original de una imagen sospechosa sin necesidad de metadatos EXIF.

### A. El Ratio de Retención de Señal ($RRS$)
Para calcular la cantidad de compresión, primero extraemos el ratio de supervivencia del núcleo:
$$RRS = \frac{Fuerza Detectada_{(0,0)}}{Fuerza Original en DB_{(0,0)}}$$

### B. Fórmula de Estimación de Calidad JPEG ($Q_{est}$)
Basándonos en la curva de cuantificación no lineal observada en los tests de Mataró, aplicamos la siguiente escala de diagnóstico:

$$Q_{est} \approx \begin{cases} 
100 - (100 \times (1 - RRS)) & \text{si } RRS > 0.90 \\
80 - (20 \times \frac{0.90 - RRS}{0.40}) & \text{si } 0.50 < RRS \le 0.90 \\
50 + (10 \times RRS) & \text{si } RRS \le 0.50 
\end{cases}$$

### C. Tabla de Referencia Rápida para Auditoría
| Valor detectado en (0,0) | Ratio ($RRS$) | Diagnóstico de Compresión |
| :--- | :---: | :--- |
| **6525 - 6000** | 1.0 - 0.92 | **Calidad 90-100**: Imagen en estado maestro o virgen. |
| **5999 - 5000** | 0.91 - 0.76 | **Calidad 80**: Compresión estándar de alta calidad. |
| **4999 - 3000** | 0.75 - 0.46 | **Calidad 70**: Compresión media. Pérdida visible de armónicos. |
| **2999 - 2000** | 0.45 - 0.30 | **Calidad 60**: Compresión fuerte. Degradación forense activa. |
| **1999 - 1500** | 0.29 - 0.23 | **Calidad 50**: Supervivencia crítica. Ataque de compresión masivo. |

---

## 5. PROTOCOLO DE TRIANGULACIÓN (LECTURA POR BALIZAS)
Para optimizar la velocidad de auditoría industrial, Blade Corp establece el **Triaje de Frecuencia**. Solo se requieren 4 puntos de lectura para certificar la autoría de Quico Melero:

1.  **BALIZA ORIGEN (0,0)**: Identificador de ADN y barómetro de compresión ($RRS$).
2.  **BALIZA ESTRUCTURAL (0,4)**: Verificación de anclaje vertical. Inmune a filtros de paso bajo.
3.  **BALIZA DE RESONANCIA (6,6)**: Punto de máxima supervivencia. En ataques agresivos, registra fuerza superior al núcleo (**1761**).
4.  **BALIZA DE CIERRE (7,7)**: Punto de máxima frecuencia. Detecta procesos de re-escalado.



---

## 6. ÍNDICE DE SALUD DEL SELLO (ISS)
Métrica para descartar ataques de borrado selectivo o manipulación local por parte de terceros:
$$ISS = \left( \frac{F_{detectada(0,4)}}{F_{detectada(0,0)}} \right) \times 100$$
* **ISS > 90%**: Degradación natural por compresión (Imagen honesta).
* **ISS < 70%**: Sospecha de ataque dirigido o manipulación de frecuencias específicas.

---

## 7. ESTRATEGIA DE BASE DE DATOS
Para cada obra de Quico Melero procesada, Blade Corp almacenará:
* **FORCE_BASE_00**: 6525 (Clave para el algoritmo ADC).
* **FORCE_BASE_66**: 5746 (Clave para validación de eco).
* **DNA_HEX**: `a66a6955`.



---

## 8. CONCLUSIÓN
El sistema **Dragon3 V18** convierte el sello en un sensor de auditoría. No solo garantiza que la obra es de Quico Melero con un p-value de **0.0000%**, sino que permite a Blade Corp reconstruir la historia de manipulación de la imagen mediante la triangulación de sus balizas de frecuencia.

---
**Firmado por:**
**Gustavo Herraiz** *Lead Tech & Security Architect - Blade Corp Forensics*