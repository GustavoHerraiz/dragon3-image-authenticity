# Developer Guide

## 1. Objetivo del proyecto

Dragon3 es una infraestructura de autenticidad visual orientada a detectar si una imagen ha sido generada por un ser humano o por inteligencia artificial. El servicio principal es el analizador Dragon3, cuya lógica está distribuida en varios módulos de análisis, validación de artefactos, modelado y sellado.

El punto de entrada operativo del sistema está asociado a www.bladecorporation.net.

## 2. Estructura de trabajo

```text
/opt/dragon3/
├── dev/                 # Laboratorio, investigación y prototipos
│   ├── analizadorpython/
│   ├── ataque/
│   ├── celulas/
│   ├── dragon3-desktop/
│   └── selladocamara/
├── prod/                # Entorno productivo y servicios de producción
│   ├── Dragon3/
│   └── services/
├── shared/              # Datos comunes, imágenes y backups
│   ├── backups/
│   └── images/
├── .gitignore
├── README.md
├── DEVELOPER_GUIDE.md
├── test_boss
├── salida/
└── .git/
```

## 3. Regla de diseño

El repositorio debe conservar solo:

- código fuente
- scripts operativos
- configuración y documentación
- pruebas y validaciones mínimas

No debe incluir:

- datasets pesados
- modelos de entrenamiento pesados
- librerías binarias nativas compiladas
- entornos virtuales
- ejecutables finales
- downloads de escritorio grandes
- archivos temporales o backups
- certificados y claves privadas

## 4. Política de almacenamiento

GitHub tiene límites para archivos pesados. Por eso:

- no se versionan `.so`, `.dmg`, `.AppImage`, `.exe`
- no se versionan entornos virtuales
- no se versionan datasets y salidas generadas
- no se versionan backups ni modelos grandes

Si alguna pieza pesa mucho y debe mantenerse disponible, debe manejarse con Git LFS o con almacenamiento externo.

## 5. Reglas de commit

Antes de cada commit:

```bash
git status
```

Y nunca hagas:

```bash
git add .
```

sin revisar lo que va a entrar.

Haz commits limitados y semánticos, por ejemplo:

```bash
git add .gitignore README.md
git commit -m "Initialize project documentation"
```

```bash
git add dev/prod
git commit -m "Add core analysis modules"
```

## 6. Reglas de Git para este repositorio

El proyecto ya usa un `.gitignore` que excluye artefactos y archivos pesados. Siga esta regla general:

- si es código o configuración: sí
- si es dataset, evidencia, binario, entorno virtual o ejecutable: no

## 7. Puntos de entrada recomendados

Los puntos de entrada principales del desarrollo normal suelen vivir en:

- `dev/analizadorpython/`
- `dev/celulas/`
- `prod/Dragon3/`

Dependiendo del flujo operativo, cada módulo puede tener su propia lógica y punto de ejecución.

## 8. Flujos de trabajo recomendados

### Desarrollo local

- trabajar en `dev/`
- probar experimentos y análisis sin contaminación del entorno productivo
- dejar la producción en `prod/`

### Producción

- la lógica definitiva se mantiene en `prod/`
- la infraestructura de validación y despliegue debe mantenerse separada de los artefactos experimentales
- los artefactos generados y salidas pesadas están fuera del repositorio

## 9. Buenas prácticas

- mantener los commits pequeños y descriptivos
- separar laboratorios de producción
- no versionar binarios ni ejecutables
- no versionar datos sensibles o de pruebas grandes
- revisar archivos grandes antes del push
- usar Git LFS solo cuando haya un caso real de necesidad

## 10. Sugerencia de flujo final

```bash
git status
git add <archivos-relevantes>
git commit -m "Describe change"
git push origin main
```

## 11. Nota final

Este proyecto está pensado para mantener la lógica y la estructura de Dragon3 en un repositorio limpio y seguro. Su objetivo no es almacenar todo el entorno ejecutable ni todos los artefactos generados, sino preservar la base del sistema, la documentación y la lógica de análisis dentro de un repositorio manejable.
