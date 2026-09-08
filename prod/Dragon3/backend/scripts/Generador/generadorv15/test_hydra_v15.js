/**
 * ============================================================================
 * 🐍 DRAGON3 - TEST AUTOMÁTICO HYDRA V15
 * ============================================================================
 * Simula ataques de recorte (cropping) y verifica si el escáner "Sliding Window"
 * es capaz de recuperar la identidad en los fragmentos.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

// --- CONFIGURACIÓN ---
const BASE_DIR = process.cwd(); // Directorio actual
const IMAGEN_ORIGEN = path.join(BASE_DIR, 'Atardecer_Hydra_V15.png');
const DIR_SALIDA = path.join(BASE_DIR, 'pruebas_hydra_crops');

// Asegurar directorio de pruebas
if (!fs.existsSync(DIR_SALIDA)) fs.mkdirSync(DIR_SALIDA);

// --- UTILIDADES DE ATAQUE ---
async function crearRecorte(nombre, left, top, width, height) {
    const output = path.join(DIR_SALIDA, nombre);
    await sharp(IMAGEN_ORIGEN)
        .extract({ left, top, width, height })
        .toFile(output);
    return output;
}

async function ejecutarTest() {
    console.log("\n============================================================");
    console.log("🐍 INICIANDO PROTOCOLO DE DESTRUCCIÓN HYDRA");
    console.log("============================================================");

    // 1. Obtener metadatos de la imagen original
    const metadata = await sharp(IMAGEN_ORIGEN).metadata();
    const w = metadata.width;
    const h = metadata.height;

    console.log(`[TARGET] Imagen cargada: ${w}x${h} px`);

    // 2. Definir los Ataques (Recortes)
    const ataques = [
        {
            nombre: "01_Recorte_Centro.png",
            desc: "🔍 Centro (50% del tamaño)",
            l: Math.floor(w * 0.25), t: Math.floor(h * 0.25), w: Math.floor(w * 0.5), h: Math.floor(h * 0.5)
        },
        {
            nombre: "02_Esquina_Sup_Izq.png",
            desc: "📐 Esquina Superior Izquierda (800x800px)",
            l: 0, t: 0, w: 800, h: 800
        },
        {
            nombre: "03_Tira_Vertical.png",
            desc: "💈 Tira Vertical Estrecha (600px ancho)",
            l: Math.floor(w / 2) - 300, t: 0, w: 600, h: h // Tira completa vertical
        },
        {
            nombre: "04_Fragmento_Minimo.png",
            desc: "🧩 Fragmento Mínimo (600x600px - Justo 1 Tile)",
            l: Math.floor(w * 0.6), t: Math.floor(h * 0.6), w: 600, h: 600
        }
    ];

    // 3. Ejecutar la Batería de Pruebas
    const informe = [];

    for (const ataque of ataques) {
        process.stdout.write(`⚔️  Ejecutando: ${ataque.desc}... `);

        // A. Generar el recorte
        const rutaRecorte = await crearRecorte(ataque.nombre, ataque.l, ataque.t, ataque.w, ataque.h);

        // B. Analizar con Hydra Scanner
        // Nota: Silenciamos los logs internos del analizador para mantener limpio el test
        const logOriginal = console.log;
        // console.log = function() {}; // Descomentar si quieres silencio absoluto

        const resultado = await analizadorImagenMBH_v15(rutaRecorte);

        // console.log = logOriginal; // Restaurar consola

        // C. Evaluar Resultado
        const ev = resultado.response.evidencia_visual;
        const exito = ev.Cliente_Identificado && ev.Cliente_Identificado.hash_suffix === 'd760'; // Hash de Quico

        if (exito) {
            console.log("✅ RECUPERADO");
        } else {
            console.log("❌ FALLO");
        }

        informe.push({
            Test: ataque.nombre,
            Descripcion: ataque.desc,
            Resultado: exito ? "EXITO" : "FALLO",
            Cliente: ev.Cliente_Identificado ? ev.Cliente_Identificado.cliente : "N/A",
            Confianza: ((ev.Mejor_Confianza || 0) * 100).toFixed(1) + "%",
            Hits: ev.Hits_Totales || 0
        });
    }

    // 4. Imprimir Tabla Final
    console.log("\n============================================================");
    console.log("📊 RESULTADOS DEL TEST DE RESISTENCIA HYDRA V15");
    console.log("============================================================");
    console.table(informe);
}

// Ejecutar
ejecutarTest().catch(console.error);
