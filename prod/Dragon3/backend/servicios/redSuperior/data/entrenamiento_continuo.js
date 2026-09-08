/* MÓDULO: registroAprendizaje.js
   OBJETIVO: Persistir datos de baja confianza para reentrenamiento MBH.
   RUTA: servicios/redSuperior/utils/registroAprendizaje.js
*/

import fs from 'fs';
import path from 'path';
import { explicarDilema } from '../utils/analistaForense.js';

const ENTRENAMIENTO_DIR = path.join(process.cwd(), 'servicios', 'redSuperior', 'data', 'casos_capturados');

// Asegurar que la carpeta existe
if (!fs.existsSync(ENTRENAMIENTO_DIR)) {
    fs.mkdirSync(ENTRENAMIENTO_DIR, { recursive: true });
}

export const registrarCasoDificil = async (datos) => {
    try {
        const filePath = path.join(ENTRENAMIENTO_DIR, `caso_${Date.now()}.json`);

        // Extraemos con valores seguros para evitar el error de 'join'
        const analizadores = datos.analizadores_locales || [0, 0, 0, 0, 0];
        const prediccion = datos.prediccion_rs || { confianza: 0, scores: [0, 0, 0] };

        const payload = {
            CRONISTA_VERDICT: "--- PENDIENTE ---",
            DILEMA: explicarDilema(datos),
            TELEMETRIA: {
                analizadores: `[${analizadores.join(', ')}]`, // <-- Ahora seguro
                confianza: `${(prediccion.confianza * 100).toFixed(1)}%`,
                timestamp: new Date().toISOString()
            },
            GUARDIANES: {
                db3: datos.veredicto_db3 || "null",
                me: datos.veredicto_me || "null"
            },
            FEATURES_BLOB: JSON.stringify(datos.features || [])
        };

        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
        return true;
    } catch (error) {
        console.error("❌ Error registrando caso difícil:", error);
        return false;
    }
};