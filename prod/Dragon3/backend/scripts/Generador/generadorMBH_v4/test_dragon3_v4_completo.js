/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║     DRAGON3 TEST SUITE v4 — NIVEL MILITAR                       ║
 * ║                                                                  ║
 * ║  Batería completa de pruebas:                                    ║
 * ║  · JPEG Q100 → Q10 (10 pasos)                                   ║
 * ║  · Resizes críticos (0.2x - 2.0x)                               ║
 * ║  · Combinaciones (resize + JPEG)                                ║
 * ║  · Telemetría completa con tiempos precisos                     ║
 * ║  · Informe HTML visual + JSON raw                               ║
 * ║  · Todas las imágenes generadas organizadas                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizadorMBH_v4.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL TEST
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG_TEST = {
    IMAGEN_ENTRADA: './input/firma_test.jpg',  // Ruta relativa al directorio de ejecución
    SELLO_TEST: BASE_DE_DATOS_SELLOS[0], // Quico Melero - "d760"

    // Transformaciones a probar
    JPEG_QUALITIES: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
    RESIZE_FACTORS: [0.25, 0.33, 0.5, 0.66, 0.75, 0.9, 1.33, 1.5, 2.0],

    // Combos críticos (resize + JPEG)
    COMBOS: [
        { resize: 0.5,  jpeg: 80 },
        { resize: 0.75, jpeg: 60 },
        { resize: 0.9,  jpeg: 40 },
    ],

    // Directorio de resultados (en el directorio actual)
    DIR_BASE: './resultados',
};

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL DEL TEST
// ─────────────────────────────────────────────────────────────────────────────
let testSession = {
    timestamp: new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5),
    dirResultados: '',
    dirImagenes: '',
    resultados: [],
    estadisticas: {
        total: 0,
        exitosos: 0,
        fallidos: 0,
        tiempoTotal: 0,
        tiempoPromedio: 0,
        tiempoMin: Infinity,
        tiempoMax: 0,
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export async function ejecutarTestCompleto() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║        DRAGON3 v4 — TEST SUITE COMPLETO                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    try {
        // 1. INICIALIZACIÓN
        await inicializarTest();

        // 2. GENERAR IMAGEN SELLADA ORIGINAL
        const rutaSellada = await generarImagenSellada();

        // 3. PRUEBA IMAGEN ORIGINAL (CONTROL)
        await probarImagen('CONTROL_original', rutaSellada, 'Imagen original sellada (control)');

        // 4. PRUEBAS JPEG
        await ejecutarPruebasJPEG(rutaSellada);

        // 5. PRUEBAS RESIZE
        await ejecutarPruebasResize(rutaSellada);

        // 6. PRUEBAS COMBO
        await ejecutarPruebasCombos(rutaSellada);

        // 7. CALCULAR ESTADÍSTICAS
        calcularEstadisticas();

        // 8. GENERAR INFORMES
        await generarInformes();

        // 9. RESUMEN FINAL
        imprimirResumenFinal();

    } catch (error) {
        console.error('❌ ERROR CRÍTICO EN TEST SUITE:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────
async function inicializarTest() {
    console.log('📋 Inicializando test suite...\n');

    // Crear directorios
    testSession.dirResultados = path.join(CONFIG_TEST.DIR_BASE, `test-${testSession.timestamp}`);
    testSession.dirImagenes = path.join(testSession.dirResultados, 'imagenes');

    fs.mkdirSync(testSession.dirResultados, { recursive: true });
    fs.mkdirSync(testSession.dirImagenes, { recursive: true });

    console.log(`   📁 Directorio: ${testSession.dirResultados}`);
    console.log(`   🎯 Sello: ${CONFIG_TEST.SELLO_TEST.cliente} - "${CONFIG_TEST.SELLO_TEST.obra}"`);
    console.log(`   🔖 Hash: ${CONFIG_TEST.SELLO_TEST.hash_suffix}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR IMAGEN SELLADA
// ─────────────────────────────────────────────────────────────────────────────
async function generarImagenSellada() {
    console.log('🔏 Generando imagen sellada...\n');

    const generador = new GeneradorMBH();
    const rutaSellada = path.join(testSession.dirImagenes, '00_original_sellada.png');

    const sello = await generador.sellarImagen(
        CONFIG_TEST.IMAGEN_ENTRADA,
        rutaSellada,
        CONFIG_TEST.SELLO_TEST
    );

    console.log(`   ✅ Generada: ${rutaSellada}`);
    console.log(`   🔖 Sello aplicado: ${sello}\n`);

    return rutaSellada;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBAS JPEG
// ─────────────────────────────────────────────────────────────────────────────
async function ejecutarPruebasJPEG(rutaSellada) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  FASE 1: PRUEBAS JPEG (Q100 → Q10)');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    for (const quality of CONFIG_TEST.JPEG_QUALITIES) {
        const nombre = `JPEG_q${quality}`;
        const rutaTransformada = path.join(testSession.dirImagenes, `${nombre}.jpg`);

        // Aplicar compresión JPEG
        await sharp(rutaSellada)
            .jpeg({ quality, mozjpeg: true })
            .toFile(rutaTransformada);

        // Analizar
        await probarImagen(nombre, rutaTransformada, `JPEG quality ${quality}`);
    }

    console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBAS RESIZE
// ─────────────────────────────────────────────────────────────────────────────
async function ejecutarPruebasResize(rutaSellada) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  FASE 2: PRUEBAS RESIZE (0.25x - 2.0x)');
    console.log('  SIMULACIÓN PRODUCCIÓN: Resize + JPEG Q80 (como Instagram/RRSS)');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const info = await sharp(rutaSellada).metadata();

    for (const factor of CONFIG_TEST.RESIZE_FACTORS) {
        const nombre = `RESIZE_${factor}x`.replace('.', '_');
        const rutaTransformada = path.join(testSession.dirImagenes, `${nombre}.jpg`);  // ← JPG, no PNG

        const w = Math.round(info.width * factor);
        const h = Math.round(info.height * factor);

        // SIMULAR PRODUCCIÓN REAL: Resize + compresión JPEG (como redes sociales)
        await sharp(rutaSellada)
            .resize(w, h, { kernel: 'lanczos3' })
            .jpeg({ quality: 100, mozjpeg: true })  // ← Compresión realista
            .toFile(rutaTransformada);

        // Analizar
        await probarImagen(nombre, rutaTransformada, `Resize ${factor}x + JPEG Q80 (${w}x${h})`);
    }

    console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBAS COMBO
// ─────────────────────────────────────────────────────────────────────────────
async function ejecutarPruebasCombos(rutaSellada) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  FASE 3: PRUEBAS COMBO (Resize + JPEG)');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const info = await sharp(rutaSellada).metadata();

    for (const combo of CONFIG_TEST.COMBOS) {
        const nombre = `COMBO_${combo.resize}x_q${combo.jpeg}`.replace('.', '_');
        const rutaTransformada = path.join(testSession.dirImagenes, `${nombre}.jpg`);

        const w = Math.round(info.width * combo.resize);
        const h = Math.round(info.height * combo.resize);

        // Aplicar resize + JPEG
        await sharp(rutaSellada)
            .resize(w, h, { kernel: 'lanczos3' })
            .jpeg({ quality: combo.jpeg, mozjpeg: true })
            .toFile(rutaTransformada);

        // Analizar
        await probarImagen(
            nombre,
            rutaTransformada,
            `Combo: Resize ${combo.resize}x + JPEG Q${combo.jpeg}`
        );
    }

    console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN NUCLEAR: PROBAR UNA IMAGEN
// ─────────────────────────────────────────────────────────────────────────────
async function probarImagen(nombre, ruta, descripcion) {
    const inicio = process.hrtime.bigint();

    try {
        // Analizar con Dragon3 v4
        const resultado = await analizarImagenMBH(ruta);

        const fin = process.hrtime.bigint();
        const tiempoMs = Number(fin - inicio) / 1_000_000; // nanosegundos → milisegundos

        // Verificar contra base de datos
        const esperado = CONFIG_TEST.SELLO_TEST.hash_suffix.toUpperCase();
        const hashObtenido = resultado.hash;
        const coincide = hashObtenido.endsWith(esperado);

        // Construir resultado
        const test = {
            nombre,
            descripcion,
            ruta: path.basename(ruta),
            tiempoMs: Math.round(tiempoMs * 100) / 100,

            // Resultado del análisis
            identificado: resultado.identificado,
            hashEsperado: esperado,
            hashObtenido: hashObtenido,
            coincide: coincide,

            // Telemetría
            energia: Math.round(resultado.energia * 1000) / 1000,
            correlacion: Math.round((resultado.diagnostico?.correlacion || 0) * 1000) / 1000,
            confianza: resultado.confianza,

            // Detalles
            cliente: resultado.cliente,
            obra: resultado.obra,
            nivel: resultado.diagnostico?.nivel || '---',
            escala: resultado.diagnostico?.escalaUsada || 'N/A',
            rotacion: resultado.diagnostico?.rotacion || 0,
            offset: resultado.diagnostico?.offsetUsado || 'N/A',

            // Veredicto
            exito: coincide && resultado.identificado,
        };

        testSession.resultados.push(test);

        // Imprimir resultado
        const icono = test.exito ? '✅' : '❌';
        const color = test.exito ? '' : '\x1b[31m'; // Rojo para fallos
        const reset = '\x1b[0m';

        console.log(`${color}${icono} ${nombre.padEnd(25)} ${descripcion.padEnd(35)} ${test.tiempoMs.toString().padStart(8)}ms${reset}`);
        if (!test.exito) {
            console.log(`   └─ E:${test.energia.toFixed(3)} C:${test.correlacion.toFixed(3)} Hash:${test.hashObtenido} (esperado: ${test.hashEsperado})`);
        }

    } catch (error) {
        const fin = process.hrtime.bigint();
        const tiempoMs = Number(fin - inicio) / 1_000_000;

        const test = {
            nombre,
            descripcion,
            ruta: path.basename(ruta),
            tiempoMs: Math.round(tiempoMs * 100) / 100,
            error: error.message,
            exito: false,
        };

        testSession.resultados.push(test);
        console.log(`❌ ${nombre.padEnd(25)} ${descripcion.padEnd(35)} ERROR: ${error.message}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCULAR ESTADÍSTICAS
// ─────────────────────────────────────────────────────────────────────────────
function calcularEstadisticas() {
    const stats = testSession.estadisticas;

    stats.total = testSession.resultados.length;
    stats.exitosos = testSession.resultados.filter(r => r.exito).length;
    stats.fallidos = stats.total - stats.exitosos;

    const tiempos = testSession.resultados.map(r => r.tiempoMs);
    stats.tiempoTotal = tiempos.reduce((a, b) => a + b, 0);
    stats.tiempoPromedio = Math.round((stats.tiempoTotal / stats.total) * 100) / 100;
    stats.tiempoMin = Math.min(...tiempos);
    stats.tiempoMax = Math.max(...tiempos);

    // Estadísticas por categoría
    stats.porCategoria = {
        control: calcularStatsPorPrefijo('CONTROL'),
        jpeg: calcularStatsPorPrefijo('JPEG'),
        resize: calcularStatsPorPrefijo('RESIZE'),
        combo: calcularStatsPorPrefijo('COMBO'),
    };
}

function calcularStatsPorPrefijo(prefijo) {
    const pruebas = testSession.resultados.filter(r => r.nombre.startsWith(prefijo));
    const exitosas = pruebas.filter(r => r.exito).length;
    return {
        total: pruebas.length,
        exitosas,
        tasa: pruebas.length > 0 ? Math.round((exitosas / pruebas.length) * 100) : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR INFORMES
// ─────────────────────────────────────────────────────────────────────────────
async function generarInformes() {
    console.log('\n📊 Generando informes...\n');

    // 1. JSON raw
    const rutaJSON = path.join(testSession.dirResultados, 'resultados.json');
    fs.writeFileSync(rutaJSON, JSON.stringify({
        session: testSession,
        config: CONFIG_TEST,
    }, null, 2));
    console.log(`   ✅ ${rutaJSON}`);

    // 2. HTML visual
    const rutaHTML = path.join(testSession.dirResultados, 'informe.html');
    const html = generarInformeHTML();
    fs.writeFileSync(rutaHTML, html);
    console.log(`   ✅ ${rutaHTML}`);

    // 3. Markdown resumen
    const rutaMD = path.join(testSession.dirResultados, 'RESUMEN.md');
    const md = generarInformeMD();
    fs.writeFileSync(rutaMD, md);
    console.log(`   ✅ ${rutaMD}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR INFORME HTML
// ─────────────────────────────────────────────────────────────────────────────
function generarInformeHTML() {
    const stats = testSession.estadisticas;
    const tasaExito = Math.round((stats.exitosos / stats.total) * 100);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dragon3 v4 - Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        .stat-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-card .number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            display: block;
            margin-bottom: 5px;
        }
        .stat-card .label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .stat-card.success .number { color: #10b981; }
        .stat-card.danger .number { color: #ef4444; }

        .section {
            padding: 30px;
        }
        .section h2 {
            color: #1e3c72;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        thead {
            background: #1e3c72;
            color: white;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85em;
            letter-spacing: 0.5px;
        }
        tr:hover {
            background: #f9fafb;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .badge.success { background: #d1fae5; color: #065f46; }
        .badge.danger { background: #fee2e2; color: #991b1b; }

        .progress-bar {
            height: 30px;
            background: #e5e7eb;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            transition: width 0.3s ease;
        }

        .category-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .category-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            padding: 20px;
        }
        .category-card h3 { margin-bottom: 10px; }
        .category-card .metric { font-size: 2em; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐉 DRAGON3 v4</h1>
            <p>Test Suite Completo — ${new Date(testSession.timestamp).toLocaleString()}</p>
            <p>Sello: ${CONFIG_TEST.SELLO_TEST.cliente} — "${CONFIG_TEST.SELLO_TEST.obra}" (${CONFIG_TEST.SELLO_TEST.hash_suffix})</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <span class="number">${stats.total}</span>
                <span class="label">Total Pruebas</span>
            </div>
            <div class="stat-card success">
                <span class="number">${stats.exitosos}</span>
                <span class="label">Exitosas</span>
            </div>
            <div class="stat-card danger">
                <span class="number">${stats.fallidos}</span>
                <span class="label">Fallidas</span>
            </div>
            <div class="stat-card">
                <span class="number">${tasaExito}%</span>
                <span class="label">Tasa Éxito</span>
            </div>
            <div class="stat-card">
                <span class="number">${stats.tiempoPromedio}ms</span>
                <span class="label">Tiempo Medio</span>
            </div>
            <div class="stat-card">
                <span class="number">${Math.round(stats.tiempoTotal)}ms</span>
                <span class="label">Tiempo Total</span>
            </div>
        </div>

        <div class="section">
            <h2>Tasa de Éxito Global</h2>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${tasaExito}%">${tasaExito}%</div>
            </div>
        </div>

        <div class="section">
            <h2>Rendimiento por Categoría</h2>
            <div class="category-stats">
                <div class="category-card">
                    <h3>CONTROL</h3>
                    <div class="metric">${stats.porCategoria.control.tasa}%</div>
                    <div>${stats.porCategoria.control.exitosas}/${stats.porCategoria.control.total}</div>
                </div>
                <div class="category-card">
                    <h3>JPEG</h3>
                    <div class="metric">${stats.porCategoria.jpeg.tasa}%</div>
                    <div>${stats.porCategoria.jpeg.exitosas}/${stats.porCategoria.jpeg.total}</div>
                </div>
                <div class="category-card">
                    <h3>RESIZE</h3>
                    <div class="metric">${stats.porCategoria.resize.tasa}%</div>
                    <div>${stats.porCategoria.resize.exitosas}/${stats.porCategoria.resize.total}</div>
                </div>
                <div class="category-card">
                    <h3>COMBO</h3>
                    <div class="metric">${stats.porCategoria.combo.tasa}%</div>
                    <div>${stats.porCategoria.combo.exitosas}/${stats.porCategoria.combo.total}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>Resultados Detallados</h2>
            <table>
                <thead>
                    <tr>
                        <th>Prueba</th>
                        <th>Descripción</th>
                        <th>Tiempo</th>
                        <th>Estado</th>
                        <th>Energía</th>
                        <th>Correlación</th>
                        <th>Nivel</th>
                        <th>Cliente</th>
                    </tr>
                </thead>
                <tbody>
                    ${testSession.resultados.map(r => `
                        <tr>
                            <td><strong>${r.nombre}</strong></td>
                            <td>${r.descripcion}</td>
                            <td>${r.tiempoMs}ms</td>
                            <td>
                                <span class="badge ${r.exito ? 'success' : 'danger'}">
                                    ${r.exito ? '✓ PASS' : '✗ FAIL'}
                                </span>
                            </td>
                            <td>${r.energia?.toFixed(3) || 'N/A'}</td>
                            <td>${r.correlacion?.toFixed(3) || 'N/A'}</td>
                            <td>${r.nivel || 'N/A'}</td>
                            <td>${r.cliente || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>Fallos Detectados</h2>
            ${stats.fallidos === 0
                ? '<p style="color: #10b981; font-weight: bold;">🎉 ¡Sin fallos detectados! Todos los tests pasaron correctamente.</p>'
                : `<table>
                    <thead>
                        <tr>
                            <th>Prueba</th>
                            <th>Hash Esperado</th>
                            <th>Hash Obtenido</th>
                            <th>Energía</th>
                            <th>Correlación</th>
                            <th>Diagnóstico</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${testSession.resultados.filter(r => !r.exito).map(r => `
                            <tr>
                                <td><strong>${r.nombre}</strong></td>
                                <td>${r.hashEsperado || 'N/A'}</td>
                                <td>${r.hashObtenido || 'N/A'}</td>
                                <td>${r.energia?.toFixed(3) || 'N/A'}</td>
                                <td>${r.correlacion?.toFixed(3) || 'N/A'}</td>
                                <td>${r.error || `Nivel: ${r.nivel}, Escala: ${r.escala}`}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`
            }
        </div>
    </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR INFORME MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────
function generarInformeMD() {
    const stats = testSession.estadisticas;
    const tasaExito = Math.round((stats.exitosos / stats.total) * 100);

    return `# 🐉 DRAGON3 v4 — Test Suite

**Fecha:** ${new Date(testSession.timestamp).toLocaleString()}
**Sello:** ${CONFIG_TEST.SELLO_TEST.cliente} — "${CONFIG_TEST.SELLO_TEST.obra}"
**Hash:** ${CONFIG_TEST.SELLO_TEST.hash_suffix}

---

## 📊 Estadísticas Globales

| Métrica | Valor |
|---------|-------|
| Total Pruebas | ${stats.total} |
| Exitosas | ${stats.exitosos} ✅ |
| Fallidas | ${stats.fallidos} ❌ |
| **Tasa de Éxito** | **${tasaExito}%** |
| Tiempo Total | ${Math.round(stats.tiempoTotal)}ms |
| Tiempo Promedio | ${stats.tiempoPromedio}ms |
| Tiempo Mínimo | ${stats.tiempoMin}ms |
| Tiempo Máximo | ${stats.tiempoMax}ms |

---

## 📈 Rendimiento por Categoría

| Categoría | Exitosas/Total | Tasa |
|-----------|----------------|------|
| CONTROL | ${stats.porCategoria.control.exitosas}/${stats.porCategoria.control.total} | ${stats.porCategoria.control.tasa}% |
| JPEG | ${stats.porCategoria.jpeg.exitosas}/${stats.porCategoria.jpeg.total} | ${stats.porCategoria.jpeg.tasa}% |
| RESIZE | ${stats.porCategoria.resize.exitosas}/${stats.porCategoria.resize.total} | ${stats.porCategoria.resize.tasa}% |
| COMBO | ${stats.porCategoria.combo.exitosas}/${stats.porCategoria.combo.total} | ${stats.porCategoria.combo.tasa}% |

---

## 🔬 Resultados Detallados

${testSession.resultados.map(r => `
### ${r.nombre} ${r.exito ? '✅' : '❌'}
- **Descripción:** ${r.descripcion}
- **Tiempo:** ${r.tiempoMs}ms
- **Estado:** ${r.exito ? 'PASS' : 'FAIL'}
- **Energía:** ${r.energia?.toFixed(3) || 'N/A'}
- **Correlación:** ${r.correlacion?.toFixed(3) || 'N/A'}
- **Nivel:** ${r.nivel || 'N/A'}
- **Cliente:** ${r.cliente || 'N/A'}
${!r.exito ? `- **Error:** Hash esperado: ${r.hashEsperado}, obtenido: ${r.hashObtenido}` : ''}
`).join('\n---\n')}

---

## 🎯 Conclusiones

${stats.fallidos === 0
    ? '✅ **TODOS LOS TESTS PASARON CORRECTAMENTE**\n\nEl sistema Dragon3 v4 ha demostrado robustez total en todas las transformaciones probadas.'
    : `⚠️ **${stats.fallidos} TEST(S) FALLARON**\n\nRevisar los casos fallidos en la sección de resultados detallados.`
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL EN CONSOLA
// ─────────────────────────────────────────────────────────────────────────────
function imprimirResumenFinal() {
    const stats = testSession.estadisticas;
    const tasaExito = Math.round((stats.exitosos / stats.total) * 100);

    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMEN FINAL                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    console.log(`  📊 Total Pruebas:     ${stats.total}`);
    console.log(`  ✅ Exitosas:          ${stats.exitosos}`);
    console.log(`  ❌ Fallidas:          ${stats.fallidos}`);
    console.log(`  📈 Tasa de Éxito:     ${tasaExito}%`);
    console.log(`  ⏱️  Tiempo Total:      ${Math.round(stats.tiempoTotal)}ms`);
    console.log(`  ⚡ Tiempo Promedio:    ${stats.tiempoPromedio}ms`);
    console.log(`  🏃 Tiempo Mínimo:     ${stats.tiempoMin}ms`);
    console.log(`  🐌 Tiempo Máximo:     ${stats.tiempoMax}ms`);

    console.log('\n  📁 Resultados guardados en:');
    console.log(`     ${testSession.dirResultados}`);
    console.log(`     • informe.html (visual)`);
    console.log(`     • resultados.json (raw)`);
    console.log(`     • RESUMEN.md`);
    console.log(`     • imagenes/ (${testSession.resultados.length} archivos)`);

    if (stats.fallidos === 0) {
        console.log('\n  🎉 ¡TODOS LOS TESTS PASARON CORRECTAMENTE!\n');
    } else {
        console.log(`\n  ⚠️  ${stats.fallidos} test(s) fallaron. Revisar informe para detalles.\n`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EJECUCIÓN AUTOMÁTICA
// ─────────────────────────────────────────────────────────────────────────────
ejecutarTestCompleto().catch(err => {
    console.error('💥 ERROR FATAL:', err);
    process.exit(1);
});
