# Dragon3 Desktop
## Propuesta de protección y trazabilidad para el Archivo Histórico Fotográfico de Mataró

**Promotor:** Gustavo Herraiz Lahassen  
**Proyecto empresarial:** Blade Corporation, actualmente en constitución  
**Destinatario:** Ayuntamiento de Mataró y servicios técnicos municipales  
**Versión de trabajo:** 15 de septiembre de 2026

> Este documento presenta una propuesta de servicio municipal. Dragon3 Desktop y su tecnología aparecen como medios para mejorar la conservación, preparación y entrega de imágenes del Archivo Histórico Fotográfico.

---

## 0. Resumen ejecutivo

El Archivo Histórico Fotográfico de Mataró conserva un patrimonio visual con valor documental, cultural e institucional. Sus imágenes pueden ser solicitadas por medios de comunicación, investigadores, estudiantes, entidades culturales y ciudadanía. Cada solicitud implica localizar una imagen, comprobar sus condiciones de uso, preparar una copia y entregarla sin perder su procedencia ni la información sobre derechos.

Dragon3 Desktop propone convertir ese proceso en un servicio municipal de imágenes protegidas y trazables.

La aplicación se instala en un ordenador autorizado del archivo y puede trabajar de dos maneras:

- **Sellado bajo demanda:** cuando llega una solicitud, el archivero selecciona la imagen y Dragon3 genera una copia protegida para entregar.
- **Sellado preventivo:** el Ayuntamiento configura la carpeta de una colección y Dragon3 procesa progresivamente sus imágenes en segundo plano. Cuando llega una solicitud posterior, el personal entrega la copia ya preparada.

En ambos casos, la copia protegida queda relacionada con un identificador, la colección, la autoría o titularidad declarada, los derechos y el registro local del archivo. La conservación separada del original será una política obligatoria del piloto y deberá configurarse y validarse expresamente.

La propuesta no exige trasladar las imágenes a una nube externa ni sustituir el flujo de trabajo del personal. Añade una capacidad de protección, documentación y recuperación sobre la infraestructura existente.

El piloto permitiría validar el servicio con una colección limitada, medir tiempos y errores, comprobar el funcionamiento con el personal del archivo y decidir si Mataró quiere ampliar progresivamente la protección al resto de su fondo fotográfico.

---

## 1. Contexto institucional y necesidad

### 1.1. El Archivo Histórico Fotográfico como patrimonio público

El Archivo Histórico Fotográfico no es únicamente un conjunto de archivos digitales. Es una memoria visual de Mataró y una fuente para la investigación, la educación, la comunicación pública, las exposiciones y la actividad cultural.

Cuando una imagen sale del archivo, puede circular en distintos contextos y ser copiada o convertida a otros formatos. Por ello, junto con la imagen debe conservarse la información que permite entenderla y utilizarla correctamente:

- procedencia y colección;
- autoría o titularidad conocida;
- fecha o contexto documental;
- condiciones de reproducción;
- identificador de la copia entregada;
- relación con el registro municipal correspondiente.

Dragon3 no sustituye la catalogación archivística ni decide los derechos jurídicos de una fotografía. Aporta una capa técnica que ayuda a que la copia destinada a salir del archivo no pierda su contexto operativo.

### 1.2. El problema de las copias derivadas

El archivo puede tener una imagen correctamente conservada y, al mismo tiempo, perder control sobre una copia que se entrega o publica. Los metadatos pueden desaparecer, el nombre del archivo puede cambiar y la imagen puede separarse de la información que acompañaba al original.

El problema municipal no es solo proteger el archivo frente a una alteración. También es poder responder de forma repetible a preguntas sencillas:

- ¿qué imagen se entregó?
- ¿de qué colección procedía?
- ¿qué derechos se comunicaron?
- ¿cuándo se preparó la copia?
- ¿qué registro permite volver a localizarla?

Dragon3 propone que estas respuestas formen parte del proceso ordinario de entrega, sin obligar al personal a realizar una investigación manual cada vez que recibe una petición.

### 1.3. Encaje con una Smart City

Una ciudad inteligente no consiste únicamente en instalar sensores o acumular datos. También consiste en gestionar mejor los activos públicos, conservar el patrimonio, facilitar servicios y mantener el control sobre la información municipal.

En ese marco, Dragon3 Desktop puede convertir el Archivo Histórico Fotográfico en un servicio digital más preparado para la ciudadanía:

