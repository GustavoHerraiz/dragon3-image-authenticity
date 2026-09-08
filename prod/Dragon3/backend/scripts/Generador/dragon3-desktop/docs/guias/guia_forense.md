# 🔬 Guía Forense de Dragon3

**Fundamentos técnicos del sellado forense.**

---

## 📋 Índice

1. [Introducción a la esteganografía forense](#introducción-a-la-esteganografía-forense)
2. [Técnica Stardust (DCT)](#técnica-stardust-dct)
3. [Técnica Vogel (Espiral geométrica)](#técnica-vogel-espiral-geométrica)
4. [Checksum Mentalista](#checksum-mentalista)
5. [Técnica del Sándwich (Metadatos)](#técnica-del-sándwich-metadatos)
6. [Resistencia a ataques](#resistencia-a-ataques)
7. [Comparativa con otras técnicas](#comparativa-con-otras-técnicas)
8. [Casos de uso](#casos-de-uso)

---

## 📌 Introducción a la esteganografía forense

### ¿Qué es la esteganografía forense?

La esteganografía forense es el arte de ocultar información en un medio (imagen, audio, vídeo) de forma que sea **indetectable para el ojo humano** pero **verificable mediante análisis técnico**.

**Dragon3** combina tres técnicas para crear un sello forense robusto:

1. **Stardust**: Ocultación en el dominio de la frecuencia (DCT).
2. **Vogel**: Verificación geométrica (espiral en canal alfa).
3. **Sándwich**: Preservación y adición de metadatos.

---

## 🧬 Técnica Stardust (DCT)

### ¿Qué es DCT?

La **Transformada del Coseno Discreto (DCT)** es una técnica matemática que convierte una señal del dominio espacial al dominio de la frecuencia.

**En imágenes:** La DCT separa la imagen en frecuencias:
- **Bajas frecuencias**: Información general (brillo, contornos).
- **Altas frecuencias**: Detalles finos (bordes, texturas).

### ¿Cómo se aplica en Dragon3?

1. **Dividir la imagen en bloques de 8x8 píxeles**.
2. **Aplicar DCT a cada bloque** (canal azul).
3. **Modificar los coeficientes** `DCT[1][1]` y `DCT[2][2]`:
   - Si el bit es `1` → `DCT[1][1] > DCT[2][2]`.
   - Si el bit es `0` → `DCT[1][1] < DCT[2][2]`.
4. **Aplicar DCT inversa (IDCT)** para reconstruir el bloque.
5. **Repetir para toda la imagen**.

### ¿Por qué el canal azul?

- El ojo humano es **menos sensible** a variaciones en el canal azul.
- Las modificaciones en azul son **prácticamente invisibles**.
- El canal azul es el **menos comprimido** en formatos como JPEG.

### Ventajas de Stardust

- ✅ **Invisible** al ojo humano.
- ✅ **Resistente a compresión** JPEG (hasta calidad 70).
- ✅ **Resistente a redimensionados** (hasta 50% de escala).
- ✅ **Resistente a recortes** (gracias a la redundancia fractal).

### Bits extraídos por Stardust

- **32 bits** en total:
  - **28 bits**: ID del sello (268 millones de IDs únicos).
  - **4 bits**: Checksum Mentalista (validación de integridad).

---

## 🌀 Técnica Vogel (Espiral geométrica)

### ¿Qué es la espiral de Vogel?

La **espiral de Vogel** es un patrón matemático que genera puntos distribuidos uniformemente en una superficie.

**Fórmula matemática:**
θ = n * 137.508° (Ángulo dorado)
r = c * √n (Radio)

text

### ¿Cómo se aplica en Dragon3?

1. **Calcular centro único** a partir del `idCompleto` y la `PRIVATE_KEY`.
2. **Generar 68-74 puntos** en espiral alrededor del centro.
3. **Marcar cada punto** en los píxeles:
   - Canal Alfa: LSB = 1.
   - Canal Azul: LSB = 1.

### ¿Por qué el canal alfa?

- El canal alfa no afecta a la visualización de la imagen.
- Es **prácticamente invisible**.
- En PNG, el alfa es **fácilmente modificable** (ideal para marcas de agua).

### ¿Para qué sirve Vogel?

- **Verificación de originalidad**: Si la imagen ha sido recortada, la espiral no se detecta.
- **Detección de manipulaciones**: Si la imagen ha sido editada, los puntos pueden desaparecer.
- **Complemento a Stardust**: Si Stardust falla (por compresión extrema), Vogel puede salvar la verificación.

### Redundancia en Vogel

- **68-74 puntos** por imagen.
- **Umbral mínimo**: 25 puntos para considerar original.
- **Alta redundancia**: Aunque se pierdan puntos, la espiral se puede detectar.

---

## 🔢 Checksum Mentalista

### ¿Qué es el checksum Mentalista?

Es un **algoritmo de validación de 4 bits** diseñado para:
- Detectar errores en la extracción del hash.
- Verificar la integridad del sello.

### Algoritmo

```javascript
function calcularChecksumMentalista(id28) {
    const L = id28 & 0x3FFF;            // 14 bits bajos
    const H = (id28 >> 14) & 0x3FFF;    // 14 bits altos
    const X = L ^ H;                    // Mezcla XOR
    const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
    return V & 0x0F;                    // 4 bits finales
}
¿Por qué "Mentalista"?
Inspirado en técnicas de ilusionismo: El checksum parece aleatorio pero es determinista.

Dificultad de falsificación: Sin conocer el algoritmo, es imposible generar un checksum válido.

Validación en el analizador
javascript
const chk = parseInt(bits.substring(28), 2);
const calc = calcularChecksumMentalista(idInt);
const ok = chk === calc;
Si el checksum no coincide, el sello se rechaza automáticamente.

🥪 Técnica del Sándwich (Metadatos)
¿Qué es la técnica del sándwich?
Es un método para preservar los metadatos originales de una imagen mientras se añaden los metadatos del sello.

Capas del sándwich
Capa inferior: Metadatos originales (EXIF, IPTC, XMP).

Capa superior: Metadatos del sello (DRAGON3_ID, Artist, Copyright).

Proceso
Leer metadatos originales con ExifTool (formato JSON).

Filtrar campos escribibles (Make, Model, ISO, etc.).

Añadir metadatos del sello (ImageDescription, Copyright, etc.).

Reinyectar todos con ExifTool.

Campos del sello
Campo	Contenido
ImageDescription	DRAGON3_ID:GHL_000001F | Obra - Cliente
Copyright	Protected by Dragon3 - Derechos
Artist	Cliente
XMP:Rights	Protected by Dragon3
XMP:Creator	Cliente
XMP:Title	Obra
Software	Dragon3 V22 Mentalist Core
Ventajas del sándwich
✅ Preserva la historia de la imagen (cámara, fecha, ISO, etc.).

✅ Añade trazabilidad (quién, cuándo, qué obra).

✅ Dificulta la falsificación: Los metadatos deben coincidir con los píxeles.

🛡️ Resistencia a ataques
Ataque	Stardust	Vogel	Metadatos
Compresión JPEG (70%)	✅	⚠️ (PNG)	❌ (Se pierden)
Redimensionado (50%)	✅	❌	❌
Recorte (10%)	✅	❌	❌
Rotación (90º)	✅ (V6)	❌	❌
Conversión JPG→PNG	✅	✅	⚠️ (Se preservan)
Eliminación de metadatos	✅	✅	❌
Ajuste de brillo/contraste	⚠️	✅	❌
Filtros (desenfoque, ruido)	⚠️	✅	❌
Estrategia de defensa en capas
Stardust: Capa principal (resistente a compresión y redimensionado).

Vogel: Capa secundaria (resistente a ajustes de brillo y filtros).

Metadatos: Capa de validación (cotejo de integridad).

Si una capa falla, las otras pueden salvar la verificación.

📊 Comparativa con otras técnicas
Técnica	Visibilidad	Resistencia	Dificultad	Dragon3
Marca de agua visible	Alta	Baja	Baja	❌
LSB (bits menos significativos)	Baja	Muy baja	Media	❌
DCT (Stardust)	Muy baja	Alta	Alta	✅
Espiral geométrica (Vogel)	Invisible	Media	Alta	✅
Metadatos (Sándwich)	Invisible	Baja	Baja	✅
Combinación Dragon3	Invisible	Muy alta	Muy alta	✅
💼 Casos de uso
1. Fotógrafos profesionales
Proteger imágenes entregadas a clientes.

Demostrar autoría en caso de disputa legal.

Gestionar proyectos con múltiples clientes y obras.

2. Archivos históricos y patrimoniales
Digitalización de archivos (bibliotecas, museos).

Trazabilidad de imágenes (quién, cuándo, cómo).

3. Forense digital
Investigación de plagio.

Verificación de autenticidad en juicios.

4. Documentación técnica
Proyectos de arquitectura, ingeniería y diseño.

Control de versiones de imágenes técnicas.

🔬 Conclusión
Dragon3 no es solo una marca de agua: es un sistema forense completo que combina:

Esteganografía en frecuencia (Stardust).

Geometría espiral (Vogel).

Metadatos forenses (Sándwich).

Protege tu obra, protege tu legado. 🐉

🐉 Dragon3 - Protege tu obra, protege tu legado.