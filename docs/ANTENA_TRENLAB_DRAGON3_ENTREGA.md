# Dragon3
## Confianza visual sostenible para la movilidad ferroviaria

**Modalidad:** Green Experience
**Promotor:** Blade Corporation
**Origen:** Mataró
**Fecha:** 10 de septiembre de 2026

---

## Resumen ejecutivo

Dragon3 es una plataforma que analiza, protege y verifica imágenes mediante una arquitectura eficiente, local y reutilizable. Su objetivo es devolver la confianza en la evidencia visual en un momento en que cualquier imagen puede generarse o modificarse en segundos.

Dragon3 combina análisis de autenticidad, explicabilidad, trazabilidad y sellado. El resultado no es solo una etiqueta de "humana" o "generada por IA": es un registro verificable de qué se analizó, qué evidencias se encontraron y qué trazabilidad quedó asociada a la imagen.

El proyecto se compone de tres piezas complementarias:

1. **Dragon3 Engine:** motor de análisis con células especializadas, planes de análisis y veredictos explicables.
2. **Dragon3 Desktop:** aplicación para fotógrafos y operarios, ya compilada, que vigila una carpeta de trabajo, sella automáticamente las fotografías terminadas y genera informes de protección.
3. **Dragon3 Edge:** arquitectura que añade una capa de sellado a cámaras de videovigilancia y vídeo ya instaladas, sin sustituirlas ni modificar su firmware.

La misma tecnología de análisis y sellado funciona sobre dos tipos de fuente visual distintos:

- **Fotografías tomadas por operarios y técnicos:** por ejemplo, una imagen capturada con un móvil o cámara para documentar una incidencia o una inspección.
- **Imágenes y vídeo de cámaras de videovigilancia:** capturas continuas o periódicas de cámaras fijas ya instaladas en estaciones, talleres o infraestructuras.

Para el sector ferroviario, esto significa que Dragon3 puede proteger tanto las fotografías que un operario toma manualmente para justificar una incidencia como el flujo de imágenes de las cámaras de videovigilancia ya instaladas, sin sustituir ese parque de cámaras y sin enviar los datos a nubes de terceros.

Dragon3 se ha desarrollado íntegramente en Mataró. El programa de aceleración permitiría convertir una tecnología ya funcional en una solución ferroviaria validada y medible en términos de eficiencia y sostenibilidad.

---

## El problema que resolvemos

Una fotografía puede documentar una incidencia, una inspección o un daño, pero el archivo puede haber sido generado, editado o separado de su contexto original. La pregunta relevante ya no es solo "qué muestra la imagen", sino también:

- ¿quién la capturó y cuándo?
- ¿fue modificada después?
- ¿qué evidencias respaldan su autenticidad?
- ¿puede verificarse posteriormente?
- ¿dónde se procesaron los datos?

Además, muchas organizaciones cuentan con cámaras y procedimientos ya instalados. Una solución que exige sustituir todo el equipamiento o cambiar el flujo de trabajo tiene un coste de adopción y un impacto ambiental elevados.

Dragon3 responde a estas dos necesidades a la vez: recuperar la confianza en la evidencia visual y hacerlo de forma eficiente, reutilizando lo que ya existe.

---

## La solución Dragon3

Dragon3 construye una cadena de confianza visual en cuatro pasos:

1. **Captura:** la imagen procede de una fotografía tomada por una persona, de una cámara de videovigilancia ya instalada o de una carpeta de trabajo.
2. **Análisis:** células independientes revisan metadatos, integridad, señales forenses y patrones de imagen.
3. **Explicación y registro:** el sistema conserva un identificador de correlación, las evidencias encontradas y el veredicto.
4. **Protección y verificación:** un sello se incorpora a la imagen y queda asociado a un registro para su comprobación posterior.

El resultado se expresa como evidencia técnica y nivel de confianza, no como una certeza absoluta.

---

## Green Experience: eficiencia sin sustituir el parque instalado

