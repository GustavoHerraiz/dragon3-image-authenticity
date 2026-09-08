import redSuperior from '../redSuperior/redSuperior.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURACIÓN OPTIMIZADA (máxima calidad)
// ============================================================================
const CONFIG = {
  purezaMinima: 0.98,        // 98% de una clase para considerar hoja
  maxProfundidad: 12,        // más profundo para capturar matices
  muestrasPorNodo: 500,      // muchas muestras para estabilidad
  minMuestrasDivision: 200,  // suficientes para evaluar divisiones
  umbralGananciaMin: 0.01,   // ganancia mínima para dividir (evita divisiones inútiles)
  // Nombres de las 20 entradas de la Red Mayor (personaliza según tu sistema)
  nombresDimensiones: [
    'score_artefactos_gan', 'score_artefactos_diffusion', 'score_exif_camara', 'score_exif_edicion',
    'score_textura', 'score_nitidez', 'score_compresion', 'score_c2pa', 'score_resolucion', 'score_metadatos',
    'local_contraste', 'local_ruido', 'local_saturacion', 'local_luminancia', 'local_bordes',
    'local_patrones', 'local_histograma', 'local_bloque', 'local_frecuencia', 'local_entropia'
  ]
};

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================
function entropia(conteo) {
  const total = Object.values(conteo).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let e = 0;
  for (let c of Object.values(conteo)) {
    const p = c / total;
    if (p > 0) e -= p * Math.log2(p);
  }
  return e;
}

async function muestrearRegion(bounds, n) {
  const conteo = { humano: 0, ia_generado: 0, editado: 0 };
  for (let i = 0; i < n; i++) {
    const punto = bounds.map(b => b.min + Math.random() * (b.max - b.min));
    const resultado = await redSuperior.predecirDesdeRedMayor(punto);
    conteo[resultado.categoria]++;
  }
  const total = n;
  let claseMayoritaria = 'humano';
  let maxCount = 0;
  for (const [clase, count] of Object.entries(conteo)) {
    if (count > maxCount) {
      maxCount = count;
      claseMayoritaria = clase;
    }
  }
  const pureza = maxCount / total;
  return { conteo, pureza, claseMayoritaria };
}

async function mejorDivision(bounds) {
  let mejorDim = -1;
  let mejorUmbral = null;
  let mejorGanancia = -Infinity;
  const muestrasAntes = await muestrearRegion(bounds, CONFIG.minMuestrasDivision);
  const entropiaAntes = entropia(muestrasAntes.conteo);
  if (entropiaAntes === 0) return { dim: -1, umbral: null, ganancia: 0 };
  for (let dim = 0; dim < 20; dim++) {
    const { min, max } = bounds[dim];
    if (max - min < 1e-6) continue;
    // Evaluamos 10 umbrales equidistantes (más precisión)
    for (let i = 1; i <= 10; i++) {
      const umbral = min + (max - min) * (i / 10);
      const boundsIzq = bounds.map((b, d) => d === dim ? { min: b.min, max: umbral } : { ...b });
      const boundsDer = bounds.map((b, d) => d === dim ? { min: umbral, max: b.max } : { ...b });
      const [izq, der] = await Promise.all([
        muestrearRegion(boundsIzq, CONFIG.minMuestrasDivision),
        muestrearRegion(boundsDer, CONFIG.minMuestrasDivision)
      ]);
      const entropiaIzq = entropia(izq.conteo);
      const entropiaDer = entropia(der.conteo);
      const proporcionIzq = CONFIG.minMuestrasDivision / (CONFIG.minMuestrasDivision * 2);
      const entropiaPonderada = proporcionIzq * entropiaIzq + (1 - proporcionIzq) * entropiaDer;
      const ganancia = entropiaAntes - entropiaPonderada;
      if (ganancia > mejorGanancia && ganancia > CONFIG.umbralGananciaMin) {
        mejorGanancia = ganancia;
        mejorDim = dim;
        mejorUmbral = umbral;
      }
    }
  }
  return { dim: mejorDim, umbral: mejorUmbral, ganancia: mejorGanancia };
}

