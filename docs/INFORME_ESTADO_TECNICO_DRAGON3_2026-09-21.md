# Informe de estado técnico de Dragon3 Desktop

**Fecha de referencia:** 21 de septiembre de 2026  
**Commit de referencia:** `d9d501b`  
**Rama:** `main`  
**Proyecto:** Dragon3 Desktop  
**Estado:** implementación funcional validada; pendiente de ampliar la validación con fotografías reales y corpus externos.

## 1. Resumen ejecutivo

Dragon3 Desktop implementa un sistema local de protección y trazabilidad de imágenes basado en varias capas complementarias:

1. **Señal embebida en píxeles:** payload de 32 bits distribuido en el canal azul mediante diferencias entre coeficientes DCT de bloques de 8x8.
2. **Redundancia bit/sombra:** cada bit se acompaña de su complemento, formando una secuencia de 64 posiciones.
3. **Señal geométrica:** patrón Vogel en los bits menos significativos del canal alfa y del canal azul.
4. **Metadatos documentales:** identificador, autoría, obra, derechos y otros campos se escriben mediante ExifTool.
5. **Registro local:** SQLite relaciona el identificador con proyecto, colección, derechos y titularidad declarada.
6. **Detección escalonada:** el analizador V6 intenta primero la lectura exacta; después explora offsets, escalas, rotaciones, espejos y variantes JPEG; finalmente puede usar una comparación parcial contra candidatos registrados y el fallback V5.

La batería actual demuestra robustez frente a una matriz amplia de transformaciones sintéticas. El resultado de referencia es:

- **18/18 pruebas obligatorias superadas.**
- **42/42 ataques exploratorios detectados.**
- **Imagen limpia rechazada.**
- **0 falsos positivos observados en la batería.**

Este resultado demuestra una capacidad técnica fuerte del prototipo, pero no equivale todavía a una certificación universal de robustez. La siguiente fase debe utilizar fotografías reales, distintas resoluciones, cámaras, texturas, perfiles de color, recortes no controlados y cadenas de edición de terceros.

## 2. Componentes de referencia

### Generador

[generadorMBH.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/generadorMBH.js)

Es el generador integrado en la aplicación Desktop. Recibe una imagen, un identificador y metadatos documentales; produce una copia PNG protegida y registra la operación.

### Analizador V6

[analizador_v6.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/analizador_v6.js)

Es el detector principal. Extrae la señal DCT del canal azul, valida el payload, consulta SQLite y realiza búsquedas adicionales cuando la imagen ha sido transformada.

### Motor espacial

[MotorEspacial.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/MotorEspacial.js)

Calcula el centro dependiente de dimensiones, identificador y clave de configuración, y genera la espiral geométrica.

### Registro local

[database.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/database.js)

Gestiona SQLite, proyectos, sellos, configuración, licencias y la enumeración de candidatos que puede utilizar la detección parcial.

### Batería de robustez

[test_robustez_sello.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/tests/test_robustez_sello.js)

Genera el sello, aplica transformaciones y comprueba que el identificador recuperado coincide con el esperado.

### Experimento de detección parcial

[test_deteccion_parcial.js](../prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/tests/test_deteccion_parcial.js)

Comprueba que, ante una señal degradada, el identificador correcto puede quedar por delante de otros candidatos mediante una puntuación ponderada.

## 3. Generación del identificador

El generador trabaja con un identificador numérico limitado a 28 bits:

```text
BITS_ID = 28
BITS_CHK = 4
PAYLOAD = (ID << 4) | CHECKSUM
```

El identificador visible/documental se representa normalmente con siete dígitos hexadecimales después del prefijo institucional:

```text
TST_0012345
```

El checksum se calcula separando el identificador en dos grupos de 14 bits:

```text
L = ID & 0x3FFF
H = (ID >> 14) & 0x3FFF
X = L ^ H
V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF
CHECKSUM = V & 0x0F
```

El checksum no es una firma criptográfica. Su función es detectar lecturas incorrectas del payload y descartar candidatos incompatibles.

## 4. Señal DCT del canal azul

La imagen se convierte a buffer RGBA y el generador recorre el canal azul en bloques de 8x8 píxeles.

Para cada bloque:

1. centra los valores alrededor de 128;
2. calcula la DCT 8x8;
3. lee los coeficientes `(1,1)` y `(2,2)`;
4. calcula su media;
5. los separa en sentidos opuestos según el bit que se codifica;
6. reconstruye el bloque mediante la IDCT;
7. escribe el resultado en el canal azul.

