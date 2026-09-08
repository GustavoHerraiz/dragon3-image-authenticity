import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { analizadorImagenMBH } from './analizadorMBH.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUTA_ORIGINAL = path.join(__dirname, 'Atardecer.jpg');
const RUTA_SELLADA = path.join(__dirname, 'Atardecer_Sellada.png');
const RUTA_HACKEADA = path.join(__dirname, 'Atardecer_Hackeada.png');

// Logger simple y seguro
const log = (msg) => console.log(`[TEST] ${msg}`);

async function ejecutarTest() {
    console.log("\n=========================================");
    console.log("   DRAGON3 V3 - TEST FINAL INTEGRADO");
    console.log("=========================================\n");

    // PASO 0: LIMPIEZA
    try {
        if (fs.existsSync(RUTA_SELLADA)) fs.unlinkSync(RUTA_SELLADA);
        if (fs.existsSync(RUTA_HACKEADA)) fs.unlinkSync(RUTA_HACKEADA);
        log("Entorno limpio.");
    } catch (e) { console.error("Error limpiando:", e); }

    // PASO 1: GENERACIÓN
    log("Generando Sello...");
    try {
        // Ejecutamos generador
        execSync(`node ${path.join(__dirname, 'generadorMBH.js')}`, { stdio: 'inherit' });

        if (!fs.existsSync(RUTA_SELLADA)) throw new Error("No se generó el archivo PNG.");
        log("✅ Generación completada.");
    } catch (e) {
        console.error("!!! ERROR CRÍTICO EN GENERADOR !!!", e);
        process.exit(1);
    }

    // PASO 2: PRUEBA DE AUTENTICIDAD (DIAGNÓSTICO DETALLADO)
    log("Verificando Autenticidad...");
    try {
        const resultado = await analizadorImagenMBH(RUTA_SELLADA);
        const datos = resultado.response || resultado; // Compatibilidad

        // --- DIAGNÓSTICO TRIPLE CHECK ---
        const techInfo = datos.narrativa.explicacion_tecnica || "";
        console.log("\n--- 🔍 DIAGNÓSTICO INDIANA JONES ---");

        // Regex para extraer los dos valores clave
        const match = techInfo.match(/Hash Leído: (.*?) vs Calc: (.*?)$/);

        if (match) {
            const hashLeido = match[1];
            const hashCalc = match[2];

            // 1. CHECK GEOMETRÍA (El Mapa)
            if (hashCalc && hashCalc !== '0' && hashCalc !== 'null') {
                log(`✅ PASO 1 (MAPA/CÁLCULO): ÉXITO. Hash calculado: ${hashCalc}`);
            } else {
                log(`❌ PASO 1 (MAPA/CÁLCULO): FALLO. Matemática rota.`);
            }

            // 2. CHECK LECTURA (El Cofre)
            if (hashLeido && hashLeido !== '0') {
                log(`✅ PASO 2 (LECTURA/EXTRA): ÉXITO. Datos recuperados: ${hashLeido}`);
            } else {
                log(`❌ PASO 2 (LECTURA/EXTRA): FALLO. Caja fuerte vacía (se leyó 0). Fallo de INYECCIÓN.`);
            }

            // 3. CHECK VALIDACIÓN (La Verdad)
            if (hashLeido === hashCalc && hashCalc !== '0') {
                log(`✅ PASO 3 (VALIDACIÓN): ÉXITO. Auténtico.`);
            } else {
                log(`❌ PASO 3 (VALIDACIÓN): FALLO. No coinciden.`);
            }
        } else {
            console.log("[TEST] ⚠️ No se pudo parsear la explicación técnica para el diagnóstico.");
            console.log("Raw Info:", techInfo);
        }
        console.log("------------------------------------\n");

        if (datos.evaluacion.veredicto === 'Auténtico') {
            log(`RESULTADO FINAL: ✅ FOTO LIMPIA APROBADA.`);
        } else {
            log(`RESULTADO FINAL: ❌ FOTO LIMPIA RECHAZADA (Ver diagnóstico arriba).`);
        }

    } catch (e) { console.error("Crash Analizador:", e); }

    // PASO 3: SABOTAJE
    log("Creando Sabotaje (Pixel Negro)...");
    try {
        await sharp(RUTA_SELLADA)
            .ensureAlpha()
            .composite([{
                input: Buffer.alloc(400, 0), // 10x10 pixeles negros
                raw: { width: 10, height: 10, channels: 4 },
                top: 0, left: 0
            }])
            .png({ palette: false }) // Guardamos igual que el generador
            .toFile(RUTA_HACKEADA);

        log("✅ Imagen Hackeada creada.");
    } catch (e) { console.error("Error creando sabotaje:", e); }

    // PASO 4: DETECCIÓN DE FRAUDE
    log("Verificando Detección de Fraude...");
    try {
        const resHack = await analizadorImagenMBH(RUTA_HACKEADA);
        const datosHack = resHack.response || resHack;

        if (datosHack.flags.tiene_manipulacion) {
            log("✅ PRUEBA 2 ÉXITO: Fraude detectado correctamente.");
            log(`   -> Causa: ${datosHack.narrativa.explicacion_tecnica}`);
        } else {
            log("❌ PRUEBA 2 FALLO: El sistema no detectó el cambio.");
        }
    } catch (e) { console.error("Crash Analizador Hack:", e); }

    console.log("\n=========================================");
    console.log("             TEST FINALIZADO             ");
    console.log("=========================================\n");
}

ejecutarTest();
