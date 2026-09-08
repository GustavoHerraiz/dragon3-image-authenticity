/**
 * TEST DE RECUPERACIÓN POR GEOMETRÍA PREDICTIVA
 * Objetivo: Validar resizes 0.33x, 0.66x y 0.9x ignorando el Radar.
 */

const resizes_criticos = [
    { escala: 0.33, nombre: "RESIZE_0_33x" },
    { escala: 0.66, nombre: "RESIZE_0_66x" },
    { escala: 0.90, nombre: "RESIZE_0_9x" }
];

async function testPredictivo() {
    console.log("🚀 Iniciando Escáner Quirúrgico V21...");

    for (let test of resizes_criticos) {
        console.log(`\n--- Analizando ${test.nombre} (s:${test.escala}) ---`);

        // 1. CÁLCULO DE LA COORDENADA TEÓRICA (Fórmula Dragon)
        // Usamos la constante k=4 detectada en el JSON
        const k = 4;
        const coordTeorica = Math.round(k * test.escala);

        console.log(`📍 Coordenada Teórica Calculada: (${coordTeorica}, ${coordTeorica})`);

        // 2. EXTRACCIÓN FORZADA
        // No buscamos el pico de energía, leemos exactamente en el offset calculado
        const resultado = await Dragon3.extractAtOffset({
            image: test.nombre,
            offsetX: coordTeorica,
            offsetY: coordTeorica,
            precision: "HIGH_32BIT" // Forzamos lectura completa de 32 bits
        });

        // 3. VALIDACIÓN POR INTEGRIDAD (Checksum)
        if (resultado.hashObtenido === "000D760") {
            console.log(`✅ ¡ÉXITO! El ID estaba donde predijo la matemática.`);
            console.log(`📊 Energía en ese punto: ${resultado.energia}`);
            console.log(`🎯 Correlación: ${resultado.correlacion}`);
        } else {
            console.log(`❌ Fallo en (${coordTeorica},${coordTeorica}). Probando micro-ajuste de fase...`);

            // Si falla, probamos un entorno de 1px (Micro-jitter de interpolación)
            const rescate = await Dragon3.microScanner({
                center: coordTeorica,
                range: 1
            });

            if (rescate.exito) {
                console.log(`⚠️ Recuperado con Micro-ajuste en: (${rescate.x}, ${rescate.y})`);
            } else {
                console.log(`💀 Punto muerto. El aliasing destruyó el bitstream.`);
            }
        }
    }
}
