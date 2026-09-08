/**
 * ============================================================================
 * 🔧 SCRIPT DE MIGRACIÓN: Base de Datos v20 → v21
 * ============================================================================
 * Añade el campo "id_numerico" a cada registro de la base de datos
 * convirtiendo el hash_suffix hexadecimal a su valor decimal.
 *
 * EJEMPLO:
 * hash_suffix: "d760" → id_numerico: 55136 (0xd760 en decimal)
 * ============================================================================
 */

import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

console.log('🔧 DRAGON3 - MIGRACIÓN DE BASE DE DATOS v20 → v21');
console.log('===================================================\n');

// Función de conversión
function convertirHashANumerico(hashSuffix) {
    // Limpiamos el hash (quitar # si existe, convertir a minúsculas)
    const hashLimpio = hashSuffix.replace('#', '').toLowerCase();

    // Convertimos hex a decimal
    const idNumerico = parseInt(hashLimpio, 16);

    if (isNaN(idNumerico)) {
        console.error(`⚠️ ERROR: No se pudo convertir "${hashSuffix}" a número`);
        return null;
    }

    return idNumerico;
}

// Procesamos la base de datos
const baseActualizada = BASE_DE_DATOS_SELLOS.map((registro, index) => {
    const hashOriginal = registro.hash_suffix;
    const idNumerico = convertirHashANumerico(hashOriginal);

    if (idNumerico === null) {
        console.log(`❌ Registro #${index + 1} - FALLO en conversión`);
        return registro; // Mantener original si falla
    }

    // Crear nuevo registro con id_numerico
    const registroActualizado = {
        id_numerico: idNumerico,  // ✅ NUEVO CAMPO
        ...registro                // Resto de campos
    };

    console.log(`✅ Registro #${index + 1}: "${registro.cliente}" | hash: ${hashOriginal} → ID: ${idNumerico}`);

    return registroActualizado;
});

console.log(`\n📊 RESUMEN:`);
console.log(`   Total de registros: ${baseActualizada.length}`);
console.log(`   Conversiones exitosas: ${baseActualizada.filter(r => r.id_numerico !== undefined).length}`);

// Tabla de muestra (primeros 10 registros)
console.log('\n📋 MUESTRA DE CONVERSIONES (Primeros 10):');
console.log('┌─────────┬──────────────────────┬─────────────┬────────────┐');
console.log('│ Índice  │ Cliente              │ hash_suffix │ id_numerico│');
console.log('├─────────┼──────────────────────┼─────────────┼────────────┤');

baseActualizada.slice(0, 10).forEach((r, idx) => {
    const cliente = r.cliente.padEnd(20).substring(0, 20);
    const hash = r.hash_suffix.padEnd(11);
    const idNum = r.id_numerico ? r.id_numerico.toString().padStart(10) : 'N/A'.padStart(10);
    console.log(`│ ${(idx + 1).toString().padStart(7)} │ ${cliente} │ ${hash} │ ${idNum} │`);
});
console.log('└─────────┴──────────────────────┴─────────────┴────────────┘');

// Guardar archivo actualizado
const outputPath = './base_datos_sellos_v21.js';
const contenidoNuevo = `export const BASE_DE_DATOS_SELLOS = ${JSON.stringify(baseActualizada, null, 4)};`;

fs.writeFileSync(outputPath, contenidoNuevo, 'utf8');

console.log(`\n✅ BASE DE DATOS ACTUALIZADA GUARDADA EN:`);
console.log(`   ${outputPath}`);

console.log('\n🎯 PRÓXIMOS PASOS:');
console.log('   1. Revisar el archivo generado: base_datos_sellos_v21.js');
console.log('   2. Hacer backup de base_datos_sellos.js');
console.log('   3. Renombrar base_datos_sellos_v21.js → base_datos_sellos.js');
console.log('   4. Actualizar analizadorMBH.js con la versión corregida');
console.log('\n🚀 Después de esto, el matching debería funcionar correctamente.');
