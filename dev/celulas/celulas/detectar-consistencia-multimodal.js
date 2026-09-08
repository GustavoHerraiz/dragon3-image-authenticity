/**
 * Detecta contradicciones entre las señales independientes del analizador.
 * No vuelve a procesar la imagen: solo agrega resultados ya calculados.
 */

const CELULAS_IA = new Set([
  'ml',
  'detectar-patrones-forenses',
  'detectar-artefactos-ia',
  'detectar-herramienta-ia'
]);

const CELULAS_HUMANAS = new Set([
  'extraer-metadatos-exif',
  'detectar-sellos-autenticidad',
  'detectar-colores',
  'detectar-sombreado'
]);

export default async function detectarConsistenciaMultimodal(entrada) {
  const inicio = performance.now();
  const resultados = entrada?.payload || {};
  const senales = [];
  let votosIA = 0;
  let votosHumanos = 0;
  let confianzaIA = 0;
  let confianzaHumana = 0;

  for (const [celulaId, resultado] of Object.entries(resultados)) {
    if (!resultado || typeof resultado !== 'object') continue;
    if (typeof resultado.esIA !== 'boolean' || typeof resultado.confianza !== 'number') continue;

    const confianza = Math.max(0, Math.min(1, resultado.confianza));
    senales.push({ celulaId, esIA: resultado.esIA, confianza });

    if (resultado.esIA) {
      votosIA++;
      confianzaIA += confianza;
    } else {
      votosHumanos++;
      confianzaHumana += confianza;
    }
  }

  const mediaIA = votosIA > 0 ? confianzaIA / votosIA : 0;
  const mediaHumana = votosHumanos > 0 ? confianzaHumana / votosHumanos : 0;
  const diferenciaVotos = Math.abs(votosIA - votosHumanos);
  const hayContradiccion = votosIA > 0 && votosHumanos > 0 && diferenciaVotos <= 2;
  const iaFuertes = senales.filter(s => s.esIA && s.confianza >= 0.7).map(s => s.celulaId);
  const humanasFuertes = senales.filter(s => !s.esIA && s.confianza >= 0.7).map(s => s.celulaId);
  const conflictoFuerte = iaFuertes.length > 0 && humanasFuertes.length > 0;

  let esIA = false;
  let confianza = 0.1;
  let decision = 'INDETERMINADO';
  const evidencias = [];

  if (conflictoFuerte || hayContradiccion) {
    evidencias.push('Señales IA y humanas en conflicto; se mantiene una decisión conservadora.');
  } else if (votosIA > votosHumanos && mediaIA > mediaHumana) {
    esIA = true;
    confianza = Math.min(0.5, Math.max(0.1, mediaIA * 0.5));
    decision = 'IA_CONSISTENTE';
    evidencias.push('La mayoría de señales independientes favorece un origen IA.');
  } else if (votosHumanos > votosIA && mediaHumana > mediaIA) {
    confianza = Math.min(0.5, Math.max(0.1, mediaHumana * 0.5));
    decision = 'HUMANO_CONSISTENTE';
    evidencias.push('La mayoría de señales independientes favorece un origen humano.');
  } else {
    evidencias.push('No existe una señal dominante suficiente.');
  }

  return {
    exito: true,
    resultado: {
      esIA,
      confianza,
      explicacion: `Consistencia multimodal: ${decision}.`,
      evidencias,
      peso: 0.2,
      decision,
      votosIA,
      votosHumanos,
      mediaIA,
      mediaHumana,
      hayContradiccion,
      conflictoFuerte,
      senales,
      celulasIA: senales.filter(s => CELULAS_IA.has(s.celulaId)).map(s => s.celulaId),
      celulasHumanas: senales.filter(s => CELULAS_HUMANAS.has(s.celulaId)).map(s => s.celulaId)
    },
    metricas: { tiempoMs: performance.now() - inicio }
  };
}
