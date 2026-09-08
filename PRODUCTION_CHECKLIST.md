# Checklist de producción

## Antes del despliegue

- [ ] Confirmar que `.env` existe fuera del control de versiones.
- [ ] Confirmar que `JWT_SECRET` tiene al menos 32 caracteres.
- [ ] Confirmar que `MONGO_URI` apunta al entorno correcto.
- [ ] Confirmar que Redis requiere autenticación cuando corresponde.
- [ ] Ejecutar `npm ci` en `dev/celulas`.
- [ ] Ejecutar `npm test` en `dev/celulas`.
- [ ] Ejecutar `node --check` sobre los módulos modificados.
- [ ] Revisar `git diff --check`.
- [ ] Verificar que no hay secretos, datasets o binarios en el commit.

## Arranque

```bash
cd /opt/dragon3/prod/Dragon3/backend
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

## Comprobaciones posteriores

```bash
pm2 status
curl -f http://127.0.0.1:3000/health
curl -f http://127.0.0.1:3002/health
curl -f http://127.0.0.1:3002/agent/catalogo
curl -f http://127.0.0.1:3002/agent/planes
```

Deben cumplirse estas condiciones:

- todos los procesos aparecen como `online`
- el servidor responde `200 OK`
- MongoDB aparece como `connected`
- Embassy responde `200 OK`
- catálogo y planes devuelven JSON válido
- no aparecen reinicios repetidos en PM2

## Prueba funcional

1. Enviar una imagen de prueba desde el frontend o endpoint público.
2. Confirmar que se genera un `correlationId`.
3. Confirmar que el análisis termina con veredicto.
4. Confirmar que la telemetría contiene las células ejecutadas.
5. Confirmar que no se registran secretos ni imágenes completas en los logs.

## Rollback

Si el despliegue falla:

```bash
pm2 logs --lines 100
pm2 restart dragon3-embassy
pm2 restart dragon3-server
```

Después se debe revisar el último commit funcional y restaurar la configuración de entorno sin sobrescribir secretos.

## Criterio de aprobación

Dragon3 no debe considerarse listo para producción hasta que:

- la suite estable pase
- los endpoints de salud respondan
- MongoDB y Redis estén disponibles
- no haya secretos en código versionado
- exista un procedimiento de rollback
- se haya ejecutado una prueba funcional con una imagen real
