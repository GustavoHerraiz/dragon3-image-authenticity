# Estructura productiva

## Runtime

- `prod/Dragon3/backend/`: servidor HTTP y configuración PM2.
- `prod/Dragon3/engine/`: Embassy, células, planes, servicios y runtime ML.
- `prod/Dragon3/frontend/`: interfaz web.
- `prod/Dragon3/data/dataset/`: dataset operativo del watcher.
- `prod/Dragon3/logs/`: logs de producción.

## Desarrollo

- `dev/`: laboratorio, experimentos, entrenamiento y pruebas.
- `dev/celulas/dataset`: enlace de compatibilidad al dataset operativo productivo.

## Estado de la migración

Embassy y `dataset-watcher` ya arrancan desde `prod/Dragon3/engine`. El servidor HTTP continúa en `prod/Dragon3/backend`. El código experimental permanece en `dev` y no participa en el arranque productivo.

## Regla operativa

No editar directamente `dev` para corregir producción. Los cambios productivos deben aplicarse al runtime de `prod/Dragon3/engine` y validarse con:

```bash
pm2 status
curl -f http://127.0.0.1:3000/health
curl -f http://127.0.0.1:3002/health
```

La copia de `engine` se regenera con `prod/Dragon3/scripts/prepare-production-engine.sh`.