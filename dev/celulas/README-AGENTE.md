 Agente de Decisión — Documentación completa
1. Introducción
El Agente de Decisión es el cerebro autónomo del meta‑sistema de células.
Su misión es analizar el rendimiento y la precisión del sistema, generar propuestas de mejora, aplicarlas automáticamente (cuando es seguro) o solicitar aprobación humana para cambios más arriesgados, y evaluar retrospectivamente si esos cambios han mejorado o empeorado el sistema.

El agente no es una red neuronal, sino un sistema basado en reglas y estadística que toma decisiones explicables y trazables. Es el componente que convierte al sistema en un organismo vivo que evoluciona y se optimiza solo con el uso.

2. Arquitectura y relación con el sistema global
El agente se integra en el ecosistema de la siguiente forma:

text
┌─────────────────────────────────────────────────────────────┐
│                    AGENT EMBASSY                           │
│   (recibe peticiones de agentes externos)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    ORQUESTADOR                             │
│   (ejecuta planes y células)                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    TELEMETRÍA                              │
│   (historial.json, baseline.json, cambios.json)           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    AGENTE DE DECISIÓN                      │
│   - Lee telemetría                                         │
│   - Genera propuestas                                      │
│   - Aplica cambios (auto o con aprobación)                │
│   - Autodiagnóstico y rollback                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    CONFIGURACIÓN                           │
│   (configuracion.json, catálogo, planes)                  │
└─────────────────────────────────────────────────────────────┘
Dependencias principales:

Telemetría: archivos JSON en telemetria/ (historial.json, baseline.json, cambios.json).

Catálogo: celulas/index.json (para leer pesos y existencia de células).

Planes: carpeta planes/ (para generar, leer y archivar planes).

Configuración: configuracion.json (todos los umbrales y parámetros ajustables).

Propuestas: carpeta propuestas/ (para almacenar propuestas pendientes, aprobadas, aplicadas y rechazadas).

3. Flujo de datos y ciclo de vida del agente
Cada ejecución del agente sigue este ciclo:

Lectura de telemetría:

Carga historial.json (todas las ejecuciones almacenadas).

Carga baseline.json (si existe) para comparar.

Cálculo de métricas:

El módulo telemetria/metricas.js genera un informe con:

Precisión global (si hay groundTruth).

Falsos positivos y negativos.

Contribución y precisión por célula.

Tiempos por célula (promedio, p95, ratio).

Combinaciones de células exitosas (para evolución).

Cuellos de botella y células poco precisas.

Generación de propuestas:

Módulos independientes (propuestas/peso.js, propuestas/planes.js, propuestas/poda.js, propuestas/rendimiento.js) generan propuestas basadas en el informe y la configuración.

Clasificación de propuestas (gobernanza):

Cada propuesta tiene una confianza y un tipo de impacto.

Según la confianza y el impacto, se decide:

Auto‑aplicar (si confianza ≥ 0.8 y impacto ≤ 2).

Solicitar aprobación (si confianza ≥ 0.6 y impacto ≥ 3).

Descartar (si confianza < 0.6).

Aplicación de cambios:

Si el modo es auto, se aplican las propuestas auto‑aplicables.

Si el modo es aprobar, se muestran las pendientes para que el usuario decida.

Cada cambio se registra en cambios.json.

Autodiagnóstico (opcional, automático o bajo demanda):

Compara las métricas actuales con la baseline.

Si hay mejora, actualiza la baseline.

Si hay empeoramiento, genera propuestas de rollback.

También ejecuta poda de planes inactivos (con período de gracia).

4. Estructura de archivos
text
/opt/dragon3/dev/celulas/
├── agente-decision.js                 # Punto de entrada principal
├── configuracion.json                 # Configuración del agente (ajustable)
├── telemetria/
│   ├── almacen.js                     # Guardado y consulta de historial
│   ├── metricas.js                    # Cálculo de métricas agregadas
│   ├── historial.json                 # Todas las ejecuciones
│   ├── baseline.json                  # Estado de referencia (para autodiagnóstico)
│   └── cambios.json                   # Historial de cambios aplicados
├── propuestas/
│   ├── pendientes/                    # Propuestas que necesitan aprobación
│   ├── aprobadas/                     # Propuestas aprobadas (pendientes de aplicar)
│   ├── aplicadas/                     # Propuestas ya aplicadas
│   └── rechazadas/                    # Propuestas rechazadas o descartadas
├── planes/
│   ├── *.json                         # Planes predefinidos
│   ├── evolucion-*.json               # Planes generados por el agente
│   └── archivados/                    # Planes podados (inactivos)
├── celulas/
│   └── index.json                     # Catálogo de células (con pesos)
└── scripts/
    └── ejecutar-agente.sh             # Wrapper para cron
