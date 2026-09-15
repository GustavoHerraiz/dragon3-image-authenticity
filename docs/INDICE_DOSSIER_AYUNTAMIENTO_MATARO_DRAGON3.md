# Índice maestro del dossier
## Propuesta de implantación de Dragon3 Desktop en el Archivo Histórico Fotográfico de Mataró

**Promotor:** Gustavo Herraiz Lahassen / Blade Corporation, proyecto empresarial en constitución  
**Ámbito:** preservación, autoría, derechos y trazabilidad de imágenes históricas  
**Destinatario:** Ayuntamiento de Mataró y servicios técnicos municipales

---

## 0. Resumen ejecutivo

Este capítulo debe permitir que un responsable municipal entienda la propuesta en menos de dos minutos. Presentará Dragon3 Desktop como una herramienta que protege automáticamente las imágenes del archivo antes de su consulta, publicación o entrega, sin cambiar el trabajo habitual del personal. Debe cerrar con una propuesta concreta: empezar con una colección piloto y decidir después entre sellado bajo demanda o protección progresiva de todo el fondo.

- Qué es Dragon3 Desktop.
- Qué problema resuelve en el Archivo Histórico Fotográfico.
- Qué se propone implantar.
- Beneficios para el Ayuntamiento.
- Resultado esperado del piloto.

**Fuentes:**
- [Dragon3 Desktop](../dev/dragon3-desktop/)
- [Manual de usuario](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/docs/MANUAL_USUARIO.md)
- [Dossier de candidatura Green Experience](ANTENA_TRENLAB_DRAGON3_ENTREGA.md)

## 1. Contexto institucional y necesidad

Aquí explicaremos por qué el Archivo Histórico Fotográfico necesita algo más que conservar los archivos visuales: necesita conservar también su procedencia, sus derechos y la relación con cada copia distribuida. El objetivo no es cuestionar el trabajo actual del archivo, sino mostrar una mejora práctica para reducir riesgos y facilitar la entrega de imágenes.

### 1.1 El valor del Archivo Histórico Fotográfico

La redacción debe presentar el archivo como patrimonio cultural y activo público de Mataró. Las fotografías pueden utilizarse en exposiciones, publicaciones, prensa, investigación, educación y comunicación institucional; por eso cada entrega debe mantener el vínculo con la colección, el autor o titular y las condiciones de uso.

- Colección de imágenes como patrimonio documental de la ciudad.
- Necesidad de conservar autoría, procedencia, derechos y contexto.
- Riesgo de pérdida de metadatos durante copias, conversiones y distribución.
- Necesidad de preparar imágenes para publicación, consulta, exposiciones y cesiones.

### 1.2 El reto de la preservación digital

Se describirá el problema de las copias derivadas: una imagen puede cambiar de carpeta, formato o usuario y perder sus datos documentales. Dragon3 aporta una capa operativa para que la copia destinada a salir del archivo lleve consigo un identificador, metadatos y un registro local.

- Una imagen puede conservar su contenido visual y perder su contexto documental.
- Los metadatos pueden desaparecer o modificarse.
- Las copias pueden circular separadas de la información de derechos.
- El archivo necesita un procedimiento repetible y trazable, no una acción manual aislada.

## 2. Propuesta Dragon3 Desktop

Este capítulo debe convertir el problema en una solución comprensible para personal no técnico. La idea central será: el archivero sigue trabajando con sus carpetas; Dragon3 trabaja en segundo plano y genera una copia protegida sin alterar el original.

### 2.1 Objetivo

El objetivo institucional será disponer de una copia preparada para distribución, identificable y relacionada con sus derechos. La protección no sustituye la conservación archivística ni modifica el original maestro: crea una capa adicional para el uso y la entrega.

Crear una copia protegida y documentada de cada imagen preparada para uso, publicación o entrega, manteniendo el archivo original separado y preservado.

### 2.2 Principio de funcionamiento

El diagrama mostrará el recorrido completo desde la imagen digitalizada hasta la copia protegida y su informe. Conviene acompañarlo con un ejemplo sencillo: una fotografía solicitada por un medio se entrega desde la carpeta de copias protegidas, mientras el original permanece en su ubicación de preservación.

