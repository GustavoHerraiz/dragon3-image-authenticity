# PROTOCOLO TÉCNICO: ANALIZADOR MBH (Melero Block Hunter)
## Identificación Forense de Sellos Digitales en Rotación (Dragon3 V18)

Este documento establece la base teórica y matemática para la detección del sello de Quico Melero bajo condiciones de rotación, escala e interpolación, utilizando el análisis de relieve en el eje Z.

---

## 1. Fundamento de Análisis: El "Vaciado del Océano" (Eje Z)

El analizador MBH no busca píxeles aislados, sino la **Topografía de la Señal**.
- **Eje Z (Intensidad):** La fuerza de cada punto se trata como una altitud.
- **Reducción de Radar:** Para detectar el sello rotado, el analizador debe ignorar el "nivel del mar" (ruido de fondo) bajando el umbral de detección a $Z \approx 80-120$.
- **Conectividad:** Al bajar el umbral, las "islas de energía" revelan su conexión estructural, formando una cordillera coherente que mantiene su forma independientemente del giro.



---

## 2. Matriz de Anclaje de Tres Niveles

Para evitar la pérdida de información por volatilidad, el MBH implementa una jerarquía de tres capas de anclaje:

### Nivel 1: Anclas Periféricas (Extremos)
- **Coordenadas:** Esquinas y bordes (0,0, 7,7, 7,0, 0,7).
- **Función:** Sensores de impacto. Detectan si el sello ha saltado de bloque o si ha girado 90°/180°.
- **Volatilidad:** Alta. Son los primeros en salir de la cuadrícula en rotaciones pequeñas.

### Nivel 2: Anclas Intermedias ("Zona de Ricitos de Oro")
- **Coordenadas:** Filas y Columnas 2 a 5.
- **Función:** **Sintonía Fina y Seguimiento Orbital.** - **Por qué son vitales:** Al estar alejadas de los bordes, estas anclas "orbitan" dentro de la cuadrícula de 8x8 durante el giro sin salirse nunca. Permiten calcular el ángulo exacto mediante el desplazamiento vectorial.

### Nivel 3: Anclas Centrales (Núcleo de Identidad)
- **Coordenadas:** El centro del bloque (3,3, 4,4, 4,3, 3,4).
- **Función:** Faro de Autoría.
- **Estabilidad:** Máxima. Al tener la menor velocidad tangencial, sufren menos degradación por interpolación, preservando el ADN HEX original.

---

## 3. El Binomio de Borde: Punto 0,0 y su Escudero "Sancho"

Se establece como regla de seguridad que el punto **(0,0)** nunca se analiza solo. Se guarda en la base de datos junto a su **Punto Sancho** adyacente (ej. 0,1 o 1,0).

- **Propósito:** El "Sancho" sirve de referencia de orientación para el (0,0).
- **Lógica Forense:** Si el (0,0) está a punto de salir de la cuadrícula, la relación de ángulo entre él y su Sancho indica el vector de fuga. Si el (0,0) desaparece pero el Sancho sigue en el (0,1), el MBH puede predecir la posición del sello fuera del bloque.

---

## 4. Fórmulas de Detección de Rotación (Backtrack)

El MBH calcula la rotación aplicada por el pirata comparando la posición original en la base de datos ($P_0$) con la posición detectada en el escaneo ($P_1$).

1. **Cálculo del Radio Orbital ($R$):**
   $$R = \sqrt{x^2 + y^2}$$

2. **Cálculo del Ángulo de Fase ($\theta$):**
   $$\theta = \arctan2(y_1, x_1) - \arctan2(y_0, x_0)$$

3. **Compensación de Escala ($S$):**
   El sistema aplicará un factor corrector según el re-escalado detectado (75%, 81.25%, 87.5%) para realinear el "Papel Cebolla" sobre la montaña de energía detectada.



---

## 5. Ficha Técnica de Puntos de Anclaje Estables

| Punto Ancla | Tipo | Coordenada Base | Comportamiento Esperado |
| :--- | :--- | :--- | :--- |
| **Pico Maestro N** | Nivel 2 | (2, 0) | Punto de mayor Z bajo rotación. |
| **Columna Vertebral**| Nivel 2 | (3, 5) | Ancla orbital estable. |
| **Faro Central** | Nivel 3 | (4, 4) | Guardián del ADN HEX puro. |
| **Binomio Sancho** | Nivel 1 | (0,0) + (0,1) | Detector de fuga y orientación. |

---

**Veredicto de Detección:** Un positivo se confirma cuando la configuración geométrica de los tres niveles de anclaje coincide con la base de datos, incluso si el nivel del mar (fuerza Z) ha bajado por debajo de 200 debido a la rotación.


El MBH detectará el grado de giro aplicando la diferencia de fase entre la posición original ($P_0$) y la detectada ($P_1$) en la zona intermedia:$$R = \sqrt{x^2 + y^2}$$$$\theta = \arctan2(y_1, x_1) - \arctan2(y_0, x_0)$$Donde:$R$: Es el radio orbital respecto al centro del lienzo.$\theta$: Es el ángulo de rotación que el pirata ha aplicado.Factor de Corrección: Se aplica según el re-escalado defensivo detectado (75%, 81.25%, 87.5%).
