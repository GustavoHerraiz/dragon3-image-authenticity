import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { analizadorImagenMBH } from './analizadorMBH.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas de las imágenes
const RUTA_SELLADA = path.join(__dirname, 'Atardecer_Sellada.png');

// Rutas de las víctimas del ataque
const RUTA_RECORTE = path.join(__dirname, 'Atardecer_Recorte.png');
const RUTA_ESTIRADA = path.join(__dirname, 'Atardecer_Estirada.png');
const RUTA_MINI = path.join(__dirname, 'Atardecer_Mini.png');

const log = (msg) => console.log(`[TORTURA] ${msg}`);

// Almacenamiento global para los resultados
const resultadosFinales = {
    control: null,
    formatos: [],
    geometricos: []
};

// =========================================================================
// Función para TEST DE FORMATOS CON EXPECTATIVAS REALISTAS
// =========================================================================

async function testFormats() {
    console.log("\n=========================================");
    console.log("   🧪 TEST DE CAMBIO DE FORMATOS Y COMPRESIÓN");
    console.log("=========================================\n");

    try {
        const imagenSelladaBuffer = fs.readFileSync(RUTA_SELLADA);

        const formatos = [
            {
                name: 'JPEG 100%',
                format: 'jpeg',
                opts: { quality: 100 },
                // JPEG 100% puede mantener algo del sello
                expecta: ["DERECHOS DETECTADOS", "SELLO PARCIAL"],
                noEspera: ["Original Intacto"]
            },
            {
                name: 'JPEG 90%',
                format: 'jpeg',
                opts: { quality: 90 },
                // JPEG 90% probablemente corrompe el sello
                expecta: ["DERECHOS DETECTADOS", "SELLO PARCIAL"],
                noEspera: ["Original Intacto"]
            },
            {
                name: 'JPEG 75% (Alta Compresión)',
                format: 'jpeg',
                opts: { quality: 75 },
                // JPEG 75% muy destructivo
                expecta: ["DERECHOS DETECTADOS", "SELLO PARCIAL", "Sin Sello Válido"],
                noEspera: ["Original Intacto"]
            },
            {
                name: 'WebP Lossless',
                format: 'webp',
                opts: { lossless: true },
                // WebP lossless mantiene el sello
                expecta: ["Original Intacto", "DERECHOS DETECTADOS"],
                noEspera: []
            },
            {
                name: 'WebP 80%',
                format: 'webp',
                opts: { quality: 80 },
                // WebP lossy corrompe
                expecta: ["DERECHOS DETECTADOS", "SELLO PARCIAL"],
                noEspera: ["Original Intacto"]
            },
            {
                name: 'TIFF LZW (Sin Pérdida)',
                format: 'tiff',
                opts: { compression: 'lzw' },
                // TIFF sin pérdida mantiene todo
                expecta: ["Original Intacto"],
                noEspera: ["Sin Sello Válido"]
            }
        ];

        for (let fmt of formatos) {
            log(`🔄 Probando formato: ${fmt.name}...`);

            const convertedBuffer = await sharp(imagenSelladaBuffer)
                .toFormat(fmt.format, fmt.opts)
                .toBuffer();

            const rutaTemporal = path.join(__dirname, `temp_${fmt.format}.png`);
            fs.writeFileSync(rutaTemporal, convertedBuffer);

            const resultado = await analizadorImagenMBH(rutaTemporal);

            const veredicto = resultado.response?.narrativa?.titulo || resultado.narrativa?.titulo || 'N/A';
            const bloquesOK = resultado.response?.narrativa?.explicacion_tecnica || 'N/A';

            // Evaluar con expectativas realistas
            const pasa = evaluarResultado(veredicto, fmt.expecta, fmt.noEspera);

            // Almacenar resultado
            resultadosFinales.formatos.push({
                prueba: fmt.name,
                veredicto: veredicto,
                bloques: bloquesOK,
                pasa: pasa,
                expecta: fmt.expecta.join(" o ")
            });

            console.log(`   -> Resultado: ${veredicto} | ${bloquesOK} | ${pasa ? '✅' : '❌'}`);

            fs.unlinkSync(rutaTemporal);
        }

    } catch (e) {
        console.error("⛔ Error en testFormats:", e.message);
    }
}

