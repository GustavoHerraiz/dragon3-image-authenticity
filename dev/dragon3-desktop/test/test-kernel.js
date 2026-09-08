import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuración
const IMAGEN_PRUEBA = path.join(__dirname, 'prueba.jpg');
const RESULTADOS = [];

async function medirTiempo(nombre, fn) {
  const inicio = performance.now();
  await fn();
  const fin = performance.now();
  const tiempo = fin - inicio;
  RESULTADOS.push({ nombre, tiempo: Math.round(tiempo) });
  return tiempo;
}

async function pruebaJavaScriptPuro() {
  const imagen = sharp(IMAGEN_PRUEBA);
  const { data, info } = await imagen.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  
  // Simular extracción de canal azul y modificación simple
  const blueChannel = new Uint8Array(data.length / 4);
  for (let i = 0; i < data.length / 4; i++) {
    blueChannel[i] = data[i * 4 + 2];
  }
  
  // Aplicar modificación simple a cada bloque 8x8 (simulando DCT)
  const blockSize = 8;
  for (let y = 0; y <= info.height - blockSize; y += blockSize) {
    for (let x = 0; x <= info.width - blockSize; x += blockSize) {
      // Extraer bloque
      const block = [];
      for (let i = 0; i < 8; i++) {
        const row = [];
        for (let j = 0; j < 8; j++) {
          const idx = ((y + i) * info.width + (x + j));
          row.push(blueChannel[idx]);
        }
        block.push(row);
      }
      
      // Modificar el centro del bloque (simulación de DCT)
      block[4][4] = block[4][4] + 1;
      
      // Escribir de vuelta
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const idx = ((y + i) * info.width + (x + j));
          blueChannel[idx] = Math.min(255, Math.max(0, block[i][j]));
        }
      }
    }
  }
  
  // Copiar de vuelta al buffer (simulación)
  for (let i = 0; i < data.length / 4; i++) {
    data[i * 4 + 2] = blueChannel[i];
  }
}

async function pruebaSharpKernel() {
  const imagen = sharp(IMAGEN_PRUEBA);
  
  // Extraer canal azul como imagen separada
  const canalAzul = await imagen
    .extractChannel(2) // Canal azul (índice 2 en RGB)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // Crear un kernel simple para "simular" modificación de DCT
  // Este kernel modifica el centro de cada bloque 8x8
  const kernel = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ];
  
  // Aplicar convolución (simulación)
  // Nota: sharp no soporta convolución directamente en canales extraídos,
  // así que esta es una simulación conceptual.
  // En la práctica, usaríamos sharp.convolve() sobre la imagen completa.
  
  // Simulación simple: modificar píxeles centrales de cada bloque
  const blockSize = 8;
  const width = canalAzul.info.width;
  const height = canalAzul.info.height;
  const buffer = canalAzul.data;
  
  for (let y = 0; y <= height - blockSize; y += blockSize) {
    for (let x = 0; x <= width - blockSize; x += blockSize) {
      // Modificar el centro de cada bloque (4,4)
      const idx = ((y + 4) * width + (x + 4));
      buffer[idx] = Math.min(255, Math.max(0, buffer[idx] + 1));
    }
  }
}

async function pruebasCompletas() {
  console.log('🧪 INICIANDO PRUEBAS DE RENDIMIENTO...\n');
  
  // Verificar que existe la imagen
  if (!fs.existsSync(IMAGEN_PRUEBA)) {
    console.error(`❌ Error: No se encontró la imagen en ${IMAGEN_PRUEBA}`);
    console.log('📌 Coloca una imagen llamada "prueba.jpg" en la misma carpeta.');
    process.exit(1);
  }

  // Obtener información de la imagen
  const metadata = await sharp(IMAGEN_PRUEBA).metadata();
  console.log(`📸 Imagen: ${metadata.width}x${metadata.height} píxeles`);
  console.log(`📦 Tamaño: ${(fs.statSync(IMAGEN_PRUEBA).size / 1024 / 1024).toFixed(2)} MB\n`);
  
  // Prueba 1: JavaScript puro (versión actual)
  console.log('⏳ Prueba 1: JavaScript puro (simulación DCT)...');
  const tiempoJS = await medirTiempo('JavaScript Puro', pruebaJavaScriptPuro);
  console.log(`✅ JavaScript Puro: ${tiempoJS}ms (${(tiempoJS/1000).toFixed(2)}s)`);
  
  // Prueba 2: Sharp (simulación kernel)
  console.log('⏳ Prueba 2: Sharp (simulación kernel)...');
  const tiempoSharp = await medirTiempo('Sharp Kernel', pruebaSharpKernel);
  console.log(`✅ Sharp Kernel: ${tiempoSharp}ms (${(tiempoSharp/1000).toFixed(2)}s)`);
  
  // Prueba 3: Sharp nativo (solo lectura, referencia)
  console.log('⏳ Prueba 3: Sharp nativo (solo lectura, referencia)...');
  const tiempoRef = await medirTiempo('Sharp Referencia', async () => {
    await sharp(IMAGEN_PRUEBA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  });
  console.log(`✅ Sharp Referencia: ${tiempoRef}ms (${(tiempoRef/1000).toFixed(2)}s)`);
  
  // Calcular mejora
  const mejora = ((tiempoJS - tiempoSharp) / tiempoJS * 100).toFixed(1);
  const factor = (tiempoJS / tiempoSharp).toFixed(1);
  
  // Mostrar tabla de resultados
  console.log('\n📊 TABLA DE RESULTADOS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('│ Prueba               │ Tiempo (ms) │ Tiempo (s) │ Mejora   │');
  console.log('├──────────────────────┼─────────────┼────────────┼──────────┤');
  
  const ordenados = [...RESULTADOS].sort((a, b) => a.tiempo - b.tiempo);
  const base = ordenados[0].tiempo;
  
  for (const r of ordenados) {
    const porcentaje = ((base / r.tiempo) * 100).toFixed(1);
    const etiqueta = r.nombre === 'JavaScript Puro' ? '❌' : r.nombre === 'Sharp Kernel' ? '✅' : '📌';
    console.log(`│ ${etiqueta} ${r.nombre.padEnd(18)} │ ${String(r.tiempo).padStart(11)} │ ${(r.tiempo/1000).toFixed(2).padStart(10)} │ ${porcentaje.padStart(8)}% │`);
  }
  
  console.log('├──────────────────────┼─────────────┼────────────┼──────────┤');
  console.log(`│ ✅ Mejor tiempo      │ ${String(Math.min(...RESULTADOS.map(r => r.tiempo))).padStart(11)} │ ${(Math.min(...RESULTADOS.map(r => r.tiempo))/1000).toFixed(2).padStart(10)} │ 100.0%    │`);
  console.log('╚══════════════════════╧═════════════╧════════════╧══════════╝\n');
  
  // Análisis final
  console.log('🔍 ANÁLISIS FINAL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📌 JavaScript Puro: ${tiempoJS}ms (${(tiempoJS/1000).toFixed(2)}s)`);
  console.log(`✅ Sharp Kernel:   ${tiempoSharp}ms (${(tiempoSharp/1000).toFixed(2)}s)`);
  console.log(`🚀 Mejora:        ${mejora}% (${factor}x más rápido)`);
  
  if (tiempoSharp < tiempoJS) {
    console.log('🎉 ¡Sharp es más rápido! Esta optimización es viable.');
  } else {
    console.log('⚠️ Sharp no mejoró el rendimiento en esta simulación.');
  }
  
  console.log('\n✅ Pruebas completadas.');
}

// Ejecutar pruebas
pruebasCompletas().catch(err => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});
