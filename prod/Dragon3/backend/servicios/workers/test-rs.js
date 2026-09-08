// test-rs.js
const { redSuperior } = require('../backend/servicios/redSuperior'); // Ajusta ruta si hace falta

async function test() {
    console.log("🔍 Cargando Motor Espacial...");
    await redSuperior.initialize();
    
    const mockFeatures = new Array(90).fill(0.5);
    console.log("🧠 Ejecutando predicción de prueba...");
    
    const result = await redSuperior.predecir(mockFeatures);
    console.log("✅ RESULTADO RS:", JSON.stringify(result, null, 2));
    process.exit(0);
}

test().catch(console.error);