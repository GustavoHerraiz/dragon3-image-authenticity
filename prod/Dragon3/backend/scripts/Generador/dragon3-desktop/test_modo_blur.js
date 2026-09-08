// test_modo_blur.js
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';
import path from 'path';
import fs from 'fs';

const IMAGEN = path.resolve('test_estres_output/blur_medium.jpg');

if (!fs.existsSync(IMAGEN)) {
    console.error('❌ No existe la imagen blur_medium.jpg');
    process.exit(1);
}

console.log('\n🧪 Probando diagnóstico de paridad extendido...');
console.log(`   Imagen: ${IMAGEN}\n`);

const resultado = await analizarImagenMBH_20bits(
    IMAGEN,
    null,
    120000,
    {
        diagnosticoParidad: true,   // Ejecuta Motor de Paridad
        modoBlur: false,            // No ejecuta el barrido lento
        verbose: true               // Para ver más detalles si es necesario
    }
);

console.log('\n📊 Resultado del diagnóstico:');
console.log(resultado);