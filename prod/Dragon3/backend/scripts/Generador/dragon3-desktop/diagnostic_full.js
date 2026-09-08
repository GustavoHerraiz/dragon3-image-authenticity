// diagnostic_full.js
// 🧪 SCRIPT DE DIAGNÓSTICO COMPLETO - DRAGON3
// Ejecuta: node diagnostic_full.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DragonDB } from './src/backend/database.js';
import { GeneradorMBH } from './src/backend/generadorMBH.js';
import { LicenseManager } from './src/backend/license.js';
import { analizarImagenMBH } from './src/backend/analizador_v5.js';
import { analizarImagenRapido } from './src/backend/analizador_v6.js';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = {
    // ✅ Usa prueba.jpg en la raíz
    IMAGEN_PRUEBA: path.join(__dirname, 'prueba.jpg'),
    
    CLIENTE: 'Cliente Test',
    OBRA: 'Obra Test',
    PROYECTO: 'Proyecto_Diagnostico',
    TIMEOUT_ANALISIS: 30000
};

// ============================================================
// FUNCIONES DE PRUEBA
// ============================================================

class DiagnosticTool {
    constructor() {
        this.db = null;
        this.generador = null;
        this.licenseManager = null;
        this.resultados = {};
        this.imagenSellada = null;
        this.hashGenerado = null;
    }

    async init() {
        console.log('\n' + '='.repeat(70));
        console.log('🧪 DIAGNÓSTICO COMPLETO - DRAGON3');
        console.log('='.repeat(70) + '\n');

        this.db = new DragonDB();
        await this.db._ensureOpen();
        console.log(`✅ DB conectada: ${this.db.dbPath}\n`);

        this.licenseManager = new LicenseManager(this.db);
        this.generador = new GeneradorMBH(this.db, this.licenseManager);
        console.log('✅ Generador inicializado\n');
    }

