 — Guía completa para crear nuevas células
markdown
# Guía para la Creación de Nuevas Células

Este documento describe el proceso, las reglas y las mejores prácticas para crear nuevas células (atómicas o compuestas) en el sistema Dragon3 / Agent Embassy.

---

## 📖 Índice

1. [¿Qué es una célula?](#-qué-es-una-célula)
2. [Tipos de células](#-tipos-de-células)
3. [Contrato de una célula](#-contrato-de-una-célula)
4. [Estructura de archivos](#-estructura-de-archivos)
5. [Guía paso a paso para crear una célula atómica](#-guía-paso-a-paso-para-crear-una-célula-atómica)
6. [Células compuestas (generadas automáticamente)](#-células-compuestas-generadas-automáticamente)
7. [Registro en el catálogo](#-registro-en-el-catálogo)
8. [Verificación de la célula](#-verificación-de-la-célula)
9. [Optimización de rendimiento](#-optimización-de-rendimiento)
10. [Ejemplo completo: `detectar-firma-digital.js`](#-ejemplo-completo-detectar-firma-digitaljs)
11. [Preguntas frecuentes](#-preguntas-frecuentes)

---

## 🧬 ¿Qué es una célula?

Una **célula** es la unidad atómica de procesamiento en el sistema. Cada célula es una **función pura** (o asíncrona) que:

- Recibe una entrada estandarizada.
- Realiza una tarea específica (ej. extraer metadatos, detectar IA, analizar texturas, etc.).
- Devuelve una salida estandarizada que cumple un **contrato** rígido.

**Principios KISS:**
- Una célula **hace una sola cosa** y la hace bien.
- Es **reutilizable** en diferentes planes.
- Es **independiente** de otras células (no tiene efectos secundarios).
- Es **rápida** y **ligera**.

---

## 🔬 Tipos de células

| **Tipo** | **Descripción** | **Ejemplo** |
|----------|-----------------|-------------|
| **Atómica** | Célula básica, implementada manualmente por un desarrollador. | `cargar-imagen.js`, `extraer-metadatos-exif.js` |
| **Compuesta** | Generada automáticamente por el orquestador (Fase 2) a partir de un plan exitoso. | `analizar-imagen-completa-1787058151803.js` |
| **Evolucionada** | Generada por el agente de decisión (Fase 6) combinando células exitosas. | `evolucion-cargar-imagen-extraer-metadatos-exif.js` |

> **Nota:** Solo las células **atómicas** se crean manualmente. Las compuestas y evolucionadas son generadas automáticamente por el sistema.

---

## 📜 Contrato de una célula

Toda célula debe cumplir con este contrato estricto. **No se aceptarán células que no lo cumplan.**

### Entrada (parámetros de la función)

```javascript
/**
 * @param {Object} entrada - Datos de entrada.
 * @param {*} entrada.payload - Datos principales (puede ser string, objeto, buffer, etc.).
 * @param {Object} [entrada.contexto] - Variables compartidas entre células (opcional).
 * @param {Object} [entrada.metadatos] - Metadatos adicionales (correlationId, usuarioId, etc.).
 * @param {Object} contexto - Contexto compartido (objeto mutable).
 * @returns {Promise<Object>} Salida estandarizada.
 */
Salida (objeto devuelto)
javascript
{
  exito: true,                        // Obligatorio. Booleano.
  resultado: {                        // Obligatorio si exito === true.
    esIA: false,                      // Obligatorio para células de análisis. Booleano.
    confianza: 0.85,                  // Obligatorio para células de análisis. Número 0-1.
    explicacion: "Texto claro...",    // Obligatorio para células de análisis. String.
    evidencias: ["Evidencia 1"],      // Obligatorio para células de análisis. Array de strings.
    peso: 0.9,                        // Obligatorio para células de análisis. Número 0-1.
    // ... otros campos específicos de la célula.
  },
  error: "Mensaje de error",          // Obligatorio si exito === false.
  metricas: { tiempoMs: 10 },         // Opcional. Objeto con métricas.
  contexto: { clave: "valor" }        // Opcional. Actualiza el contexto compartido.
}
Campos obligatorios para células de análisis
Campo	Tipo	Descripción
esIA	boolean	Indica si la célula considera que la imagen es IA (true) o humana (false).
confianza	number	Nivel de confianza (0.0 - 1.0).
explicacion	string	Explicación en lenguaje natural para el usuario final.
evidencias	string[]	Lista de hallazgos concretos que respaldan la decisión.
peso	number	Peso de la célula en el veredicto final (0.0 - 1.0). Por defecto 1.0.
📁 Estructura de archivos
Todas las células atómicas deben ubicarse en la carpeta:

text
/opt/dragon3/dev/celulas/celulas/
Convención de nombres:

Usar minúsculas y guiones (-) para separar palabras.

El nombre debe ser descriptivo: detectar-firma-digital.js, analizar-textura.js, etc.

Ejemplo de estructura:

text
celulas/
├── index.json                      # Catálogo de células
├── cargar-imagen.js                # Célula atómica
├── extraer-metadatos-exif.js       # Célula atómica
├── detectar-herramienta-ia.js      # Célula atómica
└── ... (más células)
🛠️ Guía paso a paso para crear una célula atómica
Paso 1: Definir el propósito
Claramente, define qué hace la célula y qué entrada necesita.

Ejemplo:
"Quiero una célula que detecte si una imagen contiene una firma digital (marca de agua visible) y devuelva la confianza de que es IA."

Paso 2: Crear el archivo
bash
touch /opt/dragon3/dev/celulas/celulas/detectar-firma-digital.js
Paso 3: Escribir el código
Estructura mínima:

javascript
/**
 * detectar-firma-digital.js
 * 
 * Detecta si una imagen contiene una firma digital (marca de agua visible)
 * y devuelve la confianza de que es IA.
 * 
 * Entrada: buffer de la imagen (desde cargar-imagen)
 * Salida: { esIA, confianza, explicacion, evidencias, peso, ... }
 * 
 * Contrato: cumple con el formato esperado por generar-veredicto.
 * 
 * Optimización: el tamaño de redimensionado se lee de configuracion.json.
 * 
 * @module detectar-firma-digital
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function detectarFirmaDigital(entrada, contexto) {
  let buffer;

  try {
    // ============================================================
    //  1. EXTRACCIÓN ROBUSTA DEL BUFFER
    // ============================================================
    const payload = entrada.payload;

    if (typeof payload === 'string') {
      const base64Limpia = payload.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else if (Buffer.isBuffer(payload)) {
      buffer = payload;
    } else if (payload && typeof payload === 'object') {
      let base64Str = null;
      if (payload.buffer && typeof payload.buffer === 'string') {
        base64Str = payload.buffer;
      } else if (payload.bufferBase64 && typeof payload.bufferBase64 === 'string') {
        base64Str = payload.bufferBase64;
      } else if (payload.data && typeof payload.data === 'string') {
        base64Str = payload.data;
      } else if (payload.buffer && Buffer.isBuffer(payload.buffer)) {
        buffer = payload.buffer;
      }
      if (base64Str) {
        const base64Limpia = base64Str.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Limpia, 'base64');
      } else if (!buffer) {
        throw new Error('No se pudo extraer el buffer del objeto payload.');
      }
    } else {
      throw new Error(`Tipo de payload no soportado: ${typeof payload}`);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('El buffer está vacío o no se pudo obtener.');
    }

    // ============================================================
    //  2. LECTURA DE CONFIGURACIÓN DE OPTIMIZACIÓN
    // ============================================================
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { tamañoOptimizado: 128 } };
    }
    const TAMAÑO = config.optimizacion?.tamañoOptimizado || 128;

    // ============================================================
    //  3. ANÁLISIS DE LA IMAGEN
    // ============================================================
    // 3.1. Cargar la imagen en escala de grises y redimensionar
    const imagen = await sharp(buffer)
      .grayscale()
      .resize(TAMAÑO, TAMAÑO, { fit: 'fill' })
      .raw()
      .toBuffer();

    // 3.2. Aquí va la lógica real de análisis de firma digital
    // (este es un ejemplo simulado)
    let firmaDetectada = false;
    let confianza = 0;

    // Simulación: buscar un patrón simple en los píxeles
    const pixeles = new Uint8Array(imagen);
    let contador = 0;
    for (let i = 0; i < pixeles.length; i++) {
      if (pixeles[i] > 200) contador++;
    }
    const porcentaje = contador / pixeles.length;
    if (porcentaje > 0.05) {
      firmaDetectada = true;
      confianza = Math.min(porcentaje, 1);
    }

    // ============================================================
    //  4. DECISIÓN Y CONSTRUCCIÓN DEL RESULTADO
    // ============================================================
    const esIA = firmaDetectada; // La presencia de firma puede indicar IA
    const evidencias = [];
    if (firmaDetectada) {
      evidencias.push('Firma digital visible detectada (típica de IA)');
    } else {
      evidencias.push('No se detectó firma digital visible.');
    }

    const explicacion = esIA
      ? `Se detectó firma digital visible (confianza: ${(confianza * 100).toFixed(0)}%).`
      : `No se detectó firma digital visible (confianza: ${(confianza * 100).toFixed(0)}%).`;

    return {
      exito: true,
      resultado: {
        esIA,
        confianza,
        explicacion,
        evidencias,
        peso: 0.5, // Peso moderado
        firmaDetectada,
        porcentajePixeles: porcentaje,
        tamañoUsado: TAMAÑO,
      },
      metricas: { tiempoMs: 15 },
    };

  } catch (error) {
    return {
      exito: false,
      error: `Error en detección de firma digital: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar firma digital: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.5,
      },
      metricas: { tiempoMs: 0 },
    };
  }
}
Paso 4: Registrar la célula en el catálogo
Edita celulas/index.json y añade una nueva entrada:

json
{
  "id": "detectar-firma-digital",
  "ruta": "./celulas/detectar-firma-digital.js",
  "descripcion": "Detecta si una imagen contiene una firma digital (marca de agua visible)",
  "entradaEsperada": {
    "payload": "object (resultado de cargar-imagen)"
  },
  "salidaOfrecida": {
    "esIA": "boolean",
    "confianza": "number",
    "explicacion": "string",
    "evidencias": "string[]",
    "peso": "number",
    "firmaDetectada": "boolean",
    "porcentajePixeles": "number"
  },
  "version": "1.0.0",
  "publica": true
}
Paso 5: Verificar la célula
bash
node test/celulas-verificacion.js ai.jpg
Si la célula está bien implementada, aparecerá como ✅ detectar-firma-digital: coincide=true.

🧬 Células compuestas (generadas automáticamente)
Las células compuestas no se crean manualmente. Son generadas por el orquestador (Fase 2) cada vez que un plan se ejecuta con éxito.

Ejemplo de célula compuesta:

javascript
// salida/analizar-imagen-completa-1787058151803.js
export default async function analizarImagenCompleta(entrada, contexto) {
  // ... código que ejecuta todas las células del plan en secuencia ...
}
No necesitas modificar ni crear estas células manualmente. El sistema lo hace por ti.

📋 Registro en el catálogo
El catálogo (celulas/index.json) es el repositorio central de todas las células disponibles. Debe mantenerse actualizado.

Campos del catálogo
Campo	Tipo	Obligatorio	Descripción
id	string	✅	Identificador único de la célula.
ruta	string	✅	Ruta al archivo de la célula (relativa a la raíz).
descripcion	string	✅	Breve descripción de lo que hace la célula.
entradaEsperada	object	✅	Describe la entrada que espera la célula.
salidaOfrecida	object	✅	Describe la salida que devuelve la célula.
version	string	✅	Versión semántica de la célula.
publica	boolean	✅	Si es true, la célula es visible para agentes externos.
peso	number	❌	Peso por defecto (si no se define, se usa 1.0).
generada	boolean	❌	Indica si la célula fue generada automáticamente.
timestamp	number	❌	Timestamp de creación (para células generadas).
🧪 Verificación de la célula
El sistema incluye un test de verificación que compara el resultado de la célula con una verificación independiente (usando las mismas librerías).

Para verificar una célula nueva:

bash
node test/celulas-verificacion.js ai.jpg
Si la célula falla la verificación:

Revisa que el contrato se cumpla al 100%.

Asegúrate de que la extracción del buffer sea robusta.

Verifica que los parámetros de optimización (tamaño, calidad) se lean de configuracion.json.

⚡ Optimización de rendimiento
Todas las células deben leer los parámetros de optimización desde configuracion.json para que el agente pueda ajustar automáticamente el rendimiento.

Parámetros disponibles
Parámetro	Clave	Uso
Tamaño de imagen	optimizacion.tamañoOptimizado	Redimensionado de imágenes (ej. 128).
Calidad de compresión	optimizacion.calidadOptimizada	Calidad JPEG (ej. 80).
Concurrencia máxima	optimizacion.concurrenciaMaxima	Número de trabajos paralelos.
Caché de metadatos	optimizacion.cacheActivado	Activar/desactivar caché.
Código de ejemplo para leer configuración
javascript
const configPath = path.join(__dirname, '..', 'configuracion.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = { optimizacion: { tamañoOptimizado: 128 } };
}
const TAMAÑO = config.optimizacion?.tamañoOptimizado || 128;
📝 Ejemplo completo: detectar-firma-digital.js
Aquí tienes el ejemplo completo de una célula que detecta marcas de agua digitales, siguiendo todas las reglas.

Ruta: /opt/dragon3/dev/celulas/celulas/detectar-firma-digital.js

javascript
/**
 * detectar-firma-digital.js
 * 
 * Detecta si una imagen contiene una firma digital (marca de agua visible)
 * y devuelve la confianza de que es IA.
 * 
 * Entrada: buffer de la imagen (desde cargar-imagen)
 * Salida: { esIA, confianza, explicacion, evidencias, peso, ... }
 * 
 * Contrato: cumple con el formato esperado por generar-veredicto.
 * 
 * Optimización: el tamaño de redimensionado se lee de configuracion.json.
 * 
 * @module detectar-firma-digital
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function detectarFirmaDigital(entrada, contexto) {
  let buffer;

  try {
    // ============================================================
    //  1. EXTRACCIÓN ROBUSTA DEL BUFFER
    // ============================================================
    const payload = entrada.payload;

    if (typeof payload === 'string') {
      const base64Limpia = payload.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else if (Buffer.isBuffer(payload)) {
      buffer = payload;
    } else if (payload && typeof payload === 'object') {
      let base64Str = null;
      if (payload.buffer && typeof payload.buffer === 'string') {
        base64Str = payload.buffer;
      } else if (payload.bufferBase64 && typeof payload.bufferBase64 === 'string') {
        base64Str = payload.bufferBase64;
      } else if (payload.data && typeof payload.data === 'string') {
        base64Str = payload.data;
      } else if (payload.buffer && Buffer.isBuffer(payload.buffer)) {
        buffer = payload.buffer;
      }
      if (base64Str) {
        const base64Limpia = base64Str.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Limpia, 'base64');
      } else if (!buffer) {
        throw new Error('No se pudo extraer el buffer del objeto payload.');
      }
    } else {
      throw new Error(`Tipo de payload no soportado: ${typeof payload}`);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('El buffer está vacío o no se pudo obtener.');
    }

    // ============================================================
    //  2. LECTURA DE CONFIGURACIÓN DE OPTIMIZACIÓN
    // ============================================================
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { tamañoOptimizado: 128 } };
    }
    const TAMAÑO = config.optimizacion?.tamañoOptimizado || 128;

    // ============================================================
    //  3. ANÁLISIS DE LA IMAGEN
    // ============================================================
    const imagen = await sharp(buffer)
      .grayscale()
      .resize(TAMAÑO, TAMAÑO, { fit: 'fill' })
      .raw()
      .toBuffer();

    // Simulación: detectar firma digital (patrón de píxeles)
    const pixeles = new Uint8Array(imagen);
    let contador = 0;
    for (let i = 0; i < pixeles.length; i++) {
      if (pixeles[i] > 200) contador++;
    }
    const porcentaje = contador / pixeles.length;
    const firmaDetectada = porcentaje > 0.05;
    const confianza = Math.min(porcentaje, 1);

    // ============================================================
    //  4. DECISIÓN Y CONSTRUCCIÓN DEL RESULTADO
    // ============================================================
    const esIA = firmaDetectada;
    const evidencias = firmaDetectada
      ? ['Firma digital visible detectada (típica de IA)']
      : ['No se detectó firma digital visible.'];

    const explicacion = esIA
      ? `Se detectó firma digital visible (confianza: ${(confianza * 100).toFixed(0)}%).`
      : `No se detectó firma digital visible (confianza: ${(confianza * 100).toFixed(0)}%).`;

    return {
      exito: true,
      resultado: {
        esIA,
        confianza,
        explicacion,
        evidencias,
        peso: 0.5,
        firmaDetectada,
        porcentajePixeles: porcentaje,
        tamañoUsado: TAMAÑO,
      },
      metricas: { tiempoMs: 15 },
    };

  } catch (error) {
    return {
      exito: false,
      error: `Error en detección de firma digital: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar firma digital: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.5,
      },
      metricas: { tiempoMs: 0 },
    };
  }
}
❓ Preguntas frecuentes
1. ¿Puedo usar librerías externas en mi célula?
Sí, pero deben estar instaladas en el proyecto y ser compatibles con Node.js (ESM). No uses librerías que requieran permisos especiales o que sean demasiado pesadas (ej. TensorFlow entero). Prefiere librerías ligeras y rápidas.

2. ¿Mi célula debe manejar imágenes en cualquier formato?
Sí, siempre que sea posible. Usa sharp para manejar múltiples formatos (JPEG, PNG, WebP, etc.). Si tu célula solo funciona con un formato específico, verifica el formato y devuelve un error controlado.

3. ¿Cómo puedo probar mi célula de forma aislada?
Puedes crear un script de prueba rápido:

javascript
import detectarFirmaDigital from './celulas/detectar-firma-digital.js';
import fs from 'fs';

const buffer = fs.readFileSync('ai.jpg');
const resultado = await detectarFirmaDigital({ payload: buffer }, {});
console.log(resultado);
4. ¿Qué hago si mi célula es demasiado lenta?
Lee los parámetros de optimización de configuracion.json (tamaño, calidad).

Reduce la resolución de la imagen antes de procesarla.

Usa operaciones vectorizadas (ej. sharp es mucho más rápido que manipular píxeles en JS puro).

Si es inevitable, la célula se ejecutará en la cola (Bull) para no bloquear el event loop.

5. ¿Cómo sé si mi célula es buena?
Pasa la verificación (test/celulas-verificacion.js).

Tiene buena precisión en imágenes reales (medida con groundTruth).

Es rápida (< 30 ms en promedio).

Tiene alta contribución al veredicto final (según el agente).

🎯 Resumen de buenas prácticas
Práctica	Descripción
Una célula, una tarea	No mezcles funcionalidades.
Buffer robusto	Usa el código estándar para extraer el buffer de cualquier formato.
Lee configuración	Usa configuracion.json para parámetros de optimización.
Cumple el contrato	Siempre devuelve esIA, confianza, explicacion, evidencias, peso.
Documenta	Añade JSDoc completo y comentarios claros.
Verifica	Ejecuta el test de verificación antes de subir la célula.
Mide rendimiento	Asegúrate de que sea rápida (< 30 ms).
Maneja errores	Devuelve siempre exito: false con un mensaje claro.
✅ Conclusión
Crear una nueva célula es un proceso sencillo si sigues las reglas y el contrato establecido. El sistema está diseñado para ser extensible y modular, permitiendo añadir nuevas funcionalidades sin romper nada existente.