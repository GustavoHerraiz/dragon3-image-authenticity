import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH as analizarV5 } from './analizador_v5.js';
import { analizarImagenMBH as analizarV6 } from './analizador_v6.js';
import sharp from 'sharp';
import fs from 'fs';
import { performance } from 'perf_hooks';

const CALIDADES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const IMAGEN_ORIGINAL = 'sin_sello.jpg';   // Asegúrate de tener este archivo
const PNG_SELLADO = 'temp_sellado.png';

async function generarImagenSellada() {
    const generador = new GeneradorMBH();
    await generador.sellarImagen(IMAGEN_ORIGINAL, PNG_SELLADO, {
        id_numerico: 74211,
        cliente: 'Test',
        obra: 'Comparativa'
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
    console.log('🚀 Iniciando test comparativo V5 vs V6\n');

    // 1. Generar imagen sellada PNG
    await generarImagenSellada();

    // 2. Generar JPEGs a partir del PNG
    await generarJPEGs();

    // 3. Cabecera de la tabla
    console.log('\n' + '='.repeat(90));
    console.log('Calidad\tResultado V5\tTiempo V5 (ms)\tResultado V6\tTiempo V6 (ms)\tDiferencia (ms)');
    console.log('='.repeat(90));

    // 4. Probar cada calidad
    for (const q of CALIDADES) {
        const archivo = `sellado_${q}.jpg`;

        // Medir V5
        const v5 = await medirTiempo(analizarV5, archivo);
        // Medir V6
        const v6 = await medirTiempo(analizarV6, archivo);

        const diff = v6.timeMs - v5.timeMs;
        const resultadoV5 = v5.result.identificado ? 'SÍ' : 'NO';
        const resultadoV6 = v6.result.identificado ? 'SÍ' : 'NO';

        console.log(`${q}\t${resultadoV5}\t\t${v5.timeMs.toFixed(2)}\t\t${resultadoV6}\t\t${v6.timeMs.toFixed(2)}\t\t${diff.toFixed(2)}`);
    }

    console.log('='.repeat(90));

    // Limpieza opcional (activar con variable de entorno)
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