```text
Imagen histórica o digitalizada
        |
        v
Carpeta de trabajo / hot folder
        |
        v
Dragon3 Desktop residente
        |
        +--> registro local del proyecto y derechos
        +--> sello de autoría/protección
        +--> metadatos documentales
        +--> copia protegida
        +--> informe PDF
```

### 2.3 Flujo sin interrupción

Se explicará que Dragon3 funciona como una aplicación residente y que el personal no tiene que abrirla para cada fotografía. La hot folder espera a que termine la copia del archivo, evita procesar dos veces la misma imagen y registra tanto los éxitos como los errores para que el equipo pueda revisarlos.

- El personal continúa utilizando su flujo habitual.
- Dragon3 vigila una carpeta configurada.
- Espera a que el archivo termine de copiarse.
- Detecta nuevas imágenes compatibles.
- Ignora archivos ocultos, originales y copias ya selladas.
- Genera automáticamente la versión protegida.
- Puede mover el original a una carpeta `Originales` o conservarlo según la política definida.
- Emite una notificación y registra la operación.

**Fuente principal:** `dev/dragon3-desktop/main.js`.

## 3. Qué se sella y qué significa

Este capítulo debe ser especialmente claro: el sello de Desktop es un sello de autoría, protección y trazabilidad institucional. No es una declaración automática de que la imagen fue creada por una persona; certifica que el archivo fue procesado y registrado por Dragon3 con los datos del proyecto y de los derechos declarados.

### 3.1 Sello de autoría y protección de Desktop

Se explicará qué podrá comprobar el Ayuntamiento cuando reciba una copia: el identificador, el proyecto, la colección, los derechos y el registro local asociado. También se diferenciará este sello institucional del futuro sello MBH del Engine, que requiere un análisis específico de origen humano.

El sello local de Desktop identifica la imagen dentro del sistema y la relaciona con:

- proyecto;
- cliente o institución;
- obra o colección;
- derechos;
- email de contacto;
- fecha de registro;
- identificador único.

Este sello protege la trazabilidad y los derechos declarados por el Ayuntamiento. No debe confundirse con una certificación absoluta de origen humano.

### 3.2 Tecnología del sello

La explicación técnica debe ser divulgativa y suficiente para demostrar que no se trata de una simple marca en el nombre del archivo. Dragon3 combina una señal embebida en la estructura de píxeles, una geometría de verificación y metadatos legibles. El dossier explicará qué aporta cada capa y por qué la pérdida de un metadato no elimina necesariamente toda la trazabilidad.

El generador actual combina varias capas:

- identificador numérico de 28 bits;
- checksum de control;
- inyección de señal en el canal azul mediante DCT por bloques 8x8;
- geometría de puntos tipo Vogel en el canal alfa y azul;
- metadatos documentales escritos con ExifTool;
- registro local del sello en SQLite.

**Fuente principal:** `dev/dragon3-desktop/src/backend/generadorMBH.js`.

### 3.3 Metadatos incorporados

Se incluirá una tabla con los campos que el Ayuntamiento quiera utilizar: identificador, institución, colección, título, autoría, derechos, fuente y fecha. También se definirá qué metadatos originales se conservan y cuáles se completan durante el proceso.

La implementación puede conservar o incorporar campos como:

- descripción e identificador Dragon3;
- autor o institución;
- obra;
- derechos;
- creador;
- título;
- fuente;
- software utilizado;
- metadatos técnicos originales permitidos.

**Fuente principal:** `dev/dragon3-desktop/src/backend/generadorMBH.js`.

### 3.4 Verificación posterior

Se mostrará un caso de comprobación: recibir una copia, localizar su identificador, contrastarlo con la base local y comprobar si los metadatos coinciden con el sello embebido. El lenguaje debe hablar de evidencia técnica y trazabilidad, no de una garantía jurídica absoluta.

El analizador local puede:

- leer el identificador desde metadatos;
- buscar la señal embebida en los píxeles;
- validar el checksum;
- consultar el registro local;
- detectar discrepancias entre metadatos y sello físico;
- informar de metadatos eliminados o modificados;
- comprobar la geometría Vogel en imágenes PNG protegidas.

**Fuentes:**
- `dev/dragon3-desktop/src/backend/analizador_v5.js`
- `dev/dragon3-desktop/src/backend/analizador_v6.js`
- `dev/dragon3-desktop/src/backend/MotorEspacial.js`

