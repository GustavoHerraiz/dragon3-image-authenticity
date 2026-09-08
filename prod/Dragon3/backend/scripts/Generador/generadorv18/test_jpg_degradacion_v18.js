import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v18 as analizadorV18 } from './analizadorMBH_v18.js';

// --- CONFIGURACIÓN ---
const IMAGEN_ORIGINAL = 'Atardecer.jpg';
const DIRECTORIO_SALIDA = './test_results_v21_F4';
const MASTER = path.join(DIRECTORIO_SALIDA, 'Atardecer_MASTER_VIRGEN_V18.png');
const ADN_OBJETIVO = "a66a6955"; // ADN Maestro de Quico Melero

// --- 1. MATEMÁTICA DE FAÚNDEZ (Sello de Calidad) ---
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

// --- 2. ESCENARIOS DE LA "JPG TORTURE CHAMBER" ---
const ESCENARIOS = [
    { id: 'F4_00', nombre: '💎 SELLO VIRGEN (Línea de Base)', q: 100 },
    { id: 'F4_90', nombre: 'JPG Calidad 90', q: 90 },
    { id: 'F4_80', nombre: 'JPG Calidad 80', q: 80 },
    { id: 'F4_70', nombre: 'JPG Calidad 70', q: 70 },
    { id: 'F4_60', nombre: 'JPG Calidad 60', q: 60 },
    { id: 'F4_50', nombre: 'JPG Calidad 50', q: 50 },
    { id: 'F4_40', nombre: 'JPG Calidad 40', q: 40 }
];

// --- 3. MOTOR DE EJECUCIÓN ---
async function ejecutarTestForenseJpg() {
    console.log('\n============================================================');
    console.log('🧪 PROTOCOLO F4: RADIOGRAFÍA Y EVIDENCIAS DE DEGRADACIÓN');
    console.log('============================================================\n');

    if (!fs.existsSync(DIRECTORIO_SALIDA)) fs.mkdirSync(DIRECTORIO_SALIDA, { recursive: true });

    // FASE 1: GENERACIÓN DEL TANQUE
    const gen = new GeneradorMBH_v18();
    console.log(`[FASE 1] 🧬 Inyectando ADN: ${ADN_OBJETIVO} a Intensidad 55...`);
    await gen.sellarImagen(IMAGEN_ORIGINAL, MASTER, { hash_suffix: "d760" });

    const resultadosGlobales = [];
    let baselineFuerza = 0;

    // FASE 2: BATERÍA DE TESTS
    for (const esc of ESCENARIOS) {
        console.log(`\n🚀 EJECUTANDO: ${esc.nombre}...`);

        // Forzamos que todos los resultados sean .jpg para evitar interferencias de Vogel
        const rutaImagen = path.join(DIRECTORIO_SALIDA, `${esc.id}.jpg`);
        const rutaInforme = path.join(DIRECTORIO_SALIDA, `INFORME_${esc.id}.md`);

        // 1. Aplicar compresión (incluyendo Q=100 para el Test 0)
        // Esto elimina el canal Alfa y permite ver la fuerza real del DCT
        await sharp(MASTER).jpeg({ quality: esc.q }).toFile(rutaImagen);

        // 2. Análisis Forense (Llamada limpia por ruta de archivo)
        const r = await analizadorV18(rutaImagen);
        const ev = r.response.evidencia_visual;
        const mejor = ev.Top_Candidatos[0] || { votos: 0, hash: 'None' };

        if (esc.id === 'F4_00') baselineFuerza = mejor.votos;

        // 3. --- RADIOGRAFÍA EN TERMINAL (ORO PURO) ---
        console.log(`   [ANALIZADOR V18] Fuerza Máx: ${mejor.votos}`);
        console.log(`   [TIRA DE BITS] ADN: ${mejor.hash}`);
        const pVal = MatematicaFaundez.calcularPValue(mejor.votos);
        console.log(`   [ESTADÍSTICA] p-value: ${(pVal * 100).toFixed(8)}%`);

        // 4. GUARDAR RESULTADOS
        const resObj = {
            id: esc.id,
            nombre: esc.nombre,
            fuerza: mejor.votos,
            adn: mejor.hash,
            pValue: pVal,
            match: mejor.hash === ADN_OBJETIVO
        };
        resultadosGlobales.push(resObj);

        // 5. --- GUARDAR EVIDENCIA DOCUMENTAL (.md) ---
        generarInformeMarkdown(esc, resObj, ev.Top_Candidatos, rutaInforme, baselineFuerza);

        console.log(resObj.match ? '   ✅ MATCH CONFIRMADO' : '   ❌ FALLO DE IDENTIDAD');
    }

    // FASE 3: TABLA DE RESUMEN FINAL
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
**Fuerza Baseline (Test 0)**: ${baseline}

## Análisis Probabilístico (Distribución Binomial)
Validación mediante la **Matemática de Faúndez** ($P(X \ge k)$).

| # | Fuerza | ADN | Prob. Azar | Cliente |
|---|--------|-----|------------|---------|
${tabla}

## Conclusión
${res.match
    ? `✅ **Sello Validado**: Identidad confirmada con un p-value de ${(res.pValue * 100).toFixed(8)}%.`
    : `❌ **Sello Degradado**: La señal ha caído por debajo del umbral de detección o ha mutado.`}
`;
    fs.writeFileSync(ruta, contenido);
}

function imprimirTablaFinal(datos) {
    console.log('\n============================================================');
    console.log('📊 RESUMEN DE SUPERVIVENCIA JPG (INTENSIDAD 55)');
    console.table(datos.map(d => ({
        "ID": d.id,
        "Fuerza": d.fuerza,
        "p-value (%)": (d.pValue * 100).toFixed(8),
        "ADN": d.adn,
        "Status": d.match ? "⭐ OK" : "💀 FAIL"
    })));
    console.log('============================================================\n');
}

ejecutarTestForenseJpg().catch(console.error);