async function construirArbol(bounds, profundidad = 0) {
  const muestras = await muestrearRegion(bounds, CONFIG.muestrasPorNodo);
  if (muestras.pureza >= CONFIG.purezaMinima || profundidad >= CONFIG.maxProfundidad) {
    return {
      tipo: 'hoja',
      clase: muestras.claseMayoritaria,
      pureza: muestras.pureza,
      conteo: muestras.conteo,
      bounds: bounds.map((b, i) => ({
        min: b.min.toFixed(3),
        max: b.max.toFixed(3),
        nombre: CONFIG.nombresDimensiones[i]
      }))
    };
  }
  const { dim, umbral, ganancia } = await mejorDivision(bounds);
  if (dim === -1 || ganancia <= 0) {
    return {
      tipo: 'hoja',
      clase: muestras.claseMayoritaria,
      pureza: muestras.pureza,
      conteo: muestras.conteo,
      bounds: bounds.map((b, i) => ({
        min: b.min.toFixed(3),
        max: b.max.toFixed(3),
        nombre: CONFIG.nombresDimensiones[i]
      }))
    };
  }
  const boundsIzq = bounds.map((b, d) => d === dim ? { min: b.min, max: umbral } : { ...b });
  const boundsDer = bounds.map((b, d) => d === dim ? { min: umbral, max: b.max } : { ...b });
  const nodo = {
    tipo: 'nodo',
    dimension: dim,
    nombreDimension: CONFIG.nombresDimensiones[dim],
    umbral: umbral.toFixed(4),
    ganancia: ganancia.toFixed(4),
    ramaIzq: await construirArbol(boundsIzq, profundidad + 1),
    ramaDer: await construirArbol(boundsDer, profundidad + 1),
    bounds: bounds.map((b, i) => ({
      min: b.min.toFixed(3),
      max: b.max.toFixed(3),
      nombre: CONFIG.nombresDimensiones[i]
    }))
  };
  return nodo;
}

export async function entrenarArbolExplicativo() {
  console.log('🌲 Generando árbol de reglas explicativo (muestreo intensivo, puede tomar varios minutos)...');
  const boundsIniciales = Array(20).fill().map(() => ({ min: 0, max: 1 }));
  const arbol = await construirArbol(boundsIniciales);
  const ruta = path.join(process.cwd(), 'reglasExportadas.json'); // guarda en raíz del proyecto
  fs.writeFileSync(ruta, JSON.stringify(arbol, null, 2));
  console.log(`✅ Árbol guardado en ${ruta}`);
  return arbol;
}

export function generarExplicacion(arbol, puntoRedMayor) {
  let nodo = arbol;
  const condiciones = [];
  while (nodo.tipo === 'nodo') {
    const valor = puntoRedMayor[nodo.dimension];
    const umbral = parseFloat(nodo.umbral);
    const nombre = nodo.nombreDimension;
    if (valor < umbral) {
      condiciones.push(`- El valor de **${nombre}** es **${valor.toFixed(3)}** (menor a ${umbral}).`);
      nodo = nodo.ramaIzq;
    } else {
      condiciones.push(`- El valor de **${nombre}** es **${valor.toFixed(3)}** (mayor o igual a ${umbral}).`);
      nodo = nodo.ramaDer;
    }
  }
  const pureza = nodo.pureza;
  const confianza = Math.round(pureza * 100);
  const clase = nodo.clase;
  let textoClase;
  if (clase === 'humano') textoClase = '**humano** (creación humana original)';
  else if (clase === 'ia_generado') textoClase = '**generado por inteligencia artificial**';
  else textoClase = '**editado** (modificado digitalmente)';
  let explicacion = `🔍 **Explicación de la decisión**:\n\n`;
  explicacion += `La imagen fue clasificada como ${textoClase} con una **confianza del ${confianza}%**.\n\n`;
  explicacion += `Los factores determinantes fueron:\n${condiciones.slice(0, 8).join('\n')}\n`;
  if (condiciones.length > 8) explicacion += `\n*(y ${condiciones.length - 8} condiciones más, omitidas por brevedad)*\n`;
  explicacion += `\n📊 *Esta ruta corresponde a una región del espacio de aprendizaje donde la red ha visto patrones muy consistentes.*`;
  return explicacion;
}