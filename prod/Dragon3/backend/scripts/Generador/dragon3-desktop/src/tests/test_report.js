import { DragonDB } from '../backend/database.js';
import { LicenseManager } from '../backend/license.js';
import { GeneradorMBH } from '../backend/generadorMBH.js';
import { analizarImagenMBH } from '../backend/analizador_v5.js';
import { ReportGenerator } from '../backend/report.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '../../test_output');

async function testReport() {
  console.log('🧪 TEST DE INFORMES');
  const dbPath = path.join(TEST_DIR, 'test_report.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new DragonDB(dbPath);
  const licenseManager = new LicenseManager(db);
  // Forzar premium para pruebas
  licenseManager.activarLicencia('test@email.com', 'premium', 'fake-clave');

  // Crear imagen y sellar
  const inputPath = path.join(TEST_DIR, 'input_report.png');
  await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png().toFile(inputPath);

  const generador = new GeneradorMBH(db, licenseManager);
  const outputPath = path.join(TEST_DIR, 'output_report.png');
  const resultado = await generador.sellarImagen(inputPath, outputPath, {
    id_numerico: 54321,
    cliente: 'Cliente Informe',
    obra: 'Obra Informe'
  });
  if (!resultado.ok) throw new Error('Fallo sellado');

  // Analizar
  const analisis = await analizarImagenMBH(outputPath, db);
  if (!analisis.identificado) throw new Error('Fallo análisis');

  // Generar informes
  const reportGen = new ReportGenerator(db, licenseManager);
  const pdfPath = path.join(TEST_DIR, 'informe.pdf');
  await reportGen.generarPDF(analisis, pdfPath);
  console.log(`✅ PDF generado: ${pdfPath}`);

  const csvPath = path.join(TEST_DIR, 'informe.csv');
  reportGen.generarCSV(analisis, csvPath);
  console.log(`✅ CSV generado: ${csvPath}`);

  console.log('🎉 TEST DE INFORMES COMPLETADO');
  db.cerrar();
}

testReport().catch(err => {
  console.error('❌', err);
  process.exit(1);
});