## 4. Gestión del Archivo Histórico Fotográfico

Este capítulo traducirá la aplicación a la organización diaria del archivo. Explicará cómo se estructuran las colecciones, cómo se evita mezclar originales y derivados y cómo se puede recuperar una imagen protegida sin depender de una búsqueda manual en todos los discos.

### 4.1 Organización por proyectos

Se propondrá una estructura de proyectos por fondo, colección, serie o campaña de digitalización. El Ayuntamiento podrá decidir si cada proyecto corresponde a una colección completa, a una fase de trabajo o a una petición concreta.

Dragon3 utiliza proyectos para organizar:

- fondos o colecciones;
- series fotográficas;
- obras;
- clientes o titulares;
- derechos y condiciones de uso;
- carpetas y subcarpetas.

### 4.2 Base de datos local

Se explicará que la base local funciona como índice de sellos y derechos, no como sustituto del sistema archivístico municipal. Debe definirse quién puede acceder a ella, dónde se guarda, cómo se copia y cómo se recupera ante una avería.

SQLite conserva localmente:

- proyectos;
- sellos;
- relaciones entre sellos y proyectos;
- derechos;
- emails de contacto;
- configuración institucional;
- contador e identificadores.

**Fuente principal:** `dev/dragon3-desktop/src/backend/database.js`.

### 4.3 Política de originales

Este punto debe cerrar una preocupación institucional: Dragon3 no debe sobrescribir ni destruir originales sin una política aprobada. La propuesta recomendada es conservar el maestro en una ubicación protegida y generar derivados sellados en una carpeta de distribución.

La aplicación puede configurarse para:

- conservar los originales en una carpeta separada;
- mover automáticamente el original después del sellado;
- evitar que un original se procese de nuevo;
- mantener una copia protegida para distribución o consulta.

La política definitiva del Ayuntamiento debe fijarse antes del piloto.

## 5. Informes y documentación de cada entrega

El dossier explicará que el valor no termina en la imagen sellada. Cada lote o proyecto puede quedar acompañado por un informe que facilite auditoría interna, cesión de derechos, preparación de exposiciones y respuesta a futuras consultas.

### 5.1 Informe PDF de proyecto

Se describirá como un resumen de la operación: cuántas imágenes se procesaron, qué proyecto las agrupa, qué derechos se declararon y qué identificadores permiten recuperar cada registro.

El sistema puede generar un informe con:

- institución o autor;
- nombre y descripción del proyecto;
- número de imágenes protegidas;
- colección;
- derechos;
- listado de identificadores;
- cliente u obra;
- fecha de creación;
- firma del titular.

**Fuente:** `dev/dragon3-desktop/src/backend/reportePDF.js`.

### 5.2 Informe forense de imagen

Se reservará para casos que requieran una comprobación más detallada de una imagen concreta. Puede documentar el resultado del análisis, la integridad de metadatos y la relación con el sello registrado.

La aplicación también dispone de una ruta de informe de análisis que puede incluir:

- identificador del sello;
- cliente y obra;
- veredicto;
- integridad legal de metadatos;
- escala y modo de detección;
- formato y dimensiones;
- fecha del análisis.

**Fuente:** `dev/dragon3-desktop/src/backend/report.js`.

### 5.3 Resultado para el Ayuntamiento

Se presentará el paquete final de cada colección o lote y se explicará qué archivos recibe el Ayuntamiento, qué conserva como maestro y qué copia entrega a terceros.

Cada lote de imágenes podría generar:

1. carpeta de originales preservados;
2. carpeta de copias protegidas;
3. base local de registros;
4. informe PDF de proyecto;
5. relación de derechos y condiciones de uso.

## 6. Modos de uso

Este capítulo debe demostrar que la solución se adapta a la capacidad real del archivo. Mataró podrá empezar con un flujo pequeño y controlado o decidir una protección progresiva de la colección, sin quedar obligado desde el primer día a procesar todo el volumen histórico.

### 6.1 Modo automático

Adecuado para una carpeta de digitalización o preparación editorial. El sistema crea o utiliza el proyecto asociado a la carpeta y sella automáticamente las imágenes nuevas.

### 6.2 Modo manual

Adecuado para validaciones puntuales, revisión de imágenes concretas o decisiones editoriales que requieran intervención del personal.

