import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';

(async () => {
    // 📂 CONFIGURACIÓN DE CARPETA DE SALIDA
    const outputDir = './diagnostico_azul_resultados';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log(`📁 Carpeta creada: ${outputDir}`);
    }

    console.log("🔵 EXTRACCIÓN FORENSE DEL CANAL AZUL...");

    try {
        // 1. Crear y Sellar Master
        const generador = new GeneradorMBH();
        const lienzoPath = path.join(outputDir, 'lienzo_base.png');
        const masterPath = path.join(outputDir, 'master_estudio.png');

        await sharp({
            create: { width: 1000, height: 1000, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 255 } }
        }).png().toFile(lienzoPath);

        await generador.sellarImagen(lienzoPath, masterPath, { cliente: "TEST_EXTREMO" });

        const masterBuf = await sharp(masterPath).raw().toBuffer({ resolveWithObject: true });

        // 2. Probar Escalas Críticas
        const escalas = [1.0, 0.5];

        for (const factor of escalas) {
            const w = Math.round(masterBuf.info.width * factor);
            const h = Math.round(masterBuf.info.height * factor);

            // Redimensionado (Simulando el ataque)
            const resized = await sharp(masterBuf.data, {
                raw: { width: masterBuf.info.width, height: masterBuf.info.height, channels: 4 }
            })
            .resize(w, h, { kernel: 'lanczos3' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

            // 3. EXTRAER SOLO CANAL AZUL
            const blueChannel = Buffer.alloc(w * h);
            for (let i = 0; i < w * h; i++) {
                // RGBA -> Canal Azul es índice 2
                blueChannel[i] = resized.data[i * 4 + 2];
            }

            // Guardar resultado en la carpeta de diagnóstico
            const fileName = `CANAL_AZUL_x${factor.toString().replace('.', '_')}.png`;
            const filePath = path.join(outputDir, fileName);

            await sharp(blueChannel, { raw: { width: w, height: h, channels: 1 } })
                .png()
                .toFile(filePath);

            console.log(`✅ Resultado guardado en: ${filePath}`);
        }

        // Limpiar el lienzo base para no dejar basura
        if (fs.existsSync(lienzoPath)) fs.unlinkSync(lienzoPath);

    } catch (error) {
        console.error("❌ Error en el proceso:", error);
    }
})();
