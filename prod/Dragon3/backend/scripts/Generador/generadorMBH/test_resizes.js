import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizadorMBH.js';

const OUTPUT_DIR = './output_test_resizes';
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function testResizes() {
    console.log(`\n===================================================================`);
    console.log(` 🔬 LABORATORIO FORENSE: TEST GEOMÉTRICO DE ESCALADO (RESIZES)`);
    console.log(` 🆕 VERSIÓN 2.0 - Protocolo de Rescate Mejorado`);
    console.log(`===================================================================\n`);

    const generador = new GeneradorMBH();
    const rutaBase = path.join(OUTPUT_DIR, 'base.png');
    const rutaMaster = path.join(OUTPUT_DIR, 'MASTER_RESIZES.png');

    // Crear imagen base
    await sharp({
        create: {
            width: 1000,
            height: 1000,
            channels: 4,
            background: {r:128, g:128, b:128, alpha:255}
        }
    }).png().toFile(rutaBase);

    // Sellar con ID conocido
    await generador.sellarImagen(rutaBase, rutaMaster, {
        id_numerico: 760,
        hash_suffix: "D760"
    });

    const masterInfo = await sharp(rutaMaster).metadata();

    console.log(`✅ MASTER CREADO (1000x1000) con ID: 760 (Hash: D760)`);
    console.log(`📊 Sello embebido exitosamente.\n`);

    // Primero, validar que el master se detecta correctamente
    console.log(`🔍 VERIFICACIÓN PREVIA: Analizando MASTER original...`);
    const resMaster = await analizarImagenMBH(rutaMaster);

    if (resMaster.identificado) {
        console.log(`✅ MASTER VÁLIDO - Energía: ${resMaster.energia.toFixed(4)} | Hash: ${resMaster.hash}`);
    } else {
        console.log(`⚠️  ALERTA: El MASTER no se detecta correctamente.`);
        console.log(`   Energía obtenida: ${resMaster.energia.toFixed(4)} (umbral nativo: 0.15)`);
        console.log(`   Esto indica un problema en el proceso de sellado.`);
    }
    console.log(`\n${"=".repeat(67)}`);
    console.log(`Lanzando batería de Resizes...\n`);

    // Escalas de prueba (de más fácil a más difícil)
    const ESCALAS = [
        { factor: 0.95, desc: "Reducción mínima" },
        { factor: 0.90, desc: "Reducción ligera" },
        { factor: 0.80, desc: "Reducción moderada" },
        { factor: 0.75, desc: "Reducción estándar" },
        { factor: 0.60, desc: "Reducción fuerte" },
        { factor: 0.50, desc: "Mitad de tamaño" },
        { factor: 0.30, desc: "Reducción extrema" },
        { factor: 1.10, desc: "Ampliación ligera" },
        { factor: 1.25, desc: "Ampliación moderada" },
        { factor: 1.50, desc: "Ampliación estándar" },
        { factor: 2.00, desc: "Doble tamaño" }
    ];

    const resultados = [];

    for (const { factor, desc } of ESCALAS) {
        const w = Math.round(masterInfo.width * factor);
        const h = Math.round(masterInfo.height * factor);
        const rutaResize = path.join(OUTPUT_DIR, `resize_${(factor*100).toFixed(0)}.jpg`);

        // Crear resize con JPEG (más agresivo)
        await sharp(rutaMaster)
            .resize(w, h, { kernel: 'lanczos3' })
            .jpeg({ quality: 95 })
            .toFile(rutaResize);

        console.log(`\n${"─".repeat(67)}`);
        console.log(`🧪 TEST: Escala ${(factor*100).toFixed(0)}% - ${desc}`);
        console.log(`   Dimensiones: ${w}×${h} | Formato: JPEG Q95`);
        console.log(`${"─".repeat(67)}`);

        // Analizar con el nuevo sistema
        const res = await analizarImagenMBH(rutaResize);

        // Determinar resultado
        let matchIcon, statusColor;
        if (res.identificado) {
            matchIcon = "🟢 DETECTADO";
            statusColor = "\x1b[32m"; // Verde
        } else if (res.energia > 0.05) {
            matchIcon = "🟡 SEÑAL DÉBIL";
            statusColor = "\x1b[33m"; // Amarillo
        } else {
            matchIcon = "🔴 PERDIDO";
            statusColor = "\x1b[31m"; // Rojo
        }

        console.log(`\n${statusColor}${matchIcon}\x1b[0m`);
        console.log(`   ┌─────────────────────────────────────────────────────────────┐`);
        console.log(`   │ 📊 DIAGNÓSTICO DETALLADO                                   │`);
        console.log(`   ├─────────────────────────────────────────────────────────────┤`);
        console.log(`   │ Energía detectada:    ${res.energia.toFixed(6).padEnd(38)} │`);
        console.log(`   │ Hash leído:           ${res.hash.padEnd(38)} │`);
        console.log(`   │ ID numérico:          ${res.id_numerico.toString().padEnd(38)} │`);
        console.log(`   │ Confianza:            ${res.confianza}%${" ".repeat(35 - res.confianza.toString().length)} │`);

        if (res.diagnostico) {
            console.log(`   ├─────────────────────────────────────────────────────────────┤`);
            console.log(`   │ Escala usada:         ${(res.diagnostico.escalaUsada || "N/A").padEnd(38)} │`);
            console.log(`   │ Offset aplicado:      ${(res.diagnostico.offsetUsado || "N/A").padEnd(38)} │`);
            console.log(`   │ Ancho referencia:     ${(res.diagnostico.anchoReferencia ? res.diagnostico.anchoReferencia + " bloques/fila" : "N/A").padEnd(38)} │`);
            console.log(`   │ Rotación encontrada:  ${(res.diagnostico.rotacion || 0).toString().padEnd(38)} │`);
            console.log(`   │ Checksum leído:       ${(res.diagnostico.checksumLeido || 0).toString(16).toUpperCase().padEnd(38)} │`);
        }

        console.log(`   │ Cliente:              ${(res.cliente || "---").padEnd(38)} │`);
        console.log(`   │ Obra:                 ${(res.obra || "---").padEnd(38)} │`);
        console.log(`   └─────────────────────────────────────────────────────────────┘`);

        // Guardar resultado para estadísticas
        resultados.push({
            factor,
            desc,
            detectado: res.identificado,
            energia: res.energia,
            hash: res.hash,
            hashCorrecto: res.hash === '000D760',  // 🆕 Validar hash esperado
            escala: res.diagnostico?.escalaUsada || "N/A",
            anchoRef: res.diagnostico?.anchoReferencia || "N/A"
        });
    }

    // RESUMEN ESTADÍSTICO
    console.log(`\n\n${"=".repeat(67)}`);
    console.log(`📈 RESUMEN ESTADÍSTICO FINAL`);
    console.log(`${"=".repeat(67)}\n`);

    const detectados = resultados.filter(r => r.detectado).length;
    const hashCorrectos = resultados.filter(r => r.hashCorrecto).length;  // 🆕
    const senalDebil = resultados.filter(r => !r.detectado && r.energia > 0.05).length;
    const perdidos = resultados.filter(r => r.energia <= 0.05).length;

    console.log(`   Total de tests:        ${resultados.length}`);
    console.log(`   🟢 Detectados:          ${detectados} (${((detectados/resultados.length)*100).toFixed(1)}%)`);
    console.log(`   ✅ Hash correcto:       ${hashCorrectos} (${((hashCorrectos/resultados.length)*100).toFixed(1)}%) ← IMPORTANTE`);
    console.log(`   🟡 Señal débil:         ${senalDebil} (${((senalDebil/resultados.length)*100).toFixed(1)}%)`);
    console.log(`   🔴 Perdidos:            ${perdidos} (${((perdidos/resultados.length)*100).toFixed(1)}%)`);

    console.log(`\n   Energía promedio:      ${(resultados.reduce((s,r) => s + r.energia, 0) / resultados.length).toFixed(4)}`);
    console.log(`   Energía máxima:        ${Math.max(...resultados.map(r => r.energia)).toFixed(4)}`);
    console.log(`   Energía mínima:        ${Math.min(...resultados.map(r => r.energia)).toFixed(4)}`);

    // Tabla detallada
    console.log(`\n   ┌──────────┬─────────────────────────┬─────────────┬──────────┬──────────┬──────┬─────────────┐`);
    console.log(`   │ Escala   │ Descripción             │ Estado      │ Energía  │ Hash     │ ✓    │ Ancho Ref   │`);
    console.log(`   ├──────────┼─────────────────────────┼─────────────┼──────────┼──────────┼──────┼─────────────┤`);

    resultados.forEach(r => {
        const estado = r.detectado ? "🟢 OK" : (r.energia > 0.05 ? "🟡 DÉBIL" : "🔴 FALLO");
        const factorStr = `${(r.factor*100).toFixed(0)}%`.padEnd(8);
        const descStr = r.desc.padEnd(23);
        const estadoStr = estado.padEnd(11);
        const energiaStr = r.energia.toFixed(4).padStart(8);
        const hashStr = r.hash.padEnd(8);
        const checkIcon = r.hashCorrecto ? "✅" : "❌";
        const anchoStr = (typeof r.anchoRef === 'number' ? r.anchoRef.toString() : 'N/A').padEnd(11);

        // Color: verde si hash correcto, rojo si no
        const color = r.hashCorrecto ? "\x1b[32m" : "\x1b[31m";
        const reset = "\x1b[0m";

        console.log(`   │ ${factorStr} │ ${descStr} │ ${estadoStr} │ ${energiaStr} │ ${color}${hashStr}${reset} │ ${checkIcon}   │ ${anchoStr} │`);
    });

    console.log(`   └──────────┴─────────────────────────┴─────────────┴──────────┴──────────┴──────┴─────────────┘`);

    // Recomendaciones
    console.log(`\n   💡 RECOMENDACIONES:`);

    if (hashCorrectos === resultados.length) {
        console.log(`   ✅ PERFECTO: Todos los resizes fueron detectados con el hash correcto (000D760).`);
        console.log(`      El protocolo de rescate está funcionando al 100%.`);
    } else if (hashCorrectos > resultados.length * 0.7) {
        console.log(`   ✅ Bueno: La mayoría de resizes leen el hash correcto.`);
        console.log(`      Los fallos pueden deberse a degradación extrema de la señal.`);
    } else if (hashCorrectos > 0) {
        console.log(`   ⚠️  Parcial: Solo ${hashCorrectos} de ${resultados.length} resizes leen el hash correcto.`);
        console.log(`      Problema: Desincronización en ciertos factores de escala.`);
        console.log(`      Revisa los anchos de referencia detectados.`);
    } else if (detectados > 0) {
        console.log(`   ❌ Crítico: Detecta señales pero NINGUNA lee el hash correcto (000D760).`);
        console.log(`      Problema: Falsos positivos - ruido estructurado confundido con señal.`);
        console.log(`      Causa probable: Desacople entre generador y analizador.`);
    } else {
        console.log(`   ❌ Crítico: Ningún resize fue detectado.`);
        console.log(`      Problema: El sello no se está embebiendo o leyendo correctamente.`);
    }

    if (senalDebil > 0) {
        console.log(`\n   📉 ${senalDebil} resize(s) mostraron señal débil (0.05-0.15).`);
        console.log(`      Considera reducir UMB_DETECT_RESCATE a 0.06 para capturarlos.`);
    }

    console.log(`\n${"=".repeat(67)}\n`);
    console.log(`✅ TEST COMPLETADO - Resultados guardados en: ${OUTPUT_DIR}\n`);
}

testResizes().catch(e => console.error("❌ Error en test:", e));
