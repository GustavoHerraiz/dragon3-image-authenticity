/**
 * ====================================================================
 * DRAGON3 - SCRIPT DE DIAGNÓSTICO DE INFORMES
 * ====================================================================
 * 
 * Script para diagnosticar problemas en la generación de informes PDF.
 * Verifica la estructura de datos de los análisis y identifica problemas.
 * 
 * USO:
 * node scripts/diagnostico-informes.js [analisisId]
 * 
 * ====================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import AnalisisArchivo from "../modelos/mongodb/AnalisisArchivo.js";
import Usuario from "../modelos/mongodb/Usuario.js";

// Cargar variables de entorno
dotenv.config();

async function diagnosticarInformes(analisisId = null) {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dragon3');
        console.log('✅ Conectado a MongoDB');

        if (analisisId) {
            // Diagnosticar análisis específico
            await diagnosticarAnalisisEspecifico(analisisId);
        } else {
            // Diagnosticar todos los análisis recientes
            await diagnosticarAnalisisRecientes();
        }

    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

async function diagnosticarAnalisisEspecifico(analisisId) {
    console.log(`\n🔍 DIAGNÓSTICO ANÁLISIS: ${analisisId}`);
    console.log('=' .repeat(60));

    const analisis = await AnalisisArchivo.findById(analisisId).populate('usuarioId');
    
    if (!analisis) {
        console.log('❌ Análisis no encontrado');
        return;
    }

    console.log('📊 DATOS BÁSICOS:');
    console.log(`   - ID: ${analisis._id}`);
    console.log(`   - Usuario: ${analisis.usuarioId?.email || analisis.usuarioId || 'N/A'}`);
    console.log(`   - Fecha: ${analisis.createdAt}`);
    console.log(`   - Tipo: ${analisis.tipo || 'N/A'}`);

    // Verificar estructura de datos
    console.log('\n🔍 ESTRUCTURA DE DATOS:');
    
    // Verificar si tiene resultado
    if (analisis.resultado) {
        console.log('   ✅ Tiene objeto resultado');
        
        if (analisis.resultado.resumen) {
            console.log('   ✅ Tiene resumen en resultado');
            console.log(`      - Decisión: ${analisis.resultado.resumen.decision || 'N/A'}`);
            console.log(`      - Confianza: ${analisis.resultado.resumen.confianza || 'N/A'}`);
            console.log(`      - Modelo: ${analisis.resultado.resumen.modeloPrincipal || 'N/A'}`);
        } else {
            console.log('   ❌ NO tiene resumen en resultado');
        }
        
        if (analisis.resultado.detalles) {
            console.log('   ✅ Tiene detalles en resultado');
        } else {
            console.log('   ❌ NO tiene detalles en resultado');
        }
    } else {
        console.log('   ❌ NO tiene objeto resultado');
    }

    // Verificar campos legacy
    if (analisis.resumen) {
        console.log('   ✅ Tiene resumen legacy');
        console.log(`      - Decisión: ${analisis.resumen.decision || 'N/A'}`);
        console.log(`      - Confianza: ${analisis.resumen.confianza || 'N/A'}`);
    } else {
        console.log('   ❌ NO tiene resumen legacy');
    }

    if (analisis.detalles) {
        console.log('   ✅ Tiene detalles legacy');
    } else {
        console.log('   ❌ NO tiene detalles legacy');
    }

    // Verificar analizadores
    console.log('\n🔍 ANALIZADORES:');
    const analizadores = analisis.resultado?.detalles?.analizadores?.resultados || 
                        analisis.detalles?.analizadores?.resultados || {};
    
    if (Object.keys(analizadores).length > 0) {
        console.log(`   ✅ Tiene ${Object.keys(analizadores).length} analizadores`);
        Object.keys(analizadores).forEach(key => {
            const analizador = analizadores[key];
            console.log(`      - ${key}: ${analizador.decision || analizador.esAutentico || 'N/A'}`);
        });
    } else {
        console.log('   ❌ NO tiene analizadores');
    }

    // Verificar redes
    console.log('\n🔍 REDES:');
    if (analisis.redesEspejo) {
        console.log('   ✅ Tiene red espejo');
    } else {
        console.log('   ❌ NO tiene red espejo');
    }
    
    if (analisis.redSuperior) {
        console.log('   ✅ Tiene red superior');
    } else {
        console.log('   ❌ NO tiene red superior');
    }

    // Simular extracción de datos para informe
    console.log('\n🔍 SIMULACIÓN DE EXTRACCIÓN PARA INFORME:');
    
    const resumen = analisis.resumen ?? analisis.resultado?.resumen ?? {};
    const detalles = analisis.detalles ?? analisis.resultado?.detalles ?? {};
    
    console.log(`   - Decisión extraída: ${resumen.decision || 'N/A'}`);
    console.log(`   - Confianza extraída: ${resumen.confianza || 'N/A'}`);
    console.log(`   - Modelo extraído: ${resumen.modeloPrincipal || 'N/A'}`);
    
    const analizadoresRaw = detalles.analizadores?.resultados ?? {};
    const analizadoresCount = Object.keys(analizadoresRaw).length;
    console.log(`   - Analizadores extraídos: ${analizadoresCount}`);
    
    if (analizadoresCount > 0) {
        Object.keys(analizadoresRaw).forEach(key => {
            const a = analizadoresRaw[key];
            console.log(`      - ${key}: ${a.decision || a.esAutentico || 'N/A'} (${a.confianza || 'N/A'})`);
        });
    }

    // Verificar si se puede generar informe
    console.log('\n🔍 CAPACIDAD DE GENERAR INFORME:');
    
    const puedeGenerar = resumen.decision && resumen.confianza !== undefined;
    console.log(`   - Puede generar informe: ${puedeGenerar ? '✅ SÍ' : '❌ NO'}`);
    
    if (!puedeGenerar) {
        console.log('   - Razón: Faltan datos críticos (decisión o confianza)');
    }

    // Mostrar estructura completa para debugging
    console.log('\n🔍 ESTRUCTURA COMPLETA (primeros 500 chars):');
    console.log(JSON.stringify(analisis, null, 2).substring(0, 500) + '...');

}

async function diagnosticarAnalisisRecientes() {
    console.log('\n🔍 DIAGNÓSTICO ANÁLISIS RECIENTES');
    console.log('=' .repeat(60));

    const analisisRecientes = await AnalisisArchivo.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('usuarioId');

    console.log(`📊 Encontrados ${analisisRecientes.length} análisis recientes`);

    for (const analisis of analisisRecientes) {
        console.log(`\n--- Análisis: ${analisis._id} ---`);
        
        const resumen = analisis.resumen ?? analisis.resultado?.resumen ?? {};
        const tieneResultado = !!analisis.resultado;
        const tieneResumen = !!resumen.decision;
        const tieneAnalizadores = !!(analisis.resultado?.detalles?.analizadores?.resultados || 
                                   analisis.detalles?.analizadores?.resultados);
        
        console.log(`   - Usuario: ${analisis.usuarioId?.email || 'N/A'}`);
        console.log(`   - Fecha: ${analisis.createdAt}`);
        console.log(`   - Tiene resultado: ${tieneResultado ? '✅' : '❌'}`);
        console.log(`   - Tiene resumen: ${tieneResumen ? '✅' : '❌'}`);
        console.log(`   - Tiene analizadores: ${tieneAnalizadores ? '✅' : '❌'}`);
        console.log(`   - Decisión: ${resumen.decision || 'N/A'}`);
        
        if (!tieneResumen) {
            console.log(`   ⚠️  PROBLEMA: Análisis sin datos de resumen`);
        }
    }

    // Estadísticas
    const totalAnalisis = analisisRecientes.length;
    const conResultado = analisisRecientes.filter(a => a.resultado).length;
    const conResumen = analisisRecientes.filter(a => a.resumen || a.resultado?.resumen).length;
    const conAnalizadores = analisisRecientes.filter(a => 
        a.resultado?.detalles?.analizadores?.resultados || 
        a.detalles?.analizadores?.resultados
    ).length;

    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   - Total análisis: ${totalAnalisis}`);
    console.log(`   - Con resultado: ${conResultado}/${totalAnalisis} (${(conResultado/totalAnalisis*100).toFixed(1)}%)`);
    console.log(`   - Con resumen: ${conResumen}/${totalAnalisis} (${(conResumen/totalAnalisis*100).toFixed(1)}%)`);
    console.log(`   - Con analizadores: ${conAnalizadores}/${totalAnalisis} (${(conAnalizadores/totalAnalisis*100).toFixed(1)}%)`);
}

// Obtener argumento de línea de comandos
const analisisId = process.argv[2];

// Ejecutar diagnóstico
diagnosticarInformes(analisisId);