5. Modos de ejecución
El agente se ejecuta con uno de estos modos:

Modo	Comando	Descripción
analisis	node agente-decision.js	Genera propuestas, las clasifica y las guarda en carpetas correspondientes (sin aplicar nada).
auto	node agente-decision.js --auto	Aplica automáticamente las propuestas que cumplen los criterios de auto‑aplicación.
aprobar	node agente-decision.js --aprobar	Modo interactivo: muestra propuestas pendientes y pregunta si aplicar o rechazar cada una.
diagnostico	node agente-decision.js --diagnostico	Solo ejecuta el autodiagnóstico (comparación con baseline, poda).
6. Configuración (configuracion.json)
Todos los parámetros del agente están centralizados en este archivo. Es dinámico: algunas claves pueden ser modificadas por el propio agente (ej. optimizaciones de rendimiento). A continuación, la explicación de cada sección:

6.1. agente
Clave	Valor por defecto	Descripción
confianzaMinimaAuto	0.8	Confianza mínima para auto‑aplicar (si impacto ≤ 2).
confianzaMinimaAprobacion	0.6	Confianza mínima para pasar a aprobación humana (si impacto ≥ 3).
maxPropuestasPorEjecucion	20	Número máximo de propuestas generadas por ejecución (para evitar saturación).
6.2. impacto
Tipo	Impacto	Descripción
ajuste-peso	1	Cambio en el peso de una célula (riesgo bajo).
nuevo-plan	1	Creación de un nuevo plan (riesgo bajo).
optimizacion-rendimiento	2	Cambios de rendimiento (riesgo medio).
ajuste-umbral	2	Cambio de umbrales de confianza (riesgo medio).
poda-celula	3	Eliminación de una célula (riesgo alto).
eliminar-plan	3	Eliminación de un plan (riesgo alto).
cambio-arquitectura	4	Cambios estructurales (riesgo muy alto).
6.3. peso
Clave	Valor por defecto	Descripción
minimo	0.1	Peso mínimo que puede tener una célula.
maximo	1.0	Peso máximo.
incremento	0.1	Incremento/decremento de peso en cada ajuste.
precisionAlta	0.85	Si precisión > este umbral, se propone aumentar el peso.
precisionBaja	0.6	Si precisión < este umbral, se propone reducir el peso.
contribucionMinima	0.2	Si contribución < esto, se reduce el peso.
6.4. evolucion
Clave	Valor por defecto	Descripción
frecuenciaMinima	3	Mínimo de apariciones de una combinación para considerarla.
exitoMinimo	0.8	Ratio de éxito mínimo (ejecuciones exitosas / total) para generar un plan.
precisionMinima	0.7	Precisión mínima con groundTruth para generar un plan.
maxCelulasPorPlan	20	Número máximo de células en un plan generado (evita planes excesivamente largos).
6.5. poda
Clave	Valor por defecto	Descripción
precisionMinima	0.5	Si una célula tiene precisión < esto, se propone para poda (si no es atómica).
usosMinimos	3	Si un plan tiene < usos, se considera para archivar.
diasInactivo	30	Si un plan no se usa en X días, se archiva.
diasGracia	7	Período de gracia para planes nuevos (no se archivan hasta pasados X días).
6.6. rendimiento
Clave	Valor por defecto	Descripción
percentilLento	90	Percentil para considerar una célula lenta (ej. 90 = top 10%).
ratioLentitud	1.5	Si p95 / promedio > este valor, se considera cuello de botella.
6.7. autodiagnostico
Clave	Valor por defecto	Descripción
umbralMejora	0.02	Mejora mínima (2%) para considerar mejora significativa.
umbralEmpeoramiento	0.03	Empeoramiento mínimo (3%) para considerar degradación.
ejecutarAutomaticamente	true	Si true, el autodiagnóstico se ejecuta después de aplicar cambios en modo auto.
minEjecucionesGroundTruth	10	Mínimo de ejecuciones con groundTruth para evaluar mejora/empeora.
6.8. carpetas
Clave	Valor por defecto	Descripción
propuestasPendientes	./propuestas/pendientes	Carpeta para propuestas que requieren aprobación.
propuestasAprobadas	./propuestas/aprobadas	Carpeta para propuestas aprobadas (pendientes de aplicar).
propuestasRechazadas	./propuestas/rechazadas	Carpeta para propuestas rechazadas o descartadas.
propuestasAplicadas	./propuestas/aplicadas	Carpeta para propuestas ya aplicadas.
7. Tipos de propuestas y su lógica
7.1. Ajuste de peso (ajuste-peso)
Condición: precisión > precisionAlta y contribución > 0.5 → aumentar peso; precisión < precisionBaja o contribución < contribucionMinima → reducir peso.

