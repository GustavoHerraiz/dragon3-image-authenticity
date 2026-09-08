
markdown
# 📡 API de Dragon3 - Comunicación IPC

**Documentación de los handlers IPC para integración y desarrollo.**

---

## 📋 Índice

1. [Proyectos](#proyectos)
2. [Sellado](#sellado)
3. [Análisis](#análisis)
4. [Metadatos](#metadatos)
5. [Licencias](#licencias)
6. [Configuración](#configuración)
7. [Archivos y carpetas](#archivos-y-carpetas)
8. [Informes PDF](#informes-pdf)
9. [Eventos desde main](#eventos-desde-main)

---

## 📁 Proyectos

### `get-proyectos`

**Descripción:** Obtiene todos los proyectos de la base de datos.

**Parámetros:** Ninguno

**Retorno:** `Promise<Array<Proyecto>>`

**Ejemplo:**
```javascript
const proyectos = await ipcRenderer.invoke('get-proyectos');
console.log(proyectos);
// [{ id: 1, hash_suffix: "0000001", cliente: "Cliente A", ... }]
crear-proyecto
Descripción: Crea un nuevo proyecto.

Parámetros:

Campo	Tipo	Obligatorio	Descripción
cliente	string	✅	Nombre del cliente
obra	string	✅	Título de la obra
proyecto_nombre	string	✅	Nombre de la carpeta
coleccion	string	❌	Colección (opcional)
derechos	string	❌	Derechos de autor
email_contacto	string	❌	Email de contacto
compartir_blade	boolean	❌	Compartir con Blade
descripcion	string	❌	Descripción del proyecto
Retorno: Promise<Proyecto>

Ejemplo:

javascript
const proyecto = await ipcRenderer.invoke('crear-proyecto', {
    cliente: 'Ayuntamiento Mataro',
    obra: 'Casa Coll i Regas',
    proyecto_nombre: 'Mataro',
    derechos: 'Todos los derechos reservados'
});
console.log(proyecto.id); // 5
eliminar-proyecto
Descripción: Elimina un proyecto y todos sus archivos.

Parámetros:

Campo	Tipo	Descripción
proyectoId	number	ID del proyecto a eliminar
Retorno: Promise<{ ok: boolean }>

Ejemplo:

javascript
await ipcRenderer.invoke('eliminar-proyecto', { proyectoId: 5 });
obtener-ruta-proyecto
Descripción: Obtiene la ruta de la carpeta de un proyecto.

Parámetros:

Campo	Tipo	Descripción
proyectoId	number	ID del proyecto
Retorno: Promise<string | null>

Ejemplo:

javascript
const ruta = await ipcRenderer.invoke('obtener-ruta-proyecto', { proyectoId: 5 });
// "C:\Users\Usuario\.dragon3\Dragon3_Projects\Mataro"
contar-sellos
Descripción: Cuenta los sellos de un proyecto.

Parámetros:

Campo	Tipo	Descripción
proyectoId	number	ID del proyecto
Retorno: Promise<number>

Ejemplo:

javascript
const total = await ipcRenderer.invoke('contar-sellos', { proyectoId: 5 });
console.log(total); // 15
🔒 Sellado
sellar-imagen
Descripción: Sella una imagen individual.

Parámetros:

Campo	Tipo	Obligatorio	Descripción
rutaEntrada	string	✅	Ruta de la imagen original
cliente	string	✅	Nombre del cliente
obra	string	✅	Título de la obra
proyecto_nombre	string	✅	Nombre del proyecto
proyectoId	number	❌	ID del proyecto (si existe)
coleccion	string	❌	Colección
derechos	string	❌	Derechos de autor
email_contacto	string	❌	Email de contacto
compartir_blade	number	❌	0/1
idNumerico	number	❌	ID numérico (auto si 0)
subcarpeta	string	❌	Subcarpeta dentro del proyecto
Retorno: Promise<{ ok: boolean, id: string, ruta: string }>

Ejemplo:

javascript
const resultado = await ipcRenderer.invoke('sellar-imagen', {
    rutaEntrada: 'C:/imagen.jpg',
    cliente: 'Ayuntamiento Mataro',
    obra: 'Casa Coll i Regas',
    proyecto_nombre: 'Mataro',
    proyectoId: 5
});
console.log(resultado.id); // "GHL_000001F"
sellar-lote
Descripción: Sella múltiples imágenes con los mismos metadatos.

Parámetros:

Campo	Tipo	Descripción
rutas	string[]	Array de rutas de imágenes
metadatosComunes	object	Metadatos comunes para todas
Retorno: Promise<{ ok: boolean, resultados: { ok: [], fallos: [] }, total: number, procesados: number, fallidos: number }>

cancelar-sellado-lote
Descripción: Cancela el proceso de sellado por lotes.

Parámetros: Ninguno

Retorno: Promise<{ ok: boolean, error?: string }>

🔍 Análisis
analizar-imagen
Descripción: Analiza una imagen sellada.

Parámetros:

Campo	Tipo	Descripción
ruta	string	Ruta de la imagen
modo	string	'rapido' (V6) o 'forense' (V5)
Retorno: Promise<{ identificado: boolean, hash?: string, cliente?: string, obra?: string, veredicto?: string, integridad_legal?: string }>

Ejemplo:

javascript
const resultado = await ipcRenderer.invoke('analizar-imagen', {
    ruta: 'C:/imagen_GHL_000001F.png',
    modo: 'rapido'
});
console.log(resultado.identificado); // true
console.log(resultado.veredicto); // "Original de Ayuntamiento Mataro - "Casa Coll i Regas" 🏆"
✏️ Metadatos
actualizar-metadatos
Descripción: Actualiza los metadatos de una imagen sellada (sin re-sellar).

Parámetros:

Campo	Tipo	Descripción
rutaImagen	string	Ruta de la imagen sellada
metadatos	object	Nuevos metadatos
metadatos:

Campo	Tipo	Descripción
cliente	string	Nuevo cliente
obra	string	Nueva obra
coleccion	string	Colección
derechos	string	Derechos
email_contacto	string	Email
compartir_blade	number	0/1
Retorno: Promise<{ ok: boolean, mensaje: string, idCompleto?: string, hash?: string, metadatos?: object }>

leer-metadatos-imagen
Descripción: Lee los metadatos de una imagen sellada (con ExifTool).

Parámetros:

Campo	Tipo	Descripción
rutaImagen	string	Ruta de la imagen
Retorno: Promise<{ ok: boolean, metadatos: { imageDescription: string, artist: string, copyright: string, title: string }, idInfo: { prefijo: string, hash: string, idCompleto: string } }>

obtener-sello-por-hash
Descripción: Obtiene un sello desde la DB por su hash.

Parámetros:

Campo	Tipo	Descripción
hash	string	Hash de 7 dígitos (ej: 000001F)
Retorno: Promise<object | null>

🔐 Licencias
obtener-estado-licencia
Descripción: Obtiene el estado actual de la licencia.

Parámetros: Ninguno

Retorno: Promise<{ premium: boolean, sellos_usados: number, limite: number, mensaje: string }>

activar-licencia
Descripción: Activa la licencia Premium.

Parámetros:

Campo	Tipo	Descripción
clave	string	Clave de activación
email	string	Email asociado
Retorno: Promise<{ ok: boolean, mensaje?: string, error?: string }>

generar-clave
Descripción: Genera una clave de activación para un email (solo para administradores).

Parámetros:

Campo	Tipo	Descripción
email	string	Email para generar la clave
Retorno: Promise<{ ok: boolean, clave?: string }>

⚙️ Configuración
obtener-perfil
Descripción: Obtiene la configuración del perfil del fotógrafo.

Parámetros: Ninguno

Retorno: Promise<object>

actualizar-perfil
Descripción: Actualiza la configuración del perfil.

Parámetros: object con los campos a actualizar

Campos permitidos:

nombre_autor, email_usuario, web_autor, telefono_autor

logo_path, direccion_autor, descripcion_autor, redes_sociales

ruta_proyectos, coleccion_por_defecto, derechos_por_defecto

sincronizar_blade_por_defecto, prefijo_usuario

mover_original, activar_watcher, modo_automatico

proyecto_por_defecto, subcarpeta_por_defecto

cliente_por_defecto, obra_por_defecto

Retorno: Promise<{ ok: boolean }>

guardar-configuracion-inicial
Descripción: Guarda la configuración inicial (primer arranque).

Parámetros: object (mismos campos que actualizar-perfil)

Retorno: Promise<{ ok: boolean, error?: string }>

📂 Archivos y carpetas
seleccionar-archivo
Descripción: Abre un diálogo para seleccionar un archivo.

Parámetros: Ninguno

Retorno: Promise<string | null>

seleccionar-archivos-multiples
Descripción: Abre un diálogo para seleccionar múltiples archivos.

Parámetros: Ninguno

Retorno: Promise<string[] | null>

seleccionar-carpeta
Descripción: Abre un diálogo para seleccionar una carpeta.

Parámetros: Ninguno

Retorno: Promise<string | null>

listar-archivos
Descripción: Lista los archivos de una carpeta.

Parámetros:

Campo	Tipo	Descripción
carpeta	string	Ruta de la carpeta
Retorno: Promise<Array<{ name: string, path: string, isDirectory: boolean }>>

eliminar-archivo
Descripción: Elimina un archivo.

Parámetros:

Campo	Tipo	Descripción
ruta	string	Ruta del archivo
Retorno: Promise<{ ok: boolean }>

eliminar-carpeta
Descripción: Elimina una carpeta y todo su contenido.

Parámetros:

Campo	Tipo	Descripción
ruta	string	Ruta de la carpeta
Retorno: Promise<{ ok: boolean }>

abrir-archivo
Descripción: Abre un archivo con la aplicación predeterminada.

Parámetros:

Campo	Tipo	Descripción
ruta	string	Ruta del archivo
Retorno: Promise<{ ok: boolean }>

📄 Informes PDF
generar-informe-pdf
Descripción: Genera un informe PDF de un proyecto.

Parámetros:

Campo	Tipo	Descripción
proyectoId	number	ID del proyecto
rutaSalida	string	Ruta donde guardar el PDF
Retorno: Promise<{ ok: boolean, ruta?: string, error?: string }>

📡 Eventos desde main
imagen-detectada
Descripción: Notifica que el watcher ha detectado una nueva imagen.

Datos:

Campo	Tipo	Descripción
ruta	string	Ruta de la imagen detectada
Ejemplo:

javascript
ipcRenderer.on('imagen-detectada', (event, { ruta }) => {
    console.log(`📁 Nueva imagen: ${ruta}`);
});
progreso-sellado
Descripción: Actualiza el progreso del sellado por lotes.

Datos:

Campo	Tipo	Descripción
total	number	Total de imágenes
procesados	number	Procesadas hasta ahora
fallidos	number	Fallos
rutaActual	string	Ruta actual
estado	string	'iniciando', 'procesando', 'finalizado', 'cancelado', 'error'
tiempoTranscurrido	number	Segundos
tiempoEstimado	number	Segundos estimados
porc	number	Porcentaje (0-100)
recargar-arbol
Descripción: Ordena al frontend recargar el explorador de carpetas.

actualizar-licencia
Descripción: Ordena al frontend actualizar el estado de la licencia.

notificacion-nativa
Descripción: Notificación del sistema.

Datos:

Campo	Tipo	Descripción
titulo	string	Título
mensaje	string	Mensaje
tipo	string	'info', 'ok', 'error'
🐉 Dragon3 - Protege tu obra, protege tu legado.