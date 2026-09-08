import sharp from 'sharp';
import { performance } from 'node:perf_hooks';

async function test() {
    const start = performance.now();
    try {
        console.log("🚀 Iniciando test de Sharp...");
        // Intentamos crear un buffer vacío de 100x100
        const buffer = await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 4,
                background: { r: 255, g: 0, b: 0, alpha: 0.5 }
            }
        }).png().toBuffer();
        
        const end = performance.now();
        console.log(`✅ Sharp operativo. Tiempo: ${(end - start).toFixed(2)}ms`);
        console.log(`📦 Buffer generado: ${buffer.length} bytes`);
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN SHARP:");
        console.error(err);
        process.exit(1);
    }
}
test();