Dragon3 encaja en Green Experience porque plantea una modernización frugal de la movilidad: **más capacidad de confianza visual con menos sustitución de hardware**.

El impacto que Dragon3 propone validar durante la aceleración es:

- reutilización de cámaras de videovigilancia IP ya instaladas, en lugar de sustituirlas;
- prolongación de la vida útil de ese equipamiento;
- nodos Edge de bajo consumo situados junto a cada cámara;
- menor transferencia de imágenes y vídeo completos hacia servicios externos;
- retención limitada y purga automática de capturas temporales;
- despliegue gradual, sin necesidad de una renovación masiva del parque de videovigilancia;
- operación en hardware accesible, reparable y sustituible por módulos.

Este impacto se medirá con datos concretos: cámaras de videovigilancia reutilizadas, consumo eléctrico del nodo, volumen de datos transferido y coste de sustitución evitado.

---

## Producto: Dragon3 Desktop (fotografía de operarios y profesionales)

Dragon3 Desktop es una aplicación de escritorio ya compilada, pensada para fotógrafos profesionales y para operarios que documentan incidencias con fotografías, que protege su trabajo sin cambiar su forma de trabajar:

- funciona como aplicación residente y puede iniciarse con el sistema;
- vigila automáticamente la carpeta de proyectos;
- detecta cuándo una imagen está terminada y la sella sin intervención manual;
- organiza proyectos, clientes, obras y derechos;
- ofrece un modo de análisis rápido y otro forense;
- genera un informe de protección y trazabilidad para el cliente final.

El fotógrafo sigue trabajando como siempre; Dragon3 protege cada imagen en segundo plano.

---

## Producto: adaptador Edge para cámaras de videovigilancia

Dragon3 incluye una arquitectura de adaptación que permite añadir sellado y verificación a cámaras de videovigilancia IP ya instaladas, sin modificar su firmware ni sustituirlas:

```text
Cámara de videovigilancia existente
        |
        v
Nodo Edge Dragon3
  captura el frame de vídeo
  sella localmente
        |
        v
Verificación
  analiza y confirma la evidencia
```

Esta arquitectura ya ha sido probada de extremo a extremo: captura de vídeo, sellado y verificación remota funcionando en conjunto sobre una cámara IP real. El siguiente paso de desarrollo es un adaptador físico de bajo coste, basado en una placa de tipo Raspberry Pi, que se instala junto a cada cámara de videovigilancia existente.

Esta aproximación reduce drásticamente el coste y el impacto de la implantación: no es necesario sustituir las cámaras de videovigilancia que todavía funcionan, solo añadir una capa adaptadora eficiente junto a cada una.

---

## Aplicación al sector ferroviario

Dragon3 puede proteger la evidencia visual asociada a procesos ya existentes en el ámbito ferroviario, combinando dos fuentes de imagen:

- **Mantenimiento e inspección (fotografía de operarios):** sellar fotografías de componentes, averías y reparaciones tomadas por técnicos, asociadas a un activo, una fecha y una orden de trabajo.
- **Estaciones e infraestructura (videovigilancia):** proteger y verificar de forma continua las imágenes de las cámaras de videovigilancia ya instaladas, documentando el estado de instalaciones y posibles incidencias.
- **Seguridad (videovigilancia y fotografía):** conservar trazabilidad de quién capturó, selló y verificó una evidencia visual, sea una fotografía puntual o una captura de vídeo.
- **Logística (fotografía de operarios):** sellar imágenes de vagones, cargas y precintos tomadas por el personal para su trazabilidad.

Dragon3 no sustituye los sistemas de visión artificial o videovigilancia que puedan existir. Aporta una capa adicional que verifica la integridad y el origen de la imagen o el vídeo que alimenta esos sistemas, procesada localmente y sin salir de la infraestructura de la organización.

---

## Estado actual del proyecto

Dragon3 no es una idea en fase de boceto. Actualmente están disponibles:

