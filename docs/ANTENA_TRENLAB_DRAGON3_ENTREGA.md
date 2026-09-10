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
2. **Dragon3 Desktop:** aplicación para fotógrafos, ya compilada, que vigila una carpeta de trabajo, sella automáticamente las imágenes terminadas y genera informes de protección.
3. **Dragon3 Edge:** arquitectura que añade una capa de sellado a cámaras ya instaladas, sin sustituirlas ni modificar su firmware.

Para el sector ferroviario, Dragon3 permite proteger imágenes de mantenimiento, inspección, seguridad e incidencias sin sustituir el parque de cámaras existente y sin enviar los datos a nubes de terceros.

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

1. **Captura:** la imagen procede de una cámara, un dispositivo móvil o una carpeta de trabajo.
2. **Análisis:** células independientes revisan metadatos, integridad, señales forenses y patrones de imagen.
3. **Explicación y registro:** el sistema conserva un identificador de correlación, las evidencias encontradas y el veredicto.
4. **Protección y verificación:** un sello se incorpora a la imagen y queda asociado a un registro para su comprobación posterior.

El resultado se expresa como evidencia técnica y nivel de confianza, no como una certeza absoluta.

---

## Green Experience: eficiencia sin sustituir el parque instalado

Dragon3 encaja en Green Experience porque plantea una modernización frugal de la movilidad: **más capacidad de confianza visual con menos sustitución de hardware**.

El impacto que Dragon3 propone validar durante la aceleración es:

- reutilización de cámaras IP ya instaladas, en lugar de sustituirlas;
- prolongación de la vida útil del equipamiento existente;
- nodos Edge de bajo consumo situados junto a la cámara;
- menor transferencia de imágenes completas hacia servicios externos;
- retención limitada y purga automática de capturas temporales;
- despliegue gradual, sin necesidad de una renovación masiva del parque;
- operación en hardware accesible, reparable y sustituible por módulos.

Este impacto se medirá con datos concretos: cámaras reutilizadas, consumo eléctrico del nodo, volumen de datos transferido y coste de sustitución evitado.

---

## Producto: Dragon3 Desktop

Dragon3 Desktop es una aplicación de escritorio ya compilada, pensada para fotógrafos profesionales, que protege su trabajo sin cambiar su forma de trabajar:

- funciona como aplicación residente y puede iniciarse con el sistema;
- vigila automáticamente la carpeta de proyectos;
- detecta cuándo una imagen está terminada y la sella sin intervención manual;
- organiza proyectos, clientes, obras y derechos;
- ofrece un modo de análisis rápido y otro forense;
- genera un informe de protección y trazabilidad para el cliente final.

El fotógrafo sigue trabajando como siempre; Dragon3 protege cada imagen en segundo plano.

---

## Producto: adaptador Edge para cámaras

Dragon3 incluye una arquitectura de adaptación que permite añadir sellado y verificación a cámaras IP ya instaladas, sin modificar su firmware ni sustituirlas:

```text
Cámara IP existente
        |
        v
Nodo Edge Dragon3
  captura el frame
  sella localmente
        |
        v
Verificación
  analiza y confirma la evidencia
```

Esta arquitectura ya ha sido probada de extremo a extremo: captura, sellado y verificación remota funcionando en conjunto. El siguiente paso de desarrollo es un adaptador físico de bajo coste, basado en una placa de tipo Raspberry Pi, que se instala junto a cada cámara existente.

Esta aproximación reduce drásticamente el coste y el impacto de la implantación: no es necesario sustituir cámaras que todavía funcionan, solo añadir una capa adaptadora eficiente junto a cada una.

---

## Aplicación al sector ferroviario

Dragon3 puede proteger la evidencia visual asociada a procesos ya existentes en el ámbito ferroviario:

- **Mantenimiento e inspección:** sellar fotografías de componentes, averías y reparaciones, asociadas a un activo, una fecha y una orden de trabajo.
- **Estaciones e infraestructura:** documentar de forma verificable el estado de instalaciones y posibles incidencias.
- **Seguridad:** conservar trazabilidad de quién capturó, selló y verificó una evidencia visual.
- **Logística:** sellar imágenes de vagones, cargas y precintos para su trazabilidad.

Dragon3 no sustituye los sistemas de visión artificial o videovigilancia que puedan existir. Aporta una capa adicional que verifica la integridad y el origen de la imagen que alimenta esos sistemas, procesada localmente y sin salir de la infraestructura de la organización.

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

## Uso previsto del apoyo del programa

| Área | Uso |
|---|---|
| Hardware | Adaptadores Edge de bajo coste y cámaras de prueba |
| Sostenibilidad | Medición de consumo, tráfico de datos y hardware reutilizado |
| Validación | Pruebas de precisión con conjuntos de datos externos |
| Integración | Conexión con procesos de mantenimiento e incidencias |
| Producto | Empaquetado, instalador y soporte |
| Piloto | Diseño y ejecución de una prueba real supervisada |

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