La señal lógica utilizada por el analizador es:

```text
DIFERENCIA = DCT(1,1) - DCT(2,2)
```

El generador codifica una secuencia de 64 posiciones:

```text
bit, complemento, bit, complemento, ...
```

La secuencia de 32 bits se repite espacialmente por los bloques de la imagen. La posición inicial de cada fila se reinicia, lo que introduce redundancia por filas y ayuda ante determinados recortes.

El V6 no necesita construir siempre la matriz DCT completa: calcula directamente la diferencia relevante de los coeficientes `(1,1)` y `(2,2)`. Esto reduce el coste de la búsqueda.

## 5. Señal geométrica alfa/Vogel

Antes de escribir la geometría, el generador limpia el bit menos significativo del alfa:

```text
alpha = alpha & 0xFE
```

Después obtiene el hash limpio del identificador y calcula el centro mediante:

```text
SHA-256(ancho + alto + clave + id)
```

El centro queda dentro de una zona segura con márgenes del 20% de la imagen. Desde ese centro se generan ocho vueltas con doce puntos por vuelta y crecimiento radial progresivo.

Cada punto válido marca:

```text
alpha = alpha | 1
blue  = blue  | 1
```

En una imagen de 1920x1080 se obtienen normalmente 72 puntos únicos para la espiral. Esta capa sirve principalmente como confirmación de procedencia/originalidad en PNG, mientras que la señal DCT sirve para recuperar identidad y payload.

El patrón alfa no debe considerarse una firma inalterable después de exportar a JPEG u otros formatos sin transparencia. En esos casos puede desaparecer aunque la señal DCT siga siendo recuperable.

## 6. Metadatos y trazabilidad

El generador:

- localiza ExifTool según el sistema operativo;
- extrae metadatos originales;
- filtra campos reutilizables;
- añade `ImageDescription`, `Copyright`, `Artist`, campos XMP y `Software`;
- escribe y verifica el resultado;
- utiliza `execFile` con argumentos separados en lugar de construir comandos shell completos.

El registro SQLite conserva la relación entre:

- identificador numérico;
- sufijo hexadecimal;
- proyecto;
- cliente o titular declarado;
- obra;
- colección;
- derechos;
- email de contacto;
- fecha y datos operativos.

Los metadatos y SQLite son capas de trazabilidad. No sustituyen una declaración jurídica de autoría ni un contrato de cesión.

## 7. Estrategia de detección V6

### Fase 1: lectura exacta

El analizador procesa primero los píxeles originales y extrae las medias DCT en la fase `(0,0)`. Valida:

- checksum;
- existencia del identificador en SQLite;
- score mínimo;
- número de parejas complementarias.

### Fase 2: offsets

Si falla la fase exacta, prueba offsets de bloque de `0` a `7` en ambos ejes. Esto permite recuperar imágenes cuyo origen de bloques ya no coincide con `(0,0)` tras ciertos recortes o reexportaciones.

### Fase 3: transformaciones

Se exploran:

- escalas directas e inversas;
- rotaciones de 0, 90, 180 y 270 grados;
- imagen original;
- imagen espejada;
- variante JPEG de radar;
- variante JPEG espejada.

### Fase 4: detección parcial

Cuando la validación exacta falla, el V6 puede comparar la señal observada con los candidatos registrados en SQLite.

La comparación:

1. calcula la diferencia observada en cada pareja bit/sombra;
2. ignora señales por debajo de un nivel mínimo;
3. genera el payload esperado de cada candidato;
4. prueba desplazamientos e inversión de polaridad;
5. calcula acuerdo ponderado por fuerza de señal;
6. exige suficientes parejas conocidas;
7. exige una puntuación mínima;
8. exige una ventaja clara frente al segundo candidato.

Esta fase se ejecuta también durante la búsqueda de escalas y rotaciones. Los candidatos SQLite se cargan una vez y se reutilizan, evitando una consulta por bloque o por transformación.

### Fase 5: fallback V5

Si V6 no encuentra una coincidencia y queda tiempo disponible, se activa el analizador V5 como fallback.

## 8. Estados semánticos de la detección

El resultado actual distingue funcionalmente entre:

- imagen identificada y registrada;
- copia con sello recuperado pero metadatos ausentes;
- copia transformada o derivada;
- imagen no identificada;
- imagen limpia.

