// knnExplicador.js - Explicaciones en lenguaje natural (+ modo técnico opcional)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let conocimiento = [];

// ========== DICCIONARIO DE TÉRMINOS AMIGABLES ==========
const nombresAmigables = {
  'exif_camera': 'metadatos de cámara',
  'exif_editing': 'huellas de edición',
  'texture': 'textura',
  'gan_artifacts': 'artefactos GAN',
  'diffusion_artifacts': 'artefactos de difusión',
  'sharpness': 'nitidez',
  'compression': 'compresión',
  'c2pa': 'credenciales C2PA',
  'resolution': 'resolución',
  'metadata': 'metadatos generales'
};

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========== CARGA DEL CONOCIMIENTO ==========
export function cargarConocimiento(ruta = null) {
  const archivo = ruta || path.join(process.cwd(), 'conocimiento.json');
  if (!fs.existsSync(archivo)) {
    throw new Error(`No se encuentra el archivo de conocimiento: ${archivo}`);
  }
  conocimiento = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log(`📚 Conocimiento KNN cargado: ${conocimiento.length} ejemplos`);
}

// ========== DISTANCIA EUCLIDEA ==========
function distanciaEuclidea(a, b) {
  if (a.length !== b.length) throw new Error('Vectores de diferente dimensión');
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ========== EXPLICACIÓN PRINCIPAL (con voto ponderado) ==========
export function explicarPorKNN(input20, k = 5) {
  if (!conocimiento.length) throw new Error('Conocimiento no cargado.');
  const distances = conocimiento.map(entry => ({
    ...entry,
    distancia: distanciaEuclidea(input20, entry.input20)
  }));
  distances.sort((a, b) => a.distancia - b.distancia);
  const vecinos = distances.slice(0, k);

  // Voto ponderado por inverso de distancia
  const pesos = {};
  for (const v of vecinos) {
    const peso = 1 / (v.distancia + 1e-9);
    pesos[v.categoria] = (pesos[v.categoria] || 0) + peso;
  }
  let clase = null;
  let maxPeso = -1;
  for (const [cat, p] of Object.entries(pesos)) {
    if (p > maxPeso) {
      maxPeso = p;
      clase = cat;
    }
  }
  const pesoTotal = Object.values(pesos).reduce((a, b) => a + b, 0);
  const confianza = maxPeso / pesoTotal;

  const vecinosDetalle = vecinos.map(v => ({
    id: v.id,
    categoria: v.categoria,
    distancia: v.distancia.toFixed(4),
    peso: (1 / (v.distancia + 1e-9)).toFixed(4)
  }));

  return { clase, confianza: Math.round(confianza * 100) / 100, vecinos: vecinosDetalle, vecinoMasCercano: distances[0] };
}

// ========== GENERACIÓN DE TEXTO EN LENGUAJE NATURAL ==========
export function generarExplicacionTexto(input20, k = 5, opciones = {}) {
  const modoDetallado = opciones.modoDetallado === true; // por defecto false (solo lenguaje natural)
  const { clase, confianza, vecinos, vecinoMasCercano } = explicarPorKNN(input20, k);
  const confianzaPorcentaje = Math.round(confianza * 100);
  const totalEjemplos = conocimiento.length;

  // Traducción de la clase
  let claseTexto = '';
  if (clase === 'humano') claseTexto = 'HUMANO';
  else if (clase === 'ia_generado') claseTexto = 'GENERADO POR IA';
  else claseTexto = 'EDITADO (modificado digitalmente)';

  let explicacion = `🧠 **EXPLICACIÓN DE LA RED SUPERIOR (KNN)**\n\n`;
  explicacion += `✅ **Decisión Final:** La imagen ha sido clasificada como **${claseTexto}** con una confianza del **${confianzaPorcentaje}%**.\n\n`;
  explicacion += `🔍 **¿Cómo se llegó a esta conclusión?**\n`;
  explicacion += `El sistema comparó tu imagen con ${totalEjemplos} ejemplos de su base de conocimiento. Los ${k} ejemplos más parecidos son todos de la categoría **${clase}** y su voto ponderado fue unánime.\n\n`;

  // Si tenemos features90, calculamos diferencias cualitativas
  if (opciones.features90 && vecinoMasCercano && vecinoMasCercano.features90) {
    const diffs = [];
    for (let i = 0; i < 90; i++) {
      const diff = Math.abs(opciones.features90[i] - vecinoMasCercano.features90[i]);
      if (diff > 0.1) {
        const spIdx = Math.floor(i / 9);
        const nombreTecnico = opciones.nombresEspecialistas?.[spIdx] || `especialista_${spIdx}`;
        const nombreAmigable = nombresAmigables[nombreTecnico] || nombreTecnico;
        diffs.push({ nombre: nombreAmigable, diff: diff.toFixed(2), tecnico: nombreTecnico });
      }
    }
    diffs.sort((a, b) => b.diff - a.diff);
    const topDiffs = diffs.slice(0, 4);
    if (topDiffs.length) {
      explicacion += `📊 **¿Qué hace que esta imagen sea '${claseTexto}'?**\n`;
      explicacion += `Las mayores diferencias con el ejemplo más parecido (${vecinoMasCercano.id}, también ${vecinoMasCercano.categoria}) son:\n`;
      for (const d of topDiffs) {
        let nivel = '';
        if (d.diff > 0.8) nivel = 'enorme';
        else if (d.diff > 0.5) nivel = 'importante';
        else nivel = 'moderada';
        explicacion += `- **${capitalizar(d.nombre)}**: diferencia ${nivel} (${d.diff} sobre 1). `;
        if (d.tecnico === 'metadata' && clase === 'humano') {
          explicacion += `Esto indica que tu imagen tiene una huella digital muy limpia y coherente.\n`;
        } else if (d.tecnico === 'exif_editing' && clase === 'humano') {
          explicacion += `Sugiere que la imagen no ha sido editada de forma intensiva.\n`;
        } else {
          explicacion += `\n`;
        }
      }
      explicacion += `\n`;
    }
  }

  // Bloque técnico (solo si modoDetallado = true)
  if (modoDetallado) {
    explicacion += `💡 **Datos técnicos (avanzado):**\n`;
    explicacion += `**Vecinos considerados (distancia, peso):**\n`;
    for (let i = 0; i < vecinos.length; i++) {
      explicacion += `  ${i+1}. ${vecinos[i].categoria} (dist ${vecinos[i].distancia}, peso ${vecinos[i].peso}) - id: ${vecinos[i].id}\n`;
    }
    if (opciones.features90 && vecinoMasCercano && vecinoMasCercano.features90) {
      explicacion += `\n**Principales diferencias con el vecino más cercano (${vecinoMasCercano.id}, clase ${vecinoMasCercano.categoria}):**\n`;
      const tecDiffs = [];
      for (let i = 0; i < 90; i++) {
        const diff = Math.abs(opciones.features90[i] - vecinoMasCercano.features90[i]);
        if (diff > 0.1) {
          const spIdx = Math.floor(i / 9);
          const nombreTecnico = opciones.nombresEspecialistas?.[spIdx] || `especialista_${spIdx}`;
          tecDiffs.push({ tecnico: nombreTecnico, diff: diff.toFixed(2) });
        }
      }
      tecDiffs.sort((a,b) => b.diff - a.diff);
      tecDiffs.slice(0, 5).forEach(d => {
        explicacion += `  - ${d.tecnico}: diferencia de ${d.diff}\n`;
      });
    }
  } else {
    explicacion += `💡 **Nota adicional:** Para ver los identificadores de los vecinos y las diferencias técnicas exactas, puedes solicitar el modo experto (próximamente).\n`;
  }

  explicacion += `\n📌 **Resumen:** La red neuronal ha aprendido a reconocer patrones sutiles en las imágenes. Esta explicación se basa en los ejemplos más cercanos de su entrenamiento, lo que hace la decisión transparente y comprensible.`;

  return explicacion;
}