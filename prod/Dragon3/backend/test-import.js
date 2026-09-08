import path from 'path';
import fs from 'fs/promises';

async function testDinamico() {
    const dir = '/opt/dragon3/prod/Dragon3/backend/servicios/imagen/analizadores/imagen';
    
    console.log('--- VALIDANDO MOTOR DINÁMICO ---');
    console.log('Directorio:', dir);

    try {
        const archivos = await fs.readdir(dir);
        console.log(`Archivos encontrados: ${archivos.length}`);

        for (const archivo of archivos) {
            if (archivo.endsWith('.js') && !archivo.startsWith('.')) {
                const rutaAbsoluta = path.join(dir, archivo);
                
                try {
                    // USAMOS file:// para asegurar que ESM no se pierda en Linux
                    const modulo = await import(`file://${rutaAbsoluta}`);
                    const tieneFuncion = !!(modulo.default || modulo.analizarImagen || modulo.analizar);
                    
                    console.log(`✅ [${archivo}] cargado. ¿Función detectada?: ${tieneFuncion}`);
                } catch (err) {
                    console.error(`❌ [${archivo}] ERROR DE IMPORTACIÓN:`, err.message);
                }
            }
        }
    } catch (e) {
        console.error('❌ FALLO CRÍTICO AL LEER DIRECTORIO:', e.message);
    }
}

testDinamico();