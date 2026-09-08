import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- ARSENAL V23 (FRACTAL SWARM) ---
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizarImagenMaster } from './analizador_MASTER_v22.js'; // <--- EL CAMBIO CLAVE
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURACIÓN
const IMAGEN_ORIGINAL = path.join(__dirname, 'Atardecer.jpg');
const DIRECTORIO_SALIDA = path.join(__dirname, 'RESULTADOS_FAUNDEZ_V23_FRACTAL'); // Nueva carpeta
const MASTER = path.join(DIRECTORIO_SALIDA, 'Atardecer_Master_V18_Fractal.png');

// ============================================================================
// 🏰 LA CÁMARA DE TORTURA (Mismos escenarios, nueva medición)
// ============================================================================
const ESCENARIOS = [
    // --- FASE 1: DESGASTE ---
    { id: 'F1_01', nombre: '🟢 Rescale 50% + JPG 80', categoria: 'resize', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(Math.floor(meta.width * 0.5)).jpeg({ quality: 80 }).toFile(s);
    }},
    { id: 'F1_02', nombre: '🟢 Sharpen + JPG 60', categoria: 'filtros', ejecutar: async (m, s) => {
        await sharp(m).sharpen().jpeg({ quality: 60 }).toFile(s);
    }},
    { id: 'F1_03', nombre: '🟢 Blur Gaussiano + JPG 70', categoria: 'filtros', ejecutar: async (m, s) => {
        await sharp(m).blur(3).jpeg({ quality: 70 }).toFile(s);
    }},

    // --- FASE 2: AMPUTACIÓN (Aquí es donde el v23 debe brillar) ---
    { id: 'F2_01', nombre: '🟡 Crop 50% (Esquina Superior)', categoria: 'crop', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).extract({ left: 0, top: 0, width: Math.floor(meta.width/2), height: Math.floor(meta.height/2) }).toFile(s);
    }},
    { id: 'F2_02', nombre: '🟡 Esquina 800px + JPG 60', categoria: 'crop', ejecutar: async (m, s) => {
        await sharp(m).extract({ left: 0, top: 0, width: 800, height: 800 }).jpeg({ quality: 60 }).toFile(s);
    }},
    { id: 'F2_03', nombre: '🟠 Tira Vertical + JPG 40', categoria: 'crop', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).extract({ left: 500, top: 0, width: 400, height: meta.height }).jpeg({ quality: 40 }).toFile(s);
    }},

    // --- FASE 3: DESORIENTACIÓN ---
    { id: 'F3_01', nombre: '📐 Giro 15° + Recorte + JPG 75', categoria: 'rotacion', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).rotate(15, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
            .extract({ left: 100, top: 100, width: Math.floor(meta.width*0.6), height: Math.floor(meta.height*0.6) })
            .jpeg({ quality: 75 }).toFile(s);
    }},
    { id: 'F3_02', nombre: '🔄 Giro 45° + JPG 80', categoria: 'rotacion', ejecutar: async (m, s) => {
        await sharp(m).rotate(45, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).jpeg({ quality: 80 }).toFile(s);
    }},
    { id: 'F3_03', nombre: '🥴 Deformación (0.8x) + JPG 70', categoria: 'deformacion', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(meta.width, Math.floor(meta.height * 0.8), { fit: 'fill' }).jpeg({ quality: 70 }).toFile(s);
    }},

    // --- FASE 4: EL MÁS ALLÁ ---
    { id: 'F4_01', nombre: '💀 CAOS (Giro+Deform+JPG 50)', categoria: 'caos', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).rotate(15, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
            .resize(Math.floor(meta.width * 0.9), Math.floor(meta.height * 0.75), { fit: 'fill' })
            .jpeg({ quality: 50 }).toFile(s);
    }},
    { id: 'F4_02', nombre: '☢️ EL VACÍO (Fragmento 250px + JPG 25)', categoria: 'caos', ejecutar: async (m, s) => {
        await sharp(m).extract({ left: 1000, top: 1000, width: 250, height: 250 }).jpeg({ quality: 25 }).toFile(s);
    }},
    { id: 'F4_03', nombre: '📱 Resize 25% + JPG 70', categoria: 'resize', ejecutar: async (m, s) => {
        const meta = await sharp(m).metadata();
        await sharp(m).resize(Math.floor(meta.width * 0.25)).jpeg({ quality: 70 }).toFile(s);
    }}
];

