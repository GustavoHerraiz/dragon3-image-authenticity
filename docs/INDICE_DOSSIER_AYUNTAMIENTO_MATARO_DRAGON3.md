# Índice maestro del dossier
## Propuesta de implantación de Dragon3 Desktop en el Archivo Histórico Fotográfico de Mataró

**Promotor:** Gustavo Herraiz Lahassen / Blade Corporation, proyecto empresarial en constitución  
**Ámbito:** preservación, autoría, derechos y trazabilidad de imágenes históricas  
**Destinatario:** Ayuntamiento de Mataró y servicios técnicos municipales

---

## 0. Resumen ejecutivo

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

### 1.1 El valor del Archivo Histórico Fotográfico

- Colección de imágenes como patrimonio documental de la ciudad.
- Necesidad de conservar autoría, procedencia, derechos y contexto.
- Riesgo de pérdida de metadatos durante copias, conversiones y distribución.
- Necesidad de preparar imágenes para publicación, consulta, exposiciones y cesiones.

### 1.2 El reto de la preservación digital

- Una imagen puede conservar su contenido visual y perder su contexto documental.
- Los metadatos pueden desaparecer o modificarse.
- Las copias pueden circular separadas de la información de derechos.
- El archivo necesita un procedimiento repetible y trazable, no una acción manual aislada.

## 2. Propuesta Dragon3 Desktop

### 2.1 Objetivo

Crear una copia protegida y documentada de cada imagen preparada para uso, publicación o entrega, manteniendo el archivo original separado y preservado.

### 2.2 Principio de funcionamiento

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

### 3.1 Sello de autoría y protección de Desktop

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

El generador actual combina varias capas:

- identificador numérico de 28 bits;
- checksum de control;
- inyección de señal en el canal azul mediante DCT por bloques 8x8;
- geometría de puntos tipo Vogel en el canal alfa y azul;
- metadatos documentales escritos con ExifTool;
- registro local del sello en SQLite.

**Fuente principal:** `dev/dragon3-desktop/src/backend/generadorMBH.js`.

### 3.3 Metadatos incorporados

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

### 4.1 Organización por proyectos

Dragon3 utiliza proyectos para organizar:

- fondos o colecciones;
- series fotográficas;
- obras;
- clientes o titulares;
- derechos y condiciones de uso;
- carpetas y subcarpetas.

### 4.2 Base de datos local

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

La aplicación puede configurarse para:

- conservar los originales en una carpeta separada;
- mover automáticamente el original después del sellado;
- evitar que un original se procese de nuevo;
- mantener una copia protegida para distribución o consulta.

La política definitiva del Ayuntamiento debe fijarse antes del piloto.

## 5. Informes y documentación de cada entrega

### 5.1 Informe PDF de proyecto

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

Cada lote de imágenes podría generar:

1. carpeta de originales preservados;
2. carpeta de copias protegidas;
3. base local de registros;
4. informe PDF de proyecto;
5. relación de derechos y condiciones de uso.

## 6. Modos de uso

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

El Ayuntamiento puede indicar a Dragon3 cuál es la carpeta que contiene la colección fotográfica. El sistema la procesa en segundo plano mediante la hot folder, protege progresivamente las imágenes y mantiene los originales separados.

Cuando llega una solicitud posterior, el archivero solo tiene que localizar y entregar la copia ya sellada.

Este modo convierte el fondo histórico en un archivo preparado para distribución, con las imágenes protegidas antes de que sean solicitadas. El procesamiento puede comenzar por una colección piloto y ampliarse por fases hasta cubrir todo el archivo.

### 6.6 Estrategia recomendada

Se propone comenzar con el sellado bajo demanda o con una colección limitada mediante procesamiento por lotes. Tras validar el flujo, los derechos, los tiempos y la aceptación del personal, se puede activar el sellado preventivo progresivo del resto del archivo.