- las imágenes solicitadas pueden salir ya identificadas y protegidas;
- los derechos y condiciones pueden acompañar al proceso;
- la gestión puede realizarse localmente;
- el Ayuntamiento conserva el control de imágenes y registros;
- la solución puede ampliarse posteriormente a otros fondos documentales o áreas municipales.

El proyecto conecta patrimonio, servicio público, innovación local y soberanía tecnológica.

---

## 2. Propuesta Dragon3 Desktop

### 2.1. Objetivo del servicio

El objetivo es que el Ayuntamiento pueda entregar imágenes del Archivo Histórico Fotográfico con una protección y una trazabilidad coherentes, independientemente de que la imagen se procese en el momento de una solicitud o con anterioridad.

La copia protegida debe conservar una relación clara con:

- el proyecto o colección;
- la institución responsable;
- la autoría o titularidad declarada;
- los derechos y condiciones de uso;
- el identificador técnico del sello;
- el registro local del archivo.

El original maestro no se sustituye. Dragon3 trabaja sobre copias destinadas a uso, consulta, publicación o entrega.

### 2.2. Una aplicación para dos momentos del archivo

Dragon3 Desktop permite trabajar en dos momentos distintos:

**Antes de recibir una solicitud:** el archivo procesa una colección o una carpeta en segundo plano y deja preparadas las copias protegidas.

**Después de recibir una solicitud:** el archivero selecciona una imagen concreta y genera su copia protegida antes de enviarla.

Esto permite empezar de forma prudente. El Ayuntamiento no tiene que decidir de entrada si debe procesar todo su archivo: puede probar una colección, medir el resultado y escoger después el ritmo de ampliación.

### 2.3. Funcionamiento para el personal

La aplicación puede funcionar como residente en el ordenador autorizado del archivo. El personal puede continuar utilizando sus carpetas y procedimientos habituales:

1. se configura una carpeta de entrada o de proyectos;
2. Dragon3 espera a que la copia de la imagen termine de escribirse;
3. detecta los formatos compatibles;
4. crea o utiliza el proyecto correspondiente;
5. genera la copia protegida;
6. registra sus datos y derechos;
7. genera la copia protegida en la ruta de salida configurada;
8. conserva o mueve el original según la política acordada;
9. muestra una notificación y deja la operación trazable.

La fuente principal de esta descripción es el flujo implementado en `main.js`, especialmente el watcher recursivo, el modo automático, la gestión de originales y las notificaciones. El watcher espera a que los archivos terminen de escribirse y está configurado para ignorar los archivos iniciales ya existentes; por eso, el fondo histórico existente se procesará mediante lotes o una incorporación controlada, mientras que las nuevas imágenes podrán sellarse automáticamente. La propuesta municipal deberá adaptar los nombres de carpetas, metadatos y política de conservación a las decisiones del Ayuntamiento.

---

## 3. Qué se sella y qué significa

### 3.1. Sello de autoría y protección institucional

En el contexto del Archivo Histórico Fotográfico, el sello de Desktop debe entenderse como un identificador de protección y trazabilidad de la copia entregada. Relaciona la imagen con el proyecto, la colección, la institución, los derechos y el registro local.

No sustituye un contrato de cesión, una resolución administrativa ni una declaración jurídica de autoría. Su función es que la información institucional viaje con la copia y pueda contrastarse posteriormente.

### 3.2. Capas técnicas del sellado

El generador de Desktop trabaja sobre los píxeles de la imagen y sobre sus metadatos. En la implementación actual, la salida se genera como PNG para conservar las capas de señal y geometría:

- calcula un identificador a partir del registro del proyecto;
- incorpora un checksum para validar la lectura de la señal embebida;
- modifica señales del canal azul mediante bloques DCT de 8x8;
- añade una geometría de puntos tipo Vogel en posiciones calculadas;
- escribe metadatos documentales mediante ExifTool;
- guarda el vínculo entre el identificador, el proyecto y los derechos en SQLite.

Esta combinación permite que la verificación no dependa únicamente del nombre del archivo o de un campo de metadatos que podría desaparecer durante una conversión. El comportamiento frente a conversiones, recortes o recomprensiones debe validarse con los formatos concretos que utilice el archivo.

### 3.3. Datos documentales de la copia

Para el piloto municipal se propondrá una plantilla de metadatos que incluya, como mínimo:

