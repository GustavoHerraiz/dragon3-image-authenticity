/* MÓDULO: admin-rs.js
   OBJETIVO: Ejecutar el triaje y reportar el estado del aprendizaje continuo.
*/

import { procesarCasosCapturados } from './utils/triajeAprendizaje.js';
import fs from 'fs';
import path from 'path';

const DIR_ENTRENAMIENTO = path.join(process.cwd(), 'servicios', 'redSuperior', 'data', 'casos_capturados');

console.log("--- 🐲 PANEL DE CONTROL: APRENDIZAJE RS ---");

const archivosPendientes = fs.readdirSync(DIR_ENTRENAMIENTO).filter(f => f.endsWith('.json')).length;

if (archivosPendientes === 0) {
    console.log("ℹ️ No hay casos nuevos para procesar. Los guardianes están al día.");
} else {
    console.log(`🔍 Detectados ${archivosPendientes} casos en la 'Zona de Sombra'.`);
    console.log("⚙️ Ejecutando triaje automático (DB3 + ME)...");

    const { autoEtiquetados, pendientesCronista } = procesarCasosCapturados();

    console.log("--- ✅ RESULTADOS DEL TRIAJE ---");
    console.log(`📥 Auto-etiquetados (Verdades Absolutas): ${autoEtiquetados}`);
    console.log(`⚖️ Pendientes de revisión (Cronista Jefe): ${pendientesCronista}`);
    console.log("-----------------------------------------");
    
    if (pendientesCronista > 0) {
        console.log("⚠️ Nota: Los casos pendientes requieren tu veredicto manual en la carpeta /entrenamiento_continuo.");
    }
}