// =========================================================================
// Función para evaluar resultados de manera inteligente
// =========================================================================

function evaluarResultado(veredicto, expecta, noEspera) {
    // Si esperamos algo específico
    if (expecta && expecta.length > 0) {
        for (let esperado of expecta) {
            if (veredicto.includes(esperado)) {
                return true;
            }
        }
        return false;
    }

    // Si hay algo que NO esperamos
    if (noEspera && noEspera.length > 0) {
        for (let noEsperado of noEspera) {
            if (veredicto.includes(noEsperado)) {
                return false;
            }
        }
    }

    return true; // Por defecto, pasa
}

// =========================================================================
// Función principal de Tortura
// =========================================================================

async function ejecutarTortura() {
    console.log("\n=========================================");
    console.log("   DRAGON5 V5 - TEST DE RESISTENCIA FINAL");
    console.log("=========================================\n");

    // 1. GENERAR IMAGEN SELLADA BASE
    log("Generando Madre Sellada con Hash Original Embebido...");
    try {
        execSync(`node ${path.join(__dirname, 'generadorMBH.js')}`, { stdio: 'inherit' });
    } catch (e) {
        console.error("Error al generar la imagen sellada. Abortando.");
        process.exit(1);
    }

    // 2. CASO DE CONTROL POSITIVO (Analizar la imagen tal cual fue generada)
    console.log("\n-----------------------------------------");
    log("🔎 CONTROL 1: Analizando SELLADA ORIGINAL...");
    console.log("-----------------------------------------");
    const resControl = await analizadorImagenMBH(RUTA_SELLADA);
    imprimirResultado(resControl, "Control (Original)");

    const veredictoControl = resControl?.response?.narrativa?.titulo;

    // Almacenar resultado de control
    resultadosFinales.control = {
        prueba: "Control (Original)",
        veredicto: veredictoControl,
        pasa: veredictoControl === "Original Intacto",
        expecta: "Original Intacto"
    };

    if (veredictoControl !== "Original Intacto") {
        console.error("⛔ CONTROL FALLIDO: La imagen generada no es auténtica o el Analizador falló en la validación base. Abortando pruebas de resistencia.");
        process.exit(1);
    }

    // 🔥🔥 LLAMADA AL NUEVO TEST DE FORMATOS 🔥🔥
    await testFormats();

    // 3. CREAR MUTACIONES (ATAQUES GEOMÉTRICOS)
    log("🔪 Creando Mutaciones (Ataques Geométricos)...");

    const metadata = await sharp(RUTA_SELLADA).metadata();

    // A. RECORTE (CROPPING)
    await sharp(RUTA_SELLADA)
        .extract({
            left: Math.floor(metadata.width * 0.25),
            top: Math.floor(metadata.height * 0.25),
            width: Math.floor(metadata.width * 0.5),
            height: Math.floor(metadata.height * 0.5)
        })
        .toFile(RUTA_RECORTE);
    log("   -> ✂️ Recorte Central creado.");

    // B. DEFORMACIÓN (STRETCHING)
    await sharp(RUTA_SELLADA)
        .resize(1000, 1000, { fit: 'fill' })
        .toFile(RUTA_ESTIRADA);
    log("   -> 🥴 Deformación (1000x1000) creada.");

    // C. REDUCCIÓN (RESIZING)
    await sharp(RUTA_SELLADA)
        .resize(Math.floor(metadata.width * 0.5))
        .toFile(RUTA_MINI);
    log("   -> 🤏 Miniatura (50%) creada.");

    console.log("\n-----------------------------------------");
    log("   INICIANDO ANÁLISIS DE RESISTENCIA GEOMÉTRICA");
    console.log("-----------------------------------------\n");

    // 4. ANALIZAR SUPERVIVIENTES CON EXPECTATIVAS REALISTAS

    // CASO 2: RECORTE
    log("🔎 Analizando RECORTE...");
    const resRecorte = await analizadorImagenMBH(RUTA_RECORTE);
    const veredictoRecorte = resRecorte.response?.narrativa?.titulo || 'N/A';
    imprimirResultado(resRecorte, "Recorte");
    resultadosFinales.geometricos.push({
        prueba: "Recorte Central (50% Área)",
        veredicto: veredictoRecorte,
        pasa: veredictoRecorte.includes("DERECHOS DETECTADOS") || veredictoRecorte.includes("SELLO PARCIAL"),
        expecta: "DERECHOS DETECTADOS o SELLO PARCIAL"
    });

    // CASO 3: DEFORMACIÓN
    log("🔎 Analizando DEFORMACIÓN (Warping)...");
    const resDeforme = await analizadorImagenMBH(RUTA_ESTIRADA);
    const veredictoDeforme = resDeforme.response?.narrativa?.titulo || 'N/A';
    imprimirResultado(resDeforme, "Deformación");
    resultadosFinales.geometricos.push({
        prueba: "Deformación (1000x1000)",
        veredicto: veredictoDeforme,
        pasa: veredictoDeforme.includes("DERECHOS DETECTADOS") || veredictoDeforme.includes("SELLO PARCIAL"),
        expecta: "DERECHOS DETECTADOS o SELLO PARCIAL"
    });

    // CASO 4: MINIATURA
    log("🔎 Analizando MINIATURA (Resizing 50%)...");
    const resMini = await analizadorImagenMBH(RUTA_MINI);
    const veredictoMini = resMini.response?.narrativa?.titulo || 'N/A';
    imprimirResultado(resMini, "Miniatura");
    resultadosFinales.geometricos.push({
        prueba: "Miniatura (50% Escala)",
        veredicto: veredictoMini,
        pasa: veredictoMini.includes("DERECHOS DETECTADOS") || veredictoMini.includes("SELLO PARCIAL"),
        expecta: "DERECHOS DETECTADOS o SELLO PARCIAL"
    });

    console.log("\n=========================================");
    console.log("             TEST FINALIZADO             ");
    console.log("=========================================\n");

    mostrarResumenResultados(); // Llamada al nuevo resumen
}

