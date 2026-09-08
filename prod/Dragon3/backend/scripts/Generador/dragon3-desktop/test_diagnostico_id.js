// test_diagnostico_id.js
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const res = await analizarImagenMBH_20bits(
    'referencia_83A4F.png',
    null,
    120000,
    { diagnosticoParidad: true, verbose: false }
);
console.log('Resultado:', res);