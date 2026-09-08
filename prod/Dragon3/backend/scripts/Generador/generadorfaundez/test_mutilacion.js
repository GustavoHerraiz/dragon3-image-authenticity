/**
 * ============================================================================
 * 🪓 DRAGON3: TEST DE MUTILACIÓN & INTEGRIDAD FORENSE (FINAL)
 * ============================================================================
 * Objetivo: Clasificar el documento en 3 estados:
 * 1. ✅ ÍNTEGRO (Original)
 * 2. ⚠️ MANIPULADO (Tamper Evident - Energía OK, Datos Rotos)
 * 3. ❌ FALSO (Sin Energía)
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenFaundez } from './AnalizadorFaundez.js';

const CONFIG = {
    ORIGEN: './output_faundez/MASTER_SELLADA.png',
    OUTPUT_DIR: './output_mutilacion'
};

if (!fs.existsSync(CONFIG.OUTPUT_DIR)) fs.mkdirSync(CONFIG.OUTPUT_DIR);

// Variables para guardar el "Patrón Oro" (La verdad original)
let PATRON_ORO = {
    id: null,
    hora: null,
    energia: 0
};

async function ejecutarMutilacion() {
    console.log(`\n🪓 INICIANDO ANÁLISIS FORENSE DE INTEGRIDAD...`);

    if (!fs.existsSync(CONFIG.ORIGEN)) {
        console.error("❌ NO ENCUENTRO 'MASTER_SELLADA.png'. Ejecuta el test anterior primero.");
        return;
    }

    // 1. ANALIZAR EL ORIGINAL (APRENDER LA VERDAD)
    console.log(`\n1️⃣  ESTABLECIENDO LÍNEA BASE (PATRÓN ORO)...`);
    const resOriginal = await analizarImagenFaundez(CONFIG.ORIGEN);

    if (!resOriginal.identificado) {
        console.error("❌ Error: La imagen original no tiene firma válida. No se puede auditar.");
        return;
    }

    PATRON_ORO.id = resOriginal.hash;
    PATRON_ORO.hora = resOriginal.timestamp_fecha ? new Date(resOriginal.timestamp_fecha).toLocaleTimeString('es-ES') : "---";
    PATRON_ORO.energia = resOriginal.energia;

    console.log(`   ✅ PATRÓN ORO DETECTADO:`);
    console.log(`      - ID: ${PATRON_ORO.id}`);
    console.log(`      - HORA: ${PATRON_ORO.hora}`);
    console.log(`      - ENERGÍA: ${PATRON_ORO.energia.toLocaleString()}`);

    // 2. GENERAR MUTILACIONES
    const metadata = await sharp(CONFIG.ORIGEN).metadata();
    const { width, height } = metadata;

    console.log(`\n2️⃣  GENERANDO ATAQUES Y AUDITANDO...`);
    // Ajuste visual de la tabla para que se lea perfecto
    console.log(`\n| PRUEBA          | ENERGÍA   | ID DETECTADO | HORA DETECTADA | 🚦 DIAGNÓSTICO FORENSE          |`);
    console.log(`|-----------------|-----------|--------------|----------------|---------------------------------|`);

    // A. RECORTE CENTRO (50%)
    const pathCentro = path.join(CONFIG.OUTPUT_DIR, 'recorte_centro.jpg');
    await sharp(CONFIG.ORIGEN)
        .extract({
            left: Math.floor(width * 0.25),
            top: Math.floor(height * 0.25),
            width: Math.floor(width * 0.5),
            height: Math.floor(height * 0.5)
        })
        .toFile(pathCentro);
    await auditar("✂️ RECORTE 50%", pathCentro);

    // B. RECORTE ESQUINA (25%)
    const pathEsquina = path.join(CONFIG.OUTPUT_DIR, 'recorte_esquina.jpg');
    await sharp(CONFIG.ORIGEN)
        .extract({
            left: 0,
            top: 0,
            width: Math.floor(width * 0.5),
            height: Math.floor(height * 0.5)
        })
        .toFile(pathEsquina);
    await auditar("📐 ESQUINA 25%", pathEsquina);

    // C. TACHADO / CENSURA
    const pathTachado = path.join(CONFIG.OUTPUT_DIR, 'censura_tachado.jpg');
    const parcheAncho = Math.floor(width * 0.3);
    const parcheAlto = Math.floor(height * 0.1);

    const topPos = Math.floor((height - parcheAlto) / 2);
    const leftPos = Math.floor((width - parcheAncho) / 2);

    await sharp(CONFIG.ORIGEN)
        .composite([{
            input: { create: { width: parcheAncho, height: parcheAlto, channels: 3, background: { r: 0, g: 0, b: 0 } } },
            top: topPos,
            left: leftPos
        }])
        .toFile(pathTachado);
    await auditar("⬛ TACHADO", pathTachado);

    // D. MINIATURA
    const pathMini = path.join(CONFIG.OUTPUT_DIR, 'miniatura_movil.jpg');
    await sharp(CONFIG.ORIGEN)
        .resize(150)
        .toFile(pathMini);
    await auditar("📱 MINIATURA", pathMini);
}

async function auditar(nombre, ruta) {
    try {
        const res = await analizarImagenFaundez(ruta);

        // DATOS DETECTADOS
        const idDetectado = res.identificado ? res.hash : "---";
        const horaDetectada = (res.identificado && res.timestamp_fecha)
            ? new Date(res.timestamp_fecha).toLocaleTimeString('es-ES')
            : "---";

        // Formato energía
        const energiaFmt = res.energia.toLocaleString('en-US', { maximumFractionDigits: 0 });

        // LÓGICA DE DIAGNÓSTICO (LOS 3 ESTADOS)
        let diagnostico = "";

        if (res.energia < 5000) {
            // Caso 1: Sin Energía
            diagnostico = "❌ FALSO / ROTO";
        } else if (idDetectado === PATRON_ORO.id && horaDetectada === PATRON_ORO.hora) {
            // Caso 2: Todo coincide
            diagnostico = "✅ ÍNTEGRO (Original)";
        } else {
            // Caso 3: Hay energía pero no coincide ID o Hora
            diagnostico = "⚠️ MANIPULADO (Tamper Evident)";
        }

        console.log(`| ${nombre.padEnd(15)} | ${energiaFmt.padEnd(9)} | ${idDetectado.padEnd(12)} | ${horaDetectada.padEnd(14)} | ${diagnostico.padEnd(31)} |`);

    } catch (e) {
        console.log(`| ${nombre.padEnd(15)} | ERROR     | ---          | ---            | ERROR                           |`);
    }
}

ejecutarMutilacion();
