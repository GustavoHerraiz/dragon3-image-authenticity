#!/usr/bin/env node

/**
 * scripts/evolucionar.js
 * 
 * Script para ejecutar la evolución automática.
 * Uso: node scripts/evolucionar.js [--min-frecuencia 2] [--min-tamanio 2]
 */

import { evolucionar } from '../evolucion/analizador.js';
import { program } from 'commander'; // Opcional, o usar argumentos simples

// Si no tienes commander, usa process.argv
const args = process.argv.slice(2);
let minFrecuencia = 2;
let minTamanio = 2;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min-frecuencia' && i+1 < args.length) {
    minFrecuencia = parseInt(args[i+1], 10);
    i++;
  } else if (args[i] === '--min-tamanio' && i+1 < args.length) {
    minTamanio = parseInt(args[i+1], 10);
    i++;
  }
}

console.log(`🚀 Ejecutando evolución con frecuencia mínima ${minFrecuencia} y tamaño mínimo ${minTamanio}`);
evolucionar(minFrecuencia, minTamanio);