- identificador Dragon3;
- nombre del archivo o referencia de catálogo;
- fondo, colección o serie;
- autor o titularidad conocida;
- título o descripción;
- derechos y condiciones de reproducción;
- institución responsable;
- fecha de protección;
- referencia al proyecto local.

La implementación conserva un conjunto filtrado de metadatos técnicos permitidos y añade los campos documentales del sello. Los campos definitivos se acordarán con el personal del archivo y se probarán con una colección representativa.

### 3.4. Verificación posterior

Cuando el Ayuntamiento necesite comprobar una copia, Dragon3 puede leer los metadatos, buscar la señal embebida, validar el identificador y consultar el registro local.

El resultado puede indicar si:

- la copia corresponde a un sello registrado;
- los metadatos coinciden con la señal de la imagen;
- los metadatos han sido eliminados;
- existe una discrepancia que requiere revisión;
- la copia puede relacionarse con un proyecto o colección.

La verificación aporta evidencia técnica y trazabilidad; la valoración jurídica final seguirá correspondiendo al Ayuntamiento y a la normativa aplicable.

### 3.5. Arquitectura técnica del proceso

Desktop separa la interfaz de usuario, el proceso principal de Electron y los módulos de backend que trabajan con imágenes, base de datos y generación de informes. El flujo no requiere un servidor remoto para sellar una imagen:

```text
Electron residente
	|
	+--> watcher de carpetas
	+--> generador de sello
	+--> analizador local V5/V6
	+--> SQLite local
	+--> ExifTool y Sharp
	+--> informe PDF
```

La base de datos utiliza SQLite en una ruta local del usuario y funciona con modo WAL. Las tablas principales separan proyectos, sellos, configuración y licencia. La arquitectura permite empezar en un único puesto del archivo y añadir después procedimientos de copia, puestos adicionales o integración con sistemas municipales.

La aplicación actual es un MVP de escritorio para Windows/Electron; la adaptación institucional deberá validar el sistema operativo del puesto municipal, las rutas de ExifTool, las políticas antivirus, los permisos de carpeta y el procedimiento de backup.

### 3.6. Alcance actual y adaptación institucional

El sellado, la hot folder, la base local, el procesamiento por lotes, la verificación y la generación de informes forman parte del producto Desktop. Para un archivo municipal será necesario adaptar la configuración y el modelo de operación:

- sustituir los valores de demostración por la identidad y políticas del Ayuntamiento;
- definir una licencia institucional sin límites de prueba;
- configurar los derechos y metadatos del Archivo Histórico Fotográfico;
- establecer una política explícita de originales, derivados y copias de seguridad;
- validar los informes y el tratamiento de lotes con una colección real;
- preparar soporte, actualización y recuperación del puesto.

Estas tareas no requieren cambiar el principio técnico del producto. Son la fase de configuración, endurecimiento y validación necesaria para pasar de una aplicación preparada para profesionales a una instalación institucional.

---

## Fuentes de información utilizadas para estos primeros puntos

- `dev/dragon3-desktop/main.js`: watcher, hot folder, modos automático/manual, originales y notificaciones.
- `dev/dragon3-desktop/src/backend/generadorMBH.js`: generación del identificador, DCT, geometría, metadatos y persistencia.
- `dev/dragon3-desktop/src/backend/analizador_v5.js`: lectura de metadatos, análisis de señal y comprobación de integridad.
- `dev/dragon3-desktop/src/backend/analizador_v6.js`: análisis rápido y lectura robusta de metadatos.
- `dev/dragon3-desktop/src/backend/database.js`: estructura SQLite de proyectos, sellos, derechos y configuración.
- `dev/dragon3-desktop/src/backend/reportePDF.js`: informes de proyecto y listado de imágenes protegidas.
- `docs/INDICE_DOSSIER_AYUNTAMIENTO_MATARO_DRAGON3.md`: alcance, piloto y decisiones municipales.

---

## 4. Gestión del Archivo Histórico Fotográfico

Dragon3 Desktop organiza el trabajo mediante proyectos y carpetas. Para el Ayuntamiento, cada proyecto puede representar un fondo, una colección, una serie o una campaña de digitalización.

El registro local puede asociar cada imagen protegida con:

- la colección o serie;
- la descripción de la obra;
- el autor o titular conocido;
- las condiciones de reproducción;
- un email de contacto;
- el identificador de la copia.

