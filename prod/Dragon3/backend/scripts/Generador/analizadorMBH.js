/**
 * analizadorMBH.js
 * Lector directo del sello MBH.
 * Sin configuraciones complejas. Solo lee la geometría y el ID.
 */

import sharp from 'sharp';
import fs from 'fs';

// Configuración interna (Coincide con el Generador V7)
const TARGET_SIZE = 256;
const BC_SIGNATURE_RATIO = 1.618033988749895;

async function analizarImagen() {
    // 1. Buscamos el archivo correcto
    const archivo = './imagen_sellada.jpg';

    if (!fs.existsSync(archivo)) {
        console.log(JSON.stringify({
            error: "No encuentro el archivo 'imagen_sellada.jpg'"
        }, null, 2));
        return;
    }

    try {
        const imagen = sharp(archivo);
        // Leemos los datos crudos de la imagen (píxeles)
        const { data, info } = await imagen.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const wOriginal = info.width;
        const hOriginal = info.height;

        // 2. RECONSTRUIR LA GEOMETRÍA INVISIBLE
        // Calculamos dónde deberían estar los puntos basándonos en el tamaño de la imagen
        const factorEscala = Math.max(wOriginal, hOriginal) / TARGET_SIZE;
        const wLogico = Math.floor(wOriginal / factorEscala);
        // El generador V7 ponía los puntos al 80% de la altura
        const yLogica = Math.floor(Math.floor(hOriginal / factorEscala) * 0.8);

        // Recalcular posiciones X (Ratio Áureo)
        const anchoUtil = wLogico * 0.8;
        const d1 = Math.floor(anchoUtil / (1 + BC_SIGNATURE_RATIO));
        const d2 = Math.floor(d1 * BC_SIGNATURE_RATIO);
        const anchoTotalPuntos = d1 + d2;
        const xInicio = Math.floor((wLogico - anchoTotalPuntos) / 2);

        // Coordenadas donde buscamos el "brillo" invisible
        const p1 = { x: xInicio, y: yLogica };
        const p2 = { x: xInicio + d1, y: yLogica };
        const p3 = { x: xInicio + d1 + d2, y: yLogica };

        // 3. MEDIR CONTRASTE (DETECTAR SELLO)
        const fuerza1 = medirHalo(data, wOriginal, hOriginal, p1, factorEscala);
        const fuerza2 = medirHalo(data, wOriginal, hOriginal, p2, factorEscala);
        const fuerza3 = medirHalo(data, wOriginal, hOriginal, p3, factorEscala);

        // Si los 3 puntos tienen el contraste artificial esperado, es un sello válido
        const esSelloValido = (fuerza1 > 20 && fuerza2 > 20 && fuerza3 > 20);

        if (!esSelloValido) {
            console.log(JSON.stringify({
                esHumano: false,
                mensaje: "No se detecta el sello MBH en esta imagen."
            }, null, 2));
            return;
        }

        // 4. LEER EL ID (MATRÍCULA)
        // Leemos los datos ocultos en el centro geométrico de los puntos
        const centroX = Math.round((p1.x + p3.x) / 2);
        const textoOculto = leerDatosSutiles(data, wOriginal, hOriginal, {x: centroX, y: yLogica}, factorEscala);

        // Buscamos el patrón MBH-XXXXXX
        const match = textoOculto.match(/(MBH-\d+-\d+)/);
        const idSello = match ? match[0] : "ILEGIBLE";

        // 5. RESPUESTA FINAL (JSON limpio para tu backend)
        const respuesta = {
            esHumano: true,     // ✅ Certificado
            idSello: idSello,   // 🆔 La matrícula para buscar en tu BD
            timestamp: Date.now()
        };

        console.log(JSON.stringify(respuesta, null, 2));

    } catch (error) {
        console.log(JSON.stringify({ esHumano: false, error: error.message }));
    }
}

// --- Funciones Matemáticas Auxiliares (Magia Esteganográfica) ---

function medirHalo(buffer, w, h, pLogico, escala) {
    const xCentro = Math.round(pLogico.x * escala);
    const yCentro = Math.round(pLogico.y * escala);
    const radio = Math.max(2, Math.ceil(1.5 * escala));
    const rNucleo = Math.ceil(radio * 0.5);

    let sumaNucleo = 0, cN = 0;
    let sumaAnillo = 0, cA = 0;

    for(let y = yCentro - radio; y <= yCentro + radio; y++) {
        for(let x = xCentro - radio; x <= xCentro + radio; x++) {
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            // Usamos canal Verde (idx+1) para medir brillo
            const val = buffer[(y * w + x) * 4 + 1];
            const dist = Math.sqrt(Math.pow(x - xCentro, 2) + Math.pow(y - yCentro, 2));

            if (dist <= rNucleo) { sumaNucleo += val; cN++; }
            else if (dist <= radio) { sumaAnillo += val; cA++; }
        }
    }
    return Math.max(0, (cN ? sumaNucleo/cN : 0) - (cA ? sumaAnillo/cA : 0));
}

function leerDatosSutiles(buffer, w, h, centroLogico, escala) {
    const radioArea = 6;
    let bytes = [];
    for (let yGrid = -radioArea; yGrid < radioArea; yGrid++) {
        for (let xGrid = -radioArea; xGrid < radioArea; xGrid++) {
            const p = { x: centroLogico.x + xGrid, y: centroLogico.y + yGrid };
            // Leemos la "fuerza" del relieve en cada punto de la cuadrícula
            const contraste = medirHalo(buffer, w, h, p, escala);
            // Decodificamos el byte (aprox contraste / 1.6 según generador V7)
            let val = Math.round(contraste / 1.6);
            if (val > 30 && val < 256) bytes.push(val);
        }
    }
    return Buffer.from(bytes).toString('utf8');
}

// Ejecutar
analizarImagen();
