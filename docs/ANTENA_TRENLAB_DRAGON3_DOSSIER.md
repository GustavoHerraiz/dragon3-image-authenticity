# Dragon3
## Confianza visual sostenible para la movilidad ferroviaria
### Dossier de candidatura a los Premios Antena TrenLab 2026 · Green Experience

**Promotor:** Blade Corporation  
**Origen:** Mataró  
**Categoría propuesta:** Green Experience
**Estado:** PMV funcional, producto Desktop compilado y prototipo Edge en evolución  
**Versión del dossier:** 10 de septiembre de 2026

---

## 1. Resumen ejecutivo

Dragon3 es una plataforma de soberanía tecnológica para analizar, proteger y verificar imágenes con una arquitectura eficiente y reutilizable.

Su propósito es recuperar la confianza en la evidencia visual en un momento en que una imagen puede generarse o modificarse en segundos. Dragon3 combina análisis de autenticidad, explicabilidad, trazabilidad y sellado forense. El resultado no es únicamente una etiqueta de “humana” o “IA”, sino un registro verificable de qué se analizó, qué evidencias se encontraron, qué limitaciones existían y qué registro de trazabilidad se generó.

El proyecto tiene tres expresiones complementarias:

1. **Dragon3 Engine:** motor de análisis compuesto por células especializadas, planes versionables, telemetría y veredictos explicables.
2. **Dragon3 Desktop:** aplicación para fotógrafos que trabaja como residente, vigila una hot folder, sella automáticamente las imágenes terminadas y genera informes PDF con metadatos, derechos y trazabilidad.
3. **Dragon3 Edge/Cámara:** arquitectura de adaptación que permite añadir una capa de sellado a cámaras existentes sin cambiar su firmware ni sustituir el parque instalado.

Para Renfe, Dragon3 puede convertirse en una capa de confianza visual para imágenes de mantenimiento, inspección, seguridad, incidencias y activos. La propuesta no es sustituir las plataformas de visión artificial ni el parque de cámaras existentes, sino añadir una capa eficiente que verifique la integridad y trazabilidad de la evidencia visual dentro de la infraestructura de la organización.

Dragon3 se ha desarrollado en Mataró, prácticamente en solitario y con recursos de hardware muy limitados. El premio permitiría convertir una tecnología funcional y multidisciplinar en un producto ferroviario validado, seguro, integrable y medible desde el punto de vista ambiental.

Este dossier diferencia deliberadamente entre capacidades demostradas, código disponible y trabajo de industrialización pendiente. Esa distinción es esencial para una tecnología que pretende proteger evidencias.

---

## 2. La idea que defendemos

Dragon3 no nace de una posición contra la inteligencia artificial. La IA es una herramienta extraordinaria y muy potente. La cuestión es quién decide cómo se utiliza, dónde se procesan los datos y quién controla las evidencias resultantes.

Podemos seguir dependiendo de grandes plataformas y enviar imágenes, datos y procesos a nubes que no controlamos. O podemos proponer otra manera de hacer las cosas: tecnología local, explicable, eficiente y adaptada a cada organización.

La tecnología también puede ser comprometida, razonable y humana cuando se diseña para proteger la autonomía de las personas y de las instituciones.

Dragon3 aplica la tecnología para defender una idea: que las personas, las empresas y las instituciones puedan recuperar el control sobre sus imágenes, sus datos y la realidad que representan.

---

## 3. El problema

### 3.1 La imagen ya no basta como evidencia

Una fotografía puede documentar un defecto, una incidencia, un daño, una inspección o una entrega profesional. Pero el archivo puede haber sido generado, editado, recomprimido, copiado o separado de su contexto.

La pregunta relevante ya no es solamente “¿qué muestra esta imagen?”. También es:

- ¿quién la capturó o entregó?
- ¿cuándo se obtuvo?
- ¿fue modificada?
- ¿qué análisis se le aplicó?
- ¿qué evidencias sustentan el resultado?
- ¿puede verificarse el registro después?
- ¿dónde se procesaron los datos?

### 3.2 Dependencia de soluciones centralizadas

