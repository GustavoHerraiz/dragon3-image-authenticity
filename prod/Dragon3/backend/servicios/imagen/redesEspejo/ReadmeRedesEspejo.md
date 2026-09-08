# Arquitectura y Convenciones para Redes Espejo (Mirror Networks) - Dragon3

> **NOTA KISS FAANG Enterprise:**  
> Todas las respuestas y decisiones técnicas deben ser directas, concisas y orientadas a acción. Nada de ambigüedad ni listar opciones vagas. Siempre ir al grano.

---

## Centralización de logs

**Todos los logs del sistema Dragon3 están centralizados en:**

```
/var/www/Dragon3/logs/dragon.log
```

- Toda consulta, análisis o petición de logs debe dirigirse siempre a ese archivo.
- Cualquier componente (microservicio, mirror net, analizador, etc.) que genere logs, lo hace a través del logger oficial y **todos los registros se almacenan en este único archivo**.
- No es necesario (ni se debe) repetir la ruta en cada instrucción. Por defecto, **dragon.log** es el único punto de acceso para logs operativos y de auditoría.

---

## 1. Objetivo

Estandarizar la integración, estructura y contrato de las redes neuronales espejo (“mirror networks”) en el backend de Dragon3, cumpliendo los requisitos de alta trazabilidad, concurrencia, facilidad de mantenimiento/extensión y compatibilidad total con la arquitectura de orquestación y Redis Streams.

---

## 2. Estructura de Carpetas y Archivos

- **Directorio raíz de redes espejo:**  
  `/var/www/Dragon3/backend/servicios/imagen/redesEspejo/`

- **Entry point único:**  
  `redesEspejo.js`  
  Gestiona el descubrimiento y despacho dinámico de todas las mirror nets.

- **Subcarpetas por red espejo:**  
  Cada red tiene su propia carpeta bajo `redesEspejo/`, p.ej.:
  - `/autenticidad/`
  - `/color/`
  - ... (futuras redes)

- **Dentro de cada subcarpeta:**  
  - `modelo.js` (**Obligatorio**): entry point de la red.
  - `entrenador.js`: lógica de entrenamiento (opcional, si la red se puede reentrenar).
  - `README.md`: documentación específica de la red.
  - `ws.js`: servidor WebSocket para ajuste de pesos desde servidorCentral.js (**obligatorio** si la red es ajustable).

- **Utilidades comunes:**  
  En `/var/www/Dragon3/backend/servicios/imagen/redesEspejo/utilidades/`:
    - `cargadorModelos.js` (carga dinámica, helpers)
    - `preprocesamiento.js` (normalización, features, etc.)

- **Logger y Winston:**  
  Ambos se encuentran en:
  ```
  /var/www/Dragon3/backend/utilidades/logger.js
  /var/www/Dragon3/backend/utilidades/winston.js
  ```
  **Siempre importar el logger desde esta ruta oficial.**
  > **Recuerda: todos los logs van a `/var/www/Dragon3/logs/dragon.log`**

---

## 3. Contrato de integración con analizadorImagen.js

### 3.1. Mensaje de entrada al orquestador espejo (desde analizadorImagen.js)

El orquestador recibe mensajes en el stream Redis `dragon3:stream:req:espejo` con los siguientes campos:

- `archivoId`: ID único de la imagen (clave de trazabilidad)
- `correlationId`: ID de correlación global para trazabilidad distribuida
- `datos`: **JSON.stringify(datos)** – contiene:
  - `resultadosAnalizadores`: resultados de los analizadores locales (ver abajo)
  - `parametros`: parámetros originales de la petición de análisis
  - `securityResult`: resultado de validación de seguridad
- `timestamp`: Marca temporal (ms)
- `requestId`: ID único de la petición (ej: `${archivoId}_${Date.now()}`)
- `version`: versión del módulo llamante
- `source`: identificador del origen (ej: 'analizadorImagen_FAANG')

**Ejemplo de mensaje de entrada:**

