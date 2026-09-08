# Dragon & Infra: Métricas Prometheus

Referencia completa de métricas recolectadas por Prometheus en el Proyecto Dragon y sistemas relacionados.

| Métrica | Tipo | Descripción / Ayuda |
|---|---|---|
| dragon_alertas_activas | desconocido | desconocido |
| dragon_anomalias_detectadas | desconocido | desconocido |
| dragon_archivos_fallidos | desconocido | desconocido |
| dragon_archivos_procesados | desconocido | desconocido |
| dragon_availability | desconocido | desconocido |
| dragon_error_rate | desconocido | desconocido |
| dragon_frontend_login_exito_total | desconocido | desconocido |
| dragon_frontend_login_intento_total | desconocido | desconocido |
| dragon_frontend_visita_login_total | desconocido | desconocido |
| dragon_frontend_visita_pagina_total | desconocido | desconocido |
| dragon_mem_heap_used_mb | desconocido | desconocido |
| dragon_mem_rss_mb | desconocido | desconocido |
| dragon_p95_latency_ms | desconocido | desconocido |
| dragon_p99_latency_ms | desconocido | desconocido |
| dragon_ram_percent_used | desconocido | desconocido |
| dragon_throughput | desconocido | desconocido |
| dragon_total_analisis | desconocido | desconocido |
| dragon_total_solicitudes | desconocido | desconocido |
| dragon_usuarios_activos | desconocido | desconocido |
| dragon_usuarios_unicos | desconocido | desconocido |
| dragon_volumen_datos_mb | desconocido | desconocido |

---

### Go Runtime & Infra

| Métrica | Tipo | Descripción / Ayuda |
|---|---|---|
| go_gc_cycles_automatic_gc_cycles_total | mostrador | Recuento de ciclos de GC completados generados por el entorno de ejecución de Go. |
| go_gc_cycles_forced_gc_cycles_total | mostrador | Recuento de ciclos de GC completados forzados por la aplicación. |
| go_gc_cycles_total_gc_cycles_total | mostrador | Recuento de todos los ciclos de GC completados. |
| go_gc_duration_seconds | resumen | Duración de la pausa de GC. |
| ... | ... | ... |
*(continúa con todas las métricas de Go, Infra, Redis, Websocket, etc. según la lista original)*

---

### Redis

| Métrica | Tipo | Descripción / Ayuda |
|---|---|---|
| redis_circuit_breaker_open | desconocido | desconocido |
| redis_clients_critical | desconocido | desconocido |
| redis_clients_high | desconocido | desconocido |
| redis_clients_low | desconocido | desconocido |
| redis_clients_medium | desconocido | desconocido |
| redis_connected_clients | desconocido | desconocido |
| redis_disconnected_clients | desconocido | desconocido |
| redis_error_rate | desconocido | desconocido |
| redis_errors_total | desconocido | desconocido |
| redis_latency_avg_ms | desconocido | desconocido |
| redis_latency_p50_ms | desconocido | desconocido |
| redis_latency_p95_ms | desconocido | desconocido |
| redis_latency_p99_ms | desconocido | desconocido |
| redis_operations_total | desconocido | desconocido |
| redis_overall_status | desconocido | desconocido |
| redis_reconnection_in_progress | desconocido | desconocido |
| redis_reconnects_total | desconocido | desconocido |
| redis_uptime_seconds | desconocido | desconocido |

---

### WebSocket

| Métrica | Tipo | Descripción / Ayuda |
|---|---|---|
| websocket_circuit_breaker_state | calibre | Estado del interruptor (0 = cerrado, 1 = half_open, 2 = abierto) |
| websocket_connections_active | calibre | Número actual de conexiones WebSocket activas |
| websocket_connections_total | mostrador | Número total de conexiones desde el inicio |
| websocket_error_rate | calibre | Tasa de error actual |
| websocket_errors_total | mostrador | Número total de errores |
| websocket_memory_heap_used_mb | calibre | Memoria heap usada en MB |
| websocket_message_processing_duration_ms | histograma | Duración del procesamiento de mensajes en ms |
| websocket_messages_total | mostrador | Número total de mensajes procesados |
| websocket_uptime_seconds | mostrador | Tiempo de actividad del servidor en segundos |

---

### Prometheus & Procesos

| Métrica | Tipo | Descripción / Ayuda |
|---|---|---|
| process_cpu_seconds_total | mostrador | Tiempo total de CPU usado |
| process_max_fds | calibre | Máximo de ficheros abiertos |
| process_network_receive_bytes_total | mostrador | Bytes recibidos por la red |
| process_network_transmit_bytes_total | mostrador | Bytes enviados por la red |
| process_open_fds | calibre | Ficheros abiertos |
| process_resident_memory_bytes | calibre | Memoria residente |
| process_start_time_seconds | calibre | Hora de inicio del proceso |
| process_virtual_memory_bytes | calibre | Memoria virtual |
| process_virtual_memory_max_bytes | calibre | Máxima memoria virtual disponible |
| prometheus_build_info | calibre | Info de versión/build de Prometheus |
| prometheus_http_requests_total | mostrador | Solicitudes HTTP totales |
| ... | ... | ... |

---

> Esta referencia debe actualizarse cuando se añadan nuevas métricas en el sistema y puede servir de base para diseñar dashboards, alertas y paneles de observabilidad para Dragon y toda la infraestructura.