Las dos modalidades utilizan la misma aplicación, la misma base local de registros y el mismo mecanismo de protección; cambia únicamente el momento en que se procesa la imagen.

## 7. Experiencia de usuario y operación residente

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

### 8.1 Qué aporta Dragon3

Dragon3 no sustituye la titularidad jurídica de la colección. Aporta una capa técnica para registrar y transportar junto a cada copia:

- quién declara la autoría o titularidad;
- qué derechos se aplican;
- qué obra o colección corresponde;
- qué identificador tiene la imagen;
- qué fecha y proceso de protección se utilizaron.

### 8.2 Uso institucional

El Ayuntamiento conservaría el control de:

- las imágenes;
- la base de registros;
- las políticas de derechos;
- las carpetas de originales;
- los informes generados.

## 9. Privacidad y soberanía de datos

- Procesamiento local en el ordenador del archivo.
- SQLite local, sin obligación de subir las imágenes a una nube.
- ExifTool y Sharp integrados en el producto.
- Posibilidad de trabajar sin conexión externa.
- Control municipal sobre copias, metadatos y retención.
- Separación entre original, copia protegida e informe.

## 10. Propuesta de piloto municipal

### Fase 1: preparación

- seleccionar una colección limitada;
- definir política de originales;
- definir derechos y metadatos por defecto;
- configurar un ordenador del archivo;
- crear el primer proyecto Dragon3.

### Fase 2: prueba controlada

- procesar un lote representativo;
- revisar tiempos y errores;
- comprobar metadatos;
- verificar copias protegidas;
- generar informe PDF;
- recoger observaciones del personal técnico.

### Fase 3: ampliación

- ampliar a nuevas colecciones;
- integrar la hot folder con el proceso de digitalización;
- establecer una política de nombres, carpetas y versiones;
- definir copias de seguridad;
- formar a los usuarios.

### Fase 4: evaluación

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

- Protección de un patrimonio visual municipal.
- Mejora de la trazabilidad de imágenes históricas.
- Conservación de derechos y condiciones de uso.
- Menor dependencia de plataformas externas.
- Digitalización con un flujo automatizado y documentado.
- Aplicación local de una tecnología desarrollada en Mataró.
- Caso demostrador de Smart City y soberanía tecnológica.
- Posibilidad de extender el sistema a patrimonio, comunicación, urbanismo y otras áreas municipales.

## 12. Modelo de implantación

### 12.1 Primera instalación

- un ordenador autorizado;
- Dragon3 Desktop;
- almacenamiento local configurado;
- carpeta de entrada y salida;
- política de copias de seguridad;
- colección piloto.

### 12.2 Escalado

- más puestos de digitalización;
- proyectos por colección;
- procesamiento por lotes;
- informes periódicos;
- integración futura con gestores documentales o repositorios municipales.

## 13. Seguridad operativa

- acceso restringido al ordenador del archivo;
- copias de seguridad independientes;
- separación de originales y derivados;
- protección de la base SQLite;
- control de permisos de carpetas;
- registro de operaciones;
- política de actualización y recuperación.

## 14. Límites y decisiones a cerrar con el Ayuntamiento

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

Este apartado se completará tras conocer:

- volumen aproximado de imágenes;
- número de usuarios;
- número de puestos de digitalización;
- necesidades de instalación y soporte;
- duración del piloto;
- modalidad de licencia institucional;
- necesidades de integración y copias de seguridad.

## 16. Evidencias técnicas anexas

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

Dragon3 Desktop permite que el Archivo Histórico Fotográfico de Mataró continúe trabajando con sus imágenes y sus carpetas habituales, incorporando automáticamente una capa de protección, derechos y trazabilidad.

La propuesta no exige trasladar el archivo a una nube externa ni sustituir su forma de trabajo. Añade una capacidad nueva y controlable sobre la infraestructura existente: cada imagen preparada para su uso puede salir protegida, identificada y acompañada de documentación verificable.