En sectores críticos, enviar imágenes a servicios externos puede ser incompatible con los requisitos de privacidad, soberanía, seguridad o continuidad operativa. Además, las organizaciones suelen tener cámaras, aplicaciones y procedimientos ya instalados.

Una solución que obliga a reemplazar todo el parque o a cambiar el flujo de trabajo tiene un coste de adopción elevado.

### 3.3 Falta de explicabilidad

Un clasificador que responde únicamente “humana” o “IA” no explica sus evidencias ni sus límites. Para una inspección, un peritaje o una investigación interna, la trazabilidad del proceso es tan importante como el resultado.

---

## 4. La solución Dragon3

Dragon3 crea una cadena de confianza visual en cuatro pasos:

1. **Capturar o recibir:** imagen procedente de una cámara, dispositivo móvil, carpeta de trabajo o API.
2. **Analizar:** células independientes revisan metadatos, integridad, señales forenses, sellos, patrones de imagen y modelos de análisis.
3. **Explicar y registrar:** el sistema conserva un `correlationId`, las células ejecutadas, tiempos, evidencias, limitaciones y veredicto.
4. **Proteger y verificar:** el generador MBH inserta un identificador en la imagen, añade metadatos y registra la relación entre sello, proyecto, autor y derechos para su posterior comprobación contra un registro autorizado.

El resultado se expresa como evidencia técnica y nivel de confianza. Dragon3 no debe presentarse como una autoridad metafísica capaz de conocer la verdad absoluta; debe presentarse como una infraestructura reproducible que aumenta la capacidad de verificarla.

---

## 5. Productos y componentes actuales

### 5.1 Dragon3 Engine

El motor productivo separa responsabilidades entre backend HTTP, Embassy, orquestador, células, worker ML, Redis/Bull, MongoDB y telemetría.

La arquitectura documentada incluye:

- autenticación y validación de ficheros;
- `correlationId` y trazabilidad de petición;
- planes de análisis versionables;
- células independientes con salida estructurada;
- ejecución paralela de células ligeras;
- cola serial para células pesadas basadas en Sharp;
- worker ML persistente;
- resultados y telemetría;
- explicación orientada al cliente;
- limpieza de buffers y archivos temporales;
- backpressure y respuesta `429` cuando se alcanza la capacidad segura.

El sistema productivo se ejecuta actualmente con PM2, Redis, Bull, MongoDB, Node.js, Sharp y componentes de ML. El perfil validado para el host actual limita la ruta síncrona a dos análisis en vuelo por proceso.

### 5.2 Dragon3 Desktop

Dragon3 Desktop es una aplicación Electron distribuible para fotógrafos. Su propuesta no exige que el usuario aprenda un flujo nuevo:

- se instala como aplicación residente;
- puede iniciarse con el sistema y trabajar en segundo plano;
- vigila carpetas de proyectos mediante un watcher;
- detecta automáticamente imágenes nuevas;
- sella la imagen cuando el fotógrafo la deja lista;
- mantiene proyectos, clientes, obras, colecciones y derechos en SQLite local;
- ofrece análisis V5 forense y V6 rápido;
- genera informes PDF de autenticidad y protección;
- registra el sello y sus metadatos sin depender de un servidor central.

El producto ya está compilado y preparado para ser probado por fotógrafos externos. Es el PMV más presentable para una validación inicial de usuarios.

La revisión del código confirma un flujo de trabajo concreto: el watcher espera a que el archivo termine de escribirse, recorre la carpeta de proyectos, ignora carpetas `Originales` y archivos que ya siguen el patrón de sello, crea el proyecto si es necesario y puede mover el original a `Originales` o eliminarlo según la configuración. También existen sellado individual, sellado por lotes con progreso y cancelación, análisis rápido o forense, bandeja residente, activación de licencia y dos rutas de generación de informes PDF.

### 5.3 Sello MBH

MBH significa **Made By Humans**. El concepto comercial es otorgar un sello a una imagen que Dragon3 ha analizado y para la que no ha detectado señales incompatibles con un origen humano, dentro de los límites del modelo y de la evidencia disponible.

El generador actual combina:

- un identificador de sello de 28 bits;
- checksum de control;
- modificación de patrones en el canal azul mediante bloques DCT;
- geometría de puntos tipo Vogel en canales de píxel;
- metadatos descriptivos mediante ExifTool;
- registro local del identificador, cliente, obra y derechos.