Acción: se actualiza el peso de la célula en celulas/index.json.

Confianza: calculada como precisión + contribución (máximo 1).

7.2. Nuevo plan (nuevo-plan)
Condición: combinación de células con frecuencia ≥ frecuenciaMinima, ratio de éxito ≥ exitoMinimo, y (si hay groundTruth) precisión ≥ precisionMinima.

Acción: se genera un nuevo archivo en planes/ con el plan, y se registra en cambios.json.

Confianza: min(ratioExito, precisionGroundTruth).

Deduplicación: se comprueba si ya existe un plan con el mismo conjunto de células antes de crear uno nuevo.

7.3. Poda de célula (poda-celula)
Condición: precisión < precisionMinima y ejecuciones > 5.

Acción: si es célula atómica, se reduce su peso al mínimo; si es generada, se elimina del catálogo.

Confianza: 1 - precision.

7.4. Optimización de rendimiento (optimizacion-rendimiento)
Condición: la célula es un cuello de botella (ratio p95/promedio > ratioLentitud y está en el top 3 de cuellos de botella).

Acción: modifica configuracion.json ajustando:

tamañoOptimizado para células de análisis de imagen.

calidadOptimizada para detectar-doble-compresion-sharp.

concurrenciaMaxima para cargar-imagen.

cacheActivado para extraer-metadatos-exif.

Criterios de aplicación (todos deben cumplirse):

Total ejecuciones ≥ 50.

GroundTruth ≥ 15.

Top 3 de cuellos de botella.

Ratio p95/promedio ≥ 2.0.

Frecuencia en top 3 ≥ 3.

Mejora estimada ≥ 20%.

Última optimización hace ≥ 7 días.

Confianza ≥ 0.85.

Confianza: min(ratio / 2, 1).

7.5. Rollback (rollback)
Generado automáticamente por el autodiagnóstico cuando detecta empeoramiento.

Acción: revierte una optimización o ajuste de peso anterior.

8. Autodiagnóstico y baseline
El autodiagnóstico es el mecanismo de retroalimentación del agente.

8.1. Baseline
Es un snapshot del estado del sistema en un momento dado (métricas globales, precisión, catálogo).

Se guarda en telemetria/baseline.json.

Se crea automáticamente en la primera ejecución o cuando se detecta una mejora.

8.2. Comparación con baseline
Se calcula la diferencia de precisión, falsos positivos y negativos.

Si la precisión mejora más del umbralMejora (2%) y los FP/FN no empeoran → estado mejora.

Si la precisión empeora más del umbralEmpeoramiento (3%) o FP/FN empeoran → estado empeora.

Si no hay suficientes datos con groundTruth (minEjecucionesGroundTruth) → estado sin-datos.

8.3. Acciones del autodiagnóstico
Mejora: se actualiza la baseline con las métricas actuales.

Empeora: se generan propuestas de rollback para revertir cambios recientes.

Estable: no se hace nada.

8.4. Poda de planes inactivos
Se ejecuta en el autodiagnóstico.

Archiva planes con < usosMinimos usos o inactivos > diasInactivo, siempre que hayan pasado el período de gracia (diasGracia).

9. Integración con el resto del sistema
9.1. Agent Embassy
No se comunica directamente con el Agent Embassy.

