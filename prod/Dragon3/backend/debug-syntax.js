import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [
  './utilidades/redis/core/constants.js',
  './utilidades/redis/core/RedisClient.js',
  './utilidades/redis/core/ConnectionManager.js',
  './utilidades/redis/StreamManager.js',
  './utilidades/redis/streams/StreamConsumer.js', // ¡He añadido este!
  './utilidades/redis/index.js'
];

async function findTheCulpable() {
  console.log("🚀 INICIANDO ESCÁNER DE PRE-COMPILACIÓN DRAGON3...");

  for (const file of files) {
    const filePath = resolve(file);
    try {
      // Forzamos el import dinámico
      await import(`${filePath}?cachebust=${Date.now()}`);
      console.log(`✅ ${file}: LIMPIO`);
    } catch (err) {
      console.log(`\n❌ ¡ERROR ENCONTRADO EN: ${file}!`);
      console.log(`--------------------------------------------------`);
      console.log(`MENSAJE: ${err.message}`);
      
      if (err.stack) {
        // Intentamos extraer la línea del stack trace
        const lineMatch = err.stack.match(/(\d+):(\d+)/);
        if (lineMatch) {
          console.log(`📍 POSIBLE LÍNEA: ${lineMatch[1]} (Columna ${lineMatch[2]})`);
        }
      }

      // LEER EL ARCHIVO PARA BUSCAR EL ":" CORRUPTO
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        console.log("🔍 REVISANDO CÓDIGO SOSPECHOSO:");
        lines.forEach((line, i) => {
          // Buscamos dos puntos que no estén en strings o comentarios
          if (line.includes(':') && !line.includes("'") && !line.includes('"') && !line.includes('//')) {
            console.log(`   [LÍNEA ${i + 1}] -> ${line.trim()}`);
          }
        });
      } catch (readErr) {
        console.log("No se pudo leer el contenido del archivo.");
      }
      console.log(`--------------------------------------------------\n`);
    }
  }
}

findTheCulpable();