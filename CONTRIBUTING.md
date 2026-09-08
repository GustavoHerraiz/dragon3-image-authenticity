# Guía de contribución

## 1. Propósito

Este documento define las normas para colaborar en el proyecto Dragon3 y mantener la base de código limpia, estable y segura.

## 2. Alcance

Las contribuciones están dirigidas a:

- mejoras del analizador de autenticidad
- corrección de errores y validación
- desarrollo de módulos relacionados con análisis, metadatos o validación visual
- documentación técnica y operativa
- mantenibilidad del repositorio

## 3. Principios generales

- no subir artefactos generados ni binarios grandes
- mantener el repositorio limpio
- separar trabajo experimental del entorno productivo
- documentar cambios importantes
- preferir cambios pequeños y verificables

## 4. Preparación del entorno

1. Clonar el repositorio.
2. Crear el entorno virtual si aplica.
3. Configurar el archivo `.env` a partir de `.env.example`.
4. Revisar la estructura del proyecto y usar la capa correcta: `dev/` o `prod/`.

## 5. Flujo de trabajo recomendado

```bash
git checkout main
git pull origin main
git checkout -b feature/<nombre-cambio>
```

A partir de ahí:

- desarrollar el cambio
- revisar el impacto
- ejecutar pruebas mínimas
- verificar que no se introduce artefacto pesado

## 6. Reglas para commit

Cada commit debe ser claro y específico. Usar mensajes como:

```bash
git commit -m "Add metadata validation for image analysis"
```

Evitar mensajes genéricos como:

```bash
git commit -m "fix"
```

## 7. Antes de hacer push

Ejecuta:

```bash
git status
git diff --stat
```

Verifica que:

- no hay archivos temporales
- no hay binarios pesados
- no hay secretos
- no hay datos de laboratorio no deseados
- no hay artefactos dentro de `salida/`, `dataset/` o `shared/`

## 8. Qué sí se debe incluir

- código fuente
- documentación
- configuración útil
- pruebas mínimas
- cambios aislados y justificados

## 9. Qué no se debe incluir

- `node_modules/`
- `venv/` o `.venv/`
- backups de modelos o datasets
- `.so`, `.dmg`, `.AppImage`, `.exe`
- archivos `.bak`, `.tmp`, `.log`
- certificados o claves privadas
- archivos generados en `salida/`

## 10. Pull requests

Los pull requests deben incluir:

- resumen del cambio
- motivo del cambio
- impacto esperado
- pruebas realizadas
- notas de despliegue o riesgo

## 11. Revisión de código

Se debe revisar:

- claridad del diseño
- manejo de errores
- riesgo de seguridad
- impacto sobre producción
- dependencia de artefactos pesados o archivos externos

## 12. Política de mantenimiento

- mantener ramas limpias
- usar `main` como rama principal
- evitar merges con archivos basura o artefactos grandes
- documentar cambios funcionales importantes

## 13. Conclusión

La contribución al proyecto debe aportar valor, mantener el repositorio limpio y evitar la contaminación del historial con artefactos, binarios o datos pesados. La calidad del código y la trazabilidad son prioritarias.