```json
{
  "archivoId": "img-uuid-123",
  "correlationId": "corr-456",
  "datos": "{\"resultadosAnalizadores\":{...},\"parametros\":{...},\"securityResult\":{...}}",
  "timestamp": 1721492056777,
  "requestId": "img-uuid-123_1721492056777",
  "version": "3.0.0-FAANG",
  "source": "analizadorImagen_FAANG"
}
```

### 3.2. Estructura de `datos`

- **`resultadosAnalizadores`**:  
  Objeto con resultados de cada analizador local, ejemplo:
  ```json
  {
    "analizadorMBH": {
      "esAutentico": true,
      "confianza": 0.88,
      "detalles": { ... },
      "processingTime": 42,
      "version": "1.2.1",
      "exitoso": true
    },
    "analizadorTextura": {
      "esAutentico": false,
      "confianza": 0.65,
      "detalles": { ... },
      "processingTime": 37,
      "version": "1.1.0",
      "exitoso": true
    }
    // ...
  }
  ```
- **`parametros`**:  
  Objeto con los parámetros originales de la petición de análisis:
  ```json
  {
    "rutaArchivo": "/ruta/a/imagen.jpg",
    "archivoId": "img-uuid-123",
    "correlationId": "corr-456",
    "nombreOriginal": "imagen.jpg",
    "usuarioId": "user-789",
    "clientId": "cliente-456"
  }
  ```
- **`securityResult`**:  
  Objeto con el resultado de la validación de seguridad:
  ```json
  {
    "valid": true,
    "fileHash": "sha256:abcdef...",
    "fileSize": 234817,
    "format": "jpg",
    "duration": 18,
    "validationsPassed": ["size", "format", "hash", "headers"],
    "threatLevel": "clean"
  }
  ```

---

## 4. Contrato de respuesta del orquestador espejo

El orquestador responde en el stream `dragon3:stream:resp:espejo` con los siguientes campos:

- `archivoId`
- `correlationId`
- `respuesta`: **JSON.stringify(objetoRespuesta)**
- `timestamp`

**Estructura de `respuesta`:**
```json
{
  "archivoId": "img-uuid-123",
  "correlationId": "corr-456",
  "resultados": {
    "autenticidad": {
      "idImagen": "img-uuid-123",
      "resultado": true,
      "score": 0.97,
      "idAnalisis": "ANL-9876",
      "timestamp": "2025-07-20T18:54:15Z",
      "inputHash": "sha256:abcdef...",
      "detalles": { ... }
    },
    "color": { ... }
    // ...
  },
  "procesadoPor": "espejo1",
  "timestamp": 1721492056777
}
```
- Cada clave de `resultados` es el nombre de una red espejo,
- El valor es el output estructurado de esa red, que debe contener al menos:  
   `idImagen`, `resultado`, `score`, `idAnalisis`, `timestamp`, `inputHash`, `detalles`

---

## 5. Plug & Play Dinámico

- El entry point (`redesEspejo.js`) **descubre automáticamente** las subcarpetas/redes.
- Cada red se importa dinámicamente y debe exportar una función asíncrona estándar:
  ```js
  export async function analizar(input) { ... }
  ```
- **Añadir una red nueva:**  
  Solo crear la carpeta y `modelo.js` cumpliendo el contrato, sin registrar manualmente.
- Toda la concurrencia y el aislamiento es autocontenido.  
- El orquestador debe extraer siempre `archivoId` y `correlationId` de los datos recibidos, **nunca generarlos**.

---

## 6. Arquitectura de las Mirror Nets