El analizador puede buscar el identificador en metadatos y en la estructura de píxeles, probar escalas, rotaciones, reflejo y desplazamientos, validar el checksum y contrastar el resultado con el registro local.

En comunicación comercial debe utilizarse una formulación responsable: **“Dragon3 no detectó señales de generación artificial y emitió un sello MBH comprobable contra un registro autorizado”**, no una garantía absoluta de autoría humana.

### 5.4 Adaptador Edge para cámaras

La carpeta `dev/selladocamara` demuestra una arquitectura independiente del firmware de la cámara:

```text
Cámara IP existente
        |
        v
Nodo Edge Dragon3
  captura el frame
  sella localmente
  guarda y purga capturas
        |
        v
Sala de control / servidor
  analiza y verifica
  expone la evidencia
```

El nodo Edge puede recibir una imagen o un flujo estándar de una cámara IP, sellar el frame y exponerlo. La sala de control puede solicitar un “latido” forense, descargar la imagen sellada, analizarla y mostrar el resultado junto al vídeo.

La prueba de concepto se realizó utilizando un móvil antiguo como cámara IP y un ordenador como adaptador. El frame se sellaba aproximadamente una vez por segundo y se enviaba mediante túnel a una sala de control remota. Aunque aún necesita desarrollo industrial, la cadena extremo a extremo ya ha sido demostrada.

El siguiente prototipo físico previsto es una Raspberry Pi como adaptador de bajo coste:

```text
Cámara existente -> Raspberry Pi -> sello MBH -> canal seguro -> verificación
```

Esto reduce el coste de implantación: no es necesario sustituir todas las cámaras ni modificar su firmware; se incorpora una capa adaptadora junto a cada fuente.

La implementación contiene dos variantes experimentales: una `cajita_edge` que responde inmediatamente y sella el frame en segundo plano, y una `sala_control`/`conector` que coordina captura, descarga, análisis y túnel de vídeo. La primera separación permite que el nodo junto a la cámara haga únicamente captura y sellado, mientras que el análisis puede ejecutarse en otro equipo.

---

## 6. Encaje con Renfe

### 6.1 Propuesta de valor

Renfe ya trabaja en digitalización, visión artificial, mantenimiento y seguridad. Dragon3 puede aportar una capa complementaria: **la integridad y trazabilidad de la evidencia visual que alimenta esos procesos**.

La propuesta para Renfe es:

> Proteger las imágenes de mantenimiento, inspección, seguridad e incidencias sin obligar a sustituir las cámaras existentes y sin sacar los datos críticos a nubes de terceros.

En clave **Green Experience**, la propuesta añade una decisión de eficiencia: prolongar la vida útil del equipamiento existente y añadir capacidad mediante software y nodos Edge de bajo consumo, en lugar de sustituir masivamente cámaras que todavía funcionan. La sostenibilidad se medirá con datos de equipos reutilizados, energía del nodo, almacenamiento evitado y coste material no generado.

### 6.2 Aplicaciones posibles

#### Mantenimiento e inspección

- sellar fotos de componentes, averías y reparaciones;
- asociar cada imagen a activo, lugar, fecha, técnico y orden de trabajo;
- verificar que la imagen usada para cerrar una intervención coincide con la evidencia registrada;
- detectar discrepancias entre metadatos y sello de píxeles.

#### Estaciones y material rodante

- documentar daños, vandalismo y estado de instalaciones;
- conservar una evidencia verificable antes y después de una intervención;
- adaptar cámaras existentes mediante nodos Edge.

#### Incidencias y seguridad

- proteger capturas asociadas a una incidencia;
- conservar trazabilidad de quién capturó, selló, analizó y consultó una evidencia;
- operar localmente cuando la conectividad sea limitada.

#### Mercancías y logística

- sellar imágenes de vagones, matrículas, códigos, cargas y precintos;
- asociar la evidencia a una operación logística;
- verificar que la imagen no fue sustituida durante el intercambio entre sistemas.

#### Integración con visión artificial

