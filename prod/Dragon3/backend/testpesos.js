import redSuperior from './servicios/redSuperior/redSuperior.js';
const ultimaCapa = redSuperior.redMayor.layers[redSuperior.redMayor.layers.length - 1];
console.log('Biases última capa:', ultimaCapa.biases);