import { analizarImagen } from './imagen/analizadorELA.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Umbrales de tu analizador para el diagnóstico
const UMBRALES = {
    ia_stdDev: 2.0,
    ia_avgError: 2.0,
    humano_stdDev_min: 3.0,
    humano_avg_min: 3.0,
    manipulacion_maxError: 60
};

async function run() {
    console.log("🚀 INICIANDO AUTOPSIA ELA...");
    
    const r = await analizarImagen({ 
        rutaArchivo: path.join(__dirname, 'unico.png'), 
        archivoId: 'AUTOPSIA_001' 
    });
    
    const stats = r.forense.raw_data;
    if (!stats) return console.log("❌ No hay datos raw.");

    console.log("\n🔍 --- VALORES OBTENIDOS ---");
    console.log(`AvgError:   ${stats.avgError.toFixed(4)}`);
    console.log(`MaxError:   ${stats.maxError}`);
    console.log(`StdDev:     ${stats.stdDevError.toFixed(4)}`);

    console.log("\n⚖️  --- DIAGNÓSTICO DE LÓGICA ---");

    // 1. ¿Por qué NO es IA?
    if (stats.stdDevError > UMBRALES.ia_stdDev) {
        console.log(`❌ NO ES IA: La Uniformidad (${stats.stdDevError.toFixed(2)}) es mayor al umbral de 2.0. Tiene demasiado "ruido" para ser una IA pura.`);
    }

    // 2. ¿Por qué NO es Humano (Cámara)?
    if (stats.stdDevError < UMBRALES.humano_stdDev_min || stats.avgError < UMBRALES.humano_avg_min) {
        console.log(`❌ NO ES HUMANO (Cámara): El ruido (${stats.avgError.toFixed(2)}) o la varianza (${stats.stdDevError.toFixed(2)}) son demasiado bajos. Una cámara real suele dar Avg > 3 y StdDev > 3.`);
    }

    // 3. ¿Por qué es UNDEFINED?
    if (stats.maxError < UMBRALES.manipulacion_maxError) {
        console.log(`⚠️  ES INDETERMINADO: No hay picos de error (>60). La imagen es "plana" forensemente.`);
    }

    console.log("\n💡 --- CONCLUSIÓN DRAGON3 ---");
    console.log(`Veredicto: ${r.evaluacion.veredicto}`);
    console.log(`Peso:      ${r.evaluacion.peso.toUpperCase()}`);
    console.log(`Mensaje:   ${r.narrativa.titulo}`);
    
    if (r.evaluacion.peso === 'nulo') {
        console.log("\n🛡️  RESULTADO: El Sello MBH ignorará esta prueba porque los datos están en 'tierra de nadie' (Zona Gris).");
    }
}

run();