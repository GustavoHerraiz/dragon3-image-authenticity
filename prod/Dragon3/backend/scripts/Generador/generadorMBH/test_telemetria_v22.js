import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizadorMBH.js';

async function ejecutarTestTelemetria() {
    console.log(`\n📡 INICIANDO TELEMETRÍA DRAGON3 v22 (DEEP RADAR SCAN)...`);
    const gen = new GeneradorMBH();
    const outDir = './output_telemetria';

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const rutaMaster = path.join(outDir, 'master_v22.png');
    const ID_OBJETIVO = 760; // Sello 00002F8
    const meta = { id_numerico: ID_OBJETIVO, hash_suffix: "D760" };

    // 1. GENERACIÓN CON VALIDACIÓN DE RUTA
    try {
        const inputPath = './input/firma_test.jpg';
        if (!fs.existsSync(inputPath)) throw new Error(`Archivo base no encontrado en ${inputPath}`);

        await gen.sellarImagen(inputPath, rutaMaster, meta);
        console.log(`✅ Master generado: ${rutaMaster}`);
    } catch (err) {
        console.error("❌ Error Crítico en Generación:", err.message);
        return;
    }

    // 2. BATERÍA DE ATAQUES CON EXTRACCIÓN DE METADATOS
    const ataques = [
        { nombre: "ORIGINAL (PNG)", ruta: rutaMaster },
        {
            nombre: "JPEG Q50",
            ruta: path.join(outDir, 'test_q50.jpg'),
            proc: (p) => sharp(p).jpeg({quality:50}).toFile(path.join(outDir, 'test_q50.jpg'))
        },
        {
            nombre: "RESIZE 50%",
            ruta: path.join(outDir, 'test_r50.jpg'),
            proc: (p) => sharp(p).resize({ width: 500 }).toFile(path.join(outDir, 'test_r50.jpg'))
        }
    ];

    // CABECERA DE TELEMETRÍA TOTAL (8 COLUMNAS)
    console.log(`\n| ATAQUE         | FARO (Radar) | COH (ADN) | OFFSET | ID DETECTADO | CHK | ATAQUE DETECTADO    | ESTADO   |`);
    console.log(`| :---           | :---:        | :---:     | :---:  | :---:        | :---:| :---                | :---:    |`);

    for (const atq of ataques) {
        try {
            if (atq.proc) await atq.proc(rutaMaster);

            // Analizamos y capturamos el objeto de diagnóstico completo
            const res = await analizarImagenMBH(atq.ruta);

            // SENSORES DE TELEMETRÍA
            const eFaro   = res.diagnostico?.energiaRadar || "0.00";
            const cohBits = res.diagnostico?.coherenciaBits || "0.00";
            const offset  = res.diagnostico?.offsetUsado || "N/A";
            const chk     = res.diagnostico?.checksumValido ? "OK" : "ERR";
            const idFound = res.identificado ? res.hash : (res.id_numerico ? res.id_numerico.toString(16).toUpperCase().padStart(7, '0') : "-------");

            // LÓGICA DE DIAGNÓSTICO DE ATAQUE (Deducción Forense)
            let ataqueSugerido = res.diagnostico?.ataqueDetectado || "NINGUNO";
            if (!res.identificado && parseFloat(eFaro) > 100 && parseFloat(cohBits) < 35) {
                ataqueSugerido = "RESIZE / ALIASING";
            } else if (!res.identificado && parseFloat(eFaro) < 50) {
                ataqueSugerido = "RUIDO EXTREMO";
            }

            // Lógica de Estado
            let status = "🔴 LOST";
            if (res.identificado) {
                status = "🟢 LOCK";
            } else if (parseFloat(eFaro) > 40) {
                status = "⚠️ ALIGNED";
            }

            // Formateo de salida
            const n = atq.nombre.padEnd(14);
            const f = eFaro.toString().padStart(12);
            const c = cohBits.toString().padStart(9);
            const o = offset.padStart(6);
            const i = idFound.padStart(12);
            const k = chk.padStart(3);
            const a = ataqueSugerido.padEnd(19);

            console.log(`| ${n} | ${f} | ${c} | ${o} | ${i} | ${k} | ${a} | ${status} |`);

        } catch (err) {
            console.log(`| ${atq.nombre.padEnd(14)} | ERROR EN TELEMETRÍA: ${err.message.substring(0, 40)}...`);
        }
    }
    console.log(`\n🛰️ TELEMETRÍA COMPLETADA: Sistema Dragon3 listo para auditoría.\n`);
}

ejecutarTestTelemetria();
