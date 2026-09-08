/* MÓDULO: analistaForense.js
   OBJETIVO: Traducir telemetría técnica en explicaciones lógicas.
*/

export const explicarDilema = (datos) => {
    // 1. BLINDAJE (Siempre al principio)
    if (!datos || !datos.prediccion_rs || !datos.prediccion_rs.scores) {
        return "⚠️ ERROR DE TELEMETRÍA: Datos incompletos para análisis forense.";
    }

    const { scores, confianza } = datos.prediccion_rs;
    const { features, veredicto_db3, veredicto_me } = datos;
    let explicacion = "";

    // 2. LÓGICA DE ANÁLISIS
    const esPlano = features && features.every(f => f === features[0]);
    if (esPlano) {
        explicacion += `⚠️ ANOMALÍA DE UNIFORMIDAD: Datos idénticos (${features[0]}). Sugiere origen sintético sin ruido natural. `;
    }

    const desviacion = Math.max(...scores) - Math.min(...scores);
    if (desviacion < 0.05) {
        explicacion += `⚖️ EMPATE TÉCNICO: RS paralizada. Humano ${(scores[0]*100).toFixed(1)}% vs IA ${(scores[1]*100).toFixed(1)}%. `;
    }

    if (!veredicto_db3 && !veredicto_me) {
        explicacion += `🚫 SILENCIO DE LOS GUARDIANES: Sin firmas en DB3 o ME. Caja Negra. `;
    }

    // 3. CONCLUSIÓN
    explicacion += `\n\nDILEMA: Sospecha de Replicante por perfección técnica sin prueba de delito. Requiere Sentencia del Cronista.`;

    return explicacion;
};