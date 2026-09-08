# Pruebas de Integración

Este directorio contiene scripts para probar el sistema completo.

## Requisitos

- Node.js v18+
- Redis en ejecución (para la cola)
- Imágenes de prueba (ai.jpg, comp2.jpg, etc.)

## Ejecución

```bash
# Desde la raíz del proyecto
node test/integracion.js [ruta-imagen]

# Ejemplo con ai.jpg
node test/integracion.js ai.jpg

# Ejemplo con comp2.jpg
node test/integracion.js comp2.jpg