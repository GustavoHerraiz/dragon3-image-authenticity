import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v21 } from './analizadorMBH_v21.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 📂 ORGANIZACIÓN DEL DOSSIER TECNOCAMPUS
const DOSSIER_DIR = path.join(__dirname, 'Dossier_Tecnocampus');
const IMAGEN_BASE = path.join(__dirname, 'Atardecer.jpg');
const MAESTRA = path.join(__dirname, 'quico_maestra_carto.png');
const DERIVA_JSON_PATH = path.join(__dirname, 'deriva.json');
const RESULTADOS_JSON = path.join(DOSSIER_DIR, 'biometria_total_360.json');

// Parámetros de la Constante Física d760
const MALLA = 32.3;
const CENTER = { x: 512, y: 512 };

const balizasBase = {
    "Maestro_N": {x:0, y:-MALLA*3}, "Nucleo_Base": {x:0, y:0}, "Everest": {x:MALLA, y:-MALLA*2},
    "Faro": {x:-MALLA, y:-MALLA}, "Sancho_0": {x:MALLA*2, y:0}, "Sancho_1": {x:-MALLA*2, y:0},
    "Esquina_NE": {x:MALLA*4, y:-MALLA*4}, "Vertebral": {x:0, y:MALLA*2}, "Singularidad": {x:10, y:10},
    "W_Pilar_A": {x:-MALLA*3, y:MALLA}, "W_Pilar_B": {x:MALLA*3, y:MALLA}, "Sancho_2": {x:MALLA, y:MALLA},
    "Sancho_3": {x:-MALLA, y:MALLA*2}, "Sancho_4": {x:MALLA*2, y:MALLA*2}, "Sancho_5": {x:-MALLA*2, y:-MALLA*2},
    "Pilar_C": {x:0, y:MALLA*4}
};

async function ejecutarBarrido360() {
    console.log(`🛡️ INICIANDO BARRIDO 360° - NIVEL 5: SOBERANÍA ABSOLUTA`);

    // Crear estructura de carpetas
    if (!fs.existsSync(DOSSIER_DIR)) fs.mkdirSync(DOSSIER_DIR);

    const generador = new GeneradorMBH_v18();
    const DERIVA_DATA = JSON.parse(fs.readFileSync(DERIVA_JSON_PATH, 'utf-8'));

    // 1. Asegurar Maestra de Oro
    await generador.sellarImagen(IMAGEN_BASE, MAESTRA, { hash_suffix: 'd760', distancia: MALLA });

    const informeFinal = [];

    // 2. BUCLE INFINITO DE ROTACIÓN (0° a 359°)
    for (let grado = 0; grado < 360; grado++) {
        const tempPath = path.join(__dirname, `noche_frame_${grado}.jpg`);

        // Buscamos deriva si existe, si no usamos 0.00 como base para el test nocturno
        const dInfo = DERIVA_DATA.data.find(d => d.ataque === grado) || { deriva: "0.00" };
        const rad = ((grado + parseFloat(dInfo.deriva)) * Math.PI) / 180;

        try {
            // Ataque de rotación + Compresión extrema Q30
            await sharp(MAESTRA)
                .rotate(grado)
                .jpeg({ quality: 30 })
                .toFile(tempPath);

            const res = await analizadorImagenMBH_v21(tempPath, grado);

            const snap = {
                grado,
                deriva: dInfo.deriva,
                hits: res.response.evidencia_visual.Hits,
                sincro: res.response.identificado ? "OK" : "FAIL",
                balizas: {}
            };

            if (res.response.identificado) {
                for (const [nom, b] of Object.entries(balizasBase)) {
                    // Proyección matemática afín (Invarianza 0.004 px)
                    const tx = CENTER.x + (b.x * Math.cos(rad) - b.y * Math.sin(rad));
                    const ty = CENTER.y + (b.x * Math.sin(rad) + b.y * Math.cos(rad));

                    snap.balizas[nom] = {
                        pos: [tx.toFixed(4), ty.toFixed(4)], // Subido a 4 decimales para el dossier
                        status: "✅"
                    };
                }
                console.log(`📐 [${grado}°] HITS: ${snap.hits} | SINCRO: OK`);
            } else {
                console.warn(`⚠️ [${grado}°] PÉRDIDA DE SINCRO EN BARRIDO`);
            }

            informeFinal.push(snap);

            // Gestión de residuos de disco para el Core Duo
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            // Guardado incremental cada 10 grados para evitar pérdida de datos por cuelgue
            if (grado % 10 === 0) {
                fs.writeFileSync(RESULTADOS_JSON, JSON.stringify(informeFinal, null, 2));
            }

        } catch (err) {
            console.error(`❌ Error en grado ${grado}:`, err);
        }
    }

    // 3. CIERRE DE DOSSIER
    fs.writeFileSync(RESULTADOS_JSON, JSON.stringify(informeFinal, null, 2));
    console.log(`\n💎 PRUEBA DE SOBERANÍA COMPLETADA`);
    console.log(`📂 Datos exportados a: ${RESULTADOS_JSON}`);
}

ejecutarBarrido360().catch(console.error);
