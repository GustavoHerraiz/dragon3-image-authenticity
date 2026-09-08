// launcher.js
const path = require('path');
// Forzamos la carga de sharp desde la carpeta local real
const sharpPath = path.join(process.cwd(), 'node_modules', 'sharp');
try {
    global.sharp = require(sharpPath);
    console.log(">>> [DEBUG] Sharp anclado físicamente.");
} catch (e) {
    console.error(">>> [ERROR] No se pudo anclar Sharp:", e.message);
}

// Lanzamos el corazón del dragón
require('./core_blindado.js');
