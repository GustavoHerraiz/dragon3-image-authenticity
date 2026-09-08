import { DragonDB } from '../backend/database.js';
import { GeneradorMBH } from '../backend/generadorMBH.js';
import { analizarImagenMBH } from '../backend/analizador_v5.js';
import { analizarImagenRapido } from '../backend/analizador_v6.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { telemetry } from '../backend/telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '../../test_output');

async function runTest() {
    console.log('🧪 INICIANDO TEST PASO 1...');
    telemetry.info('TestStep1', 'Inicio de test de integración');

    // 1. Preparar directorio
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

    // 2. DB temporal (eliminar si existe)
    const dbPath = path.join(TEST_DIR, 'test.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const db = new DragonDB(dbPath);

    // 3. Generar imagen de prueba (1024x1024 rojo)
    const inputPath = path.join(TEST_DIR, 'input.png');
    await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).png().toFile(inputPath);
    console.log('✅ Imagen de prueba creada');

    // 4. Sellar la imagen
    const outputPath = path.join(TEST_DIR, 'output_sellado.png');
    const generador = new GeneradorMBH(db);
    const resultadoSellado = await generador.sellarImagen(inputPath, outputPath, {
        id_numerico: 12345,
        cliente: 'Test Cliente',
        obra: 'Test Obra'
    });

    if (!resultadoSellado.ok) {
        throw new Error(`Fallo en sellado: ${resultadoSellado.error}`);
    }
    console.log(`✅ Imagen sellada con ID: ${resultadoSellado.id}`);

    // 5. Analizar la imagen sellada con V5 (timeout 2 minutos)
    const resultadoAnalisis = await analizarImagenMBH(outputPath, db, 120000);
    if (!resultadoAnalisis.identificado) {
        throw new Error(`Fallo en análisis V5: ${resultadoAnalisis.veredicto}`);
    }
    console.log(`✅ Análisis V5 exitoso: ${resultadoAnalisis.hash} - ${resultadoAnalisis.veredicto}`);

    // === PRUEBA V6 (rápido, sin fallback) ===
    const resultadoV6 = await analizarImagenRapido(outputPath, db, 15000, false);
    if (!resultadoV6.identificado) {
        throw new Error(`Fallo en análisis rápido V6: ${resultadoV6.veredicto}`);
    }
    console.log(`✅ Análisis rápido V6 exitoso: ${resultadoV6.hash} - ${resultadoV6.veredicto}`);

    // 6. Verificaciones
    const hashEsperado = '0003039';
    const hashObtenido = resultadoAnalisis.hash.trim();
    if (hashObtenido !== hashEsperado) {
        throw new Error(`Hash incorrecto: esperado "${hashEsperado}", obtenido "${hashObtenido}" (longitud ${hashObtenido.length})`);
    }
    console.log(`✅ Hash correcto: ${hashObtenido}`);
    if (resultadoAnalisis.cliente !== 'Test Cliente') {
        throw new Error(`Cliente incorrecto: esperado 'Test Cliente', obtenido ${resultadoAnalisis.cliente}`);
    }

    // 7. Verificar que la DB tiene el registro (con await)
    const registro = await db.buscarPorHash('0003039');
    if (!registro) {
        throw new Error('No se encontró el registro en la DB');
    }
    console.log(`✅ Registro en DB: ${registro.cliente} - ${registro.obra}`);

    console.log('🎉 TEST PASO 1 COMPLETADO CON ÉXITO');
    console.log(`📊 Logs disponibles en: dragon3_telemetry.log`);
    await db.cerrar();
}

runTest().catch(err => {
    console.error('❌ TEST FALLIDO:', err);
    process.exit(1);
});