Dragon3 no compite necesariamente con la visión artificial que Renfe ya utilice. Puede actuar como capa de confianza alrededor de esos sistemas: el algoritmo detecta una anomalía y Dragon3 ayuda a demostrar que la imagen de entrada, el momento del análisis y el registro de la decisión son trazables.

### 6.3 Soberanía tecnológica

La solución puede instalarse dentro de la infraestructura de Renfe, en servidores propios o en nodos Edge. Eso permite:

- mantener el dato dentro del perímetro autorizado;
- reducir exposición a proveedores externos;
- operar en entornos desconectados o con conectividad limitada;
- adaptar la capacidad al nivel de criticidad;
- conservar control sobre claves, registros y políticas de retención.

La soberanía y la sostenibilidad se refuerzan mutuamente: procesar cerca de la fuente reduce transferencias innecesarias, permite conservar solo la evidencia necesaria y evita que cada captura tenga que viajar a una infraestructura externa para ser protegida.

---

## 7. Green Experience: eficiencia sin sustituir el parque instalado

Dragon3 encaja en Green Experience porque plantea una modernización frugal de la movilidad: **más capacidad de confianza visual con menos sustitución de hardware**.

El impacto sostenible que se propone validar es:

- reutilización de cámaras IP ya instaladas;
- prolongación de la vida útil del equipamiento;
- nodos Edge de bajo consumo junto a la fuente de imagen;
- menor transferencia de imágenes completas hacia servicios externos;
- retención limitada y purga automática de capturas temporales;
- despliegue gradual, evitando una renovación masiva del parque;
- operación en hardware accesible, reparable y sustituible por módulos.

Dragon3 no presentará un ahorro ambiental como hecho ya certificado. Lo convertirá en una hipótesis medible durante la aceleración mediante comparación entre adaptador Edge, sustitución de cámara y procesamiento centralizado.

## 8. Por qué es innovador y disruptivo

La innovación no está únicamente en añadir otro detector de IA. Está en unir cinco decisiones que normalmente aparecen separadas:

1. **Confianza desde el flujo de trabajo:** el sello se genera cuando la imagen se crea o termina, no solo cuando alguien sospecha de ella.
2. **Explicabilidad:** el resultado conserva evidencias y limitaciones, no solo una etiqueta.
3. **Soberanía:** el análisis puede ejecutarse localmente sin entregar la imagen a una nube de terceros.
4. **Retrofit:** la capa Edge puede trabajar con cámaras existentes sin sustituirlas.
5. **Usabilidad:** el fotógrafo o técnico puede seguir trabajando como siempre; Dragon3 trabaja en segundo plano.

La alternativa no es “IA contra no IA”. Es elegir si la tecnología se utiliza de manera centralizada y opaca o si también puede ser local, razonable, eficiente y humana.

---

## 9. Encaje con los Premios Antena TrenLab 2026

La información pública localizada sobre la convocatoria indica:

- orientación a innovación territorial vinculada a movilidad sostenible y ámbito ferroviario;
- tres premios de 25.000 €, con 75.000 € de dotación total;
- programa de aceleración de seis meses presencial en Antena TrenLab, Mataró;
- mentorías y posibilidad de testeo local;
- enfoque en un PMV innovador, tecnológico y sostenible relacionado con ferrocarril o movilidad;
- participación dirigida a pyme, micropyme o startup;
- compromiso de asistencia presencial al programa.

Dragon3 encaja especialmente en **Green Experience** y debe presentarse con ese foco:

1. **PMV:** Dragon3 Desktop está compilado y listo para validación externa; el motor productivo y el prototipo Edge amplían la base tecnológica.
2. **Impacto verde:** se reutilizan cámaras existentes, se evita una renovación prematura y se plantea una medición de energía, almacenamiento y hardware evitado.
3. **Movilidad y ferrocarril:** la evidencia visual de mantenimiento, seguridad, inspección e incidencias es un caso de uso ferroviario claro.
4. **Territorio:** es una tecnología nacida en Mataró y puede ser desarrollada y pilotada desde Antena TrenLab.

El encaje en **Accesibilidad Universal** es secundario y no debe ser el eje de la candidatura. El producto puede facilitar la documentación y consulta de evidencias, pero su innovación principal es la eficiencia y reutilización aplicada a movilidad.

