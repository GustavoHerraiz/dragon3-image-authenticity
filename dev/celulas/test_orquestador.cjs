const { default: Orquestador } = require('./orquestador.js');
const fs = require('fs');

// Cargar plan
const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orq = new Orquestador(plan);

// Preparar entrada CORRECTA
const imagenPath = './prueba.jpg';
const buffer = fs.readFileSync(imagenPath);
const base64 = buffer.toString('base64');

const entrada = {
  archivo: {
    buffer: base64,
    formato: 'jpg',
    nombre: 'prueba.jpg'
  }
};

orq.ejecutar(entrada)
  .then(resultado => {
    console.log('\n📋 RESULTADO COMPLETO:');
    console.log(JSON.stringify(resultado.resultado, null, 2));
  })
  .catch(err => console.error('❌ Error:', err.message));
