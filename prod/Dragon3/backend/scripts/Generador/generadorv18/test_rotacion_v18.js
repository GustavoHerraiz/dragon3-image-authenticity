import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v18 as analizadorV18 } from './analizadorMBH_v18.js';

// --- CONFIGURACIÓN ---
const IMAGEN_ORIGINAL = 'Atardecer.jpg';
const DIRECTORIO_SALIDA = './test_results_ROTACION_V18';
const MASTER = path.join(DIRECTORIO_SALIDA, 'Atardecer_MASTER_VIRGEN_V18.png');
const ADN_OBJETIVO = "a66a6955";

const MatematicaFaundez = {
    combinacion: (n, k) => {
        if (k < 0 || k > n) return 0;
        if (k === 0 || k === n) return 1;
        let res = 1;
        for (let i = 1; i <= k; i++) res = res * (n - i + 1) / i;
        return res;
    },
    calcularPValue: (k) => {
        const n = 16;
        let pValue = 0;
        for (let i = Math.max(0, Math.floor(k)); i <= n; i++) {
            pValue += MatematicaFaundez.combinacion(n, i) * Math.pow(0.5, n);
        }
        return pValue;
    }
};

// --- CONFIGURACIÓN DE ESCENARIOS DINÁMICOS (0° a 10°) ---
const ESCENARIOS_GIRO = Array.from({ length: 11 }, (_, i) => ({
    id: `ROT_${i.toString().padStart(2, '0')}`,
    nombre: `Giro ${i}°`,
    grados: i
}));

async function ejecutarTestRotacion() {
    console.log('\n============================================================');
    console.log('🧪 PROTOCOLO ROT: ANÁLISIS DE ESTABILIDAD GEOMÉTRICA');
    console.log('============================================================\n');

    if (!fs.existsSync(DIRECTORIO_SALIDA)) fs.mkdirSync(DIRECTORIO_SALIDA, { recursive: true });

    const gen = new GeneradorMBH_v18();
    console.log(`[FASE 1] 🧬 Sellando para Test de Giro: ${ADN_OBJETIVO}...`);
    await gen.sellarImagen(IMAGEN_ORIGINAL, MASTER, { hash_suffix: "d760" });

    const resultadosGlobales = [];
    let baselineFuerza = 0;

    for (const esc of ESCENARIOS_GIRO) {
        console.log(`\n🚀 ROTANDO: ${esc.nombre}...`);

        const rutaImagen = path.join(DIRECTORIO_SALIDA, `${esc.id}.png`);
        const rutaInforme = path.join(DIRECTORIO_SALIDA, `INFORME_${esc.id}.md`);

        // Aplicar Rotación pura (sin compresión para aislar el efecto del giro)
        await sharp(MASTER)
            .rotate(esc.grados, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(rutaImagen);

        const r = await analizadorV18(rutaImagen);
        const ev = r.response.evidencia_visual;
        const mejor = ev.Top_Candidatos[0] || { votos: 0, hash: 'None' };

        if (esc.id === 'ROT_00') baselineFuerza = mejor.votos;

        const pVal = MatematicaFaundez.calcularPValue(mejor.votos);

        const resObj = {
            id: esc.id,
            nombre: esc.nombre,
            fuerza: mejor.votos,
            adn: mejor.hash,
            pValue: pVal,
            match: mejor.hash === ADN_OBJETIVO
        };
        resultadosGlobales.push(resObj);

        generarInformeMarkdown(esc, resObj, ev.Top_Candidatos, rutaInforme, baselineFuerza);
        console.log(resObj.match ? '   ✅ SELLO LOCALIZADO' : '   ❌ SELLO DESPLAZADO');
    }

    // IMPRESIÓN DEL RESUMEN FINAL (Añadido)
    imprimirTablaFinal(resultadosGlobales);
}

// --- 4. GENERADORES DE INFORMES ---
function generarInformeMarkdown(esc, res, candidatos, ruta, baseline) {
    const tabla = candidatos.map((c, i) => {
        const p = MatematicaFaundez.calcularPValue(c.votos);
        const autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === c.hash);
        return `| ${i+1} | ${c.votos} | \`${c.hash}\` | ${(p * 100).toFixed(8)}% | ${autor ? autor.cliente : '---'} |`;
    }).join('\n');

    const contenido = `
# Informe de Evidencia Forense: ${esc.id}
**Escenario**: ${esc.nombre}
**Fuerza Baseline (Giro 0°)**: ${baseline}

## Análisis Probabilístico (Distribución Binomial)
Validación mediante la **Matemática de Faúndez** ($P(X \ge k)$).

| # | Fuerza | ADN | Prob. Azar | Cliente |
|---|--------|-----|------------|---------|
${tabla}

## Conclusión
${res.match
    ? `✅ **Sello Localizado**: Identidad confirmada con un p-value de ${(res.pValue * 100).toFixed(8)}%.`
    : `❌ **Sello Desplazado/Inclinado**: La señal se ha perdido debido a la interpolación de píxeles por rotación.`}
`;
    fs.writeFileSync(ruta, contenido);
}

function imprimirTablaFinal(datos) {
    console.log('\n============================================================');
    console.log('📊 RESUMEN DE ESTABILIDAD GEOMÉTRICA (ROTACIÓN)');
    console.table(datos.map(d => ({
        "ID": d.id,
        "Fuerza": d.fuerza,
        "p-value (%)": (d.pValue * 100).toFixed(8),
        "ADN": d.adn,
        "Status": d.match ? "⭐ OK" : "💀 FAIL"
    })));
    console.log('============================================================\n');
}

ejecutarTestRotacion().catch(console.error);
