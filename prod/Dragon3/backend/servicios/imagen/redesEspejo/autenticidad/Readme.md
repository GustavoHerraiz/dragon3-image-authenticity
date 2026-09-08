# Red Espejo "autenticidad" – Dragon3

> **FAANG Enterprise | KISS | 100% contrato y plug & play**

---

## 1. Objetivo

Red espejo para análisis de autenticidad de imágenes.  
Listo para integración plug & play bajo `/redesEspejo/`.  
Cumple el contrato Dragon3: entrada/salida estándar, logging, ajuste remoto.

---

## 2. Contrato de entrada/salida (`analizar`)

### Entrada esperada

```js
{
  idImagen: "img-uuid-123",   // ID único recibido desde analizadorImagen.js (obligatorio)
  datos: { ... }              // Input preprocesado específico para esta red (obligatorio)
}
```

### Salida estándar

```json
{
  "idImagen": "img-uuid-123",
  "resultado": true,
  "score": 0.93,
  "idAnalisis": "ANL-xxxx",
  "timestamp": "2025-07-20T18:54:15Z",
  "inputHash": "sha256:abcd...",
  "detalles": {
    "pesos": { "output": 0.82, ... },
    "motivo": "Patrón válido",
    "inputResumen": ["campo1", "campo2"]
  }
}
```

---

## 3. Contrato de ajuste remoto de pesos (WebSocket)

### Servidor

- Archivo: `ws.js`
- Puerto: `9501` (solo localhost, protegido)
- Solo acepta mensajes del tipo `ajuste_pesos` (ver ejemplo).

### Mensaje de entrada

```json
{
  "tipo": "ajuste_pesos",
  "idAnalisis": "UUID-o-nanotime",
  "correlationId": "corr-456",
  "parametrosAjuste": {
    "learningRate": 0.01,
    "epochs": 5,
    "targetLayer": "output"
  }
}
```

### Mensaje de respuesta (`ack_ajuste`)

```json
{
  "tipo": "ack_ajuste",
  "idAnalisis": "UUID-o-nanotime",
  "correlationId": "corr-456",
  "resultado": "ok",
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

## 4. Explicabilidad y logging

- Detalles técnicos y cambios en pesos siempre en output.detalles.
- Todos los eventos (análisis, ajuste, error) van a `/var/www/Dragon3/logs/dragon.log` usando `dragonLogger` (prohibido `console.log`).
- Cada análisis o ajuste tiene:
  - idImagen, idAnalisis, correlationId, inputHash y timestamp para trazabilidad total.

---

## 5. Test mínimo recomendado

Puedes probar desde NodeJS:

```js
import { analizar, ajustarPesos, obtenerHashPesos } from './modelo.js';

const input = {
  idImagen: "img-uuid-123",
  datos: { campo1: 1, campo2: 2 }
};

const resultado = await analizar(input);
console.log(resultado);

const cambios = await ajustarPesos({ learningRate: 0.01, epochs: 2, targetLayer: "output" });
console.log(cambios);

const hash = await obtenerHashPesos();
console.log(hash);
```

Y para ajuste remoto, conecta vía WebSocket al puerto 9501 y envía un mensaje de tipo `ajuste_pesos` como arriba.

---

## 6. Seguridad

- Validación estricta de input/output en todas las funciones.
- WebSocket solo escucha en localhost.
- Logging obligatorio de toda anomalía o error.

---

## 7. Plug & Play

- Al añadir esta carpeta y `modelo.js`, la red es descubierta automáticamente por `redesEspejo.js`.
- No requiere registro manual.
- El contrato y la estructura están alineados al README global de redes espejo.

---

**Fin**