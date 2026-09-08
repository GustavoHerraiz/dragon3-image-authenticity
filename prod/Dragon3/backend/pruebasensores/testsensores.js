import path from 'path';
import { fileURLToPath } from 'url';
import AnalizadorHardware from './analizadorHardware.js'; // Asegúrate de que el archivo de la clase se llame así

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ejecutarTestAnalizador() {
    console.log("======================================================================");
    console.log(" TELEMETRÍA DE PRODUCCIÓN: EVALUACIÓN CON ANALIZADORHARDWARE ");
    console.log("======================================================================");

    const analizador = new AnalizadorHardware();
    const archivos = ['sellada1.png', 'sellada2.png', 'nosellada1.jpg', 'nosellada2.jpg'];

    for (const archivo of archivos) {
        const rutaCompleta = path.join(__dirname, archivo);
        console.log(`\n⏳ Procesando: ${archivo}...`);

        try {
            const resultado = await analizador.procesarImagen(rutaCompleta);

            console.log(`----------------------------------------------------------------------`);
            console.log(`📊 ARCHIVO: ${archivo.toUpperCase()}`);
            console.log(`⏱️ Tiempo de Cómputo : ${resultado.telemetria.tiempoMs} ms`);
            console.log(`🎯 Ratio Sello MBH   : ${resultado.telemetria.ratioSelloMBH !== undefined ? resultado.telemetria.ratioSelloMBH + '%' : 'N/A'}`);
            console.log(`📈 Bloques Evaluados : ${resultado.telemetria.hits}`);
            console.log(`🔋 Ruido Neto        : ${resultado.telemetria.ruido !== undefined ? resultado.telemetria.ruido.toFixed(5) : 'N/A'}`);
            console.log(`🚫 ¿Es Sintético?    : ${resultado.telemetria.esSintetico}`);
            
            if (resultado.veredicto) {
                console.log(`📢 VEREDICTO         : ${resultado.veredicto}`);
            } else if (resultado.advertencia) {
                console.log(`🚨 ADVERTENCIA       : ${resultado.advertencia}`);
            }
            
            console.log(`📝 EXPLICACIÓN       : ${resultado.explicacion}`);
        } catch (error) {
            console.error(`❌ Error crítico al analizar ${archivo}:`, error.message);
        }
    }
    console.log("\n======================================================================");
    console.log(" FIN DEL DIAGNÓSTICO TEMPORAL DE PRODUCCIÓN ");
    console.log("======================================================================");
}

ejecutarTestAnalizador();