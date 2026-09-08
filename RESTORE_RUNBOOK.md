# Runbook de restauración

Este procedimiento reconstruye Dragon3 desde GitHub sin depender de los archivos experimentales de `dev`.

## 1. Obtener el código

```bash
git clone https://github.com/GustavoHerraiz/dragon3-image-authenticity.git /opt/dragon3
cd /opt/dragon3
```

Para una restauración concreta:

```bash
git checkout main
```

El tag `before-history-cleanup` conserva el historial anterior a la purga histórica. Solo debe usarse para recuperación forense o consulta de legado.

## 2. Preparar configuración externa

Crear el archivo de entorno fuera de Git:

```bash
cp .env.example prod/Dragon3/backend/.env
chmod 600 prod/Dragon3/backend/.env
```

Completar como mínimo:

- `MONGO_URI`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `MBH_SECRET` si se utiliza sellado MBH
- `EMBASSY_PORT`
- `DRAGON3_DATASET_DIR`

No copiar secretos desde commits antiguos. Si alguna credencial estuvo expuesta, debe rotarse antes de arrancar.

## 3. Restaurar el modelo ML

El modelo XGBoost no se versiona en GitHub. Copiarlo desde el almacenamiento seguro de modelos:

```bash
mkdir -p prod/Dragon3/engine/laboratorio
cp /secure-model-storage/modelo_xgboost_25000_optimizado.pkl \
  prod/Dragon3/engine/laboratorio/
```

También puede usarse una ruta externa:

```bash
export ML_MODEL_PATH=/secure-model-storage/modelo_xgboost_25000_optimizado.pkl
```

## 4. Reconstruir el runtime

```bash
chmod +x prod/Dragon3/scripts/bootstrap-production-engine.sh
prod/Dragon3/scripts/bootstrap-production-engine.sh
```

El script instala dependencias Node y Python y falla si no encuentra el modelo ML.

## 5. Restaurar datos operativos

El dataset no forma parte del repositorio. Restaurarlo desde el almacenamiento de datos:

```bash
mkdir -p prod/Dragon3/data
tar -xzf /secure-backup/dragon3-dataset.tar.gz -C prod/Dragon3/data
```

No restaurar datasets, backups o logs dentro de `prod/Dragon3/engine`.

## 6. Arrancar servicios

```bash
cd prod/Dragon3/backend
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

## 7. Verificación mínima

```bash
pm2 status
curl -f http://127.0.0.1:3000/health
curl -f http://127.0.0.1:3002/health
curl -f http://127.0.0.1:3002/agent/catalogo
curl -f http://127.0.0.1:3002/agent/planes
```

Después, ejecutar una imagen de prueba y confirmar:

- respuesta `completado`
- `correlationId`
- veredicto
- confianza ML
- telemetría
- ausencia de secretos en logs

## 8. Rollback

Si la nueva instalación no supera las verificaciones:

```bash
pm2 stop all
rm -rf /opt/dragon3

git clone https://github.com/GustavoHerraiz/dragon3-image-authenticity.git /opt/dragon3
```

Para consultar el estado histórico anterior a la limpieza de credenciales, usar el tag `before-history-cleanup` únicamente en una copia aislada y nunca como runtime público.

## 9. Criterio de éxito

La restauración es correcta cuando el clon limpio arranca, los endpoints responden, MongoDB y Redis están disponibles y una imagen real produce un análisis completo con ML operativo.
