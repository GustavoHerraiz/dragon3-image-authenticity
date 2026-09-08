import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';




// --- IMPORTS V18 (TWIN-KEY PROTOCOL) ---
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v18 as analizadorV18 } from './analizadorMBH_v18.js';


const IMAGEN_ORIGINAL = 'Atardecer.jpg';
const DIRECTORIO_SALIDA = './test_results_v21';
const DIRECTORIO_VISUALES = path.join(DIRECTORIO_SALIDA, 'visuales');
// Cambiamos nombre para diferenciar
const MASTER = path.join(DIRECTORIO_SALIDA, 'Atardecer_V18_TwinKey_Master.png');
const TILE_SIZE = 256;

// ============================================================================
// BATERÍA DE TORTURA (FAUNDEZ TORTURE CHAMBER)
// ============================================================================

const ESCENARIOS = [
    // --- FASE 1: DESGASTE (Uso estándar) ---
    { id: 'F1_01', nombre: '🟢 Rescale 50% + JPG 80', categoria: 'resize', severidad: 'leve', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(Math.floor(meta.width * 0.5)).jpeg({ quality: 80 }).toFile(s);
    }},
    { id: 'F1_02', nombre: '🟢 Sharpen + JPG 60', categoria: 'filtros', severidad: 'moderada', ejecutar: async (m, s) => {
        await sharp(m).sharpen().jpeg({ quality: 60 }).toFile(s);
    }},
    { id: 'F1_03', nombre: '🟢 Blur Gaussiano + JPG 70', categoria: 'filtros', severidad: 'moderada', ejecutar: async (m, s) => {
        await sharp(m).blur(3).jpeg({ quality: 70 }).toFile(s);
    }},

    // --- FASE 2: AMPUTACIÓN (Ataques de Crop) ---
    { id: 'F2_01', nombre: '🟡 Crop 50% (Esquina Superior)', categoria: 'crop', severidad: 'moderada', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).extract({ left: 0, top: 0, width: Math.floor(meta.width/2), height: Math.floor(meta.height/2) }).toFile(s);
    }},
    { id: 'F2_02', nombre: '🟡 Esquina 800px + JPG 60', categoria: 'crop', severidad: 'moderada', ejecutar: async (m, s) => {
        await sharp(m).extract({ left: 0, top: 0, width: 800, height: 800 }).jpeg({ quality: 60 }).toFile(s);
    }},
    { id: 'F2_03', nombre: '🟠 Tira Vertical + JPG 40', categoria: 'crop', severidad: 'severa', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).extract({ left: 500, top: 0, width: 400, height: meta.height }).jpeg({ quality: 40 }).toFile(s);
    }},

    // --- FASE 3: DESORIENTACIÓN (Geometría) ---
    { id: 'F3_01', nombre: '📐 Giro 15° + Recorte + JPG 75', categoria: 'rotacion', severidad: 'severa', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).rotate(15, { background: '#fff' }).extract({ left: 100, top: 100, width: Math.floor(meta.width*0.6), height: Math.floor(meta.height*0.6) }).jpeg({ quality: 75 }).toFile(s);
    }},
    { id: 'F3_02', nombre: '🔄 Giro 45° + JPG 80', categoria: 'rotacion', severidad: 'severa', ejecutar: async (m, s) => {
        await sharp(m).rotate(45, { background: '#fff' }).jpeg({ quality: 80 }).toFile(s);
    }},
    { id: 'F3_03', nombre: '🥴 Deformación (0.8x) + JPG 70', categoria: 'deformacion', severidad: 'severa', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(meta.width, Math.floor(meta.height * 0.8), { fit: 'fill' }).jpeg({ quality: 70 }).toFile(s);
    }},

    // --- FASE 4: EL MÁS ALLÁ (Destrucción total) ---
    { id: 'F4_01', nombre: '💀 CAOS (Giro+Deform+JPG 50)', categoria: 'caos', severidad: 'extrema', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).rotate(15, { background: '#fff' }).resize(Math.floor(meta.width * 0.9), Math.floor(meta.height * 0.75), { fit: 'fill' }).jpeg({ quality: 50 }).toFile(s);
    }},
    { id: 'F4_02', nombre: '☢️ EL VACÍO (Fragmento 250px + JPG 25)', categoria: 'caos', severidad: 'extrema', ejecutar: async (m, s) => {
        await sharp(m).extract({ left: 1000, top: 1000, width: 250, height: 250 }).jpeg({ quality: 25 }).toFile(s);
    }},
    { id: 'F4_03', nombre: '📱 Resize 25% + JPG 70', categoria: 'resize', severidad: 'extrema', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(Math.floor(meta.width * 0.25)).jpeg({ quality: 70 }).toFile(s);
    }}
];

