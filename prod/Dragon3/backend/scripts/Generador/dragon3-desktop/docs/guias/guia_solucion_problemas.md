
markdown
# 🔧 Guía de Solución de Problemas - Dragon3

**Resolución de problemas comunes en Dragon3.**

---

## 📋 Índice

1. [Problemas de instalación](#problemas-de-instalación)
2. [Problemas con el generador](#problemas-con-el-generador)
3. [Problemas con el analizador](#problemas-con-el-analizador)
4. [Problemas con la base de datos](#problemas-con-la-base-de-datos)
5. [Problemas con el watcher](#problemas-con-el-watcher)
6. [Problemas con metadatos](#problemas-con-metadatos)
7. [Problemas con ExifTool](#problemas-con-exiftool)
8. [Problemas de rendimiento](#problemas-de-rendimiento)
9. [Errores comunes y soluciones](#errores-comunes-y-soluciones)

---

## 🪟 Problemas de instalación

### ❌ "ExifTool no encontrado"

**Síntoma:**
[ERROR] ExifTool falló: Command failed...
[WARN] ExifTool not found

text

**Causa:**
- ExifTool no está en la ruta esperada.
- La ruta en `generadorMBH.js` es incorrecta.

**Solución:**

**Windows:**
1. Verifica que `resources/exiftool/exiftool-13.59_64/exiftool_win.exe` existe.
2. Si no, descárgalo desde [exiftool.org](https://exiftool.org/).
3. Colócalo en `resources/exiftool/exiftool-13.59_64/exiftool_win.exe`.

**macOS/Linux:**
```bash
# Instalar ExifTool
brew install exiftool      # macOS
sudo apt install exiftool  # Ubuntu/Debian
❌ "La base de datos no se abre"
Síntoma:

text
[ERROR] Error al abrir DB: SQLITE_CANTOPEN...
Causa:

La carpeta ~/.dragon3/ no existe o no tiene permisos.

El antivirus está bloqueando el archivo .db.

Solución:

Crea manualmente la carpeta ~/.dragon3/.

Verifica que tienes permisos de escritura.

En Windows, añade una excepción en el antivirus para dragon3.db.

🔧 Problemas con el generador
❌ "No se inyecta el sello correctamente"
Síntoma:

El generador dice "sellado con éxito" pero el analizador no detecta nada.

Vogel: 0 puntos detectados.

Causa:

La fuerza de inyección es demasiado baja (77).

La imagen es demasiado grande o ruidosa.

El canal alfa está saturado.

Solución:

Aumenta STARDUST_INTENSITY a 200 en generadorMBH.js.

Verifica que la imagen tiene canal alfa (PNG).

Asegúrate de que inyectarGeometria() usa hashLimpio (sin prefijo).

❌ "Error en licenseManager"
Síntoma:

text
TypeError: Cannot read properties of undefined (reading 'comprobarLimite')
Causa:

LicenseManager no se pasa correctamente al generador.

Solución:

javascript
// ✅ Asegúrate de pasar licenseManager
const licenseManager = new LicenseManager(db);
const generador = new GeneradorMBH(db, licenseManager);
🔍 Problemas con el analizador
❌ "No se detecta el sello"
Síntoma:

text
[WARN] Timeout en búsqueda rápida
[INFO] Análisis rápido completado: NO identificado
Causa:

La fuerza de inyección es demasiado baja.

El timeout es demasiado corto.

El hash no está en la base de datos correcta.

Solución:

Aumenta el timeout a 300000ms (5 minutos).

Verifica que el hash está en ~/.dragon3/dragon3.db.

Aumenta STARDUST_INTENSITY a 200.

❌ "Timeout en Deep Scan"
Síntoma:

text
[WARN] Timeout superado en Deep Scan
Causa:

La imagen es muy grande (10.000+ píxeles).

El timeout es demasiado corto.

Solución:

Aumenta el timeout a 600000ms (10 minutos).

Usa el modo rápido (V6) en lugar del forense (V5).

❌ "Cannot read properties of undefined (reading 'identificado')"
Síntoma:

text
TypeError: Cannot read properties of null (reading 'identificado')
Causa:

El analizador devuelve null en lugar de un objeto.

Solución:
En analizador_v6.js, cambia los retornos de null por objetos:

javascript
// ❌ ANTES:
return null;

// ✅ DESPUÉS:
return { identificado: false, veredicto: "Timeout en análisis" };
🗄️ Problemas con la base de datos
❌ "El hash no se encuentra en la DB"
Síntoma:

text
[DEBUG] Hash NO encontrado: 000001F
Causa:

El sello se registró en sellos pero no en proyectos.

buscarPorHash() solo busca en proyectos.

Solución:
Verifica que buscarPorHash() busca en sellos también:

javascript
async buscarPorHash(hash) {
    let row = await this.db.get('SELECT * FROM proyectos WHERE hash_suffix = ?', hash);
    if (row) return row;
    row = await this.db.get('SELECT * FROM sellos WHERE hash_suffix = ?', hash);
    return row || null;
}
❌ "Error insertando proyecto duplicado"
Síntoma:

text
[ERROR] Ya existe un proyecto con el nombre "Mataro"
Causa:

El proyecto ya existe en la base de datos.

Solución:
Usa skipDuplicateCheck: true al crear el proyecto:

javascript
await db.crearProyecto(..., true);  // ← skipDuplicateCheck
🤖 Problemas con el watcher
❌ "El watcher no detecta imágenes"
Síntoma:

No hay logs de "Archivo detectado".

Las imágenes no se sellan automáticamente.

Causa:

La carpeta raíz no está configurada.

El modo automático está desactivado.

El watcher está detenido.

Solución:

Verifica que ruta_proyectos está configurada en Configuración.

Activa el modo automático en Configuración.

Reinicia Dragon3 para reiniciar el watcher.

❌ "El watcher detecta imágenes pero no las sella"
Síntoma:

text
[INFO] Archivo detectado: imagen.jpg
[INFO] Modo automático: 1
(No hay más logs)
Causa:

Error en el generador o en la base de datos.

Solución:

Verifica los logs completos.

Comprueba que licenseManager funciona correctamente.

Asegúrate de que db.obtenerSiguienteId() devuelve un ID válido.

📝 Problemas con metadatos
❌ "Los metadatos no se preservan"
Síntoma:

Después de sellar, se pierden Make, Model, ISO, etc.

Causa:

ExifTool no está inyectando -TagsFromFile.

La conversión JPG → PNG elimina EXIF.

Solución:

javascript
// ✅ Usa -TagsFromFile para preservar metadatos
const cmd = `"${exifPath}" -TagsFromFile "${rutaEntrada}" "-exif:all<exif:all" "-xmp:all<xmp:all" ...`;
❌ "Los metadatos del sello no aparecen"
Síntoma:

ImageDescription, Artist, Copyright no están en la imagen.

Causa:

ExifTool no se ejecutó correctamente.

La ruta de ExifTool es incorrecta.

Solución:

Verifica que ExifTool está en la ruta correcta.

Comprueba los logs de ExifTool.

🛠️ Problemas con ExifTool
❌ "ExifTool warnings: Invalid EXIF text encoding"
Síntoma:

text
[WARN] ExifTool warnings: Warning: Invalid EXIF text encoding for UserComment
Causa:

Caracteres especiales en los metadatos.

Solución:

Asegúrate de que los metadatos no tienen caracteres especiales.

Usa UTF-8 para los metadatos.

❌ "ExifTool no se encuentra en producción"
Síntoma:

En desarrollo funciona, en producción no.

Causa:

process.resourcesPath es diferente en producción.

Solución:

javascript
// ✅ Buscar ExifTool en múltiples rutas
const rutasPosibles = [
    path.join(process.resourcesPath || '', 'exiftool', 'exiftool_win.exe'),
    path.join(process.cwd(), 'resources', 'exiftool', 'exiftool_win.exe'),
    'exiftool'
];
for (const ruta of rutasPosibles) {
    if (fs.existsSync(ruta)) {
        exifPath = ruta;
        break;
    }
}
⚡ Problemas de rendimiento
❌ "El sellado es muy lento"
Síntoma:

Sellado de imágenes > 60 segundos.

Causa:

Imagen muy grande (20+ MP).

Compresión PNG al máximo (compressionLevel: 9).

Solución:

Reduce compressionLevel a 6 (equilibrio entre tamaño y velocidad).

Procesa imágenes más pequeñas.

❌ "El análisis es muy lento"
Síntoma:

Análisis V5 > 5 minutos.

Causa:

Imagen muy grande.

Multi-escala y rotaciones consumen tiempo.

Solución:

Usa V6 (rápido) en lugar de V5 (forense).

Reduce el número de escalas.

❌ Errores comunes y soluciones
Error: "Cannot read properties of null (reading 'identificado')"
Solución: Asegúrate de que el analizador siempre devuelve un objeto.

Error: "ReferenceError: MotorForense is not defined"
Solución: Verifica que MotorForense está exportado en analizador_v5.js.

Error: "SyntaxError: Cannot use import statement outside a module"
Solución: Asegúrate de que type: "module" está en package.json.

Error: "Error: Input file is missing"
Solución: Verifica que la ruta de la imagen es correcta.

Error: "Error: SQLITE_CONSTRAINT: UNIQUE constraint failed"
Solución: Usa skipDuplicateCheck: true al crear proyectos.

📞 Soporte
Si el problema persiste:

Email: soporte@dragon3.com

Web: www.dragon3.com

GitHub: https://github.com/tuusuario/dragon3

🐉 Dragon3 - Protege tu obra, protege tu legado.