La detección parcial solo acepta candidatos registrados porque su objetivo es recuperar la identidad dentro del universo institucional conocido. Para una futura verificación externa convendría separar explícitamente “payload técnicamente válido” de “identificador encontrado en la base local”.

## 9. Resultados reproducibles

La batería se ejecuta con:

```bash
cd /opt/dragon3/prod/Dragon3/backend/scripts/Generador/dragon3-desktop
npm run test:robustez
```

La referencia actual produce:

```text
Pruebas obligatorias: 18/18
Ataques exploratorios: 42/42
Imagen limpia: rechazada
Falsos positivos observados: 0
```

También se puede ejecutar el experimento parcial:

```bash
npm run test:parcial
```

El experimento devuelve el candidato correcto por delante de candidatos cercanos. En la prueba JPEG Q20 documentada, el candidato correcto obtuvo una puntuación normalizada de `1.0` y el segundo candidato `0.7917`.

## 10. Qué demuestran y qué no demuestran los tests

Los tests demuestran que, sobre la imagen sintética texturada utilizada, el sistema recupera el identificador después de las transformaciones incluidas en la batería.

No demuestran todavía:

- robustez universal ante cualquier JPEG Q10 real;
- resistencia ante todas las aplicaciones de edición;
- resistencia ante recortes arbitrarios que eliminen la redundancia suficiente;
- resistencia ante una reimpresión o captura de pantalla;
- seguridad criptográfica del sello;
- imposibilidad de ingeniería inversa del ejecutable;
- validez jurídica automática de la titularidad.

## 11. Riesgos técnicos pendientes

### Corpus limitado

La batería utiliza una imagen sintética controlada. Debe ampliarse con fotografías reales:

- texturas finas;
- cielos y superficies uniformes;
- alto contraste;
- poca luz;
- ruido de cámara;
- distintas resoluciones y relaciones de aspecto;
- imágenes con y sin alfa.

### Coste de búsqueda

La detección parcial durante escalas y rotaciones mejora la cobertura, pero puede aumentar el tiempo cuando SQLite contiene muchos candidatos. Será necesario medir el coste con miles o millones de sellos y estudiar indexación por checksum, prefijo o códigos parciales.

### Umbrales

Los valores de score, parejas mínimas y margen frente al segundo candidato están calibrados inicialmente. Deben calibrarse con corpus positivos y negativos reales para controlar falsos positivos.

### Transformaciones no afines

La implementación cubre escalas, rotaciones discretas, espejos, filtros y recortes de prueba. La detección de perspectiva, deformación de lente o inclinación arbitraria requiere una fase geométrica específica.

### ExifTool

El funcionamiento multiplataforma depende de que ExifTool esté disponible y ejecutable en Windows, macOS y Linux. Si no está disponible, la imagen puede conservar la señal de píxeles pero perder la capa de metadatos.

## 12. Próxima fase recomendada

1. Conservar este commit y esta batería como baseline.
2. Crear un corpus real de fotografías de distintas características.
3. Ejecutar la matriz de ataques sobre cada fotografía.
4. Registrar score, parejas, tiempo, escala, rotación y modo de detección.
5. Medir falsos positivos con imágenes no selladas.
6. Medir rendimiento con una base SQLite grande.
7. Calibrar umbrales con datos reales.
8. Separar en la API detección, identificación y verificación de procedencia.
9. Añadir pruebas de perspectiva y deformación.
10. Solo después fijar una versión de producción del analizador.

## 13. Comandos de regresión

Validación estática:

```bash
cd /opt/dragon3
node --check prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/generadorMBH.js
node --check prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/analizador_v6.js
node --check prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/backend/database.js
git diff --check
```

Batería funcional:

```bash
cd /opt/dragon3/prod/Dragon3/backend/scripts/Generador/dragon3-desktop
npm run test:robustez
npm run test:parcial
```

## 14. Conclusión técnica

El proyecto ya no debe describirse como una simple marca de agua. La implementación actual es un sistema local de protección forense de imágenes con:

- señal redundante en frecuencia;
- señal geométrica espacial;
- metadatos documentales;
- registro local de identidad;
- análisis exacto y parcial;
- búsqueda frente a transformaciones;
- batería reproducible de robustez.

El resultado `18/18` y `42/42` es una referencia técnica muy fuerte para esta fase. La prioridad siguiente no es añadir complejidad indiscriminadamente, sino verificar que la misma robustez se mantiene sobre un corpus real y cuantificar el coste, los umbrales y los falsos positivos.