// ============================================================================
// GENERADORES DE VISUALES (Simplificados para V17)
// ============================================================================

async function generarComparativa() {
    console.log('   [Visual 1/5] Comparativa Original vs Sellada...');
    // ... (Código visual idéntico al anterior) ...
    // Para brevedad en la copia, asumo que tienes las funciones visuales del anterior script.
    // Si las necesitas completas dímelo, pero son puramente estéticas.
    const targetHeight = 600;
    const original = await sharp(IMAGEN_ORIGINAL).resize(null, targetHeight, { fit: 'inside' }).toBuffer();
    const originalMeta = await sharp(original).metadata();
    const sellada = await sharp(MASTER).resize(null, targetHeight, { fit: 'inside' }).toBuffer();
    const selladaMeta = await sharp(sellada).metadata();
    const totalWidth = originalMeta.width + selladaMeta.width;
    await sharp({
        create: { width: totalWidth, height: targetHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).composite([{ input: original, top: 0, left: 0 }, { input: sellada, top: 0, left: originalMeta.width }]).png().toFile(path.join(DIRECTORIO_VISUALES, 'comparativa_original_vs_sellada.png'));
    console.log('      ✅ Guardada.');
}

// ... (Resto de visuales: Grid, Zoom, Caos, Arquitectura, Patrón, Filtro) ...
// Puedes pegar aquí las funciones visuales de tu script anterior si las quieres generar.
// Por seguridad y limpieza, me centro en la ejecución del test.

// ============================================================================
// GENERADOR DE INFORME MARKDOWN
// ============================================================================
function generarInformeMarkdown(jsonData, resultados, estadisticas, masterMeta, durGen) {
    const fecha = new Date().toISOString().split('T')[0];
    return `# Informe Científico: Nano-Hydra V17 (Dual Engine)
## Arquitectura Híbrida: Vogel (Alfa) + Stardust DCT (Frecuencia)

**Fecha**: ${fecha}
**Versión**: 17.0 (Dual)
**Autor**: Dragon3 Project
**Destinatario**: Prof. Marcos Faúndez-Zanuy (Tecnocampus)

---

## 1. Resumen Ejecutivo
Nano-Hydra V17 implementa una arquitectura dual revolucionaria. Utiliza **Geometría Vogel en Canal Alfa** para certificar originales (Notaría) y **Modulación DCT en Canal Azul** para rastreo forense resistente a JPG y crop (Detective).

### Métricas clave:
- **Tasa de supervivencia**: ${((estadisticas.exito/estadisticas.total)*100).toFixed(1)}%
- **Estrategia**: Dual (Geometría Espacial + Frecuencia)

## 2. Resultados (${estadisticas.total} escenarios)
| ID | Prueba | Resultado | Confianza | Hits/Votos | Método Detectado |
|----|--------|-----------|-----------|------------|------------------|
${resultados.map(r => `| ${r.id} | ${r.nombre} | **${r.resultado}** | ${r.confianzaPct}% | ${r.hits} | ${r.metodo} |`).join('\n')}

---
*Generado automáticamente por Test Definitivo V21 - ${new Date().toISOString()}*
`;
}

/**
 * EJECUCIÓN DEL TEST BRUTAL "FAÚNDEZ TORTURE CHAMBER" (V18.5)
 * Integra análisis de fuerza bruta, radiografía de señal y documentación individual.
 */
async function ejecutarTestBrutal() {
    console.log('\n============================================================');
    console.log('🐉 DRAGON3 - TEST V21 "FAÚNDEZ TORTURE CHAMBER" (V18.5)');
    console.log('============================================================\n');

    // Preparación de directorios
    if (!fs.existsSync(DIRECTORIO_SALIDA)) fs.mkdirSync(DIRECTORIO_SALIDA, { recursive: true });
    if (!fs.existsSync(DIRECTORIO_VISUALES)) fs.mkdirSync(DIRECTORIO_VISUALES, { recursive: true });

    // --- FASE 1: GENERACIÓN ---
    console.log('[FASE 1] 🧬 Generando Master V18 (Twin-Key DCT + Vogel)...');
    const inicioGen = Date.now();
    const gen = new GeneradorMBH_v18(); // Generador con inyección profunda
    const datosCliente = { id: "X881", hash_suffix: "d760" };

    // Sellar la imagen original
    await gen.sellarImagen(IMAGEN_ORIGINAL, MASTER, datosCliente);
    const duracionGen = Date.now() - inicioGen;

    // --- FASE 2: CONTROL DE CALIDAD (BASELINE) ---
    console.log('\n[FASE 2] 🔍 Verificando integridad del Master...');
    const control = await analizadorV18(MASTER); // Analizador con motor dual
    const evMaster = control?.response?.evidencia_visual;

    if (!control?.response?.exito) {
        console.error("❌ ERROR CRÍTICO: El Master no ha pasado el control de calidad.");
        process.exit(1);
    }
    console.log(`   ✅ MASTER OK: [${evMaster.ADN_Detectado}] | Confianza: ${evMaster.Mejor_Confianza}%`);

    // --- FASE 3: CÁMARA DE TORTURA (DETECTIVE) ---
    console.log('\n[FASE 3] ⚔️ Ejecutando Batería de Tortura y Documentación...\n');
    const resultados = [];

    for (const esc of ESCENARIOS) {
        process.stdout.write(`   [${esc.id}] ${esc.nombre.padEnd(40)} `);
        const rutaImagenAtacada = path.join(DIRECTORIO_SALIDA, `${esc.id}.jpg`);
        const rutaDoc = path.join(DIRECTORIO_SALIDA, `INFORME_${esc.id}.md`);

        // 1. Ejecutar ataque (Crop, Resize, JPG, etc.)
        await esc.ejecutar(MASTER, rutaImagenAtacada);

        // 2. Analizar mediante fuerza bruta (64 offsets)
        const r = await analizadorV18(rutaImagenAtacada);
        const ev = r.response.evidencia_visual;

        // 3. Registrar resultado para el Dossier Final
        resultados.push({
            id: esc.id,
            nombre: esc.nombre,
            resultado: r.response.exito ? 'EXITO' : 'FALLO',
            hits: ev.Hits_Totales,
            confianzaPct: ev.Mejor_Confianza,
            metodo: ev.Metodo,
            categoria: esc.categoria
        });

        // 4. Generar Ficha Forense Individual (.md)
        generarFichaIndividual(esc, r, rutaDoc);

        // 5. Visualizar Top 10 candidatos en Terminal
        visualizarTopCandidatos(esc, r);

        console.log(r.response.exito ? '✅ OK' : '❌ FAIL');
    }

    // --- FASE 4: DOCUMENTACIÓN FINAL ---
    console.log('\n[FASE 4] 🎨 Generando Dossier Forense Consolidado...');

    const stats = {
        total: resultados.length,
        exito: resultados.filter(r => r.resultado === 'EXITO').length
    };

    const jsonData = {
        metadata: { version: '18.5.0', master: evMaster },
        resultados
    };

    try {
        await generarComparativa(); // Generación de visuales estéticos
    } catch (e) {
        console.log("   ⚠️ Visuales saltados o error parcial.");
    }

    // Informe global en Markdown
    const mdGlobal = generarInformeMarkdown(jsonData, resultados, stats, {}, duracionGen);
    fs.writeFileSync(path.join(DIRECTORIO_SALIDA, `INFORME_V18_FINAL.md`), mdGlobal);

    // --- FASE 5: TABLA DE RESUMEN FINAL ---
    console.log('\n============================================================');
    console.log('📊 RESUMEN DE SUPERVIVENCIA NANO-HYDRA V18');
    console.table(resultados.map(r => ({
        ID: r.id,
        Prueba: r.nombre,
        Status: r.resultado,
        Método: r.metodo,
        Confianza: `${r.confianzaPct.toFixed(1)}%`
    })));

    const tasa = (stats.exito / stats.total) * 100;
    console.log(`\n📈 TASA DE ÉXITO GLOBAL: ${tasa.toFixed(1)}%`);
    console.log('============================================================\n');
}


function visualizarTopCandidatos(escenario, resultadoAnalisis) {
    const ev = resultadoAnalisis.response.evidencia_visual;
    const candidatos = ev.Top_Candidatos || [];

    if (candidatos.length === 0) {
        console.log(`\n   ⚠️  SIN SEÑAL DETECTADA EN ${escenario.id} (Ruido demasiado alto)`);
        return;
    }

    console.log(`\n   🔍 RADIOGRAFÍA FORENSE - ESCENARIO: ${escenario.id}`);

    const tablaTerminal = candidatos.map((c, i) => {
        const autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === c.hash);
        // La probabilidad de que sea ruido es el p-value
        const probError = (c.p_value * 100).toFixed(4) + "%";

        return {
            "Rango": `${i + 1}º`,
            "Fuerza": c.votos,
            "ADN": c.hash,
            "Prob. Azar": probError, // <--- MÉTRICA PARA FAÚNDEZ
            "Identificación": autor ? autor.cliente : "Desconocido",
            "Veredicto": c.hash === "d760" ? "⭐ MATCH" : ""
        };
    });

    console.table(tablaTerminal);
}

function generarFichaIndividual(escenario, resultadoAnalisis, rutaInforme) {
    const ev = resultadoAnalisis.response.evidencia_visual;
    const candidatos = ev.Top_Candidatos || [];

    // Blindaje contra undefined
    const mejorCandidato = candidatos.length > 0 ? candidatos[0] : null;

    let tabla = candidatos.length > 0
        ? candidatos.map((c, i) => {
            const autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === c.hash);
            const pRuido = (c.p_value * 100).toFixed(4) + "%";
            return `| ${i+1} | ${c.votos} | \`${c.hash}\` | ${pRuido} | ${autor ? autor.cliente : '---'} |`;
          }).join('\n')
        : "| --- | --- | --- | --- | No se recuperó señal |";

    const contenido = `
# Informe Forense: ${escenario.id}
**Prueba**: ${escenario.nombre}

## Análisis de Probabilidad Estadística
Demostración de que la señal no es producto de ruido aleatorio.

| # | Fuerza | ADN | Prob. Ruido | Cliente |
|---|--------|-----|-------------|---------|
${tabla}

## Conclusión Técnica
${mejorCandidato && mejorCandidato.hash === "d760"
    ? `✅ **Sello Validado**: La probabilidad de que esta detección sea ruido es de solo ${ (mejorCandidato.p_value * 100).toFixed(4) }%.`
    : "❌ **Señal Insuficiente**: No se pudo extraer un ADN con confianza estadística."}
`;
    fs.writeFileSync(rutaInforme, contenido);
}
ejecutarTestBrutal().catch(err => console.error(err));
