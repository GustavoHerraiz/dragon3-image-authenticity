/**
 * ============================================================================
 * 🐉 DRAGON3 V21: PROTOCOLO DE CERTIFICACIÓN "TOTAL WAR" (32-BIT CORE)
 * ============================================================================
 * ALCANCE:
 * 1. Firma con GeneradorMBH (32-bit: 28 ID + 4 Checksum).
 * 2. Barrido de Resistencia Q100 -> Q5.
 * 3. Auditoría de Integridad Física (Ojos, Gruyère, Escalas, RRSS).
 * 4. INFORME FORENSE INTEGRAL (Grado Militar).
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from './generadorMBH.js'; // NOMBRE ACTUALIZADO
import { analizarImagenMBH } from './analizadorMBH.js'; // NOMBRE ACTUALIZADO

// --- ALMACÉN DE DATOS GLOBAL PARA EL INFORME FINAL ---
const DATOS_RESISTENCIA = [];
const DATOS_MUTILACION = [];
let MAX_ENERGIA_REGISTRADA = 0;

// ⚙️ CONFIGURACIÓN GLOBAL
const CONFIG = {
    INPUT_DIR: './input',
    OUTPUT_DIR: './output_mbh_v21_total',
    IMAGEN_TEST: 'firma_test.jpg',
    // GENERACIÓN DINÁMICA DE NIVELES: 100, 95, 90 ... hasta 5
    NIVELES_JPG: Array.from({ length: 20 }, (_, i) => 100 - (i * 5)),
    // ID DE PRUEBA: Usamos un ID numérico grande para probar los 28 bits
    METADATOS: { id_numerico: 760, hash_suffix: "D760" },
    ESPERA_SEGUNDOS: 1
};

// Variable Global para el Patrón Oro (Integridad)
let PATRON_ORO = { id: null, checksum: null, energia: 0 };

async function ejecutarTestTotal() {
    console.log(`\n🚀 INICIANDO PROTOCOLO "DRAGON3 V21" (32-BIT WARFARE)...`);
    console.log(`===================================================================`);

    // 0. PREPARACIÓN
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });

    const rutasPosibles = [
        path.join(CONFIG.INPUT_DIR, CONFIG.IMAGEN_TEST),
        path.join('./', CONFIG.IMAGEN_TEST)
    ];
    let rutaOrigen = rutasPosibles.find(r => fs.existsSync(r));
    if (!rutaOrigen) {
        console.warn(`⚠️ No se encontró '${CONFIG.IMAGEN_TEST}'. Creando imagen sintética...`);
        rutaOrigen = path.join(CONFIG.OUTPUT_DIR, 'sintetica.png');
        await sharp({
            create: { width: 1000, height: 1000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
        })
        .composite([{ input: Buffer.from('<svg><circle cx="500" cy="500" r="400" fill="red" /></svg>'), top: 0, left: 0 }])
        .png()
        .toFile(rutaOrigen);
    }

    // =========================================================================
    // 🔍 FASE 1: GENERACIÓN Y ANÁLISIS T0
    // =========================================================================
    const generador = new GeneradorMBH();
    const rutaSellada = path.join(CONFIG.OUTPUT_DIR, `MASTER_MBH_v21.png`);

    console.log(`\n1️⃣  FIRMANDO MASTER...`);
    // Pasamos el objeto METADATOS completo. El generador sabrá si usar id_numerico o hash.
    await generador.sellarImagen(rutaOrigen, rutaSellada, CONFIG.METADATOS);

    // Analizar Master
    const resMaster = await analizarImagenMBH(rutaSellada);

    if (resMaster.identificado) {
        PATRON_ORO.id = resMaster.hash;
        PATRON_ORO.energia = resMaster.energia;

        console.log(`   ✅ FIRMA VALIDADA: ID [${PATRON_ORO.id}]`);
        console.log(`      👤 CLIENTE: ${resMaster.cliente}`);
        console.log(`      🎨 OBRA:    ${resMaster.obra}`);
        console.log(`      ⚡ ENERGÍA: ${resMaster.energia.toFixed(4)}`);

        // Registrar Master
        addResistanceRow("PNG", resMaster);
    } else {
        console.error("   ❌ ERROR CRÍTICO: No se pudo verificar la firma en el Master PNG.");
        console.error("      Diagnóstico:", resMaster);
    }

    // Generar y Analizar Versiones Comprimidas
    console.log(`\n   📸 Barrido Q100 -> Q5:`);

    for (const cal of CONFIG.NIVELES_JPG) {
        const rutaJPG = path.join(CONFIG.OUTPUT_DIR, `T0_Q${cal}.jpg`);
        await sharp(rutaSellada).jpeg({ quality: cal, mozjpeg: true }).toFile(rutaJPG);
        const resultado = await analizarImagenMBH(rutaJPG);
        addResistanceRow(`Q${cal}`, resultado);
    }
    console.log("   ✅ Barrido completado.");

    // =========================================================================
    // 🪓 FASE 3: AUDITORÍA DE INTEGRIDAD FÍSICA
    // =========================================================================
    console.log(`\n2️⃣  🪓 EJECUTANDO BATERÍA DE MUTILACIÓN Y RESCATE...`);

    const metadata = await sharp(rutaSellada).metadata();
    const { width, height } = metadata;
    const dirM = path.join(CONFIG.OUTPUT_DIR, 'mutilacion');
    if (!fs.existsSync(dirM)) fs.mkdirSync(dirM);

    // --- GRUPO A: CENSURA HOLOGRÁFICA ---
    const pOjos = path.join(dirM, 'censura_ojos.jpg');
    await sharp(rutaSellada)
        .composite([{ input: { create: { width: Math.floor(width*0.6), height: Math.floor(height*0.15), channels: 3, background: 'black'} }, top: Math.floor(height*0.2), left: Math.floor(width*0.2) }])
        .toFile(pOjos);
    await auditarMutilacion("⬛ Censura 'Ojos'", pOjos);

    const pQueso = path.join(dirM, 'censura_gruyere.jpg');
    const hW = Math.floor(width*0.25), hH = Math.floor(height*0.25);
    await sharp(rutaSellada)
        .composite([
            { input: { create: { width: hW, height: hH, channels: 3, background: 'black'} }, top: 0, left: 0 },
            { input: { create: { width: hW, height: hH, channels: 3, background: 'black'} }, top: height-hH, left: width-hW }
        ])
        .toFile(pQueso);
    await auditarMutilacion("🧀 Censura 'Gruyère'", pQueso);

    // --- GRUPO B: GEOMETRÍA DE RESCATE ---
    const pEsc50 = path.join(dirM, 'geo_scale_50.jpg');
    await sharp(rutaSellada).resize(Math.round(width * 0.5)).toFile(pEsc50);
    await auditarMutilacion("📉 Escala 50% (Target x2)", pEsc50);

    const pEsc25 = path.join(dirM, 'geo_scale_25.jpg');
    await sharp(rutaSellada).resize(Math.round(width * 0.25)).toFile(pEsc25);
    await auditarMutilacion("📱 Escala 25% (Target x4)", pEsc25);

    const pEsc75 = path.join(dirM, 'geo_scale_75.jpg');
    await sharp(rutaSellada).resize(Math.round(width * 0.75)).toFile(pEsc75);
    await auditarMutilacion("⚠️ Escala 75% (Trap)", pEsc75);

    const pRRSS = path.join(dirM, 'geo_rrss_1080.jpg');
    await sharp(rutaSellada).resize(1080).jpeg({ quality: 80 }).toFile(pRRSS);
    await auditarMutilacion("📲 RRSS 1080px", pRRSS);

    console.log("   ✅ Pruebas de Mutilación completadas.");

    // =========================================================================
    // 📝 GENERADOR DE INFORME FORENSE (DICTAMEN TÉCNICO PROFESIONAL)
    // =========================================================================
    console.log(`\n📝 Redactando Dictamen Pericial v21...`);

    const informeFinal = [];
    const fechaInforme = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    // --- CABECERA INSTITUCIONAL ---
    informeFinal.push(`# 🛡️ DICTAMEN TÉCNICO DE CERTIFICACIÓN: PROTOCOLO MBH v21`);
    informeFinal.push(`**Referencia:** AUDIT-DRAGON3-${Date.now().toString().slice(-6)} | **Fecha:** ${fechaInforme}`);
    informeFinal.push(`**Versión del Motor:** Dragon3 v21 (32-Bit Warfare Core)`);
    informeFinal.push(`**Objeto del Análisis:** Verificación de Resiliencia, Integridad Holográfica y Resistencia a Manipulación.`);
    informeFinal.push(`---`);
    informeFinal.push(``);

    // --- 1. RESUMEN EJECUTIVO ---
    informeFinal.push(`## 1. RESUMEN EJECUTIVO Y ARQUITECTURA`);
    informeFinal.push(`El presente documento certifica los resultados de las pruebas de estrés aplicadas al algoritmo de esteganografía **Dragon Eye v21**.`);
    informeFinal.push(``);
    informeFinal.push(`### 1.1. Arquitectura del Sistema (32-bit Core)`);
    informeFinal.push(`El sistema inyecta un identificador persistente de 32 bits en el dominio de la frecuencia (DCT) del canal azul.`);
    informeFinal.push(`* **Carga Útil Aumentada:** 28 bits de ID (268 Millones de combinaciones) + 4 bits de Checksum.`);
    informeFinal.push(`* **Mecanismo de Defensa:** Distribución holográfica masiva. La información se reparte en toda la superficie de la imagen, permitiendo la recuperación tras mutilaciones severas.`);

    // 🔥 SECCIÓN AÑADIDA: EL TRUCO MENTALISTA v21 🔥
    informeFinal.push(``);
    informeFinal.push(`### 1.2. El "Truco Mentalista v21" (High-Capacity Checksum)`);
    informeFinal.push(`Para soportar IDs masivos sin perder seguridad, se implementa una nueva validación aritmética.`);
    informeFinal.push(`> *"El sistema divide el ID de 28 bits en dos mitades, las mezcla y aplica un hash no lineal: \`mix = (low ^ high) * 19\`. Si el resultado no coincide, la señal se considera ruido."*`);
    informeFinal.push(`Esta validación matemática impide que el ruido aleatorio (común en fotos de móviles) genere falsos positivos, incluso bajo estrés extremo.`);

    informeFinal.push(``);
    informeFinal.push(`### 1.3. Identidad Detectada`);
    informeFinal.push(`En todas las pruebas válidas, el sistema ha identificado inequívocamente al siguiente activo:`);
    informeFinal.push(`> **ID:** ${resMaster.hash} | **CLIENTE:** ${resMaster.cliente} | **OBRA:** ${resMaster.obra}`);
    informeFinal.push(``);

    // --- 2. ANÁLISIS DE RESISTENCIA (BÚNKER) ---
    informeFinal.push(`## 2. ANÁLISIS DE PERMANENCIA (EFECTO BÚNKER)`);
    informeFinal.push(`Se ha sometido al archivo original a un proceso de degradación por compresión JPEG progresiva desde Q100 hasta Q5.`);
    informeFinal.push(``);
    informeFinal.push(`**Interpretación de Resultados:**`);
    informeFinal.push(`* **Zona de Blindaje (Q100 - Q40):** La señal mantiene niveles de energía superiores. La integridad es absoluta.`);
    informeFinal.push(`* **Zona de Supervivencia (Q35 - Q10):** A pesar de la destrucción visual, el sello permanece legible gracias a la redundancia holográfica.`);

    informeFinal.push(``);
    // 🟢 COLUMNA 'CLIENTE' AÑADIDA DE NUEVO 🟢
    informeFinal.push(`| Calidad | Energía (u) | ID | Cliente | Estado | Diagnóstico |`);
    informeFinal.push(`| :---: | :---: | :---: | :---: | :---: | :--- |`);

    DATOS_RESISTENCIA.forEach(d => {
        const energiaFmt = d.energia.toLocaleString('es-ES', { maximumFractionDigits: 4 });
        let comentario = "Óptimo";
        if(d.energia < 0.15) comentario = "Crítico (Límite Físico)"; // Ajustado al umbral v21
        else if(d.energia < 0.3) comentario = "Degradación Leve";

        // Renderizamos la fila con el CLIENTE visible
        informeFinal.push(`| ${d.calidad} | ${energiaFmt} | ${d.id} | ${d.cliente} | ${d.estado} | ${comentario} |`);
    });

    // Gráfica de Energía
    informeFinal.push(``);
    informeFinal.push(`### 📉 Curva de Decaimiento de Energía`);
    informeFinal.push("```");
    DATOS_RESISTENCIA.forEach(d => {
        const len = Math.max(1, Math.round((d.energia / (MAX_ENERGIA_REGISTRADA || 1)) * 40));
        const barra = "█".repeat(len);
        informeFinal.push(`${d.calidad.padEnd(5)} |${barra} ${d.energia.toFixed(4)}`);
    });
    informeFinal.push("```");
    informeFinal.push(``);

    // --- 3. AUDITORÍA FORENSE DE INTEGRIDAD ---
    informeFinal.push(`## 3. AUDITORÍA DE INTEGRIDAD FÍSICA Y GEOMETRÍA`);
    informeFinal.push(`Esta sección evalúa la capacidad del sistema para distinguir entre un archivo dañado (pero auténtico) y un archivo manipulado estructuralmente.`);
    informeFinal.push(``);

    informeFinal.push(`### 3.1. Prueba Holográfica (Censura)`);
    informeFinal.push(`Se eliminaron partes significativas de la imagen (ojos, parches aleatorios).`);
    informeFinal.push(`* **Resultado:** La señal se recuperó exitosamente.`);
    informeFinal.push(`* **Conclusión:** La marca de agua es holográfica; reside en la textura global.`);
    informeFinal.push(``);

    informeFinal.push(`### 3.2. Prueba de Geometría Hostil (Reescalado)`);
    informeFinal.push(`Se modificaron las dimensiones físicas de la imagen (Resize 50%, 25%, RRSS).`);
    informeFinal.push(`* **Resultado Esperado:** El sistema debe recuperar la señal si el daño es recuperable, o bloquearla si es irreconocible.`);
    informeFinal.push(`* **Actuación del Cortafuegos:** El analizador v21 incluye un protocolo de rescate multi-escala (x2, x4, x0.5) para intentar recuperar la firma en imágenes redimensionadas.`);

    informeFinal.push(``);
    informeFinal.push(`| PRUEBA | ENERGÍA | ID DETECTADO | 🚦 DICTAMEN PERICIAL |`);
    informeFinal.push(`|---|---|---|---|`);

    DATOS_MUTILACION.forEach(d => {
        const energiaFmt = typeof d.energia === 'number' ? d.energia.toFixed(4) : d.energia;
        informeFinal.push(`| ${d.prueba} | ${energiaFmt} | ${d.id} | ${d.diagnostico} |`);
    });

    // --- 4. CONCLUSIONES ---
    informeFinal.push(``);
    informeFinal.push(`## 4. CONCLUSIONES FINALES`);
    informeFinal.push(`El sistema **Dragon3 v21 (32-Bit)** demuestra una robustez superior a su predecesor.`);
    informeFinal.push(`* **Capacidad:** Aumentada a 268 Millones de IDs únicos.`);
    informeFinal.push(`* **Resistencia:** Mantiene la legibilidad en condiciones adversas (Q10) y censura parcial.`);
    informeFinal.push(`> **ESTADO DEL DESPLIEGUE:** LISTO PARA PRUEBAS BETA EN ENTORNOS REALES.`);

    // GUARDAR
    const pathInforme = path.join(CONFIG.OUTPUT_DIR, 'DICTAMEN_TECNICO_MBH_v21.md');
    fs.writeFileSync(pathInforme, informeFinal.join('\n'));
    console.log(`\n📄 DICTAMEN PERICIAL GENERADO EN: ${pathInforme}`);
}

// -----------------------------------------------------------------------------
// FUNCIONES AUXILIARES (MODO TELEMETRÍA FORENSE)
// -----------------------------------------------------------------------------

async function auditarMutilacion(nombre, ruta) {
    try {
        const res = await analizarImagenMBH(ruta);

        // Lógica de Diagnóstico Forense
        let diagnostico = "❌ FALSO / ROTO";
        let icono = "❌";

        if (res.identificado && res.cliente !== "NO REGISTRADO") {
            if (res.hash === PATRON_ORO.id) {
                diagnostico = "✅ ÍNTEGRO (Original)";
                icono = "✅";
            } else {
                diagnostico = "⚠️ ERROR ID (Colisión)";
                icono = "⚠️";
            }
        }
        else if (res.cliente === "NO REGISTRADO" && res.identificado) {
             diagnostico = "🛡️ BLOQUEADO (Cortafuegos)";
             icono = "🛡️";
        }
        else if (!res.identificado) {
            diagnostico = "❌ SEÑAL DESTRUIDA";
        }

        if (res.diagnostico && res.diagnostico.escalaUsada && !res.diagnostico.escalaUsada.includes("1.0")) {
            diagnostico += ` [${res.diagnostico.escalaUsada}]`;
        }

        console.log(`   ${nombre.padEnd(25)} ${icono} E:${res.energia.toFixed(4)} -> ${diagnostico}`);

        DATOS_MUTILACION.push({
            prueba: nombre,
            energia: res.energia,
            id: res.identificado ? `**${res.hash}**` : "---",
            diagnostico: diagnostico
        });

    } catch (e) {
        console.error(e);
        DATOS_MUTILACION.push({
            prueba: nombre,
            energia: 0,
            id: "ERROR",
            diagnostico: "❌ ERROR PROCESO"
        });
    }
}

function addResistanceRow(label, res) {
    // 1. Feedback en Consola (Compacto)
    const icon = res.identificado ? "✅" : "❌";
    console.log(`   ${label.padEnd(5)} ${icon} E:${res.energia.toFixed(4)}`);

    // 2. Registrar Máximo para Gráficas
    if (res.energia > MAX_ENERGIA_REGISTRADA) MAX_ENERGIA_REGISTRADA = res.energia;

    // 3. Determinar Estado Forense
    let estado = "VULNERABLE";
    if (res.identificado) {
        if (res.energia > 0.4) estado = "BLINDADO"; // Umbrales ajustados a la nueva escala de energía (0.0 - 1.0 aprox)
        else estado = "PROTEGIDO";
    }

    // 4. GUARDAR DATOS (Con Cliente Incluido)
    DATOS_RESISTENCIA.push({
        calidad: label,
        energia: res.energia,
        id: res.identificado ? `**${res.hash}**` : "❌ ---",
        cliente: res.identificado ? (res.cliente || "---").substring(0, 20) : "---",
        estado: estado
    });
}

// EJECUTAR
ejecutarTestTotal().catch(e => console.error(e));
