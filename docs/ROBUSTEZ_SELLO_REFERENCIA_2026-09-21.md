# Referencia de robustez del sello Dragon3

**Fecha:** 21 de septiembre de 2026  
**Versión:** estado previo a nuevas modificaciones del analizador V6  
**Prueba ejecutada:** `npm run test:robustez`  
**Script:** `prod/Dragon3/backend/scripts/Generador/dragon3-desktop/src/tests/test_robustez_sello.js`  
**Informe de ejecución:** `/tmp/dragon3-robustez-parcial-transformaciones.log`

**Extensión posterior:** ataques dobles y triples ejecutados el mismo día.
**Resultado de la extensión:** **15/15 detectados**, sin regresiones en las pruebas obligatorias.

## Resultado de referencia

| Medición | Resultado |
|---|---:|
| Pruebas obligatorias superadas | **18/18** |
| Ataques exploratorios detectados | **42/42** |
| Ataques dobles y triples adicionales | **15/15** |
| Imagen limpia rechazada | **Sí** |
| Falsos positivos observados | **0** |

Este documento fija el estado de referencia del generador y del analizador V6 después de integrar la detección parcial durante la búsqueda de escalas y rotaciones. Cualquier modificación posterior del analizador debe repetir esta batería y no puede reducir estos resultados sin una decisión explícita.

## Cobertura de la batería

### Compresión y formatos

- PNG original sellado
- JPEG Q100, Q95, Q90, Q85, Q80, Q75, Q70, Q65, Q60, Q55
- JPEG Q50, Q45, Q40, Q35, Q30, Q25, Q20, Q15, Q10 y Q5
- WebP Q50
- WebP Q10
- TIFF con compresión LZW
- JPEG Q70 en dos generaciones
- JPEG Q30 en dos generaciones

### Escala y geometría

- Escala 25%
- Escala 33%
- Escala 50%
- Escala 75%
- Escala 90%
- Escala 110%
- Escala 125%
- Escala 150%
- Escala 200%
- Rotación de 90 grados
- Rotación de 180 grados
- Rotación arbitraria de 15 grados
- Rotación arbitraria de 30 grados
- Espejo vertical
- Espejo horizontal

### Filtros y alteraciones

- Desenfoque sigma 0.5
- Desenfoque sigma 1.5
- Desenfoque sigma 3
- Realce de nitidez
- Mediana 3x3
- Brillo reducido
- Brillo aumentado
- Saturación reducida
- Escala de grises
- Gamma bajo
- Ruido RGB determinista

### Recortes y combinaciones

- Reexportación PNG
- Recorte central
- Recorte lateral izquierdo
- Recorte lateral derecho
- Recorte superior
- Recorte inferior
- JPEG Q30 combinado con escala 50%
- JPEG Q30 combinado con escala 75%

### Ataques dobles y triples

- JPEG Q20 y escala 125%;
- rotación y JPEG Q30;
- recorte y escala 75%;
- desenfoque y JPEG Q30;
- doble escala y WebP Q20;
- escala de grises y JPEG Q20;
- brillo y nitidez;
- recorte, escala y JPEG;
- rotación, escala y JPEG;
- espejo, escala y WebP;
- desenfoque, escala y JPEG;
- escala de grises, gamma y JPEG;
- brillo, saturación y JPEG;
- nitidez, escala y WebP;
- recorte, rotación y JPEG.

## Criterio de aceptación

La prueba se considera válida cuando se cumplen simultáneamente estas condiciones:

1. Las 18 pruebas obligatorias pasan.
2. Los 42 ataques exploratorios son detectados.
3. Los 15 ataques dobles y triples son detectados.
4. La imagen sin sello es rechazada.
5. El identificador recuperado coincide con el sello generado.
6. No se producen excepciones durante búsquedas agotadas o transformaciones extremas.

## Regla para cambios futuros

Antes de modificar de nuevo `analizador_v6.js`, ejecutar:

```bash
cd /opt/dragon3/prod/Dragon3/backend/scripts/Generador/dragon3-desktop
npm run test:robustez
```

El resultado debe compararse con esta referencia. El objetivo mínimo de no regresión es mantener **18/18**, **42/42** y el rechazo de la imagen limpia.
