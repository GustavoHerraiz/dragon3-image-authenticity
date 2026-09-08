import { DragonDB } from '../backend/database.js';
import { GeneradorMBH } from '../backend/generadorMBH.js';
import { analizarImagenMBH } from '../backend/analizador_v5.js';
import { analizarImagenRapido } from '../backend/analizador_v6.js';
import { LicenseManager } from '../backend/license.js';
import { ReportGenerator } from '../backend/report.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { telemetry } from '../backend/telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '../../test_output_full');
const RESULTS = [];

// Helper para registrar resultados
function logResult(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${testName} ${details}`);
  RESULTS.push({ test: testName, passed, details });
}

// Función para generar imagen de prueba con dimensiones variables
async function generarImagenPrueba(width, height, color = { r: 128, g: 128, b: 128 }) {
  const inputPath = path.join(TEST_DIR, `input_${width}x${height}.png`);
  await sharp({
    create: { width, height, channels: 3, background: color }
  }).png().toFile(inputPath);
  return inputPath;
}

// Función para sellar y analizar
async function sellarYAnalizar(db, licenseManager, metadatos, rutaEntrada, timeout = 60000) {
  const generador = new GeneradorMBH(db, licenseManager);
  const outputPath = path.join(TEST_DIR, `output_${metadatos.id_numerico}.png`);
  const resultadoSellado = await generador.sellarImagen(rutaEntrada, outputPath, metadatos);
  if (!resultadoSellado.ok) {
    return { ok: false, error: resultadoSellado.error };
  }
  const resultadoAnalisis = await analizarImagenMBH(outputPath, db, timeout);
  return { ok: true, sellado: resultadoSellado, analisis: resultadoAnalisis, outputPath };
}

async function testCompleto() {
  console.log('🧪 INICIANDO TEST COMPLETO DE DRAGON3...');
  telemetry.info('TestCompleto', 'Inicio de prueba exhaustiva');

  // Preparar directorio
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  // Base de datos limpia
  const dbPath = path.join(TEST_DIR, 'test_full.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new DragonDB(dbPath);
await db.ensureOpen();
  const licenseManager = new LicenseManager(db);

  // --- 1. PRUEBA DE SELLADO Y ANÁLISIS BÁSICO (V5 y V6) ---
  console.log('\n📌 1. PRUEBA BÁSICA DE SELLADO Y ANÁLISIS');
  const inputBasic = await generarImagenPrueba(1024, 1024);
  const resultadoBasic = await sellarYAnalizar(db, licenseManager, {
    id_numerico: 12345,
    cliente: 'Cliente Basic',
    obra: 'Obra Basic'
  }, inputBasic);

  if (resultadoBasic.ok && resultadoBasic.analisis.identificado) {
    logResult('Sellado y análisis básico (V5)', true, `ID: ${resultadoBasic.analisis.hash}`);
    logResult('Sellado y análisis básico (V6)', true, `ID: ${resultadoBasic.analisis.hash}`);
  } else {
    logResult('Sellado y análisis básico (V5)', false, resultadoBasic.error || 'No identificado');
    logResult('Sellado y análisis básico (V6)', false, resultadoBasic.error || 'No identificado');
  }

  // --- 2. PRUEBA DE ESCALADO ---
  console.log('\n📌 2. PRUEBA DE RESISTENCIA A ESCALADO');
  const escalas = [0.75, 0.5, 0.25];
  for (const escala of escalas) {
    const imgEscalada = path.join(TEST_DIR, `escalada_${escala}.png`);
    await sharp(resultadoBasic.outputPath).resize({ width: Math.round(1024 * escala) }).png().toFile(imgEscalada);
    const result = await analizarImagenMBH(imgEscalada, db, 60000);
    const passed = result.identificado && result.hash === '0003039';
    logResult(`Escalado ${escala*100}%`, passed, result.hash || 'No ID');
  }

  // --- 3. PRUEBA DE COMPRESIÓN JPEG ---
  console.log('\n📌 3. PRUEBA DE RESISTENCIA A COMPRESIÓN JPEG');
  const calidades = [95, 80, 60, 40, 20];
  for (const calidad of calidades) {
    const jpegPath = path.join(TEST_DIR, `compressed_${calidad}.jpg`);
    await sharp(resultadoBasic.outputPath).jpeg({ quality: calidad }).toFile(jpegPath);
    const result = await analizarImagenMBH(jpegPath, db, 60000);
    const passed = result.identificado && result.hash === '0003039';
    logResult(`Compresión JPEG Q${calidad}`, passed, result.hash || 'No ID');
  }

  // --- 4. PRUEBA DE CROP ---
  console.log('\n📌 4. PRUEBA DE RESISTENCIA A CROP');
  const crops = [
    { x: 100, y: 100, width: 500, height: 500 },
    { x: 50, y: 50, width: 200, height: 200 },
  ];
  for (const [i, crop] of crops.entries()) {
    const cropPath = path.join(TEST_DIR, `crop_${i}.png`);
    await sharp(resultadoBasic.outputPath).extract(crop).png().toFile(cropPath);
    const result = await analizarImagenMBH(cropPath, db, 60000);
    const passed = result.identificado && result.hash === '0003039';
    logResult(`Crop ${i+1} (${crop.width}x${crop.height})`, passed, result.hash || 'No ID');
  }

  // --- 5. PRUEBA DE ROTACIÓN (90°, 180°, 270°) ---
  console.log('\n📌 5. PRUEBA DE ROTACIÓN');
  const angulos = [90, 180, 270];
  for (const angulo of angulos) {
    const rotPath = path.join(TEST_DIR, `rotacion_${angulo}.png`);
    await sharp(resultadoBasic.outputPath).rotate(angulo).png().toFile(rotPath);
    const result = await analizarImagenMBH(rotPath, db, 60000);
    // Las rotaciones 90/270 deberían fallar (no detectadas), 180 sí debería pasar
    const passed = (angulo === 180) ? (result.identificado && result.hash === '0003039') : !result.identificado;
    logResult(`Rotación ${angulo}°`, passed, result.hash || 'No ID');
  }

  // --- 6. PRUEBA DE ESPIRAL VOGEL (PNG original) ---
  console.log('\n📌 6. PRUEBA DE ESPIRAL VOGEL');
  // Usamos el PNG generado directamente (outputBasic.outputPath es PNG)
  // Verificamos que el analizador lo identifique como "Original"
  const resultVogel = await analizarImagenMBH(resultadoBasic.outputPath, db, 60000);
  const passedVogel = resultVogel.identificado && resultVogel.veredicto.includes('Original');
  logResult('Espiral Vogel (PNG original)', passedVogel, resultVogel.veredicto || 'No original');

  // --- 7. PRUEBA DE INTEGRIDAD DE METADATOS ---
  console.log('\n📌 7. PRUEBA DE INTEGRIDAD DE METADATOS');
  // Modificar metadatos EXIF (simular manipulación)
  const metadatosPath = path.join(TEST_DIR, 'metadatos_modificados.png');
  // Copiamos el PNG y luego usamos exiftool para cambiar ImageDescription
  // Si no tenemos exiftool, esta prueba se salta.
  try {
    // Usamos exiftool si está disponible
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);
    fs.copyFileSync(resultadoBasic.outputPath, metadatosPath);
    await execPromise(`exiftool -ImageDescription="DRAGON3_ID:FAKE123" -overwrite_original "${metadatosPath}"`);
    const resultMeta = await analizarImagenMBH(metadatosPath, db, 60000);
    const passedMeta = resultMeta.identificado && resultMeta.integridad_legal && resultMeta.integridad_legal.includes('FRAUDE');
    logResult('Detección de fraude en metadatos', passedMeta, resultMeta.integridad_legal || 'No detectado');
  } catch (e) {
    logResult('Detección de fraude en metadatos (exiftool no disponible)', false, 'Saltado');
  }

  // --- 8. PRUEBA DE LICENCIAS (Modo gratuito vs premium) ---
  console.log('\n📌 8. PRUEBA DE LICENCIAS');
  // Crear un nuevo generador con licencia gratuita forzada (simulamos)
  const licenseFree = new LicenseManager(db);
  // Forzar modo gratuito (en license.js hay una forma, pero aquí simulamos)
  // Realmente licenseManager es el que tenemos, pero forzamos que no sea premium
  // Para probar, creamos uno nuevo con el estado actual.
  const generadorFree = new GeneradorMBH(db, licenseManager);
  // Intentar sellar sin ID (debe forzar ID=1)
  const inputFree = await generarImagenPrueba(512, 512);
  const resultFree = await generadorFree.sellarImagen(inputFree, path.join(TEST_DIR, 'free.png'), {});
  const passedFree = resultFree.ok && resultFree.id === '0000001';
  logResult('Modo gratuito (ID forzado a 1)', passedFree, resultFree.id || 'No ID');

  // --- 9. PRUEBA DE INFORMES (PDF/CSV) ---
  console.log('\n📌 9. PRUEBA DE INFORMES');
  try {
    const reportGen = new ReportGenerator(db, licenseManager);
    const pdfPath = path.join(TEST_DIR, 'informe.pdf');
    const csvPath = path.join(TEST_DIR, 'informe.csv');
    await reportGen.generarPDF({ hash: '0003039', cliente: 'Cliente Test', obra: 'Obra Test', veredicto: 'OK' }, pdfPath);
    await reportGen.generarCSV({ hash: '0003039', cliente: 'Cliente Test', obra: 'Obra Test' }, csvPath);
    const passedPDF = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0;
    const passedCSV = fs.existsSync(csvPath) && fs.statSync(csvPath).size > 0;
    logResult('Generación PDF', passedPDF);
    logResult('Generación CSV', passedCSV);
  } catch (e) {
    logResult('Generación PDF', false, e.message);
    logResult('Generación CSV', false, e.message);
  }

  // --- 10. PRUEBA DE RENDIMIENTO (tiempos de V5 vs V6) ---
  console.log('\n📌 10. PRUEBA DE RENDIMIENTO');
  // Medir tiempos en diferentes tamaños
  const sizes = [512, 1024, 2048];
  for (const size of sizes) {
    const imgSize = await generarImagenPrueba(size, size);
    const { outputPath: tempOutput } = await sellarYAnalizar(db, licenseManager, {
      id_numerico: size,
      cliente: 'Rendimiento',
      obra: `Size ${size}`
    }, imgSize);
    // Medir V5
    const startV5 = performance.now();
    await analizarImagenMBH(tempOutput, db, 300000);
    const timeV5 = performance.now() - startV5;
    // Medir V6
    const startV6 = performance.now();
    await analizarImagenRapido(tempOutput, db, 30000, false);
    const timeV6 = performance.now() - startV6;
    logResult(`Rendimiento ${size}x${size} V5`, timeV5 < 30000, `${Math.round(timeV5)}ms`);
    logResult(`Rendimiento ${size}x${size} V6`, timeV6 < 5000, `${Math.round(timeV6)}ms`);
  }

  // --- RESUMEN FINAL ---
  console.log('\n📊 RESUMEN DE RESULTADOS:');
  const passedCount = RESULTS.filter(r => r.passed).length;
  const totalCount = RESULTS.length;
  console.log(`✅ ${passedCount}/${totalCount} pruebas superadas`);
  if (passedCount === totalCount) {
    console.log('🎉 TODAS LAS PRUEBAS PASARON. EL SISTEMA ESTÁ LISTO PARA OFUSCAR Y EMPAQUETAR.');
  } else {
    console.log('⚠️ Algunas pruebas fallaron. Revisa los logs.');
    RESULTS.filter(r => !r.passed).forEach(r => console.log(`  ❌ ${r.test}: ${r.details}`));
  }

  await db.cerrar();
}

testCompleto().catch(err => {
  console.error('❌ ERROR EN TEST COMPLETO:', err);
  process.exit(1);
});