### Nota de verificación

Antes de enviar la candidatura hay que descargar y revisar la convocatoria y el formulario activos, especialmente fechas, forma jurídica, límites de extensión y documentación obligatoria.

---

## 10. Dos modelos de negocio

### 9.1 Mercado profesional y general: MBH

Dragon3 Desktop puede ofrecerse a fotógrafos y estudios como una herramienta de protección automática:

- licencia o suscripción de uso;
- sello MBH por volumen o plan;
- informes PDF y gestión de derechos;
- protección local y opcionalmente verificación compartida;
- soporte y mantenimiento.

El valor no es añadir una marca visible que moleste al cliente. El valor es que el fotógrafo entrega su trabajo como siempre, pero cada imagen queda protegida y documentada.

### 9.2 Empresas e infraestructuras críticas

Para Renfe, industria, seguros, peritaje, Defensa o administraciones, el producto sería una plataforma privada:

- instalación on-premise o Edge;
- adaptadores junto a cámaras existentes;
- integración con órdenes de trabajo y sistemas de incidencias;
- políticas de retención y control de acceso;
- auditoría y trazabilidad;
- soporte especializado;
- desarrollo de conectores y validación sectorial.

La misma tecnología sirve para dos necesidades distintas: demostrar origen humano o proteger el origen institucional de una evidencia.

---

## 11. Estado real del proyecto

### Ya funciona o está disponible

- motor de análisis Dragon3 en producción experimental;
- células y planes de análisis;
- análisis forense y verificaciones de sellos;
- cola serial para células Sharp;
- worker asíncrono separado;
- PM2, Redis/Bull, MongoDB y telemetría;
- backpressure y warm-up para el host actual;
- Dragon3 Desktop compilado;
- watcher/hot folder residente;
- SQLite local para proyectos, sellos, licencias y derechos;
- generación de informes PDF;
- generador y analizador MBH;
- prototipo de captura, sellado y sala de control;
- demostración con un móvil antiguo como cámara IP.

### Validación disponible

En la validación operativa del 10 de septiembre de 2026:

- concurrencia 1: 6 de 6 análisis correctos;
- concurrencia 2: 12 de 12 análisis correctos;
- sin fallos en esas ventanas controladas;
- p50 de 15,700 segundos en concurrencia 1;
- p50 de 14,070 segundos en concurrencia 2;
- procesos PM2 esperados en estado online;
- health check correcto después del arranque;
- comprobación sintáctica de los módulos modificados superada.

En la auditoría profunda realizada para este dossier, las comprobaciones `node --check` pasaron para los módulos principales de Desktop y para los cinco scripts del prototipo de cámara. Las pruebas de integración disponibles de Desktop arrancan tras reconstruir `sqlite3` para Linux, pero actualmente fallan antes del flujo funcional por desajustes entre tests antiguos y la API actual: un test crea `GeneradorMBH` sin inyectar `LicenseManager` y otro llama a `activarLicencia`, mientras que la implementación vigente expone `activarPremium`. Por tanto, esas pruebas no se presentan como evidencia verde y deben actualizarse antes de una certificación externa.

### Lo que todavía no debe afirmarse

- no existe aún certificación empresarial de alta concurrencia;
- no debe afirmarse una precisión universal del detector sin dataset externo;
- el sello MBH no equivale por sí solo a una prueba jurídica absoluta de autoría humana;
- el nodo Edge aún es prototipo y necesita endurecimiento industrial;
- la integración ferroviaria todavía es una propuesta, no un piloto de Renfe;
- faltan pruebas independientes de seguridad y resistencia contra ataques.
- las pruebas automatizadas heredadas de Desktop todavía requieren alinearse con la API actual;
- el código experimental de cámara contiene configuraciones de desarrollo que deben externalizarse antes de cualquier despliegue.

La honestidad sobre estos límites aumenta la credibilidad de la candidatura.

---

## 12. Segunda fase propuesta con Antena TrenLab

### Objetivo

Convertir Dragon3 en una capa ferroviaria validada de confianza visual y eficiencia operativa, con un piloto diseñado junto a Renfe y ejecutado sin sacar datos críticos de su entorno.