La base local SQLite no pretende reemplazar el sistema archivístico municipal. Su función es mantener el índice operativo de las protecciones realizadas y permitir que el personal recupere el vínculo entre imagen, proyecto y derechos.

La política recomendada para el piloto es conservar tres elementos separados:

1. el original maestro;
2. la copia protegida para uso o entrega;
3. el registro o informe que documenta la operación.

## 5. Informes y documentación

Dragon3 Desktop puede generar documentación asociada a un proyecto y a sus imágenes. Para el Archivo Histórico Fotográfico, el informe serviría como resumen de una colección procesada o de un conjunto de imágenes entregadas.

El informe puede incluir:

- institución responsable;
- nombre y descripción del proyecto;
- número de imágenes procesadas;
- identificadores de los sellos;
- colección y obra;
- derechos y condiciones de uso;
- fechas de registro;
- firma o identificación del titular.

Para una petición individual, el Ayuntamiento podría conservar la imagen protegida junto con una ficha o informe que documente qué copia fue preparada y bajo qué condiciones se entregó.

## 6. Dos modalidades de operación

### 6.1. Sellado bajo demanda

Cuando un medio de comunicación, investigador, estudiante o ciudadano solicite una fotografía, el archivero localizará el original y solicitará la generación de una copia protegida.

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
Entrega de imagen e información de derechos
```

Es la modalidad más sencilla para comenzar: permite probar el servicio con pocas imágenes y comprobar el tiempo de respuesta, la calidad de los metadatos y la utilidad del informe.

### 6.2. Sellado preventivo en segundo plano

El Ayuntamiento puede configurar una carpeta autorizada que contenga una colección o parte del archivo. Dragon3 Desktop procesa automáticamente los archivos nuevos que llegan a la hot folder. Para una colección que ya existe antes de activar el watcher, se utilizará el procesamiento por lotes o una incorporación controlada; así se evitan reprocesados y se mantiene el control del volumen.

Las imágenes protegidas se generan sin modificar los originales. Cuando llegue una solicitud posterior, el archivero podrá buscar directamente la copia preparada y entregarla con su identificador y sus derechos asociados.

### 6.3. Procesamiento por lotes

Para una colección ya existente, Desktop dispone de procesamiento por lotes con progreso, estimación de tiempo, registro de éxitos y fallos y posibilidad de cancelación. Esto permite comenzar con una muestra, pausar el trabajo y continuar por fases.

### 6.4. Estrategia municipal recomendada

La propuesta inicial es:

1. seleccionar una colección piloto;
2. procesar un lote limitado;
3. probar una solicitud real bajo demanda;
4. evaluar el flujo con el personal;
5. activar después el sellado preventivo de nuevas colecciones.

Así el Ayuntamiento obtiene valor desde el primer piloto sin comprometer de entrada todo el archivo.

## 7. Experiencia de usuario y operación residente

Desktop está diseñado para que el personal no tenga que aprender un procedimiento técnico complejo. La aplicación puede iniciarse con el sistema, permanecer en la bandeja y mostrar notificaciones cuando termina una operación.

La configuración permite definir:

- carpeta de proyectos;
- carpeta de entrada;
- nombre de la institución;
- web y email de contacto;
- logotipo;
- derechos por defecto;
- modo automático o manual;
- tratamiento de originales;
- colecciones y subcarpetas.

La interfaz permite consultar proyectos, archivos, imágenes pendientes, lotes y resultados. Para el piloto se definirán perfiles de uso sencillos y una guía operativa para el personal autorizado.

## 8. Derechos, privacidad y soberanía

Dragon3 no determina por sí mismo quién es legalmente titular de una fotografía. El Ayuntamiento seguirá siendo responsable de decidir qué derechos declara y qué condiciones aplica a cada colección o entrega.

Dragon3 aporta una capa técnica para que esa información no quede separada de la copia protegida:

- el registro local conserva los derechos declarados;
- los metadatos pueden acompañar a la imagen;
- el identificador permite relacionarla con su proyecto;
- el informe documenta el conjunto procesado.

El procesamiento se realiza localmente en el ordenador autorizado del archivo. Las imágenes no necesitan enviarse a una nube externa. El Ayuntamiento conserva el control sobre originales, copias protegidas, base de datos, permisos y políticas de retención.

## 9. Propuesta de piloto municipal

### Fase 1: preparación

- seleccionar una colección limitada y representativa;
- acordar los campos documentales y derechos por defecto;
- definir carpetas de originales y copias protegidas;
- configurar un ordenador autorizado;
- establecer copias de seguridad;
- formar al personal que participará.

### Fase 2: prueba controlada

- procesar un lote representativo;
- comprobar que no se modifican los originales;
- verificar metadatos e identificadores;
- generar un informe PDF;
- simular una petición externa;
- entregar una copia protegida de prueba.

### Fase 3: ampliación progresiva

- incorporar nuevas colecciones;
- activar la hot folder para nuevas digitalizaciones;
- utilizar procesamiento por lotes para fondos existentes;
- establecer una política uniforme de nombres y derechos.

### Fase 4: evaluación

Se medirán:

- imágenes protegidas;
- tiempo medio por imagen;
- errores y reintentos;
- integridad de originales;
- completitud de metadatos;
- informes generados;
- tiempo de respuesta a solicitudes;
- aceptación del personal.

## 10. Beneficios para Mataró y encaje Smart City

Dragon3 convertiría una función municipal existente, la entrega de imágenes del archivo, en un servicio digital más seguro, trazable y preparado para el futuro.

Los beneficios serían:

- protección del patrimonio visual municipal;
- mejor servicio a medios, investigadores, estudiantes y ciudadanía;
- conservación de derechos y procedencia;
- reducción de tareas manuales repetitivas;
- procesamiento local y soberanía sobre los datos;
- reutilización de la infraestructura informática existente;
- posibilidad de extender el modelo a patrimonio, comunicación, urbanismo y otros fondos documentales.

La propuesta encaja con una Smart City entendida no solo como una ciudad sensorizada, sino como una administración que gestiona mejor sus activos, conserva su memoria, protege sus datos y ofrece servicios públicos más inteligentes.

## 11. Implantación y escalado

La primera instalación puede realizarse en un único ordenador autorizado, con una colección piloto y una política clara de copias de seguridad. No es necesario desplegar una infraestructura compleja para empezar.

Después, el servicio puede crecer por:

- colecciones;
- puestos de digitalización;
- usuarios autorizados;
- procesamiento por lotes;
- informes periódicos;
- integración futura con gestores documentales municipales.

## 12. Seguridad operativa

Antes del piloto se definirán:

- permisos de acceso a carpetas;
- usuarios autorizados;
- copias de seguridad y recuperación;
- separación entre originales y derivados;
- protección de la base local;
- política de actualizaciones;
- procedimiento ante error o interrupción;
- retención de informes y registros.

## 13. Decisiones que debe cerrar el Ayuntamiento

El piloto permitirá acordar con los responsables municipales:

- colección inicial;
- formatos maestros y derivados;
- política de nombres y carpetas;
- metadatos obligatorios;
- titulares y textos de derechos;
- ubicación de la base de datos;
- frecuencia de copias de seguridad;
- usuarios autorizados;
- modalidad bajo demanda o preventiva;
- volumen y duración del piloto;
- necesidades de integración futura.

## 14. Propuesta económica

La propuesta económica se concretará después de conocer el volumen de imágenes, los usuarios, los puestos de digitalización, la duración del piloto, el soporte necesario y la integración con los sistemas municipales.

Se separarán claramente:

- instalación y configuración;
- licencia institucional;
- formación;
- soporte y mantenimiento;
- almacenamiento y copias de seguridad;
- procesamiento inicial por lotes;
- integraciones opcionales.

## 15. Evidencias técnicas anexas

El dossier se completará con:

- capturas de Desktop;
- ejemplo de imagen original y copia protegida;
- metadatos antes y después;
- prueba de verificación;
- informe PDF generado;
- registro de un lote;
- demostración de hot folder;
- manual de usuario;
- manual de instalación;
- explicación técnica resumida del generador y analizador.

## 16. Cierre de la propuesta

Dragon3 Desktop permitiría que las imágenes que salen del Archivo Histórico Fotográfico de Mataró salgan preparadas, identificadas y vinculadas a su procedencia y sus derechos.

El Ayuntamiento podría comenzar con una colección limitada o con el sellado bajo demanda y ampliar después al resto del archivo. La propuesta es reversible, local, progresiva y compatible con el trabajo actual del personal.

La tecnología no es el fin de la propuesta. Es el medio para que Mataró gestione mejor su patrimonio fotográfico y lo ponga a disposición de la ciudadanía con más control, más trazabilidad y más confianza.