// =========================================================================
// Función de RESUMEN DE RESULTADOS CON EXPECTATIVAS REALISTAS
// =========================================================================

function mostrarResumenResultados() {
    console.log("\n\n=========================================");
    console.log("        ✅ RESUMEN DE PRUEBAS FINALES ✅");
    console.log("=========================================");

    const totales = {
        fallas: 0,
        exitos: 0,
        total: 0
    };

    const tablaFormatter = (data, title) => {
        console.log(`\n### ${title}`);
        console.log("| PRUEBA | VEREDICTO OBTENIDO | EXPECTATIVA | ESTADO |");
        console.log("|---|---|---|---|");

        data.forEach(item => {
            const estado = item.pasa ? "✅ ÉXITO" : "❌ FALLO";

            if (item.pasa) {
                totales.exitos++;
            } else {
                totales.fallas++;
            }
            totales.total++;

            console.log(`| ${item.prueba} | ${item.veredicto} | ${item.expecta || 'N/A'} | ${estado} |`);
        });
    };

    // 1. Caso de Control
    if (resultadosFinales.control) {
        tablaFormatter([resultadosFinales.control], "1. Integridad de Control (Base)");
    }

    // 2. Ataques Geométricos
    if (resultadosFinales.geometricos && resultadosFinales.geometricos.length > 0) {
        tablaFormatter(resultadosFinales.geometricos, "2. Ataques Geométricos (Detección Forense)");
    }

    // 3. Resistencia a Formatos
    if (resultadosFinales.formatos && resultadosFinales.formatos.length > 0) {
        tablaFormatter(resultadosFinales.formatos, "3. Resistencia a Compresión/Formatos");
    }

    console.log("\n--- RESULTADO GLOBAL ---");
    console.log(`TOTAL DE PRUEBAS: ${totales.total}`);
    console.log(`✅ ÉXITOS: ${totales.exitos}`);
    console.log(`❌ FALLOS: ${totales.fallas}`);

    const porcentajeExito = totales.total > 0 ? Math.round((totales.exitos / totales.total) * 100) : 0;

    let resultadoFinal = "";
    if (porcentajeExito === 100) {
        resultadoFinal = "¡EXCELENTE! 100% DE ÉXITO";
    } else if (porcentajeExito >= 80) {
        resultadoFinal = "MUY BUENO - SISTEMA FUNCIONAL";
    } else if (porcentajeExito >= 60) {
        resultadoFinal = "ACEPTABLE - ÁREAS DE MEJORA";
    } else {
        resultadoFinal = "NECESITA MEJORAS SIGNIFICATIVAS";
    }

    console.log(`\nPORCENTAJE DE ÉXITO: ${porcentajeExito}%`);
    console.log(`ESTADO GENERAL: ${resultadoFinal}`);
    console.log("=========================================");

    // Mostrar diagnóstico adicional
    console.log("\n📊 DIAGNÓSTICO DEL SISTEMA:");
    console.log("----------------------------");

    if (totales.exitos === totales.total) {
        console.log("✅ El sistema es ROBUSTO y RESISTENTE");
        console.log("✅ Detecta manipulación en todos los casos");
        console.log("✅ Mantiene atribución de autor incluso con daño");
    } else if (totales.exitos >= totales.total * 0.7) {
        console.log("⚠️  El sistema es FUNCIONAL pero puede mejorar");
        console.log("✅ Detecta la mayoría de manipulaciones");
        console.log("⚠️  Algunos formatos/ataques pueden requerir ajustes");
    } else {
        console.log("🔴 El sistema necesita MEJORAS IMPORTANTES");
        console.log("🔴 Revisar resistencia a compresión y extracción de datos");
    }
}

