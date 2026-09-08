# 📄 PROYECTO DRAGON3: ARQUITECTURA DE CERTIFICACIÓN FORENSE DUAL

| Metadato | Detalle |
| :--- | :--- |
| **Proyecto** | Dragon3 (Blade Corporation) |
| **Módulo** | Core de Certificación & Esteganografía |
| **Versión** | 4.1 "Forensic Detective & Sensor Biometrics" |
| **Estado** | Whitepaper Técnico / Especificación de Ingeniería |
| **Autor** | Gustavo (CTO, Blade Corporation) |
| **Fecha** | 12 de Diciembre de 2025 |
| **Confidencialidad** | Alta (Blade Corp & TecnoCampus Partners) |

---

## 1. RESUMEN EJECUTIVO

**Dragon3** representa un cambio de paradigma en la protección de activos digitales y la lucha contra la desinformación. Evolucionamos desde un modelo pasivo de "Marca de Agua Digital" hacia una **Plataforma de Telemetría Forense Activa**.

El sistema supera las limitaciones de los DRM tradicionales mediante una arquitectura de **Verificación Dual** que combina lógica matemática y física de sensores:

1.  **Capa Lógica (La Espiral Áurea):** Una estructura de datos esteganográfica basada en geometría sagrada que permite no solo validar la autenticidad, sino **medir y diagnosticar** deformaciones (rotación, escala, recorte) y detectar ataques de trasplante.
2.  **Capa Física (Biometría de Sensor PRNU):** Un escáner de "ADN de Hardware" que identifica el origen de la cámara incluso si la firma digital ha sido borrada quirúrgicamente.

El resultado es un sistema capaz de distinguir jurídicamente entre una imagen falsa, una imagen manipulada y una **supresión ilegal de derechos (sabotaje con dolo)**.

---

## 2. FUNDAMENTOS TEÓRICOS: LA ESPIRAL ÁUREA (CAPA LÓGICA)

Utilizamos la **Espiral Logarítmica** como carril de distribución de datos debido a sus propiedades únicas de autosimilitud.

$$r = a \cdot e^{k\theta}$$

Donde:
* $r$ es la distancia al origen.
* $\theta$ es el ángulo desde el eje x.
* $a$ y $k$ son constantes derivadas de la Clave Privada y la Proporción Áurea ($\phi$).

### 2.1. Estrategia de Distribución: "La Constelación"
Para garantizar la invisibilidad estética (crucial en Obras de Arte) y evitar patrones de ruido detectables:
* **Discretización:** No "dibujamos" la línea continua de la espiral. Inyectamos paquetes de datos ("Faros" o *Beacons*) en coordenadas discretas a lo largo de la curva teórica.
* **Densidad Armónica:** La separación entre puntos sigue una proporción áurea, asegurando cobertura tanto en el centro (foco de atención) como en la periferia, sin crear "cicatrices" visuales.

### 2.2. Autosimilitud y Resistencia Geométrica
La propiedad fundamental de la espiral logarítmica es que **rotar la espiral es equivalente a escalarla**.
* Esto permite que Dragon3 recupere la información incluso si la imagen ha sido ampliada (Upscaling AI), reducida (Thumbnail) o girada. El sistema no busca coordenadas fijas $(x,y)$, sino relaciones relativas angulares y radiales.

---

## 3. ARQUITECTURA DE SEGURIDAD: VINCULACIÓN CRIPTOGRÁFICA

Para mitigar la vulnerabilidad de "Ataque de Trasplante" (copiar píxeles válidos de una foto auténtica y pegarlos en una foto falsa), el Sello MBH deja de ser un identificador al portador.

### 3.1. Estructura del Payload (Carga Útil Vinculada)
El mensaje oculto en los bits LSB (Least Significant Bit) contiene ahora una prueba matemática de su contenedor visual.

