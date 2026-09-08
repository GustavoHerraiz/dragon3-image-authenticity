/**
 * DRAGON3 - TEST 0 V16 (ANTIMATERIA CHECK)
 * Objetivo: Confirmar que la V16 NO detecta nada en la imagen virgen.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
// Importamos el nuevo analizador V16
import { analizadorImagenMBH_v15 as analizadorV16 } from './analizadorMBH_v16.js';

const IMAGEN_ORIGINAL = 'Atardecer.jpg';
const DIRECTORIO_SALIDA = './test0_v16_results';

function crearDirectorio(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function ejecutarTestCeroV16() {
    console.log('\n============================================================');
    console.log('🐉 DRAGON3 - TEST 0 V16 (PROTOCOLO ANTIMATERIA)');
    console.log('============================================================\n');

    crearDirectorio(DIRECTORIO_SALIDA);

    // Escenarios críticos donde la V15 fallaba (daba falsos positivos)
    const ESCENARIOS = [
        { id: 'V16_BASE', nombre: '📸 Original Virgen', proc: img => img },
        { id: 'V16_SHARP', nombre: '🔍 Sharpen (Extremo)', proc: img => img.sharpen() },
        { id: 'V16_CAOS', nombre: '💀 Caos (Giro 15° + JPG 50)', proc: img => img.rotate(15).jpeg({quality:50}) }
    ];

    for (const esc of ESCENARIOS) {
        const rutaTmp = path.join(DIRECTORIO_SALIDA, `${esc.id}_tmp.jpg`);
        console.log(`🧪 Probando: ${esc.nombre}...`);

        try {
            await esc.proc(sharp(IMAGEN_ORIGINAL)).toFile(rutaTmp);

            // Analizamos con la nueva lógica V16
            const r = await analizadorV16(rutaTmp);
            const ev = r.response.evidencia_visual;

            if (ev.Hits_Totales > 0) {
                console.log(`❌ FRACASO: ${ev.Hits_Totales} hits detectados. El "hueco" no está limpio.`);
                console.log(`   Confianza: ${(ev.Mejor_Confianza * 100).toFixed(1)}%`);
            } else {
                console.log(`✅ LIMPIO: 0 hits detectados en el espacio de antimateria.`);
            }
        } catch (e) {
            console.log(`⚠️ Error: ${e.message}`);
        }
    }
    console.log('\n============================================================');
}

ejecutarTestCeroV16();