### 6.3 Sellado por lotes

Adecuado para fondos históricos ya digitalizados. Incluye:

- procesamiento secuencial;
- contador de progreso;
- tiempo estimado;
- registro de éxitos y fallos;
- cancelación del proceso.

### 6.4 Sellado bajo demanda

Se presentará como la opción de entrada más sencilla: solo se procesa una imagen cuando existe una solicitud real. Permite validar el flujo con medios, investigadores o estudiantes y medir el tiempo de respuesta sin intervenir todavía en todo el fondo.

Cuando un medio de comunicación, historiador, estudiante o ciudadano solicite una imagen, el archivero localiza el original y solicita su protección. Dragon3 genera una copia sellada para entregar, manteniendo el original preservado y separado.

Flujo:

```text
Solicitud de imagen
        |
        v
Archivero selecciona el original
        |
        v
Dragon3 genera la copia protegida
        |
        v
Entrega de imagen sellada e identificada
```

Este modo permite iniciar el proyecto con un piloto pequeño y controlado.

### 6.5 Sellado preventivo del archivo

Se explicará como una segunda etapa: Dragon3 recorre progresivamente una carpeta autorizada y deja preparadas las copias protegidas. Así el trabajo se distribuye en el tiempo y las futuras solicitudes se resuelven buscando una copia ya preparada.

El Ayuntamiento puede indicar a Dragon3 cuál es la carpeta que contiene la colección fotográfica. El sistema la procesa en segundo plano mediante la hot folder, protege progresivamente las imágenes y mantiene los originales separados.

Cuando llega una solicitud posterior, el archivero solo tiene que localizar y entregar la copia ya sellada.

Este modo convierte el fondo histórico en un archivo preparado para distribución, con las imágenes protegidas antes de que sean solicitadas. El procesamiento puede comenzar por una colección piloto y ampliarse por fases hasta cubrir todo el archivo.

### 6.6 Estrategia recomendada

La recomendación institucional será comenzar con una colección piloto, comparar ambos modos y decidir con datos. El Ayuntamiento conservará la capacidad de pausar, ampliar o limitar el procesamiento.

Se propone comenzar con el sellado bajo demanda o con una colección limitada mediante procesamiento por lotes. Tras validar el flujo, los derechos, los tiempos y la aceptación del personal, se puede activar el sellado preventivo progresivo del resto del archivo.

Las dos modalidades utilizan la misma aplicación, la misma base local de registros y el mismo mecanismo de protección; cambia únicamente el momento en que se procesa la imagen.

## 7. Experiencia de usuario y operación residente

Este capítulo mostrará que el sistema está pensado para el trabajo real del archivo, no para exigir conocimientos técnicos. Se explicará la instalación, la bandeja del sistema, las notificaciones, la configuración de carpetas y la consulta de pendientes.

- Inicio automático con el sistema.
- Icono en bandeja del sistema.
- Notificaciones de sellado correcto o fallido.
- Configuración de carpeta de proyectos.
- Configuración de autor, institución, web, email, logo y derechos.
- Consulta de proyectos y archivos.
- Gestión de subcarpetas.
- Consulta de imágenes pendientes.

**Fuentes:**
- `dev/dragon3-desktop/main.js`
- `dev/dragon3-desktop/renderer/index.html`
- `dev/dragon3-desktop/renderer/renderer.js`

## 8. Derechos y propiedad intelectual

Aquí se aclarará la relación entre el registro técnico y la titularidad jurídica. Dragon3 ayuda a transportar y comprobar la información declarada por el Ayuntamiento, pero no sustituye contratos, licencias, normativa patrimonial ni decisiones del responsable del archivo.

### 8.1 Qué aporta Dragon3

Se describirá cómo la información de derechos acompaña a la copia protegida y queda registrada junto con el proyecto. Esto reduce el riesgo de entregar una imagen sin contexto o sin las condiciones de uso conocidas.

Dragon3 no sustituye la titularidad jurídica de la colección. Aporta una capa técnica para registrar y transportar junto a cada copia:

- quién declara la autoría o titularidad;
- qué derechos se aplican;
- qué obra o colección corresponde;
- qué identificador tiene la imagen;
- qué fecha y proceso de protección se utilizaron.

### 8.2 Uso institucional