### Fase 1: definición y seguridad

- seleccionar un caso de uso ferroviario de bajo riesgo;
- definir qué imagen se sella, cuándo y con qué metadatos;
- revisar protección de datos, retención y accesos;
- separar claramente datos de demostración y datos operativos;
- definir métricas de éxito y criterios de parada;
- fijar una línea base ambiental: cámaras sustituidas, consumo, tráfico de red y almacenamiento.

### Fase 2: adaptador Edge

- construir el prototipo Raspberry Pi;
- parametrizar cámaras, credenciales y políticas por dispositivo;
- añadir almacenamiento temporal con TTL;
- cifrar comunicaciones y proteger claves;
- probar cámaras IP de varios fabricantes;
- validar funcionamiento con conectividad intermitente.

### Fase 3: piloto de evidencia visual

- instalar un nodo en un entorno de prueba autorizado;
- capturar imágenes de inspección o mantenimiento;
- sellar localmente;
- analizar y verificar en infraestructura controlada;
- asociar la evidencia con una incidencia o activo;
- generar informe auditable.

### Fase 4: evaluación

Métricas propuestas:

- porcentaje de capturas correctamente selladas;
- porcentaje de verificaciones correctas;
- detección de modificaciones deliberadas;
- tiempo de sellado y de verificación;
- uso de CPU, memoria y almacenamiento del Edge;
- consumo eléctrico estimado por nodo y por captura;
- volumen de datos transferido frente a un flujo centralizado equivalente;
- número de cámaras reutilizadas y equipos cuya sustitución se evita;
- vida útil adicional estimada del parque instalado;
- disponibilidad con pérdida de conectividad;
- reducción de coste frente a sustitución de cámaras;
- aceptación de técnicos y responsables de seguridad;
- porcentaje de imágenes que requieren revisión humana.

### Entregables

- adaptador Edge funcional;
- API y esquema de evidencia;
- consola de verificación;
- informe de seguridad;
- resultados de precisión y rendimiento;
- guía de despliegue;
- plan de industrialización y escalado.

---

## 13. Uso previsto del premio

El premio se dedicaría a convertir la demostración individual en una validación profesional y medible para Green Experience:

| Área | Uso |
|---|---|
| Hardware | Raspberry Pi y Edge industrial, almacenamiento y cámaras de prueba |
| Sostenibilidad | Medición de consumo, tráfico, almacenamiento y hardware reutilizado |
| Seguridad | revisión externa, gestión de claves, autenticación y cifrado |
| Validación | dataset externo, pruebas de precisión y resistencia |
| Integración | conectores para activos, incidencias y operaciones ferroviarias |
| Producto | instalador, configuración, actualización y soporte |
| Piloto | diseño, documentación y ejecución de una prueba autorizada |
| Negocio | entrevistas, pricing, propiedad intelectual y estrategia comercial |

La asignación final debe ajustarse a las reglas económicas de la convocatoria y a un presupuesto detallado.

---

## 14. Seguridad, propiedad intelectual y soberanía

La protección del proyecto es parte de la propuesta, pero no debe confundirse con afirmar que el sistema ya está certificado para Defensa o infraestructura crítica.

Medidas necesarias para la siguiente fase:

- retirar credenciales embebidas y usar secretos externos;
- sustituir configuraciones abiertas por políticas de acceso explícitas;
- proteger la clave privada del sello con almacenamiento seguro;
- firmar registros o encadenarlos de forma verificable;
- registrar eventos de acceso y verificación;
- separar roles de operador, auditor y administrador;
- cifrar datos en tránsito y en reposo;
- establecer retención y borrado seguro;
- realizar auditoría externa de seguridad;
- proteger marca MBH y documentación técnica;
- estudiar patentabilidad o secreto empresarial de los componentes diferenciales.

La revisión del código confirma que esta industrialización es necesaria: el prototipo de cámara contiene credenciales de acceso y una política CORS abierta para desarrollo, y el módulo de licencias de Desktop contiene un secreto local de demostración. Estos elementos no se consideran configuración de producción y deben rotarse, extraerse a secretos protegidos y someterse a revisión antes de compartir el software fuera del círculo de pruebas.

