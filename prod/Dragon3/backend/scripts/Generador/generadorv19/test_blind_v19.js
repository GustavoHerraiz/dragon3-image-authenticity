import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v19 } from './analizadorMBH_v19.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGEN_ORIGINAL = path.join(__dirname, 'original.png');
const RUTA_MAESTRA = path.join(__dirname, 'maestra_sellada_quico.png');
const RESULTADOS_DIR = path.join(__dirname, 'PERITAJE_DRAGON3_V19');
const ANGULOS_TEST = [7, 15, 33, 45, 90, 180, 210];

async function ejecutarPeritajeOmega() {
    console.log(`\n============================================================`);
    console.log(`🐉 DRAGON3 V19: PERITAJE FORENSE DE ALTA RESOLUCIÓN`);
    console.log(`============================================================\n`);

    if (!fs.existsSync(RESULTADOS_DIR)) fs.mkdirSync(RESULTADOS_DIR);

    // 1. SELLADO REAL (V18)
    console.log(`[1/3] 🛠️  FORJANDO MAESTRA: Sello Quico Melero [d760]`);
    const generador = new GeneradorMBH_v18();
    await generador.sellarImagen(IMAGEN_ORIGINAL, RUTA_MAESTRA, { hash_suffix: 'd760' });

    console.log(`[2/3] 🚀 INICIANDO CAZA MULTI-ÁNGULO:`);
    let resumenGlobal = "";

    for (const angulo of ANGULOS_TEST) {
        const rutaAtaque = path.join(RESULTADOS_DIR, `ATAQUE_${angulo}.jpg`);

        try {
            // EL ATAQUE: Rotación + JPG 100 (Bye bye Vogel)
            await sharp(RUTA_MAESTRA).rotate(angulo).jpeg({ quality: 100 }).toFile(rutaAtaque);

            // EL ANÁLISIS V19
            const res = await analizadorImagenMBH_v19(rutaAtaque);

            // EXTRACCIÓN Y MAPEO DE BALIZAS
            const exito = res.response.identificado;
            const ev = res.response.evidencia_visual || {};
            const adnCazado = ev.ADN_Detectado;

            // BUSCAR NOMBRE DE LA BALIZA EN LA DB
            let nombreBaliza = "Desconocida";
            let autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === 'd760');
            if (autor && adnCazado) {
                const bInfo = autor.balizas.find(b => b.hex === adnCazado);
                if (bInfo) nombreBaliza = bInfo.name;
            }

            const rotDetectada = res.response.rotacion_detectada || "0.00°";
            const errorFase = Math.abs(angulo - parseFloat(rotDetectada));

            // 📢 LOGS FORENSES EN CONSOLA
            console.log(`\n────────────────────────────────────────────────────────────`);
            console.log(`🌀 ATAQUE GIRO: ${angulo}°`);

            if (exito) {
                console.log(`   ✅ STATUS:  AUTORÍA CONFIRMADA`);
                console.log(`   🧬 BALIZA:  [${nombreBaliza}] (DNA: ${adnCazado})`);
                console.log(`   📐 ORIENT:  Real ${angulo}° | Detectada ${rotDetectada}`);
                console.log(`   🎯 PRECI:   Error de Fase: ${errorFase.toFixed(2)}°`);
                console.log(`   📊 SEÑAL:   Confianza ${ev.Mejor_Confianza.toFixed(1)}% | Hits: ${ev.Hits_Totales}`);
            } else {
                console.log(`   ❌ STATUS:  SEÑAL PERDIDA (Ruido > Umbral)`);
            }

            // 📝 INFORME MD COMPLETO
            const informeMD = `
# INFORME PERICIAL DRAGON3 - GIRO ${angulo}°
- **Veredicto**: ${exito ? "EXITO" : "FALLO"}
- **Sesión**: ${res.id}
- **Baliza Detectada**: ${nombreBaliza}
- **ADN Recuperado**: ${adnCazado || "N/A"}
- **Rotación Real**: ${angulo}°
- **Rotación Detectada**: ${rotDetectada}
- **Error**: ${errorFase.toFixed(2)}°
- **Fuerza Z (Hits)**: ${ev.Hits_Totales || 0}
- **Top Candidatos**:
${ev.Top_Candidatos?.map(c => `  * Offset(${c.offX},${c.offY}) -> DNA: ${c.hash} [${c.confianza.toFixed(1)}%]`).join('\n')}

---
*Firma Digital Dragon3 V19 Forensic Lab*
            `;
            fs.writeFileSync(path.join(RESULTADOS_DIR, `REPORT_${angulo}.md`), informeMD);
            resumenGlobal += `${exito ? '✅' : '❌'} ${angulo}° -> Baliza: ${nombreBaliza} | Err: ${errorFase.toFixed(2)}°\n`;

        } catch (err) {
            console.error(`   [!] Error en ${angulo}°: ${err.message}`);
        }
    }

    fs.writeFileSync(path.join(RESULTADOS_DIR, `RESUMEN_EJECUTIVO.txt`), resumenGlobal);
    console.log(`\n============================================================`);
    console.log(`🏁 [3/3] PERITAJE COMPLETADO`);
    console.log(`📂 Dossier generado en: /${path.basename(RESULTADOS_DIR)}/`);
    console.log(`============================================================\n`);
}

ejecutarPeritajeOmega();
