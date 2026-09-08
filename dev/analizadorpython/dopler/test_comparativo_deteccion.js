import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH as analizarV5 } from './analizador_v5.js';
import { analizarImagenMBH as analizarV6 } from './analizador_v6.js';  // tu versión fusionada
import sharp from 'sharp';
import fs from 'fs';
import { performance } from 'perf_hooks';

const CALIDADES = [
    100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
    9, 8, 7, 6, 5, 4
];
const IMAGEN_ORIGINAL = 'sin_sello.jpg';   // debe existir
const PNG_SELLADO = 'temp_sellado.png';
const ID_HEX_ESPERADO = '00121E3';  // para ID numérico 74211

async function generarImagenSellada() {
    const generador = new GeneradorMBH();
    await generador.sellarImagen(IMAGEN_ORIGINAL, PNG_SELLADO, {
        id_numerico: 74211,
        cliente: 'Cliente Test',
        obra: 'Obra Test'
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

async function medirYValidar(analizador, archivo) {
    const start = performance.now();
    const result = await analizador(archivo);
    const end = performance.now();
    const tiempo = end - start;
    let identificado = result.identificado || false;
    let hash = identificado ? result.hash : null;
    let ok = (hash === ID_HEX_ESPERADO);
    return { tiempo, identificado, hash, ok };
}

async function main() {
    console.log('🔍 Test comparativo de detección (V5 vs V6)\n');
    await generarImagenSellada();
    await generarJPEGs();

    // Cabecera
    console.log('\n' + '='.repeat(160));
    console.log('Calidad\tV5 detecta\tV5 hash\t\tV5 ok\tV5 tiempo(ms)\tV6 detecta\tV6 hash\t\tV6 ok\tV6 tiempo(ms)\tDiferencia(ms)');
    console.log('='.repeat(160));

    for (const q of CALIDADES) {
        const archivo = `sellado_${q}.jpg`;
        const v5 = await medirYValidar(analizarV5, archivo);
        const v6 = await medirYValidar(analizarV6, archivo);
        const diff = v6.tiempo - v5.tiempo;
        const v5HashStr = v5.hash ? v5.hash.padEnd(7) : '---';
        const v6HashStr = v6.hash ? v6.hash.padEnd(7) : '---';
        console.log(`${q}\t${v5.identificado ? 'SÍ' : 'NO'}\t\t${v5HashStr}\t${v5.ok ? 'SÍ' : (v5.identificado ? 'NO' : '-')}\t${v5.tiempo.toFixed(2)}\t\t${v6.identificado ? 'SÍ' : 'NO'}\t\t${v6HashStr}\t${v6.ok ? 'SÍ' : (v6.identificado ? 'NO' : '-')}\t${v6.tiempo.toFixed(2)}\t\t${diff.toFixed(2)}`);
    }

    console.log('='.repeat(160));

    // Limpieza opcional
    if (process.env.CLEANUP === 'true') {
        console.log('\n🧹 Eliminando archivos...');
        for (const q of CALIDADES) {
            try { fs.unlinkSync(`sellado_${q}.jpg`); } catch(e) {}
        }
        try { fs.unlinkSync(PNG_SELLADO); } catch(e) {}
        console.log('✅ Limpieza completada.');
    }
}

main().catch(console.error);