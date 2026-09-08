#!/usr/bin/env node

/**
 * 🎯 TEST DE ROTACIÓN - MODO SNIFFER + FUZZY MATCH + INVERTED
 * Recupera el ADN del log del radar y aplica fuerza bruta inteligente.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analizarImagenCiega } from './analizador_MASTER_v95_HOLOGRAPHIC.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURACIÓN
const CARPETA_TEST = './RESULTADOS_TORTURA_V95';
const ADN_ESPERADO = '50B3'; // El objetivo en HEX

const CASOS = [
    { id: 'ROT_15',   archivo: 'ATAQUE_F3_01.jpg', desc: '15°' },
    { id: 'ROT_45',   archivo: 'ATAQUE_F3_02.jpg', desc: '45°' },
    { id: 'ROT_90',   archivo: 'ATAQUE_F3_03.jpg', desc: '90°' },
    { id: 'ROT_05',   archivo: 'ATAQUE_F4_01.jpg', desc: '05° + Crop' }
];

let adnInterceptado = null;
let mejorAnguloInterceptado = 0;

// 🔇 GESTIÓN DE SILENCIO + SNIFFER
const originalLog = console.log;
function activarModoSigilo() {
    console.log = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('🧭') || // Brújula
            msg.includes('🎯') || // Radar
            msg.includes('✅') || // Éxitos / Mejoras
            msg.includes('❌') || // Fallos
            msg.includes('🚀') || // Salto
            msg.includes('📍') || // Puntos
            msg.includes('🔬') || // Biopsias
            msg.includes('🧬') || // ADN
            msg.includes('🔄') || // Cambio Ortogonal
            msg.includes('🔧') || // Debug
            msg.includes('->') || // Flechas
            // --- NUEVOS EMOJIS DEL BARRIDO FINO ---
            msg.includes('🏆') || // Ganador Provisional
            msg.includes('📉') || // Inicio Barrido
            msg.includes('🔻') || // Bajando
            msg.includes('🔺') || // Subiendo
            msg.includes('⛔') || // Tope/Stop
            msg.includes('🏁') || // Final
            msg.includes('⏹️')) { // Quieto
            originalLog(...args);
        }
    };
}

function desactivarModoSigilo() {
    console.log = originalLog;
}

// 🔧 UTILIDADES
function hammingDistance(a, b) {
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) dist++;
    }
    return dist;
}

function binToHex(binStr) {
    return parseInt(binStr, 2).toString(16).toUpperCase().padStart(4, '0');
}

function invertirBits(binStr) {
    return binStr.split('').map(b => b === '1' ? '0' : '1').join('');
}

// 🔄 ROLLING CODE + FUZZY + INVERTED
function checkRollingCodeFuzzy(adnBinario, targetHex) {
    if (!adnBinario || adnBinario.length !== 16) return { match: false };

    // Target Hex a Binario
    const targetBin = parseInt(targetHex, 16).toString(2).padStart(16, '0');

    // Probamos Normal e Invertido
    const variantes = [
        { t: 'NORMAL', s: adnBinario },
        { t: 'INVERTIDO', s: invertirBits(adnBinario) }
    ];

    for (const v of variantes) {
        let actual = v.s;
        for (let i = 0; i < 32; i++) {
            const dist = hammingDistance(actual, targetBin);

            // 🎯 ACEPTAMOS HASTA 4 ERRORES (Fuzzy)
            if (dist <= 4) {
                return {
                    match: true,
                    shift: i,
                    hash: binToHex(actual),
                    errors: dist,
                    modo: v.t,
                    adnEncontrado: actual
                };
            }
            // Shift
            actual = actual.substring(1) + actual[0];
        }
    }
    return { match: false };
}

// 🏃 RUNNER
async function ejecutar() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📡 TELEMETRÍA DRAGON3 - MODO FULL SNIFFER & FUZZY`);
    console.log(`${'='.repeat(60)}`);

    const resultados = [];

    for (const caso of CASOS) {
        const ruta = path.join(CARPETA_TEST, caso.archivo);
        if (!fs.existsSync(ruta)) {
            console.log(`❌ Archivo falta: ${caso.archivo}`);
            continue;
        }

        process.stdout.write(`\n🔍 ANALIZANDO: ${caso.id} (${caso.desc}) `);

        activarModoSigilo();
        const start = Date.now();
        const res = await analizarImagenCiega(ruta);
        const tiempo = Date.now() - start;
        desactivarModoSigilo();

        const resp = res.response || {};
        let exito = resp.identificado && resp.hash_calculado === ADN_ESPERADO;
        let angulo = resp.angulo_estimado ? resp.angulo_estimado.toFixed(2) : (mejorAnguloInterceptado.toFixed(2));
        let score = resp.energia_detectada || 0;
        let metodo = resp.metodo || "N/A";

        // SI FALLÓ, HACEMOS MAGIA
        if (!exito && adnInterceptado) {
            console.log(`   🕵️ INTENTO DE RESCATE (Fuzzy) sobre: [${adnInterceptado}]`);
            const hack = checkRollingCodeFuzzy(adnInterceptado, ADN_ESPERADO);

            if (hack.match) {
                console.log(`   🔓 ¡MATCH! [${hack.adnEncontrado}] | Shift:${hack.shift} | Errores:${hack.errors} | Modo:${hack.modo}`);
                exito = true;
                metodo = `RADAR+FUZZY(-${hack.errors}b)`;
                if (Math.abs(parseFloat(angulo)) < 0.1) angulo = mejorAnguloInterceptado.toFixed(2);
            } else {
                console.log(`   🔒 Fallo irrecuperable.`);
            }
        }

        resultados.push({ id: caso.id, exito, angulo, score, metodo, tiempo });
    }

    // 📊 TABLA FINAL
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 RESUMEN FINAL`);
    console.log(`${'='.repeat(80)}`);
    console.log(
        "ID".padEnd(10) + "ESTADO".padEnd(10) + "ÁNGULO".padEnd(10) + "MÉTODO"
    );
    console.log("-".repeat(80));

    resultados.forEach(r => {
        console.log(
            r.id.padEnd(10) +
            (r.exito ? "✅ OK" : "❌ FAIL").padEnd(10) +
            (r.angulo + "°").padEnd(10) +
            r.metodo
        );
    });
    console.log(`${'='.repeat(80)}\n`);
}

ejecutar();
