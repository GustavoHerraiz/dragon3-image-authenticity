// test-rs.cjs
const { redSuperior } = require('/opt/dragon3/prod/Dragon3/backend/servicios/redSuperior/redSuperior.js');

async function test() {
    console.log("🧠 Motor Espacial detectado. Probando predicción...");
    
    // 90 features neutras (0.5) para validar el flujo
    const mockFeatures = new Array(90).fill(0.5);
    
    try {
        // Ejecutamos la predicción
        const result = await redSuperior.predecir(mockFeatures);
        console.log("✅ RESULTADO RS:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("❌ Fallo en la ejecución del Cerebro:");
        console.log(err);
        // Si el método no se llama 'predecir', listamos los que tiene
        console.log("🔍 Métodos disponibles en redSuperior:", Object.keys(redSuperior));
    }
    process.exit(0);
}

test().catch(console.error);