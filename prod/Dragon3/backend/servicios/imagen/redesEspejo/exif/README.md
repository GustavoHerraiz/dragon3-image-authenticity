# DRAGON3 - Red Espejo EXIF (`/redesEspejo/exif`)

**Versión:** 3.1.0-FAANG-KISS  
**Arquitecto:** Gustavo Herraiz  
**Última revisión:** 2025-07-22  
**Ubicación:** `/var/www/Dragon3/backend/servicios/imagen/redesEspejo/exif/`

---

## 🧠 Propósito

La red espejo EXIF es un **módulo plug & play** que enriquece los resultados del analizador EXIF clásico usando una **micro-red neuronal Synaptic** y lógica orientada a escala de grises.  
- Añade **score de confianza** (continuo), **clase cualitativa** (`humana`, `ai`, `indeterminado`) y **warning/explicación**.
- Cumple **100% el contrato** de `redesEspejo.js` (input/output, errores, logging, trazabilidad).
- Es **rápida, sencilla y auditable**: P95 <200ms garantizado.
- Permite **ajuste de pesos en caliente** desde `servidorCentral.js`, recomendado por `redSuperior.js` vía WebSocket.
- Garantiza que los features nunca sean `null` ni `undefined` (siempre valor 0/1), asegurando compatibilidad total y resultados fiables.
- Implementa lógica profesional para casos ambiguos/indeterminados, aportando valor real a auditoría y análisis forense.

---

## ⚡ Arquitectura y Flujo

```mermaid
graph TD
    A[analizadorImagen.js] -->|Llama a analizadores clásicos| B[analizadorExif.js]
    B -->|Resultado EXIF| C[redesEspejo/exif/modelo.js]
    C -->|Score, clase, warning, features| D[redesEspejo.js]
    D -->|Resultados de mirror nets| E[servidorCentral.js]
    E -->|Reenvía pesos recomendados vía WS| C
    E -->|Todos los resultados| F[redSuperior.js (TensorFlow)]
    F -->|Predicción final| A
```

---

## 🛠️ **IMPORTANTE: Cómo solucionar el problema de compatibilidad de pesos Synaptic (guía para todas las redes espejo)**

**Este apartado es fundamental para futuras redes espejo Dragon3.**

### 🟢 **Problema detectado:**
- **Incompatibilidad al cargar pesos entrenados (`pesos.json`) en `modelo.js` usando Synaptic y Node ESM.**
- El error típico:  
  ```
  TypeError: nn.fromJSON is not a function
  ```
- O, aunque no falle, la red no responde igual tras cargar los pesos.

### 🟢 **Causa raíz:**
- **Synaptic es un módulo CommonJS y, si lo importas como ESM, las clases (`Network`, `Layer`) no aparecen como "named exports".**
- Además, **el método correcto para cargar una red desde JSON es el método estático `Network.fromJSON()`**, NO `nn.fromJSON()`.
- Es crucial que la construcción de la red neuronal en el script de entrenamiento y en el de inferencia sea **exactamente igual** (misma arquitectura y método).

### 🟢 **Solución definitiva y patrón DRAGON3:**

#### 1. **Importa Synaptic así en ESM:**
```js
import pkg from "synaptic";
const { Network, Layer, Trainer } = pkg;
```

#### 2. **Construye la red SIEMPRE igual en entrenamiento y en modelo.js**  
Ejemplo para 9 features, 4 ocultas, 1 salida:
```js
const FEATURE_COUNT = 9;
const inputLayer = new Layer(FEATURE_COUNT);
const hiddenLayer = new Layer(4);
const outputLayer = new Layer(1);
inputLayer.project(hiddenLayer);
hiddenLayer.project(outputLayer);
let nn = new Network({
  input: inputLayer,
  hidden: [hiddenLayer],
  output: outputLayer,
});
```

#### 3. **Guarda pesos con:**
```js
const pesos = nn.toJSON();
fs.writeFileSync('pesos.json', JSON.stringify(pesos, null, 2));
```

#### 4. **Carga pesos SIEMPRE así (en ESM):**
```js
if (fs.existsSync('./pesos.json')) {
  const pesos = JSON.parse(fs.readFileSync('./pesos.json'));
  nn = Network.fromJSON(pesos); // No uses nn.fromJSON()
}
```

#### 5. **NO MEZCLES Architect.Perceptron y construcción manual de layers**
- Usa siempre el mismo método en ambos scripts.
- El JSON de pesos solo es compatible con la arquitectura exacta.

#### 6. **Este patrón es válido para CUALQUIER red espejo Dragon3**
- Cuando crees una nueva red espejo (por ejemplo, para análisis de pantalla, ruido, etc), usa este mismo patrón para garantizar compatibilidad y trazabilidad.

#### 7. **¿Por qué esto es crítico?**
- Si mezclas métodos de construcción o usas importación incompatible, los pesos NO se podrán cargar y la red dará errores sutiles o fallos directos.

---

## 🏆 Cumplimiento de Especificaciones FAANG Enterprise

### ✔️ Contrato con `redesEspejo.js` (PRIMORDIAL)
- **Input:**  
  `{ idImagen, datos }`  
  - `idImagen`: string  
  - `datos`: objeto EXIF (output de analizadorExif.js), nunca null/undefined en features extraídos.
- **Output:**  
  - `idImagen`: string
  - `score`: float 0..1 (confianza “humano”)
  - `clase`: `"humana" | "ai" | "indeterminado"`
  - `warning`: string | null (explicación del resultado)
  - `features`: array numérico (0/1, nunca null/undefined)
  - `exif`: objeto EXIF original
  - `timestamp`: ISO8601
  - En caso de error: `{ idImagen, error: true, mensaje, timestamp }`