La ventaja soberana no significa aislarse de toda colaboración. Significa que la organización decide dónde se procesa la información, quién la puede consultar y bajo qué reglas.

---

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Falsos positivos o negativos | dataset externo, calibración, umbral conservador y revisión humana |
| Manipulación del sello | firma de registros, gestión segura de claves y pruebas adversariales |
| Rendimiento insuficiente | Edge dedicado, colas, backpressure y perfiles por caso de uso |
| Dependencia del fundador | documentación, modularidad y colaboradores con mínimo privilegio |
| Exposición de datos | despliegue local, cifrado, retención limitada y control de accesos |
| Adopción lenta | integración con cámaras y hot folders sin cambiar el flujo de trabajo |
| Exceso de alcance | comenzar con un caso de uso medible y ampliar después |
| Interpretación jurídica excesiva | lenguaje probabilístico, auditoría y supervisión humana |

---

## 16. Demo recomendada para el jurado

La demostración debe durar pocos minutos y mostrar un flujo completo:

1. Abrir Dragon3 Desktop como residente.
2. Mostrar una carpeta de trabajo de un fotógrafo.
3. Copiar o guardar una imagen terminada.
4. Mostrar que Dragon3 la detecta sin intervención.
5. Enseñar el sello, el identificador y los metadatos.
6. Ejecutar la verificación y mostrar evidencias y resultado.
7. Generar un informe PDF con cliente, obra y derechos cedidos.
8. Explicar que el mismo principio puede proteger una imagen de inspección ferroviaria.
9. Mostrar, como evolución, el esquema cámara existente -> Edge -> análisis local -> sala de control.

La demo debe evitar depender de una conexión pública o de un servicio externo. Conviene llevar una copia de respaldo de imágenes, resultados y PDF.

---

## 17. Discurso de presentación

Hola. Gracias por la oportunidad de presentar mi proyecto.

Desde siempre, mi madre me ha dicho que podía ser lo que quisiera. Y con 16 años decidí hacerle caso: quería ser Harrison Ford.

Pero no el Harrison Ford de *Indiana Jones* o *Star Wars*, sino el de *Blade Runner*. ¿Quién ha visto la película?

En ella, los replicantes son tan parecidos a los seres humanos que resulta casi imposible distinguirlos. Esa idea me marcó: ¿qué ocurre cuando algo parece real, pero ya no podemos demostrar que lo es?

De esa pregunta nace Blade Corporation. Y nace Dragon3.

Hoy podemos generar o modificar una imagen en segundos. Una fotografía puede documentar una incidencia, una inspección, un daño o una investigación, pero también puede haber sido manipulada.

El problema no es solo la inteligencia artificial. El problema es la pérdida de confianza en la evidencia visual.

Y quiero aclarar algo: Dragon3 no está en contra de la inteligencia artificial. La IA es una herramienta extraordinaria y muy potente. Lo que defendemos es que la tecnología debe estar al servicio de las personas, de sus ideas y de su visión del mundo.

La tecnología también puede ser comprometida, razonable y humana.

Por eso Dragon3 propone otra manera de proteger la realidad.

Podemos seguir dependiendo de grandes plataformas, enviar nuestros datos e imágenes a nubes que no controlamos y aceptar soluciones cerradas. O podemos recuperar el control.

Dragon3 es una plataforma de autenticidad y trazabilidad visual. Analiza imágenes, busca señales de generación o manipulación, explica las evidencias encontradas y registra el proceso con una visión casi forense.

Además, puede sellar una imagen con un identificador comprobable contra un registro autorizado. Así se puede contrastar posteriormente su integridad, su origen y su relación con el registro correspondiente.

Para fotógrafos, Dragon3 funciona de forma invisible: vigila una carpeta de trabajo, detecta cuándo una imagen está terminada y la sella automáticamente antes de entregarla al cliente. También puede generar un informe PDF con la información de la entrega y los derechos cedidos.

El fotógrafo no tiene que cambiar su forma de trabajar. Sigue haciendo lo de siempre, pero sus imágenes salen protegidas.

Ese mismo principio puede aplicarse a entornos críticos.

