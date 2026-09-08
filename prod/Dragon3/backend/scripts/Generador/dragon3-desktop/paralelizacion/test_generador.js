// paralelizacion/test_generador.js
// 🧪 Prueba del generador con paralelización

import { GeneradorMBH } from './generadorMBH.js';
import { DragonDB } from '../src/backend/database.js';
import { LicenseManager } from '../src/backend/license.js';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testGenerador() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 PRUEBA DEL GENERADOR CON PARALELIZACIÓN');
    console.log('='.repeat(70) + '\n');

    try {
        const db = new DragonDB();
        await db._ensureOpen();
        const licenseManager = new LicenseManager(db);
        const generador = new GeneradorMBH(db, licenseManager);

        const rutaEntrada = path.join(__dirname, '../prueba.jpg');
        const rutaSalida = path.join(__dirname, 'prueba_sellada_paralelo.png');

        if (!fs.existsSync(rutaEntrada)) {
            console.log(`❌ No existe: ${rutaEntrada}`);
            return;
        }

        console.log(`📸 Imagen: ${path.basename(rutaEntrada)}`);
        const meta = await sharp(rutaEntrada).metadata();
        console.log(`📐 Dimensiones: ${meta.width}x${meta.height}`);

        const resultado = await generador.sellarImagen(rutaEntrada, rutaSalida, {
            cliente: 'Prueba Paralelo',
            obra: 'Test Generador Copiado',
            proyecto_nombre: 'Proyecto_Prueba_Paralelo',
            id_numerico: 0
        });

        console.log('\n📊 Resultado:');
        console.log(`   ✅ OK: ${resultado.ok}`);
        console.log(`   🔑 ID: ${resultado.id}`);
        console.log(`   📁 Ruta: ${resultado.ruta}`);

        if (resultado.ok && fs.existsSync(resultado.ruta)) {
            const stats = fs.statSync(resultado.ruta);
            console.log(`   📦 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }

        console.log('\n✅ Prueba completada.');

    } catch (err) {
        console.error('❌ Error:', err);
    }
}

testGenerador();