- **Tecnología inicial recomendada:**  
  [Synaptic](https://github.com/cazala/synaptic) (Node.js, CPU-only), válido para prototipo y escalado inicial sin GPU.
- **Motivos:**  
  - Inferencia rápida (P95 <50ms en modelos pequeños)
  - Serialización sencilla (JSON), portable y versionable
  - Admite MLP, perceptrón, recurrentes sencillas
  - Plug & play real, bajo overhead

> **IMPORTANTE:**  
> Synaptic es adecuado solo para modelos pequeños, sin GPU y con concurrencia moderada.  
> Cuando el sistema crezca o requiera escalabilidad enterprise real, migrar a TensorFlow.js, ONNX o microservicio Python.

---

## 7. Contrato de Entrada/Salida para Mirror Nets

### Entrada estándar a cada red espejo (`modelo.js`):

```js
{
  idImagen: "img-uuid-123",   // ID único recibido desde analizadorImagen.js
  datos: { ... }              // Input específico preprocesado para esta red (usualmente subcampos de datos.resultadosAnalizadores, datos.parametros, datos.securityResult)
}
```

### Salida estándar de cada red espejo:

```json
{
  "idImagen": "img-uuid-123",           // Propagado tal cual
  "resultado": true,                    // Decisión principal (boolean)
  "score": 0.93,                        // Score/confianza (0-1)
  "idAnalisis": "UUID1234...",          // ID único de este análisis (generado por la red o el orquestador)
  "timestamp": "2025-07-20T18:54:15Z",  // Fecha/hora UTC ISO8601
  "inputHash": "sha256:abcd...",        // Hash del input analizado (para trazabilidad forense)
  "detalles": {                         // Explicabilidad ampliada (umbral, activaciones, etc.)
    // ... estructura libre y extendible
  }
}
```

**Principios:**
- **idImagen**: siempre presente y sin alterar, para máxima trazabilidad.
- **idAnalisis**: único para cada ejecución (puede ser UUIDv4, nanoid, etc.).
- **inputHash**: hash SHA-256 del input bruto.
- **timestamp**: momento exacto del análisis, UTC.
- **detalles**: campo libre para explainability extendida.

---

## 8. Logging y Métricas

Dragon3 implementa un sistema de logging robusto, centralizado y seguro, usando Winston.  
> **Todos los logs de todos los componentes del sistema se almacenan únicamente en:**  
> `/var/www/Dragon3/logs/dragon.log`

**NO se permite console.log**, ni en producción ni en desarrollo.

### Núcleo de logging

- **Ruta de logger oficial:**  
  `/var/www/Dragon3/backend/utilidades/logger.js`
- **Ruta de winston base:**  
  `/var/www/Dragon3/backend/utilidades/winston.js`
- Todos los módulos, microservicios y mirror nets **deben importar SIEMPRE desde `logger.js`**, nunca directamente desde `winston.js`, salvo para casos avanzados/documentados.

#### Ejemplo de importación recomendada:
```js
import dragonLogger from '/var/www/Dragon3/backend/utilidades/logger.js';
// O relativa, según contexto:
import dragonLogger from '../../../utilidades/logger.js';
```

### Métodos y niveles disponibles

- El wrapper `logger.js` expone métodos dragón semánticos (agoniza, zen, seEnfada, sonrie…), además de los niveles estándar.

#### Tabla de correspondencia de funciones y niveles

| Método Dragon         | Nivel Winston | Uso principal                                              | Emoji  | Ejemplo de situación                                     |
|---------------------- |--------------|-----------------------------------------------------------|--------|----------------------------------------------------------|
| agoniza(mensaje)      | error        | Errores críticos y excepciones no recuperables            | 💀     | Caída de analizador, error de conexión, throw en red     |
| seEnfada(mensaje)     | warn         | Advertencias importantes, degradación, anomalías graves   | 😤     | Timeout alto, input sospechoso, recurso lento            |
| sePreocupa(mensaje)   | info         | Info relevante, eventos normales, operaciones completadas | 😰     | Imagen analizada, respuesta enviada, evento esperado     |
| respira(mensaje)      | http         | Logs de tráfico HTTP o pasos clave de flujo de red        | 💓     | Petición recibida, llamada a microservicio               |
| sonrie(mensaje)       | verbose      | Detalles extendidos, tracing ampliado                     | 😊     | Detalles de procesamiento, estadísticas de lote          |
| zen(mensaje)          | debug        | Depuración, payloads de entrada/salida, timings finos     | 🧘     | Datos de entrada, salida de función, timings             |
| mideRendimiento(...)  | según ms     | Medición automática de latencia y performance             | 💀/😤/😰/😊/🧘 | Asigna nivel según la duración de la operación           |

> **Todos los métodos permiten incluir metadata adicional, y nunca bloquean el proceso aunque fallen los logs.**

### Formatos

- **Consola:** colores, emojis y trazabilidad enriquecida (timestamp, instancia, correlationId, usuario…).
- **Archivo:** JSON estructurado, fácil de auditar y parsear.
- **Errores y excepciones:** logs dedicados en `dragon-errors.log`, `exceptions.log`, etc.

### Buenas prácticas

- **NO usar console.log.** Siempre usar los métodos del logger.
- Siempre añadir contexto: módulo, operación, metadata relevante.
- En producción, los niveles debug/verbose pueden estar desactivados para rendimiento.
- Nunca lanzar throw en el logger, ni bloquear el proceso si falla el log.
- El logger jamás debe bloquear el startup, incluso si hay errores de permisos.

---

## 9. Testing y Seguridad

- **Testing:**  
  Cada mirror net debe incluir su propio test mínimo bajo `test/` o en README.
- **Seguridad:**  
  Los inputs deben validarse y normalizarse antes de pasar a la red.
- **Performance:**  
  El entry point mide y loguea tiempos de cada análisis para garantizar P95 <200ms.

---

## 10. Extensión y Mantenimiento

- Añadir una nueva red = carpeta nueva con contrato cumplido, sin modificar código global.
- Para eliminar una red, basta con eliminar la carpeta.
- Cada red debe documentar su input esperado, output, y explainability en su README.md.

---

## 11. Contrato y Arquitectura WebSocket para Ajuste de Pesos (Bidireccional)

### 11.1. Resumen

Cada red espejo **debe exponer un servidor WebSocket** (archivo `ws.js`) que acepte órdenes de ajuste de pesos *únicamente* de `servidorCentral.js` y devuelva confirmación estructurada y auditable.

- **Ubicación:**  
  `/var/www/Dragon3/backend/servicios/imagen/redesEspejo/[nombre]/ws.js`
- **Obligatorio si la red admite ajuste en caliente (online/fine-tuning).**
- **El entry point global `redesEspejo.js` debe poder gestionar la conexión/cliente a este WebSocket.**

---

### 11.2. Contrato de mensajes WebSocket

#### Mensaje de entrada (ajuste de pesos)

```json
{
  "tipo": "ajuste_pesos",
  "idAnalisis": "UUID-o-nanotime",
  "correlationId": "corr-456",
  "parametrosAjuste": {
    "learningRate": 0.01,
    "epochs": 5,
    "targetLayer": "output",
    "otros": "..."
  }
}
```

#### Mensaje de respuesta (acknowledgement)

```json
{
  "tipo": "ack_ajuste",
  "idAnalisis": "UUID-o-nanotime",
  "correlationId": "corr-456",
  "resultado": "ok", // o "error"
  "detalles": {
    "hashPesosAntes": "sha256:abcd...",
    "hashPesosDespues": "sha256:ef12...",
    "cambios": ["output.W actualizado"],
    "errores": [],
    "timestamp": "2025-07-20T21:00:00Z"
  }
}
```

---

### 11.3. Esqueleto de código estándar para `ws.js`

```javascript
import WebSocket, { WebSocketServer } from 'ws';
import dragonLogger from '../../../utilidades/logger.js';
import { ajustarPesos, obtenerHashPesos } from './modelo.js';

const PORT = 9501; // Puerto único por red espejo, configurable

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

wss.on('connection', (ws, req) => {
  // Seguridad: solo conexiones locales del servidor central
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1') {
    ws.close(4001, 'Conexión no autorizada');
    dragonLogger.seEnfada('Intento de conexión WS no autorizada', 'ws.js', 'WEBSOCKET_FORBIDDEN', { ip });
    return;
  }
  dragonLogger.sonrie('Conexión WebSocket aceptada', 'ws.js', 'WEBSOCKET_CONNECTED', { ip });

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.tipo !== 'ajuste_pesos' || !data.idAnalisis || !data.correlationId || !data.parametrosAjuste) {
        ws.send(JSON.stringify({
          tipo: "ack_ajuste",
          idAnalisis: data.idAnalisis,
          correlationId: data.correlationId,
          resultado: "error",
          detalles: { errores: ["Contrato de mensaje inválido"], timestamp: new Date().toISOString() }
        }));
        dragonLogger.seEnfada('Contrato de ajuste_pesos inválido', 'ws.js', 'WEBSOCKET_CONTRACT_ERROR', { data });
        return;
      }

      const hashAntes = await obtenerHashPesos();
      const cambios = await ajustarPesos(data.parametrosAjuste);
      const hashDespues = await obtenerHashPesos();

      ws.send(JSON.stringify({
        tipo: "ack_ajuste",
        idAnalisis: data.idAnalisis,
        correlationId: data.correlationId,
        resultado: "ok",
        detalles: {
          hashPesosAntes: hashAntes,
          hashPesosDespues: hashDespues,
          cambios,
          errores: [],
          timestamp: new Date().toISOString()
        }
      }));

      dragonLogger.sePreocupa('Ajuste de pesos realizado correctamente', 'ws.js', 'WEIGHTS_UPDATED', {
        idAnalisis: data.idAnalisis,
        correlationId: data.correlationId,
        cambios, hashAntes, hashDespues
      });

    } catch (err) {
      ws.send(JSON.stringify({
        tipo: "ack_ajuste",
        idAnalisis: null,
        correlationId: null,
        resultado: "error",
        detalles: { errores: [err.message], timestamp: new Date().toISOString() }
      }));
      dragonLogger.agoniza('Error procesando ajuste de pesos', err, 'ws.js', 'WEBSOCKET_ADJUST_ERROR');
    }
  });
});

dragonLogger.sonrie(`Servidor WebSocket de red espejo iniciado en puerto ${PORT}`, 'ws.js', 'WEBSOCKET_SERVER_STARTED');
```

---

### 11.4. Reglas y mejores prácticas

- **Seguridad:**  
  - Solo conexiones locales (`127.0.0.1` o `::1`), bloqueo inmediato de cualquier otra IP.
  - Validación estricta del esquema de mensaje.
  - Rate limiting básico en el servidor WebSocket.

- **Logging obligatorio:**  
  - Todos los eventos (conexión, petición, respuesta, error) deben registrarse con `dragonLogger` y nivel adecuado.
  - Prohibido el uso de `console.log`.

- **Integración:**  
  - El entry point global (`redesEspejo.js`) debe gestionar la conexión cliente con reconexión automática si se requiere.

- **Modularidad:**  
  - Los métodos `ajustarPesos(parametrosAjuste)` y `obtenerHashPesos()` deben implementarse en cada `modelo.js` de red.

- **Auditoría:**  
  - Toda orden y respuesta debe contener `correlationId` y `idAnalisis` para trazabilidad.

---

## 12. Ejemplo de ciclo completo (resumido)

1. **Frontend** sube una imagen.
2. **analizadorImagen.js** recibe la petición y ejecuta analizadores locales.
3. **orquestador espejo** recibe y despacha el input a cada red espejo (via función `analizar`).
4. **Cada red espejo** devuelve su output estándar.
5. **Orquestador** publica la respuesta en el stream.
6. **Si servidorCentral.js requiere ajuste**, envía orden por WebSocket a la red espejo, que responde con `ack_ajuste` y logging.
7. **Todo el ciclo es auditable, seguro y cumple trazabilidad enterprise.**

---

# Fin del documento