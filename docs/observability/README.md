# Observabilidad Dragon3

## Componentes

- `prometheus.yml`: scraping de backend Dragon3, Prometheus, Node Exporter y Redis Exporter.
- `dragon3-alerts.yml`: reglas de disponibilidad, errores, latencia y rechazos `429`.
- `dragon3-dashboard.json`: dashboard operativo Grafana.
- `grafana/provisioning/`: datasource y proveedor de dashboards.

## Instalacion en el host

Validar antes de instalar:

```bash
promtool check config prometheus.yml
promtool check rules dragon3-alerts.yml
```

Copiar `prometheus.yml` y `dragon3-alerts.yml` al directorio de configuración de Prometheus. Copiar el dashboard a `/var/lib/grafana/dashboards/dragon3/` y los dos archivos de provisioning a sus directorios equivalentes de Grafana. Ajustar propietarios y reiniciar los servicios mediante el mecanismo de la distribución.

En hosts sin unidad registrada, instalar la unidad incluida:

```bash
sudo cp prometheus.service /etc/systemd/system/prometheus.service
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus
```

Requisitos: usuario/grupo `prometheus`, `/var/lib/prometheus` y `/etc/prometheus/prometheus.yml` deben existir y ser legibles por ese usuario.

El target Dragon3 es `localhost:3000/metrics`. El endpoint está restringido a localhost por defecto; si Prometheus está en otro host, configurar `METRICS_TOKEN` en PM2 y un header seguro en el scraper o colocar un proxy interno autenticado. No exponer `/metrics` públicamente.

## Verificación

```bash
curl -fsS http://localhost:9090/-/ready
curl -fsS http://localhost:9090/api/v1/targets
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3000/metrics
```

La instalación de Prometheus no se fuerza desde el repositorio: en este host el binario existe, Grafana está activo y no hay una unidad `prometheus.service` registrada. El operador debe elegir la unidad de servicio o contenedor oficial de la distribución.