    // ============================================================
    // PASO 1: VERIFICAR IMAGEN DE PRUEBA
    // ============================================================
    async paso1_verificarImagen() {
        console.log('📋 PASO 1: Verificando imagen de prueba...');
        
        try {
            if (!fs.existsSync(CONFIG.IMAGEN_PRUEBA)) {
                throw new Error(`❌ No existe: ${CONFIG.IMAGEN_PRUEBA}\n   Coloca una imagen llamada "prueba.jpg" en la raíz`);
            }

            const stats = fs.statSync(CONFIG.IMAGEN_PRUEBA);
            const meta = await sharp(CONFIG.IMAGEN_PRUEBA).metadata();

            this.resultados.paso1 = {
                status: '✅',
                mensaje: 'Imagen válida',
                datos: {
                    ruta: CONFIG.IMAGEN_PRUEBA,
                    tamaño: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    dimensiones: `${meta.width}x${meta.height}`,
                    formato: meta.format
                }
            };

            console.log(`  ✅ Imagen: prueba.jpg`);
            console.log(`  📐 Dimensiones: ${meta.width}x${meta.height}`);
            console.log(`  📦 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  🎨 Formato: ${meta.format}\n`);

        } catch (err) {
            this.resultados.paso1 = {
                status: '❌',
                mensaje: err.message
            };
            console.log(`  ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 2: GENERAR SELLO
    // ============================================================
    async paso2_generarSello() {
        console.log('📋 PASO 2: Generando sello...');

        try {
            if (this.resultados.paso1?.status === '❌') {
                throw new Error('No se puede sellar porque la imagen no existe');
            }

            const outputDir = path.join(__dirname, 'test_diagnostico');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const resultado = await this.generador.sellarImagen(
                CONFIG.IMAGEN_PRUEBA,
                null,
                {
                    cliente: CONFIG.CLIENTE,
                    obra: CONFIG.OBRA,
                    proyecto_nombre: CONFIG.PROYECTO,
                    outputDir: outputDir,
                    id_numerico: 0
                }
            );

            if (!resultado.ok) {
                throw new Error(resultado.error);
            }

            this.imagenSellada = resultado.ruta;
            this.hashGenerado = resultado.id;

            const meta = await sharp(this.imagenSellada).metadata();
            const stats = fs.statSync(this.imagenSellada);

            this.resultados.paso2 = {
                status: '✅',
                mensaje: 'Sello generado exitosamente',
                datos: {
                    ruta: this.imagenSellada,
                    hash: this.hashGenerado,
                    tamaño: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    dimensiones: `${meta.width}x${meta.height}`
                }
            };

            console.log(`  ✅ Sello generado: ${this.hashGenerado}`);
            console.log(`  📁 Ruta: ${this.imagenSellada}`);
            console.log(`  📐 Dimensiones: ${meta.width}x${meta.height}`);
            console.log(`  📦 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

        } catch (err) {
            this.resultados.paso2 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 3: VERIFICAR DB
    // ============================================================
    async paso3_verificarDB() {
        console.log('📋 PASO 3: Verificando base de datos...');

        try {
            if (!this.hashGenerado) {
                throw new Error('No hay hash generado');
            }

            const proyecto = await this.db.buscarPorHash(this.hashGenerado);
            const sello = await this.db.get(
                'SELECT * FROM sellos WHERE hash_suffix = ?',
                this.hashGenerado
            );

            this.resultados.paso3 = {
                status: proyecto && sello ? '✅' : '⚠️',
                mensaje: proyecto && sello ? 'DB correcta' : 'Inconsistencia en DB',
                datos: {
                    proyecto: proyecto ? {
                        id: proyecto.id,
                        hash: proyecto.hash_suffix,
                        nombre: proyecto.proyecto_nombre
                    } : '❌ NO ENCONTRADO',
                    sello: sello ? {
                        id: sello.id,
                        hash: sello.hash_suffix,
                        proyecto_id: sello.proyecto_id
                    } : '❌ NO ENCONTRADO'
                }
            };

            console.log(`  📁 Proyecto: ${proyecto ? '✅ ENCONTRADO' : '❌ NO ENCONTRADO'}`);
            console.log(`  🔒 Sello: ${sello ? '✅ ENCONTRADO' : '❌ NO ENCONTRADO'}\n`);

        } catch (err) {
            this.resultados.paso3 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 4: ANALIZAR CON V5
    // ============================================================
    async paso4_analizarV5() {
        console.log('📋 PASO 4: Analizando con V5 (forense)...');

        try {
            if (!this.imagenSellada) {
                throw new Error('No hay imagen sellada');
            }

            const inicio = Date.now();
            const resultado = await analizarImagenMBH(
                this.imagenSellada,
                this.db,
                CONFIG.TIMEOUT_ANALISIS
            );
            const tiempo = Date.now() - inicio;

            this.resultados.paso4 = {
                status: resultado.identificado ? '✅' : '❌',
                mensaje: resultado.identificado ? 'Sello detectado' : 'Sello NO detectado',
                datos: {
                    identificado: resultado.identificado,
                    hash: resultado.hash || 'N/A',
                    cliente: resultado.cliente || 'N/A',
                    obra: resultado.obra || 'N/A',
                    tiempo_ms: tiempo
                }
            };

            console.log(`  🔍 Resultado: ${resultado.identificado ? '✅ DETECTADO' : '❌ NO DETECTADO'}`);
            if (resultado.identificado) {
                console.log(`     Hash: ${resultado.hash}`);
                console.log(`     Cliente: ${resultado.cliente}`);
                console.log(`     Obra: ${resultado.obra}`);
            }
            console.log(`  ⏱️ Tiempo: ${tiempo}ms\n`);

        } catch (err) {
            this.resultados.paso4 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 5: ANALIZAR CON V6
    // ============================================================
    async paso5_analizarV6() {
        console.log('📋 PASO 5: Analizando con V6 (rápido)...');

        try {
            if (!this.imagenSellada) {
                throw new Error('No hay imagen sellada');
            }

            const inicio = Date.now();
            const resultado = await analizarImagenRapido(
                this.imagenSellada,
                this.db,
                15000,
                true
            );
            const tiempo = Date.now() - inicio;

            this.resultados.paso5 = {
                status: resultado.identificado ? '✅' : '❌',
                mensaje: resultado.identificado ? 'Sello detectado' : 'Sello NO detectado',
                datos: {
                    identificado: resultado.identificado,
                    hash: resultado.hash || 'N/A',
                    cliente: resultado.cliente || 'N/A',
                    obra: resultado.obra || 'N/A',
                    tiempo_ms: tiempo
                }
            };

            console.log(`  🔍 Resultado: ${resultado.identificado ? '✅ DETECTADO' : '❌ NO DETECTADO'}`);
            if (resultado.identificado) {
                console.log(`     Hash: ${resultado.hash}`);
                console.log(`     Cliente: ${resultado.cliente}`);
                console.log(`     Obra: ${resultado.obra}`);
            }
            console.log(`  ⏱️ Tiempo: ${tiempo}ms\n`);

        } catch (err) {
            this.resultados.paso5 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 6: COMPARAR DCT
    // ============================================================
    async paso6_compararDCT() {
        console.log('📋 PASO 6: Comparando algoritmos DCT...');

        try {
            const block = Array(8).fill(0).map(() => 
                Array(8).fill(0).map(() => Math.floor(Math.random() * 255) - 128)
            );

            const dctGen = this.generador.dct8x8(block);
            
            const { MotorForense } = await import('./src/backend/analizador_v5.js');
            const dctAnal = MotorForense.dct8x8(block);

            const diff1 = Math.abs(dctGen[1][1] - dctAnal[1][1]);
            const diff2 = Math.abs(dctGen[2][2] - dctAnal[2][2]);
            const identical = diff1 < 0.01 && diff2 < 0.01;

            this.resultados.paso6 = {
                status: identical ? '✅' : '❌',
                mensaje: identical ? 'Algoritmos idénticos' : '⚠️ ALGORITMOS DIFERENTES',
                datos: {
                    identical,
                    diferencias: { dct11: diff1, dct22: diff2 }
                }
            };

            console.log(`  📊 Diferencias: [1][1]=${diff1.toFixed(4)}, [2][2]=${diff2.toFixed(4)}`);
            console.log(`  ${identical ? '✅ DCT IDÉNTICAS' : '❌ DCT DIFERENTES'}\n`);

        } catch (err) {
            this.resultados.paso6 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // PASO 7: VERIFICAR CONFIGURACIÓN
    // ============================================================
    async paso7_verificarConfig() {
        console.log('📋 PASO 7: Verificando configuración...');

        try {
            const config = await this.db.obtenerConfiguracion();
            const licencia = await this.db.obtenerLicencia();

            const fuerza = this.generador.constructor.CONFIG?.STARDUST_INTENSITY || 
                          this.generador.CONFIG?.STARDUST_INTENSITY || 
                          'NO ENCONTRADA';

            this.resultados.paso7 = {
                status: '✅',
                mensaje: 'Configuración cargada',
                datos: {
                    prefijo: config.prefijo_usuario,
                    fuerza_inyeccion: fuerza,
                    licencia: licencia?.tipo || 'gratuita'
                }
            };

            console.log(`  ⚙️ Prefijo: ${config.prefijo_usuario || 'No configurado'}`);
            console.log(`  💪 Fuerza inyección: ${fuerza}`);
            console.log(`  🔑 Licencia: ${licencia?.tipo || 'gratuita'}\n`);

        } catch (err) {
            this.resultados.paso7 = {
                status: '❌',
                mensaje: `Error: ${err.message}`
            };
            console.log(`  ❌ ERROR: ${err.message}\n`);
        }
    }

    // ============================================================
    // GENERAR INFORME
    // ============================================================
    generarInforme() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 INFORME DE DIAGNÓSTICO');
        console.log('='.repeat(70) + '\n');

        let ok = 0;
        let total = 0;

        for (const [key, paso] of Object.entries(this.resultados)) {
            total++;
            if (paso.status === '✅') ok++;
            
            const nombre = {
                paso1: 'Verificar imagen',
                paso2: 'Generar sello',
                paso3: 'Verificar DB',
                paso4: 'Analizar V5',
                paso5: 'Analizar V6',
                paso6: 'Comparar DCT',
                paso7: 'Verificar config'
            }[key] || key;

            console.log(`${paso.status} ${nombre}: ${paso.mensaje}`);
        }

        console.log('\n' + '-'.repeat(70));
        console.log(`📈 RESUMEN: ${ok}/${total} pruebas exitosas`);
        
        if (ok === total) {
            console.log('✅ ¡TODO FUNCIONA CORRECTAMENTE!');
        } else {
            console.log('⚠️ PRUEBAS FALLIDAS:');
            for (const [key, paso] of Object.entries(this.resultados)) {
                if (paso.status !== '✅') {
                    console.log(`   ❌ ${key}: ${paso.mensaje}`);
                }
            }
        }
        console.log('='.repeat(70) + '\n');

        const informe = {
            fecha: new Date().toISOString(),
            resultados: this.resultados,
            resumen: { ok, total }
        };

        const informePath = path.join(__dirname, 'diagnostico_informe.json');
        fs.writeFileSync(informePath, JSON.stringify(informe, null, 2));
        console.log(`📄 Informe guardado en: ${informePath}`);
    }

    async cerrar() {
        if (this.db) await this.db.cerrar();
    }
}

// ============================================================
// EJECUCIÓN
// ============================================================

const diagnostic = new DiagnosticTool();

try {
    await diagnostic.init();
    await diagnostic.paso1_verificarImagen();
    await diagnostic.paso2_generarSello();
    await diagnostic.paso3_verificarDB();
    await diagnostic.paso4_analizarV5();
    await diagnostic.paso5_analizarV6();
    await diagnostic.paso6_compararDCT();
    await diagnostic.paso7_verificarConfig();
    diagnostic.generarInforme();
} catch (err) {
    console.error('❌ ERROR FATAL:', err.message);
} finally {
    await diagnostic.cerrar();
}

console.log('\n✅ Diagnóstico completado.');