// ============================================================================
// GENERADOR DE INFORME MARKDOWN (V23)
// ============================================================================
function generarInformeMarkdown(resultados, estadisticas) {
    const fecha = new Date().toISOString().split('T')[0];
    return `# Informe Científico: Dragon3 v23 "Fractal Swarm"
## Cámara de Tortura (Protocolo Faúndez)

**Fecha**: ${fecha}
**Motor**: v23 Fractal Swarm
**Objetivo**: Demostración de Resiliencia Fractal ante Recorte (Crop)

---

## 1. Resumen Ejecutivo
La arquitectura v23 implementa una búsqueda distribuida ("Swarm Scanning") en celdas de 256px.
Esto permite recuperar la señal incluso cuando el centro geométrico de la imagen ha sido eliminado.

### Métricas clave:
- **Tasa de Supervivencia**: **${((estadisticas.exito/estadisticas.total)*100).toFixed(1)}%**
- **Nodos Fractales Activos (Media)**: ~${estadisticas.mediaNodos}

## 2. Resultados Detallados (${estadisticas.total} escenarios)

| ID | Prueba | Estado | Energía | Nodos | Ángulo | Método |
|----|--------|--------|---------|-------|--------|--------|
${resultados.map(r => `| ${r.id} | ${r.nombre} | **${r.resultado}** | ${r.energia} | ${r.nodos} | ${r.angulo}º | ${r.metodo} |`).join('\n')}

---
*Generado automáticamente por Dragon3 Lab - ${new Date().toISOString()}*
`;
}

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================
async function ejecutarTestFaundez() {
    console.log('\n============================================================');
    console.log('🏰 DRAGON3 v23 - PROTOCOLO "FAÚNDEZ FRACTAL"');
    console.log('   "Buscamos en el todo, y en cada una de sus partes."');
    console.log('============================================================\n');

    if (!fs.existsSync(DIRECTORIO_SALIDA)) fs.mkdirSync(DIRECTORIO_SALIDA, { recursive: true });

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.error(`❌ ERROR: No encuentro ${IMAGEN_ORIGINAL}.`);
        return;
    }

    console.log('[FASE 1] 🧬 Generando Master v18 (Original con Stardust)...');
    const gen = new GeneradorMBH_v18();
    const datosCliente = { cliente: "Quico Melero", hash_suffix: "d760" };
    await gen.sellarImagen(IMAGEN_ORIGINAL, MASTER, datosCliente);
    console.log(`   ✅ Master Generado: ${MASTER}`);

    // --- FASE 3: TORTURA ---
    console.log('\n[FASE 3] ⚔️ Iniciando Tortura Fractal...\n');

    const resultados = [];

    // Encabezado actualizado con NODOS
    console.log(`| ID    | RESULTADO | ENERGÍA  | NODOS | ÁNGULO | PRUEBA                                   |`);
    console.log(`|-------|-----------|----------|-------|--------|------------------------------------------|`);

    let sumaNodos = 0;

    for (const esc of ESCENARIOS) {
        const rutaAtacada = path.join(DIRECTORIO_SALIDA, `${esc.id}.jpg`);
        try {
            await esc.ejecutar(MASTER, rutaAtacada);

            // ANALIZAR CON V23 FRACTAL
            const res = await analizarImagenMaster(rutaAtacada);
            const data = res.response;

            const status = data.identificado ? "✅ EXITO" : "❌ FALLO";
            const energiaStr = data.energia_detectada ? data.energia_detectada.padStart(8) : "     N/A";
            const anguloStr = (data.angulo_detectado !== undefined) ? `${data.angulo_detectado}º`.padStart(6) : "   ---";
            // DATO NUEVO: NODOS
            const nodosStr = (data.nodos_activos || 0).toString().padStart(5);

            resultados.push({
                id: esc.id,
                nombre: esc.nombre,
                resultado: data.identificado ? "EXITO" : "FALLO",
                energia: data.energia_detectada || "0",
                angulo: data.angulo_detectado || 0,
                nodos: data.nodos_activos || 0,
                metodo: data.metodo_deteccion || "N/A"
            });

            if (data.nodos_activos) sumaNodos += data.nodos_activos;

            console.log(`| ${esc.id} | ${status.padEnd(9)} | ${energiaStr} | ${nodosStr} | ${anguloStr} | ${esc.nombre.padEnd(40)} |`);

        } catch (e) {
            console.error(`❌ Error en escenario ${esc.id}: ${e.message}`);
        }
    }

    // --- FASE 4: INFORME ---
    console.log('\n[FASE 4] 📝 Generando Informe Fractal...');

    const stats = {
        total: resultados.length,
        exito: resultados.filter(r => r.resultado === 'EXITO').length,
        mediaNodos: (sumaNodos / resultados.length).toFixed(1)
    };

    const informePath = path.join(DIRECTORIO_SALIDA, 'INFORME_FRACTAL_V23.md');
    const contenidoInforme = generarInformeMarkdown(resultados, stats);
    fs.writeFileSync(informePath, contenidoInforme);

    console.log(`   ✅ Informe guardado en: ${informePath}`);
    console.log(`\n📈 TASA DE SUPERVIVENCIA: ${((stats.exito/stats.total)*100).toFixed(1)}%`);
    console.log('============================================================');
}

ejecutarTestFaundez().catch(console.error);