- un motor de análisis en funcionamiento, con planes de análisis, múltiples señales de evidencia y generación de veredictos explicables;
- Dragon3 Desktop, compilado y preparado para su uso por fotógrafos profesionales;
- el sistema de sellado y verificación de imágenes;
- una arquitectura Edge probada de extremo a extremo, incluyendo captura, sellado local y verificación remota.

El siguiente paso es la industrialización del adaptador físico, la validación de precisión con conjuntos de datos externos y un piloto ferroviario que permita medir el impacto real en eficiencia, sostenibilidad y coste evitado.

---

## Plan de trabajo propuesto para la aceleración

**Fase 1 — Definición y línea base**
Seleccionar un caso de uso ferroviario concreto y de bajo riesgo, y establecer una línea base de consumo, tráfico de datos y cámaras a mantener en servicio.

**Fase 2 — Adaptador Edge**
Construir el prototipo físico sobre una placa de bajo coste, compatible con distintas cámaras IP y con almacenamiento temporal seguro.

**Fase 3 — Piloto de evidencia visual**
Instalar el sistema en un entorno de prueba autorizado, capturar y sellar imágenes reales de inspección o mantenimiento, y verificar la evidencia en un entorno controlado.

**Fase 4 — Evaluación de resultados**
Medir la reducción de sustitución de hardware, el consumo eléctrico del nodo, el volumen de datos evitado y la aceptación por parte de los equipos técnicos.

---

## Equipo

Dragon3 ha sido diseñado y desarrollado íntegramente por su fundador, de forma individual, desde Mataró.

Esta decisión ha sido deliberada: Dragon3 protege evidencias visuales que pueden llegar a ser críticas, y mantener el control total del código, los sellos y las claves durante la fase de diseño ha permitido garantizar la integridad del sistema sin depender de terceros ni exponer el núcleo tecnológico antes de que estuviera maduro.

Con la fase de diseño crítico ya cerrada, la siguiente etapa natural del proyecto es incorporar un equipo: perfiles de seguridad, hardware embebido, validación de datos y desarrollo de negocio. El apoyo del programa de aceleración se destinaría, en parte, a dar ese paso de forma ordenada, con accesos controlados y responsabilidades bien definidas.

---

## Uso previsto del apoyo del programa

El apoyo económico y el programa de aceleración se destinarían a convertir la tecnología actual en una solución ferroviaria validada:

| Partida | Destino |
|---|---|
| Adaptador Edge | Diseño y fabricación de un adaptador de bajo coste para cámaras de videovigilancia ya instaladas |
| Cámaras y hardware de prueba | Adquisición de cámaras de videovigilancia y equipos de prueba representativos del entorno ferroviario |
| Medición de sostenibilidad | Instrumentación para medir consumo eléctrico, tráfico de datos y hardware reutilizado |
| Seguridad | Revisión externa de seguridad, gestión de claves y cifrado de comunicaciones |
| Validación técnica | Pruebas de precisión con conjuntos de imágenes independientes |
| Incorporación de equipo | Primeros perfiles especializados en seguridad, hardware e integración |
| Piloto ferroviario | Diseño, despliegue y evaluación de una prueba real supervisada |

La distribución final del presupuesto se ajustará a las bases económicas del programa y se detallará en un plan financiero específico.

---

## Por qué Dragon3

Dragon3 no propone sustituir la inteligencia artificial ni las cámaras existentes: propone protegerlas y complementarlas con una capa de confianza eficiente, local y reutilizable.

Es una tecnología ya construida y en funcionamiento, desarrollada desde Mataró, que puede convertirse en una infraestructura de confianza visual sostenible para la movilidad ferroviaria.

Renfe tiene una historia de liderazgo tecnológico y social, conectando territorios, personas y oportunidades. Mataró fue el origen del primer ferrocarril de la península en 1848. Con Dragon3, esa misma ciudad puede impulsar una nueva forma de proteger la confianza en la información que sostiene la movilidad de hoy.

---

## Contacto

**Blade Corporation**
Proyecto Dragon3
Mataró
