/**
 * Convierte un array de 90 features (10 especialistas × 9) en los 20 inputs
 * que necesita la Red Mayor y el KNN explicativo.
 * Los 10 scores de especialistas se calculan como la media de cada bloque de 9.
 * Los 10 analizadores locales se reciben por separado (se guardarán junto a features90).
 * @param {number[]} features90 - Array de 90 números.
 * @param {number[]} localAnalyzers - Array de 10 números (opcional, si no se proporciona, se rellena con 0.5).
 * @returns {number[]} input20 - Array de 20 números.
 */
export function convertir90a20(features90, localAnalyzers = null) {
  if (!Array.isArray(features90) || features90.length !== 90) {
    throw new Error(`Se requieren 90 features, recibidos ${features90?.length}`);
  }
  const scores = [];
  for (let i = 0; i < 90; i += 9) {
    const block = features90.slice(i, i + 9);
    const mean = block.reduce((a, b) => a + b, 0) / 9;
    scores.push(mean);
  }
  const locals = Array.isArray(localAnalyzers) && localAnalyzers.length === 10 ? localAnalyzers : Array(10).fill(0.5);
  return [...scores, ...locals];
}