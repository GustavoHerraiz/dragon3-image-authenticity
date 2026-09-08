/* MÓDULO: reentrenar-rs.js
   OBJETIVO: Carga el dataset de errores corregidos y reajusta la Red Superior.
*/

import fs from 'fs';
import path from 'path';
import { RedSuperiorSmallNN } from './redSuperior.js';

const PATH_DATASET = path.join(process.cwd(), 'servicios', 'redSuperior', 'data', 'dataset_reentrenamiento.csv');

async function ejecutarReentrenamiento() {
    console.log("--- 🧠 REENTRENAMIENTO EVOLUTIVO RS ---");

    if (!fs.existsSync(PATH_DATASET)) {
        console.log("❌ No hay dataset de reentrenamiento. Necesitas validar casos primero.");
        return;
    }

    // Instanciamos la Red. El constructor ya debería manejar la carga inicial.
    const rs = new RedSuperiorSmallNN();

    // Eliminamos 'inicializar()' y usamos un chequeo de seguridad por si acaso
    try {
        const lineas = fs.readFileSync(PATH_DATASET, 'utf-8').trim().split('\n');
        
        if (lineas.length === 0 || lineas[0] === "") {
            console.log("⚠️ El dataset está vacío. Abortando.");
            return;
        }

        console.log(`📈 Procesando ${lineas.length} nuevos patrones de aprendizaje...`);

        // En el estándar de nuestra SmallNN, el método es optimizarPesos
        const exito = await rs.optimizarPesos(lineas);

        if (exito) {
            console.log("✅ Red Superior actualizada con éxito. Nuevos patrones integrados.");
            
            // Rotación de logs/dataset para evitar duplicados en el próximo entrenamiento
            const backupPath = `${PATH_DATASET}_${Date.now()}.bak`;
            fs.renameSync(PATH_DATASET, backupPath);
            console.log(`📦 Dataset archivado en: ${path.basename(backupPath)}`);
        }
    } catch (error) {
        console.error("❌ Fallo crítico en el reentrenamiento:", error.message);
    }
}

ejecutarReentrenamiento();