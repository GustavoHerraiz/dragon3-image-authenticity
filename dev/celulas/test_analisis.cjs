const orquestador = require('./orquestador.js');
const fs = require('fs');

const imagenPath = './prueba.jpg';
const buffer = fs.readFileSync(imagenPath);
const base64 = buffer.toString('base64');

console.log('📸 Analizando:', imagenPath);

// Usar la función exportada por defecto
orquestador.default.procesarImagen(base64)
  .then(resultado => {
    const celdas = resultado.datosCelulas || {};
    console.log('📋 CÉLULAS:');
    for (const [nombre, datos] of Object.entries(celdas)) {
      const keys = Object.keys(datos).filter(k => datos[k] !== null);
      console.log(`\n🔬 ${nombre}:`);
      console.log('   Campos:', keys.join(', '));
    }
    console.log('\n✅ VEREDICTO:', resultado.veredicto);
  })
  .catch(err => console.error('❌ Error:', err.message));
