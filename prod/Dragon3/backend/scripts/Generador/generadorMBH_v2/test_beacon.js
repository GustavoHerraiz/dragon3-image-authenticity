// test_beacon_detailed.js
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizadorMBH.js';

const CONFIG_TEST = {
    imagenBase: './test_input.jpg',
    carpetaSalida: './test_beacon_report',
    idPrueba: 12345678,
    factoresResize: [0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0],
    compresionesJPEG: [80, 60, 40, 20],
    verbose: true,
    telemetria: true   // Activar modo detallado
};

async function prepararEntorno() {
    if (!fs.existsSync(CONFIG_TEST.imagenBase)) {
        console.log('Generando imagen de prueba...');
        const ancho = 1024, alto = 1024;
        const buffer = Buffer.alloc(ancho * alto * 4);
        for (let y = 0; y < alto; y++) {
            for (let x = 0; x < ancho; x++) {
                const i = (y * ancho + x) * 4;
                buffer[i] = (x * 255) / ancho;
                buffer[i+1] = (y * 255) / alto;
                buffer[i+2] = 128;
                buffer[i+3] = 255;
            }
        }
        await sharp(buffer, { raw: { width: ancho, height: alto, channels: 4 } })
            .jpeg({ quality: 90 })
            .toFile(CONFIG_TEST.imagenBase);
    }
    if (!fs.existsSync(CONFIG_TEST.carpetaSalida)) {
        fs.mkdirSync(CONFIG_TEST.carpetaSalida, { recursive: true });
    }
}

async function generarSellada() {
    const rutaSellada = path.join(CONFIG_TEST.carpetaSalida, 'sellada.png');
    const generador = new GeneradorMBH();
    const metadatos = { id_numerico: CONFIG_TEST.idPrueba };
    console.log(`\n🔨 Generando sello ID ${CONFIG_TEST.idPrueba} (hex: ${CONFIG_TEST.idPrueba.toString(16).toUpperCase().padStart(7,'0')})...`);
    const selloHex = await generador.sellarImagen(CONFIG_TEST.imagenBase, rutaSellada, metadatos);
    console.log(`✅ Sello: ${selloHex}`);
    return rutaSellada;
}

async function probarResizes(rutaSellada) {
    const resultados = [];
    const infoOriginal = await sharp(rutaSellada).metadata();

    for (const factor of CONFIG_TEST.factoresResize) {
        const nombre = `resize_${factor.toFixed(2).replace('.','_')}.png`;
        const ruta = path.join(CONFIG_TEST.carpetaSalida, nombre);
        const w = Math.round(infoOriginal.width * factor);
        const h = Math.round(infoOriginal.height * factor);
        if (w < 64 || h < 64 || w > 8192 || h > 8192) {
            console.log(`⏩ Escala ${factor} ignorada`);
            continue;
        }

        console.log(`\n📐 Redimensionando a ${w}x${h} (factor ${factor})...`);
        await sharp(rutaSellada).resize(w, h, { kernel: 'lanczos3' }).png().toFile(ruta);

        const inicio = Date.now();
        // Llamada con opción detailed = true
        const resultado = await analizarImagenMBH(ruta, { detailed: CONFIG_TEST.telemetria });
        const tiempo = Date.now() - inicio;

        // Guardar telemetría en un archivo aparte
        if (CONFIG_TEST.telemetria && resultado.debugInfo) {
            const debugFile = path.join(CONFIG_TEST.carpetaSalida, `debug_factor_${factor}.json`);
            fs.writeFileSync(debugFile, JSON.stringify(resultado.debugInfo, null, 2));
            console.log(`   📊 Telemetría guardada en ${debugFile}`);
        }

        resultados.push({
            factor,
            dimensiones: `${w}x${h}`,
            tiempo_ms: tiempo,
            ...resultado,
            diagnostico: resultado.diagnostico
        });

        console.log(`   → Score: ${resultado.energia.toFixed(4)} | ID: ${resultado.hash} | Método: ${resultado.diagnostico?.metodo}`);
    }

    // Pruebas JPEG
    if (CONFIG_TEST.compresionesJPEG) {
        for (const calidad of CONFIG_TEST.compresionesJPEG) {
            const nombre = `resize_1.0_jpeg_${calidad}.jpg`;
            const ruta = path.join(CONFIG_TEST.carpetaSalida, nombre);
            console.log(`\n📸 Comprimiendo JPEG calidad ${calidad}...`);
            await sharp(rutaSellada).jpeg({ quality: calidad, mozjpeg: true }).toFile(ruta);

            const inicio = Date.now();
            const resultado = await analizarImagenMBH(ruta, { detailed: CONFIG_TEST.telemetria });
            const tiempo = Date.now() - inicio;

            if (CONFIG_TEST.telemetria && resultado.debugInfo) {
                const debugFile = path.join(CONFIG_TEST.carpetaSalida, `debug_jpeg_${calidad}.json`);
                fs.writeFileSync(debugFile, JSON.stringify(resultado.debugInfo, null, 2));
            }

            resultados.push({
                factor: 1.0,
                dimensiones: `${infoOriginal.width}x${infoOriginal.height}`,
                compresionJPEG: calidad,
                tiempo_ms: tiempo,
                ...resultado,
                diagnostico: resultado.diagnostico
            });
        }
    }
    return resultados;
}

function generarInforme(resultados, metadatos) {
    const informePath = path.join(CONFIG_TEST.carpetaSalida, 'informe.json');
    const htmlPath = path.join(CONFIG_TEST.carpetaSalida, 'informe.html');

    const total = resultados.length;
    const exitos = resultados.filter(r => r.identificado).length;
    const tasa = (exitos / total * 100).toFixed(2);
    const tiempoMedio = (resultados.reduce((a, r) => a + r.tiempo_ms, 0) / total).toFixed(2);
    const metodos = resultados.reduce((acc, r) => {
        const m = r.diagnostico?.metodo || 'desconocido';
        acc[m] = (acc[m] || 0) + 1;
        return acc;
    }, {});

    const informe = {
        fecha: new Date().toISOString(),
        configuracion: CONFIG_TEST,
        metadatos,
        estadisticas: { total, exitos, fallos: total - exitos, tasaExito: `${tasa}%`, tiempoMedioMs: tiempoMedio, metodosUsados: metodos },
        resultados
    };
    fs.writeFileSync(informePath, JSON.stringify(informe, null, 2));

    const html = `...`; // (mismo HTML que antes)
    fs.writeFileSync(htmlPath, html);
    console.log(`\n📄 Informe generado en ${informePath} y ${htmlPath}`);
}

async function main() {
    console.log('🚀 TEST CON TELEMETRÍA DETALLADA');
    await prepararEntorno();
    const rutaSellada = await generarSellada();
    const resultados = await probarResizes(rutaSellada);
    const metadatos = { idPrueba: CONFIG_TEST.idPrueba, idHex: CONFIG_TEST.idPrueba.toString(16).toUpperCase().padStart(7,'0') };
    generarInforme(resultados, metadatos);
    console.log('\n✅ Completado. Revisa la carpeta:', CONFIG_TEST.carpetaSalida);
}

main().catch(console.error);