Debe quedar claro que el Ayuntamiento conserva el control del archivo, de sus imágenes, de sus políticas y de sus registros. Dragon3 sería una herramienta instalada y configurada para el servicio municipal, no una plataforma que obligue a transferir el patrimonio a un proveedor externo.

El Ayuntamiento conservaría el control de:

- las imágenes;
- la base de registros;
- las políticas de derechos;
- las carpetas de originales;
- los informes generados.

## 9. Privacidad y soberanía de datos

Este capítulo explicará dónde se ejecuta el procesamiento, quién controla la base local y qué datos salen, si alguno. Para el archivo histórico, la propuesta prioriza instalación local, permisos municipales, copias de seguridad propias y ausencia de dependencia de una nube externa.

- Procesamiento local en el ordenador del archivo.
- SQLite local, sin obligación de subir las imágenes a una nube.
- ExifTool y Sharp integrados en el producto.
- Posibilidad de trabajar sin conexión externa.
- Control municipal sobre copias, metadatos y retención.
- Separación entre original, copia protegida e informe.

## 10. Propuesta de piloto municipal

El piloto debe ser pequeño, reversible y medible. Su finalidad será comprobar que Dragon3 se integra con el procedimiento del archivo y que el personal puede usarlo sin añadir una carga administrativa desproporcionada.

### Fase 1: preparación

Se acordarán la colección, los formatos, los usuarios, los derechos, las rutas de almacenamiento, la política de originales y las copias de seguridad antes de procesar imágenes reales.

- seleccionar una colección limitada;
- definir política de originales;
- definir derechos y metadatos por defecto;
- configurar un ordenador del archivo;
- crear el primer proyecto Dragon3.

### Fase 2: prueba controlada

Se procesará un lote representativo con imágenes de distinto tamaño y procedencia. Se revisarán tiempos, errores, metadatos, copias protegidas e informes con el personal responsable.

- procesar un lote representativo;
- revisar tiempos y errores;
- comprobar metadatos;
- verificar copias protegidas;
- generar informe PDF;
- recoger observaciones del personal técnico.

### Fase 3: ampliación

Una vez validado el flujo, se ampliará a nuevas colecciones y se conectará con el procedimiento habitual de digitalización o preparación de peticiones.

- ampliar a nuevas colecciones;
- integrar la hot folder con el proceso de digitalización;
- establecer una política de nombres, carpetas y versiones;
- definir copias de seguridad;
- formar a los usuarios.

### Fase 4: evaluación

Los indicadores permitirán decidir si se continúa, qué modalidad se adopta y qué ajustes necesita la instalación institucional.

Indicadores:

- número de imágenes protegidas;
- tiempo medio por imagen;
- porcentaje de errores y reintentos;
- porcentaje de imágenes con metadatos completos;
- tiempo ahorrado al personal;
- número de informes generados;
- trazabilidad recuperable por identificador;
- aceptación del flujo por el personal del archivo.

## 11. Beneficios para Mataró

Este capítulo resumirá el retorno municipal: patrimonio mejor preparado para su difusión, derechos más claros, trabajo más repetible, menor dependencia externa y un caso visible de innovación local aplicada a Smart City.

- Protección de un patrimonio visual municipal.
- Mejora de la trazabilidad de imágenes históricas.
- Conservación de derechos y condiciones de uso.
- Menor dependencia de plataformas externas.
- Digitalización con un flujo automatizado y documentado.
- Aplicación local de una tecnología desarrollada en Mataró.
- Caso demostrador de Smart City y soberanía tecnológica.
- Posibilidad de extender el sistema a patrimonio, comunicación, urbanismo y otras áreas municipales.

## 12. Modelo de implantación

Se explicará la diferencia entre el primer puesto de trabajo, el piloto y la ampliación a varios puestos o colecciones. El modelo permite empezar con poco hardware y crecer según volumen y presupuesto.

### 12.1 Primera instalación

La primera instalación debe ser deliberadamente sencilla: un ordenador autorizado, una colección de prueba, una carpeta de entrada, una carpeta de derivados y una política de copias aprobada.

- un ordenador autorizado;
- Dragon3 Desktop;
- almacenamiento local configurado;
- carpeta de entrada y salida;
- política de copias de seguridad;
- colección piloto.

### 12.2 Escalado

