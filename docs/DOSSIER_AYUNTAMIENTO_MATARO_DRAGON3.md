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

En ambos casos, el original se conserva separado y la copia protegida queda relacionada con un identificador, la colección, la autoría o titularidad declarada, los derechos y el registro local del archivo.

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
7. conserva o mueve el original según la política acordada;
8. muestra una notificación y deja la operación trazable.

La fuente principal de esta descripción es el flujo implementado en `main.js`, especialmente el watcher recursivo, el modo automático, la gestión de originales y las notificaciones. La propuesta municipal deberá adaptar los nombres de carpetas, metadatos y política de conservación a las decisiones del Ayuntamiento.

---

## 3. Qué se sella y qué significa

### 3.1. Sello de autoría y protección institucional

En el contexto del Archivo Histórico Fotográfico, el sello de Desktop debe entenderse como un identificador de protección y trazabilidad de la copia entregada. Relaciona la imagen con el proyecto, la colección, la institución, los derechos y el registro local.

No sustituye un contrato de cesión, una resolución administrativa ni una declaración jurídica de autoría. Su función es que la información institucional viaje con la copia y pueda contrastarse posteriormente.

### 3.2. Capas técnicas del sellado

El generador de Desktop trabaja sobre los píxeles de la imagen y sobre sus metadatos:

- calcula un identificador a partir del registro del proyecto;
- incorpora un checksum para detectar inconsistencias;
- modifica señales del canal azul mediante bloques DCT de 8x8;
- añade una geometría de puntos tipo Vogel en posiciones calculadas;
- escribe metadatos documentales mediante ExifTool;
- guarda el vínculo entre el identificador, el proyecto y los derechos en SQLite.

Esta combinación permite que la verificación no dependa únicamente del nombre del archivo o de un campo de metadatos que podría desaparecer durante una conversión.

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

Los campos definitivos se acordarán con el personal del archivo y se probarán con una colección representativa.

### 3.4. Verificación posterior

Cuando el Ayuntamiento necesite comprobar una copia, Dragon3 puede leer los metadatos, buscar la señal embebida, validar el identificador y consultar el registro local.

El resultado puede indicar si:

- la copia corresponde a un sello registrado;
- los metadatos coinciden con la señal de la imagen;
- los metadatos han sido eliminados;
- existe una discrepancia que requiere revisión;
- la copia puede relacionarse con un proyecto o colección.

La verificación aporta evidencia técnica y trazabilidad; la valoración jurídica final seguirá correspondiendo al Ayuntamiento y a la normativa aplicable.

---

## Fuentes de información utilizadas para estos primeros puntos

- `dev/dragon3-desktop/main.js`: watcher, hot folder, modos automático/manual, originales y notificaciones.
- `dev/dragon3-desktop/src/backend/generadorMBH.js`: generación del identificador, DCT, geometría, metadatos y persistencia.
- `dev/dragon3-desktop/src/backend/analizador_v5.js`: lectura de metadatos, análisis de señal y comprobación de integridad.
- `dev/dragon3-desktop/src/backend/analizador_v6.js`: análisis rápido y lectura robusta de metadatos.
- `dev/dragon3-desktop/src/backend/database.js`: estructura SQLite de proyectos, sellos, derechos y configuración.
- `dev/dragon3-desktop/src/backend/reportePDF.js`: informes de proyecto y listado de imágenes protegidas.
- `docs/INDICE_DOSSIER_AYUNTAMIENTO_MATARO_DRAGON3.md`: alcance, piloto y decisiones municipales.