Lee la telemetría generada por el Agent Embassy y el orquestador.

Las propuestas de ajuste de peso se aplican en celulas/index.json, que el orquestador lee en tiempo real.

9.2. Orquestador
Las optimizaciones de rendimiento modifican configuracion.json, que las células leen para ajustar parámetros (tamaño, calidad, concurrencia).

9.3. Catálogo de células
El agente lee celulas/index.json para obtener pesos y existencia de células.

También lo modifica (ajuste de peso o poda).

9.4. Telemetría
El agente es el principal consumidor de historial.json, baseline.json y cambios.json.

9.5. Planes
El agente genera nuevos planes en planes/ y los archiva en planes/archivados/ cuando es necesario.

10. Registro y seguimiento
Archivo	Contenido
propuestas/pendientes/*.json	Propuestas esperando aprobación humana.
propuestas/aprobadas/*.json	Propuestas aprobadas pero aún no aplicadas.
propuestas/aplicadas/*.json	Propuestas ya aplicadas (historial).
propuestas/rechazadas/*.json	Propuestas rechazadas o descartadas.
telemetria/cambios.json	Historial de todos los cambios aplicados (con timestamp, tipo y detalles).
telemetria/baseline.json	Estado de referencia del sistema.
telemetria/historial.json	Todas las ejecuciones (entradas de telemetría).
11. Ejemplos de uso
11.1. Ejecutar análisis (solo propuestas, sin aplicar)
bash
node agente-decision.js
11.2. Aplicar cambios automáticamente
bash
node agente-decision.js --auto
11.3. Aprobar/rechazar propuestas pendientes (interactivo)
bash
node agente-decision.js --aprobar
11.4. Ejecutar solo autodiagnóstico
bash
node agente-decision.js --diagnostico
11.5. Programar ejecución automática (cron)
En crontab -e:

text
0 2 * * * cd /opt/dragon3/dev/celulas && bash scripts/ejecutar-agente.sh
12. Extensiones y personalización
12.1. Añadir un nuevo tipo de propuesta
Crear un archivo en propuestas/mi-tipo.js que exporte generarPropuestas(informe, config).

Importarlo en propuestas/index.js y añadirlo al array generadores.

Añadir el impacto en configuracion.json y el aplicador en APLICADORES de agente-decision.js.

12.2. Modificar umbrales
Editar configuracion.json sin tocar el código.

12.3. Añadir una nueva optimización de rendimiento
En aplicarOptimizacionRendimiento, añadir un nuevo bloque else if para la nueva célula y los parámetros a modificar.

13. Buenas prácticas y seguridad
Siempre hacer backup antes de ejecutar el agente en modo auto (el script de test lo hace automáticamente, pero en producción es recomendable).

Revisar propuestas pendientes regularmente para evitar acumulación.

Monitorizar logs (logs/agente-cron.log si se usa cron).

No modificar manualmente baseline.json o cambios.json; el agente los gestiona.

Ajustar configuracion.json con cuidado; cambios demasiado agresivos pueden afectar la estabilidad.

14. Glosario
Término	Definición
Baseline	Estado de referencia del sistema (métricas y catálogo) para evaluar mejoras/empeoramientos.
Confianza	Medida de fiabilidad de una propuesta (0-1).
Cuello de botella	Célula con alto ratio p95/promedio (lenta).
Deduplicación	Evitar crear planes que ya existen (mismo conjunto de células).
Falso positivo	Imagen humana clasificada como IA.
Falso negativo	Imagen IA clasificada como humana.
GroundTruth	Conocimiento real de si una imagen es IA o humana.
Impacto	Nivel de riesgo de un cambio (1-4).
Período de gracia	Tiempo durante el cual los planes nuevos no se archivan (por defecto 7 días).
Poda	Eliminación o archivo de elementos inactivos o poco precisos.
Rollback	Reversión de un cambio aplicado previamente.
15. Resumen
El Agente de Decisión es el motor de mejora continua del sistema. Analiza datos reales, propone cambios, los aplica de forma segura, y aprende de sus decisiones. Es autónomo, explicable, y se integra perfectamente con el resto de componentes. Su configuración es flexible y permite adaptarlo a diferentes dominios y necesidades.

El sistema no solo analiza imágenes; también se analiza a sí mismo.