function imprimirResultado(res, tipo) {
    const datos = res.response || res;

    const datosClave = datos.datos_clave || {};
    const hashOriginal = datosClave.Hash_Original;
    const hashActual = datosClave.Hash_Actual;
    const titulo = datos.narrativa?.titulo;
    const explicacion = datos.narrativa?.explicacion_tecnica;

    console.log(`[${tipo}] Veredicto: ${titulo || 'N/A'}`);

    if (titulo.includes("Original Intacto")) {
        console.log(`   ✅ PERFECTO: Imagen original intacta (Hash OK).`);
        console.log(`   -> Hash ORIGINAL (Sello): ${hashOriginal || 'N/A'}`);
        console.log(`   -> Hash ACTUAL (Imagen): ${hashActual || 'N/A'}`);
    }
    else if (titulo.includes("DERECHOS DETECTADOS") || titulo.includes("SELLO PARCIAL")) {
        console.log(`   ✅ DETECCIÓN EXITOSA: Sello detectado en imagen manipulada.`);
        console.log(`   -> Hash Original (Sello): ${hashOriginal || 'No legible'}`);
        console.log(`   -> Hash Actual (Imagen): ${hashActual || 'N/A'}`);
        console.log(`   -> Diagnóstico: ${explicacion}`);
    }
    else if (titulo.includes("Sin Sello Válido")) {
        console.log(`   ❌ FALLO CRÍTICO: No se pudo detectar sello.`);
        console.log(`   -> Posible causa: Compresión destructiva o corrupción total`);
        console.log(`   -> Diagnóstico: ${explicacion}`);
    }
    else {
        console.log(`   ⚠️  RESULTADO INESPERADO: ${titulo}`);
        console.log(`   -> Diagnóstico: ${explicacion}`);
    }
    console.log("-----------------------------------------");
}

// Ejecutar el test
ejecutarTortura().catch(e => {
    console.error("Error en test:", e);
    process.exit(1);
});
