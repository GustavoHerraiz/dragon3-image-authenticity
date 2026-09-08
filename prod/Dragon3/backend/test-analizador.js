import analizadorImagen from './servicios/imagen/analizadorImagen.js';
import { performance } from 'node:perf_hooks';

async function test() {
    console.log("🚀 Iniciando test de Analizador de Imagen...");
    const start = performance.now();
    
    /**
     * Ajuste Crítico: El Analizador FAANG requiere rutaArchivo y archivoId
     * para superar la validación de la línea 4279.
     */
    const mockArchivo = {
        path: '/opt/dragon3/prod/Dragon3/backend/temp/test_image.png', // Legacy path
        rutaArchivo: '/opt/dragon3/prod/Dragon3/backend/temp/test_image.png', // FAANG requirement
        archivoId: 'test-forense-2026', // FAANG requirement
        originalname: 'test_image.png',
        mimetype: 'image/png'
    };

    try {
        console.log(`🔍 Probando análisis para: ${mockArchivo.rutaArchivo}`);
        
        /**
         * Como 'export default' es la función 'analizarImagen', 
         * la llamamos directamente.
         */
        const resultado = await analizadorImagen(mockArchivo);
        
        const end = performance.now();
        console.log("✅ Análisis completado con éxito");
        console.log("📊 RESULTADOS:", JSON.stringify(resultado, null, 2));
        console.log(`⏱️ Tiempo total: ${(end - start).toFixed(2)}ms`);
        
    } catch (err) {
        console.error("❌ ERROR EN EL ANALIZADOR:");
        // Si es un DragonError, imprimimos sus detalles técnicos
        if (err.code) {
            console.error(`Código: ${err.code}`);
            console.error(`Módulo: ${err.module}`);
            console.error(`Mensaje: ${err.message}`);
        } else {
            console.error(err);
        }
    }
    process.exit(0);
}

test();