El escalado se hará por colecciones y puestos de digitalización, sin obligar a migrar todo el archivo de una vez. La integración con otros sistemas se deja para una fase posterior, cuando el procedimiento básico esté validado.

- más puestos de digitalización;
- proyectos por colección;
- procesamiento por lotes;
- informes periódicos;
- integración futura con gestores documentales o repositorios municipales.

## 13. Seguridad operativa

Se detallarán las medidas necesarias para que el sistema sea mantenible: permisos, copias, separación de originales, protección de la base local, actualizaciones y recuperación. El objetivo es que el Ayuntamiento sepa cómo operar y recuperar el servicio.

- acceso restringido al ordenador del archivo;
- copias de seguridad independientes;
- separación de originales y derivados;
- protección de la base SQLite;
- control de permisos de carpetas;
- registro de operaciones;
- política de actualización y recuperación.

## 14. Límites y decisiones a cerrar con el Ayuntamiento

Este capítulo convierte las preguntas abiertas en decisiones conjuntas. No representa una carencia del producto, sino la personalización necesaria para adaptar Dragon3 a la normativa, estructura y política documental del Ayuntamiento.

- formato maestro de preservación;
- política de nombres y carpetas;
- ubicación de la base de datos;
- frecuencia de copias de seguridad;
- titulares y textos de derechos;
- usuarios autorizados;
- conservación de originales;
- licencia institucional;
- volumen inicial del piloto;
- integración futura con el sistema documental municipal.

## 15. Propuesta económica

La propuesta económica se construirá después de conocer el volumen y el alcance del piloto. Debe separar instalación inicial, licencia institucional, soporte, formación, copias de seguridad e integración opcional.

Este apartado se completará tras conocer:

- volumen aproximado de imágenes;
- número de usuarios;
- número de puestos de digitalización;
- necesidades de instalación y soporte;
- duración del piloto;
- modalidad de licencia institucional;
- necesidades de integración y copias de seguridad.

## 16. Evidencias técnicas anexas

Los anexos permitirán que el Ayuntamiento vea el sistema funcionando y compruebe el resultado sobre una imagen real: antes, después, metadatos, verificación, informe y registro del lote.

- Capturas de Dragon3 Desktop.
- Ejemplo de imagen original y copia protegida.
- Ejemplo de metadatos antes y después.
- Ejemplo de verificación.
- Ejemplo de informe PDF.
- Registro de un lote de prueba.
- Manual de instalación.
- Manual de usuario.
- Arquitectura del generador y analizador.

## 17. Fuentes del proyecto

Estas fuentes sirven para respaldar la descripción del producto y mantener trazabilidad entre el dossier y el código. En la versión entregable al Ayuntamiento se decidirá qué documentos técnicos se adjuntan y cuáles se reservan para una revisión técnica.

- [Dragon3 Desktop](../dev/dragon3-desktop/)
- [Manual técnico Desktop](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/docs/MANUAL_TECNICO.md)
- [Manual de usuario Desktop](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/docs/MANUAL_USUARIO.md)
- [Guía forense](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/docs/guias/guia_forense.md)
- [Generador MBH](../dev/dragon3-desktop/src/backend/generadorMBH.js)
- [Analizador V5](../dev/dragon3-desktop/src/backend/analizador_v5.js)
- [Analizador V6](../dev/dragon3-desktop/src/backend/analizador_v6.js)
- [Base de datos](../dev/dragon3-desktop/src/backend/database.js)
- [Generación de informes PDF](../dev/dragon3-desktop/src/backend/reportePDF.js)
- [Prototipo de cámara Edge](../dev/selladocamara/)

## 18. Resumen de la propuesta

El cierre debe dejar una decisión clara: empezar con un piloto municipal de bajo riesgo y alto valor demostrable, protegiendo primero una colección o las imágenes solicitadas y ampliando después al resto del archivo.

Dragon3 Desktop permite que el Archivo Histórico Fotográfico de Mataró continúe trabajando con sus imágenes y sus carpetas habituales, incorporando automáticamente una capa de protección, derechos y trazabilidad.

La propuesta no exige trasladar el archivo a una nube externa ni sustituir su forma de trabajo. Añade una capacidad nueva y controlable sobre la infraestructura existente: cada imagen preparada para su uso puede salir protegida, identificada y acompañada de documentación verificable.
