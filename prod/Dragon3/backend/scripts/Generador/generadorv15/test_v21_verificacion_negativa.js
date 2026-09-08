/**
 * ============================================================================
 * DRAGON3 - TEST V21 "VERIFICACIÓN NEGATIVA"
 * ============================================================================
 * - OBJETIVO: Demostrar que el analizador NO da falsos positivos.
 * - PROCEDIMIENTO: Analiza una imagen virgen que NUNCA ha sido procesada.
 * - RESULTADO ESPERADO: 0 Hits / 0% Confianza.
 */

import fs from 'fs';
import path from 'path';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

const IMAGEN_VIRGEN = 'Jerome-Locally Farm.jpg'; // La imagen del olivo
const DIRECTORIO_SALIDA = './test_results_v21_negativo';

function crearDirectorio(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function ejecutarVerificacionNegativa() {
    console.log('\n============================================================');
    console.log('🐉 DRAGON3 - TEST V21 "VERIFICACIÓN NEGATIVA"');
    console.log('============================================================\n');

    crearDirectorio(DIRECTORIO_SALIDA);

    if (!fs.existsSync(IMAGEN_VIRGEN)) {
        console.error(`❌ ERROR: No se encuentra la imagen ${IMAGEN_VIRGEN} en el directorio.`);
        return;
    }

    console.log(`[FASE ÚNICA] 🔍 Analizando imagen virgen: ${IMAGEN_VIRGEN}...`);
    console.log('Buscando espirales de Vogel y Twin-Blocks en contenido original...');

    const inicioAnalisis = Date.now();

    // Ejecutamos el analizador v15 directamente sobre la imagen virgen
    const resultado = await analizadorImagenMBH_v15(IMAGEN_VIRGEN);

    const duracionAnalisis = Date.now() - inicioAnalisis;
    const ev = resultado.response.evidencia_visual;

    console.log('\n============================================================');
    console.log('📊 RESULTADO DEL PERITAJE');
    console.log('============================================================');
    console.log(`📸 Imagen: ${IMAGEN_VIRGEN}`);
    console.log(`⏱️  Tiempo de proceso: ${duracionAnalisis}ms`);
    console.log(`🎯 Hits detectados: ${ev.Hits_Totales}`);
    console.log(`📈 Mejor Confianza: ${(ev.Mejor_Confianza * 100).toFixed(1)}%`);
    console.log(`👤 Cliente Identificado: ${ev.Cliente_Identificado ? ev.Cliente_Identificado.cliente : 'NINGUNO'}`);
    console.log('============================================================');

    if (ev.Hits_Totales === 0 && ev.Mejor_Confianza === 0) {
        console.log('\n✅ TEST SUPERADO: El analizador es HONESTO.');
        console.log('No se han encontrado falsos positivos en la imagen virgen.');
        console.log('Esto confirma que los resultados de ±5 eran REALES.');
    } else {
        console.log('\n⚠️  ALERTA: Se han detectado artefactos o falsos positivos.');
        console.log('Es necesario revisar la sensibilidad del Filtro Anti-Fantasmas.');
    }
    console.log('============================================================\n');
}

ejecutarVerificacionNegativa().catch(console.error);