En Renfe, Dragon3 podría proteger imágenes de mantenimiento, inspecciones, incidencias, seguridad o vandalismo. No tendría que sustituir las cámaras existentes ni modificar su firmware. Podría funcionar como una capa adicional de confianza, localmente y dentro de la propia infraestructura de Renfe.

Los datos no tendrían que salir a una nube de terceros. La organización conservaría el control sobre sus imágenes, sus evidencias y sus procesos.

Además, esta propuesta es eficiente por diseño: reutiliza cámaras que ya existen, añade nodos Edge de bajo consumo y evita sustituir hardware antes de tiempo. La segunda fase mediría ese impacto con datos de consumo, tráfico, almacenamiento y equipos reutilizados.

Y esto no es solo una visión futura. Dragon3 ya tiene un motor funcional, una aplicación de escritorio compilada y una arquitectura probada con cámaras y dispositivos existentes.

He desarrollado esta tecnología en Mataró, prácticamente en solitario y con recursos muy limitados.

Mataró no es un lugar casual para hablar de ferrocarril. En 1848 salió de aquí la primera línea ferroviaria de la península, conectando Mataró con Barcelona.

Renfe tiene una historia de liderazgo, no solo tecnológico, sino también social. Ha conectado territorios, personas y oportunidades.

Dragon3 quiere proteger la confianza en la información que hace posibles esas conexiones.

Si Renfe apuesta por Dragon3, puede volver a ser la locomotora de una tecnología nacida aquí, en Mataró. Puede liderar una nueva forma de proteger la evidencia visual y la soberanía tecnológica.

O puede esperar a que otros desarrollen esa capacidad y acabar ocupando el vagón de cola.

No afirmamos que una máquina pueda conocer la verdad absoluta. Aportamos algo más honesto y más útil: evidencia técnica, trazabilidad y un nivel de confianza verificable.

Dragon3 no es solo un detector de imágenes artificiales. Es una infraestructura para recuperar el control sobre nuestras imágenes, nuestros datos y la realidad que representan.

Porque en un mundo donde ya no basta con ver una imagen, también necesitamos saber de dónde viene, cómo se ha analizado y si podemos confiar en ella.

Muchas gracias.

---

## 18. Fuentes y evidencias internas

### Fuentes públicas consultadas

- [TecnoCampus: información de Antena TrenLab y Premios 2026](https://www.tecnocampus.cat/)
- [Búsqueda pública de la convocatoria Antena TrenLab 2026](https://www.google.com/search?q=%22Premios+Antena+TrenLab+2026%22+retos+75.000+euros+requisitos)
- [Grupo Renfe: TrenLab](https://grupo.renfe.com/)

La información pública recuperada durante esta preparación identifica tres retos 2026: Green Experience, Onboard Experience y Accesibilidad Universal; tres premios de 25.000 €; un programa presencial de seis meses; y la exigencia de un PMV tecnológico orientado a ferrocarril o movilidad. Debe comprobarse la versión vigente de las bases antes del envío.

### Evidencias del repositorio

- [Documentación maestra del sistema](SYSTEM_DOCUMENTATION.md)
- [Perfil operativo seguro](operations/PRODUCTION_SAFE_PROFILE_2026-09-10.md)
- [Revisión técnica de producción](operations/PRODUCTION_REVIEW_2026-09-10.md)
- [Dragon3 Desktop](../dev/dragon3-desktop/)
- [Prototipo Edge y sala de control](../dev/selladocamara/)
- [Plan de alta concurrencia](../HIGH_CONCURRENCY_PLAN.md)
- [Checklist de producción](../PRODUCTION_CHECKLIST.md)

---

## 19. Resumen final para el jurado

Dragon3 es una tecnología nacida en Mataró que propone una alternativa eficiente al modelo de procesamiento centralizado: proteger y verificar imágenes de forma local, explicable y trazable, reutilizando el equipamiento existente.

Ya existe un PMV para fotógrafos, un motor de análisis y un prototipo de adaptación a cámaras. El siguiente paso no es imaginar si la idea puede funcionar, sino medir su impacto ambiental y validarla en un entorno ferroviario real como una infraestructura profesional de confianza visual sostenible.

Renfe puede ser la locomotora de esa transformación.