/* MÓDULO: triajeAprendizaje.js
   OBJETIVO: Clasificar casos capturados en 'Auto-Label' o 'Manual-Review'.
*/

import fs from 'fs';
import path from 'path';

const DIR_ENTRENAMIENTO = path.join(process.cwd(), 'servicios', 'redSuperior', 'data', 'casos_capturados');
const PATH_DATASET_FINAL = path.join(process.cwd(), 'servicios', 'redSuperior', 'data', 'dataset_reentrenamiento.csv');

export const procesarCasosCapturados = () => {
    const archivos = fs.readdirSync(DIR_ENTRENAMIENTO).filter(f => f.endsWith('.json'));
    let autoEtiquetados = 0;
    let pendientesCronista = 0;

    archivos.forEach(archivo => {
        const fullPath = path.join(DIR_ENTRENAMIENTO, archivo);
        const caso = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        let veredictoFinal = null;

        // 1. PRIORIDAD CRONISTA: Si has firmado "ia", "ai" o "humano"
        const firma = caso.CRONISTA_VERDICT ? caso.CRONISTA_VERDICT.toLowerCase() : "";
        if (firma === 'ia' || firma === 'ai') {
            veredictoFinal = 'ia';
        } else if (firma === 'humano') {
            veredictoFinal = 'humano';
        }

        // 2. TRIAJE AUTOMÁTICO: Solo si no hay firma del Cronista
        if (!veredictoFinal) {
            const v_db3 = caso.GUARDIANES?.db3;
            const v_me = caso.GUARDIANES?.me;
            
            if (v_db3 && v_me && v_db3 === v_me && v_db3 !== "null") {
                veredictoFinal = v_db3;
            }
        }

        // 3. EJECUCIÓN: Si tenemos veredicto, movemos al CSV
        if (veredictoFinal) {
            // Limpiamos los corchetes del FEATURES_BLOB para que sea un CSV válido
            const featuresLimpio = caso.FEATURES_BLOB.replace(/[\[\]]/g, '');
            const nuevaLinea = `${featuresLimpio},${veredictoFinal}\n`;
            
            fs.appendFileSync(PATH_DATASET_FINAL, nuevaLinea);
            fs.unlinkSync(fullPath); // Borramos el JSON para no duplicar
            autoEtiquetados++;
        } else {
            pendientesCronista++;
        }
    });

    return { autoEtiquetados, pendientesCronista };
};