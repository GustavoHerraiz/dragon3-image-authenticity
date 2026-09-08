# Política de seguridad

## 1. Objetivo

Este proyecto maneja análisis de autenticidad visual, procesamiento de imágenes y lógica de validación técnica. Aunque su uso principal es interno y privado, debe gestionarse con criterios de seguridad, trazabilidad y control de acceso.

## 2. Alcance

Esta política cubre:

- acceso al repositorio
- configuración de entorno
- manejo de secretos y tokens
- manejo de datos de entrada y salida
- protección de información sensible
- despliegue y operación del servicio principal

## 3. Principios generales

- no compartir credenciales ni tokens públicos
- no incluir claves privadas ni certificados dentro del repositorio
- mantener secretos en variables de entorno locales o sistemas de gestión seguros
- separar entornos de producción, validación y laboratorio
- aplicar revision de permisos por usuario y servicio
- mantener trazabilidad de cambios críticos

## 4. Datos sensibles

Los siguientes elementos deben mantenerse fuera del repositorio:

- `.env` reales
- claves privadas
- certificados
- tokens
- datasets sensibles
- imágenes de usuario o clientes sin autorización
- información de acceso a infraestructura externa

## 5. Reglas para secretos y configuración

### Nunca hacer

- subir `.env` reales al repositorio
- incluir tokens dentro de commits
- dejar archivos con claves privadas en carpetas del proyecto
- guardar secretos en logs o archivos temporales

### Recomendado

- usar `.env.example` como plantilla
- gestionar secrets con herramientas de entorno seguras
- asegurar que los permisos de archivos de entorno sean restrictivos

## 6. Permisos y accesos

- limitar acceso al repositorio a personal autorizado
- restringir acceso a despliegues productivos
- separar permisos entre desarrollo, prueba y producción
- auditar accesos de usuarios y tokens cuando sea necesario

## 7. Protección del repositorio

- mantener el repositorio privado
- controlar quién puede hacer push o merge
- revisar ramas y pull requests antes de fusionar cambios críticos
- no habilitar accesos abiertos a infraestructuras operativas

## 8. Gestión de incidentes

Si se detecta una fuga de secretos o un problema de seguridad:

1. revocar tokens o claves afectadas
2. rotar credenciales
3. revisar logs y accesos recientes
4. verificar si hubo exposición de secretos en el repositorio
5. eliminar cualquier archivo sensible del historial si es necesario

## 9. Consideraciones de despliegue

El analizador Dragon3 opera dentro de la infraestructura principal asociada a www.bladecorporation.net. Por tanto:

- la infraestructura de producción debe estar protegida por autenticación y control de acceso adecuados
- se deben controlar conexiones a servicios externos
- no se deben exponer secretos en logs, pantallas ni respuestas HTTP

## 10. Buenas prácticas recomendadas

- usar variables de entorno para configuración sensible
- revisar archivos modificados antes de cada push
- eliminar temporales y artefactos generados antes de finalización
- mantener la rama principal limpia y protegida
- revisar permisos de lectura/escritura del repositorio periódicamente

## 11. Política de respuesta

Cualquier incidente grave debe tratarse de forma inmediata mediante:

- bloqueo de acceso afectado
- revisión del alcance del problema
- notificación a la persona responsable del sistema
- limpieza del repositorio y de la infraestructura si procede

## 12. Conclusión

Dragon3 debe operar como una solución técnica fiable y segura, con control estricto sobre accesos, secretos y datos. La seguridad no solo es un requisito técnico, sino un componente central del diseño del sistema.
