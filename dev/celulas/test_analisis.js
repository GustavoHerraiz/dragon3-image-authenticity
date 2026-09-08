const fs = require('fs');
const orquestador = require('./orquestador.js');

const imagenPath = './prueba.jpg';
if (!fs.existsSync(imagenPath)) {
  console.log('❌ No existe prueba.jpg');
  const files = fs.readdirSync('.').filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log('📸 Imágenes disponibles:', files.slice(0, 5));
  process.exit(1);
}

const buffer = fs.readFileSync(imagenPath);
const base64 = buffer.toString('base64');

console.log('📸 Analizando:', imagenPath);
console.log('📊 Tamaño:', buffer.length, 'bytes\n');

orquestador.procesarImagen(base64)
  .then(resultado => {
    const celdas = resultado.datosCelulas || {};
    console.log('📋 CÉLULAS EJECUTADAS:');
    for (const [nombre, datos] of Object.entries(celdas)) {
      console.log(`\n🔬 ${nombre}:`);
      const keys = Object.keys(datos).filter(k => datos[k] !== null && datos[k] !== undefined);
      console.log('   Campos con valor:', keys.join(', '));
    }
    console.log('\n✅ VEREDICTO:', resultado.veredicto);
  })
  .catch(err => console.error('❌ Error:', err.message));
