import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH as analizarV5 } from './analizador_v5.js';
import { analizarImagenMBH as analizarV6 } from './analizador_v6.js';
import sharp from 'sharp';
import fs from 'fs';
import { performance } from 'perf_hooks';

// Calidades: de 100 a 10 cada 10, luego de 9 a 4 (de uno en uno)
const CALIDADES = [
    100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
    9, 8, 7, 6, 5, 4
];
const IMAGEN_ORIGINAL = 'sin_sello.jpg';   // Asegúrate de que exista
const PNG_SELLADO = 'temp_sellado.png';
const CSV_FILENAME = 'resultados_limite.csv';

async function generarImagenSellada() {
    const generador = new GeneradorMBH();
    await generador.sellarImagen(IMAGEN_ORIGINAL, PNG_SELLADO, {
        id_numerico: 74211,
        cliente: 'Test Limite',
        obra: 'Compresion Extrema'
    });
    console.log('✅ Imagen sellada generada:', PNG_SELLADO);
}

async function generarJPEGs() {
    const img = sharp(PNG_SELLADO);
    for (const q of CALIDADES) {
        await img.clone().jpeg({ quality: q }).toFile(`sellado_${q}.jpg`);
    }
    console.log('✅ JPEGs generados para calidades:', CALIDADES.join(', '));
}

async function medirTiempo(fn, archivo) {
    const start = performance.now();
    const result = await fn(archivo);
    const end = performance.now();
    return { result, timeMs: end - start };
}

async function main() {
    console.log('🔍 Test de límite de compresión (hasta Q4)\n');
    await generarImagenSellada();
    await generarJPEGs();

    // Cabecera de la tabla
    console.log('\n' + '='.repeat(110));
    console.log('Calidad\tResultado V5\tTiempo V5 (ms)\tResultado V6\tTiempo V6 (ms)\tDiferencia (ms)\tVentaja');
    console.log('='.repeat(110));

    const resultados = [];

    for (const q of CALIDADES) {
        const archivo = `sellado_${q}.jpg`;
        const v5 = await medirTiempo(analizarV5, archivo);
        const v6 = await medirTiempo(analizarV6, archivo);
        const diff = v6.timeMs - v5.timeMs;
        const ventaja = diff < 0 ? `V6 ${Math.abs(diff).toFixed(2)} ms más rápido` : `V5 ${diff.toFixed(2)} ms más rápido`;
        const resultadoV5 = v5.result.identificado ? 'SÍ' : 'NO';
        const resultadoV6 = v6.result.identificado ? 'SÍ' : 'NO';

        console.log(`${q}\t${resultadoV5}\t\t${v5.timeMs.toFixed(2)}\t\t${resultadoV6}\t\t${v6.timeMs.toFixed(2)}\t\t${diff.toFixed(2)}\t\t${ventaja}`);

        resultados.push({
            calidad: q,
            resultadoV5: resultadoV5,
            tiempoV5: v5.timeMs,
            resultadoV6: resultadoV6,
            tiempoV6: v6.timeMs,
            diferencia: diff,
            ventaja
        });
    }

    console.log('='.repeat(110));

    // Guardar CSV
    const csvContent = [
        ['Calidad', 'Resultado_V5', 'Tiempo_V5_ms', 'Resultado_V6', 'Tiempo_V6_ms', 'Diferencia_ms', 'Ventaja'],
        ...resultados.map(r => [r.calidad, r.resultadoV5, r.tiempoV5, r.resultadoV6, r.tiempoV6, r.diferencia, r.ventaja])
    ].map(row => row.join(',')).join('\n');
    fs.writeFileSync(CSV_FILENAME, csvContent);
    console.log(`\n📊 Resultados guardados en ${CSV_FILENAME}`);

    // Limpieza opcional (con variable de entorno)
    if (process.env.CLEANUP === 'true') {
        console.log('\n🧹 Eliminando archivos temporales...');
        for (const q of CALIDADES) {
            try { fs.unlinkSync(`sellado_${q}.jpg`); } catch(e) {}
        }
        try { fs.unlinkSync(PNG_SELLADO); } catch(e) {}
        console.log('✅ Limpieza completada');
    }
}

main().catch(console.error);