### ✔️ Logging y trazabilidad
- **Solo logging estructurado (`dragonLogger`/Winston):**
  - Logs para inicio, éxito, error, actualización de pesos, conexión WS, y performance.
  - Todos los logs incluyen: `module`, `operation`, `timestamp`, `idImagen`, features y metadatos relevantes.
  - Compatible con métodos dragón: `agoniza`, `sePreocupa`, `sonrie`, etc.
  - Preparado para incluir `correlationId` como metadato si está disponible.
- **Performance:**  
  - P95 <200ms garantizado, latencia medida y logueada.

### ✔️ Escala de grises y lógica experta
- **Tres posibles salidas cualitativas:**
  - `"humana"`: Metadatos completos, coherentes con cámaras reales, sin firmas AI.
  - `"ai"`: Firmas AI presentes, ausencia de campos clave, incoherencias claras.
  - `"indeterminado"`: Insuficientes metadatos para decisión fiable, ausencia de EXIF, contradicciones.
- **Siempre score continuo + explicación (`warning`).**
- **Nunca hay features null/undefined:**  
  Si falta un campo, se representa como 0 (garantizado en la función extractora).

### ✔️ Hot-reload de pesos Synaptic
- **WebSocket** para recibir pesos desde `servidorCentral.js` (recomendado por `redSuperior.js`).
- **Gestión de errores y logs** detallados al actualizar pesos.
- **No persiste estado fuera de la propia red espejo**.

### ✔️ KISS, Plug & Play, Enterprise
- Código limpio, modular, sin dependencias circulares ni hacks.
- Plug & play real: solo añade la carpeta, sin tocar nada del core.
- Evolutiva: puedes ampliar el set de features y lógica sin romper contrato.

---

## 📝 Contrato de Entrada

```js
{
  idImagen: "string", // ID único de la imagen
  datos: { ... }      // Objeto EXIF original (output de analizadorExif.js)
}
```

## 📝 Contrato de Salida

```js
{
  idImagen: "string",
  score: 0.0-1.0,          // Score de confianza IA Synaptic
  clase: "humana" | "ai" | "indeterminado", // Clasificación escala de grises
  warning: "string|null",  // Explicación o motivo del resultado
  features: [0,1,0,1,...], // Array de features numéricas usadas (nunca null)
  exif: { ... },           // Objeto EXIF original (trazabilidad total)
  timestamp: "ISO8601"
}
```

- **Errores**: Siempre devueltos como `{ idImagen, error: true, mensaje, timestamp }` y logueados.

---

## 🚦 Features EXIF utilizados (máximo valor discriminante, nunca null/undefined)

1. **Marca y modelo de cámara** (`make`, `model`)
2. **MakerNote, SerialNumber, LensSerialNumber**
3. **Fecha de captura** (`datetimeoriginal`)
4. **Software de cámara/móvil** (`software`)
5. **Firma de IA en software** (ej: “diffusion”, “midjourney”, “generator”)
6. **Thumbnail o SubSecTime**
7. **GPS presente**
8. **Coherencia fechas (`datetimeoriginal` vs `modifydate`)** *(plazo flexible)*
9. **Orientación presente**

Cada feature es 1 (presente/ok) o 0 (ausente/incoherente), nunca null.

---

## 🧠 Lógica de clasificación (escala de grises)

- **Si hay firma de AI en software → `ai` (warning claro)**
- **Si hay EXIF muy completo y plausible (marca/modelo, serial, fecha, software cámara) → `humana`**
- **Si EXIF es mínimo (<3 campos) y formato suele tener EXIF (JPEG/JPG) → `indeterminado` (warning)**
- **Si hay <3 features clave → `indeterminado` (warning)**
- **En otros casos, `humana` pero con warning (“EXIF parcial, posible recorte o edición”)**

---

## 🧪 Ejemplo de pesos Synaptic (JSON)

```json
{
  "neurons": [
    // ... arquitectura y pesos completos exportados por nn.toJSON() ...
  ],
  "connections": [
    // ... conexiones y pesos completos exportados por nn.toJSON() ...
  ]
}
```
- El formato debe coincidir exactamente con el que genera `nn.toJSON()`.
- Para hot-reload por WebSocket, puedes enviar solo los biases como en el ejemplo de `setWeights()`.

---

## 🛠️ Ejemplo de integración para actualizar pesos desde servidorCentral.js

```js
// En servidorCentral.js, tras recibir recomendación de redSuperior.js
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: "exif-mirror-update-weights",
    weights: {
      inputBias: [0.1, 0.0, -0.2, 0.3, 0.0, 0.1, 0.2, 0.3, 0.0],
      hiddenBias: [0.05, 0.15, 0.2, 0.1],
      outputBias: [0.1]
    }
  }));
});
```

---

## 🧩 Plug & Play

- Solo tienes que poner `modelo.js` en la carpeta `/redesEspejo/exif/`
- No requiere ninguna modificación en el core ni en `redesEspejo.js`
- Se autodetecta y ejecuta automáticamente

---

## 📚 Referencias

- [ReadmeRedesEspejo.md](../ReadmeRedesEspejo.md)
- [logger.js](../../../utilidades/logger.js)
- [redesEspejo.js](../redesEspejo.js)
- [Winston Logger FAANG](../../../utilidades/winston.js)
- [Synaptic](https://caza.la/synaptic/)

---

## 🏅 Garantía FAANG Enterprise

- Contrato y logs **100% auditables** y homogéneos.
- Documentación y código SIEMPRE alineados.
- Seguridad y performance garantizados.
- Escala de grises y razonamiento profesional real.
- Evolutivo: puedes migrar a IA compleja o híbrida sin tocar el contrato.

---