**Schema JSON del Sello:**
```json
{


}
3.2. Mecanismo de Defensa (La Trampa del Hash)Lectura: Dragon3 extrae el payload y decodifica: "Este sello certifica que la imagen contenedora tiene Hash X".Cálculo: Dragon3 computa en tiempo real el Hash de la imagen que está analizando: Hash Y.Sentencia:Si X == Y $\rightarrow$ INTEGRIDAD VERIFICADA.Si X != Y $\rightarrow$ ALERTA DE TRASPLANTE. El sello es auténtico, pero no pertenece a esta imagen (integridad visual comprometida).4. TELEMETRÍA FORENSE: LA CAJA NEGRADragon3 no solo valida, sino que diagnostica. Al analizar la discrepancia geométrica entre los puntos de la espiral teórica y los puntos encontrados en la imagen, el sistema genera un informe pericial automático:Síntoma Geométrico DetectadoDiagnóstico ForenseAcción del SistemaDistancia entre puntos alterada"Imagen reducida o ampliada (Escalado)"Calcular % de zoom aplicado.Desfase angular constante"Imagen rotada"Calcular grados de rotación exactos ($\Delta\theta$).Ausencia de centro + Cola detectada"Recorte (Crop) de obra protegida"Identificar cuadrante de origen y alertar de uso parcial no autorizado.Distorsión no uniforme"Deformación de Aspect Ratio"Alerta de manipulación estética (estiramiento).5. NIVEL 2: VERIFICACIÓN BIOMÉTRICA (EL MAPA DE CALOR)(La Red de Seguridad Física)Si un atacante localiza y borra los puntos de la espiral (mediante filtros de suavizado o borrado manual), la Capa Lógica falla (Silencio). Aquí se activa la Capa Física como medida de redundancia.5.1. Fundamento: PRNU (Photo Response Non-Uniformity)Cada sensor de cámara tiene una "huella dactilar" única debida a imperfecciones microscópicas de fabricación en el silicio de sus fotodiodos. Dragon3 almacena la firma PRNU de las cámaras registradas (Base de Datos Segura).5.2. El Mapa de Calor (Heat Map)Dragon3 escanea la imagen píxel a píxel correlacionando el ruido visual residual con la firma del sensor registrada.Zonas Verdes (Hot): Coincidencia estadística alta con el sensor del autor.Zonas Rojas (Cold): Ruido incoherente (píxeles generados por IA, parches de Photoshop o provenientes de otra cámara).5.3. Detección de Sabotaje (Prueba de Mala Fe)Este es el escenario legalmente más potente del sistema:Estado Espiral: ❌ NO DETECTADO (Puntos borrados intencionadamente).Estado Mapa de Calor: ✅ POSITIVO (La imagen coincide al >98% con la cámara del autor).VERDICTO AUTOMÁTICO: 🚨 SUPRESIÓN INTENCIONADA DE DERECHOS."La imagen pertenece físicamente al autor, pero sus medidas tecnológicas de protección han sido eliminadas manualmente. Existe evidencia de dolo (mala fe) para ocultar la autoría."6. PLAN DE IMPLEMENTACIÓN TÉCNICAHoja de ruta para la adaptación del código (v3.0.0-FAANG) a la arquitectura v4.1.6.1. Generador (generadorMBH.js)Hashing Previo: Implementar cálculo de SHA-256 del buffer visual slice(0, 10000) antes de la construcción del payload.Geometría Áurea: Sustituir coordenadas fijas por función generarEspiralAurea(clave, width, height).Inyección Discreta: Modificar bucle de escritura para seguir la lista de coordenadas generada por la espiral, garantizando invisibilidad (LSB).6.2. Analizador (analizadorMBH.js)Fase 1 (Rápida - Lógica): Buscar Espiral, decodificar y validar Hash.Si OK $\rightarrow$ Certificado Verde (Original).Si Geometría Rota $\rightarrow$ Certificado Amarillo (Informe de Deformación).Fase 2 (Forense - Física): Si la Espiral falla, activar extracción de PRNU.Comparar con firmas almacenadas.Si PRNU OK $\rightarrow$ Certificado Rojo (Sabotaje).Visualización: Generar heatmap.png superponiendo la capa de coincidencia de ruido sobre la imagen original para el informe final.7. CONCLUSIÓNLa arquitectura propuesta convierte a Dragon3 en un sistema Redundante y Resiliente:Si rompes la Integridad (Hash), te detectamos por incoherencia matemática.Si rompes la Geometría (Recorte/Giro), te medimos por telemetría áurea.Si borras la Firma (Puntos), te identificamos por la Física (Sensor PRNU).No existe escapatoria matemática ni física para la falsificación o apropiación indebida sin dejar rastro forense.Blade Corporation - Confidential & ProprietaryMataró, 2025
### 3.2. Mecanismo de Defensa (La Trampa del Hash)

1.  **Lectura:** Dragon3 extrae el payload y decodifica: *"Este sello certifica que la imagen contenedora tiene Hash `X`"*.
2.  **Cálculo:** Dragon3 computa en tiempo real el Hash de la imagen que está analizando: Hash `Y`.
3.  **Sentencia:**
    * Si `X == Y` $\rightarrow$ **INTEGRIDAD VERIFICADA**.
    * Si `X != Y` $\rightarrow$ **ALERTA DE TRASPLANTE**. El sello es auténtico, pero no pertenece a esta imagen (integridad visual comprometida).

---

## 4. TELEMETRÍA FORENSE: LA CAJA NEGRA

Dragon3 no solo valida, sino que **diagnostica**. Al analizar la discrepancia geométrica entre los puntos de la espiral teórica y los puntos encontrados en la imagen, el sistema genera un informe pericial automático:

| Síntoma Geométrico Detectado | Diagnóstico Forense | Acción del Sistema |
| :--- | :--- | :--- |
| **Distancia entre puntos alterada** | *"Imagen reducida o ampliada (Escalado)"* | Calcular % de zoom aplicado. |
| **Desfase angular constante** | *"Imagen rotada"* | Calcular grados de rotación exactos ($\Delta\theta$). |
| **Ausencia de centro + Cola detectada** | *"Recorte (Crop) de obra protegida"* | Identificar cuadrante de origen y alertar de uso parcial no autorizado. |
| **Distorsión no uniforme** | *"Deformación de Aspect Ratio"* | Alerta de manipulación estética (estiramiento). |

---

## 5. NIVEL 2: VERIFICACIÓN BIOMÉTRICA (EL MAPA DE CALOR)
*(La Red de Seguridad Física)*

Si un atacante localiza y borra los puntos de la espiral (mediante filtros de suavizado o borrado manual), la Capa Lógica falla (Silencio). Aquí se activa la **Capa Física** como medida de redundancia.

### 5.1. Fundamento: PRNU (Photo Response Non-Uniformity)
Cada sensor de cámara tiene una "huella dactilar" única debida a imperfecciones microscópicas de fabricación en el silicio de sus fotodiodos. Dragon3 almacena la firma PRNU de las cámaras registradas (Base de Datos Segura).

### 5.2. El Mapa de Calor (Heat Map)
Dragon3 escanea la imagen píxel a píxel correlacionando el ruido visual residual con la firma del sensor registrada.
* **Zonas Verdes (Hot):** Coincidencia estadística alta con el sensor del autor.
* **Zonas Rojas (Cold):** Ruido incoherente (píxeles generados por IA, parches de Photoshop o provenientes de otra cámara).

### 5.3. Detección de Sabotaje (Prueba de Mala Fe)
Este es el escenario legalmente más potente del sistema:

1.  **Estado Espiral:** ❌ **NO DETECTADO** (Puntos borrados intencionadamente).
2.  **Estado Mapa de Calor:** ✅ **POSITIVO** (La imagen coincide al >98% con la cámara del autor).
3.  **VERDICTO AUTOMÁTICO:** 🚨 **SUPRESIÓN INTENCIONADA DE DERECHOS**.
    > *"La imagen pertenece físicamente al autor, pero sus medidas tecnológicas de protección han sido eliminadas manualmente. Existe evidencia de dolo (mala fe) para ocultar la autoría."*

---

## 6. PLAN DE IMPLEMENTACIÓN TÉCNICA

Hoja de ruta para la adaptación del código (`v3.0.0-FAANG`) a la arquitectura `v4.1`.

### 6.1. Generador (`generadorMBH.js`)
* **Hashing Previo:** Implementar cálculo de SHA-256 del buffer visual `slice(0, 10000)` antes de la construcción del payload.
* **Geometría Áurea:** Sustituir coordenadas fijas por función `generarEspiralAurea(clave, width, height)`.
* **Inyección Discreta:** Modificar bucle de escritura para seguir la lista de coordenadas generada por la espiral, garantizando invisibilidad (LSB).

### 6.2. Analizador (`analizadorMBH.js`)
* **Fase 1 (Rápida - Lógica):** Buscar Espiral, decodificar y validar Hash.
    * Si OK $\rightarrow$ Certificado Verde (Original).
    * Si Geometría Rota $\rightarrow$ Certificado Amarillo (Informe de Deformación).
* **Fase 2 (Forense - Física):** Si la Espiral falla, activar extracción de PRNU.
    * Comparar con firmas almacenadas.
    * Si PRNU OK $\rightarrow$ Certificado Rojo (Sabotaje).
* **Visualización:** Generar `heatmap.png` superponiendo la capa de coincidencia de ruido sobre la imagen original para el informe final.

---

## 7. CONCLUSIÓN

La arquitectura propuesta convierte a Dragon3 en un sistema **Redundante y Resiliente**:

* Si rompes la **Integridad** (Hash), te detectamos por incoherencia matemática.
* Si rompes la **Geometría** (Recorte/Giro), te medimos por telemetría áurea.
* Si borras la **Firma** (Puntos), te identificamos por la **Física** (Sensor PRNU).

No existe escapatoria matemática ni física para la falsificación o apropiación indebida sin dejar rastro forense.

---
**Blade Corporation - Confidential & Proprietary**
**Mataró, 2025**
