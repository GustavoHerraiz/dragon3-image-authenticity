/**
 * ====================================================================
 * DRAGON3 - SCRIPT DE PRUEBA DE GENERACIÓN DE INFORMES
 * ====================================================================
 * 
 * Script para probar la generación de informes PDF con datos de ejemplo.
 * Útil para verificar que el sistema funciona correctamente.
 * 
 * USO:
 * node scripts/test-informe.js
 * 
 * ====================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { generarInformeAnalisis } from "../utilidades/generarInforme.js";

// Cargar variables de entorno
dotenv.config();

async function testGeneracionInforme() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dragon3');
        console.log('✅ Conectado a MongoDB');

        // Crear datos de prueba
        const analisisPrueba = {
            _id: 'test_' + Date.now(),
            usuarioId: {
                _id: 'test_user_123',
                email: 'test@dragon3.com',
                name: 'Usuario de Prueba'
            },
            resultado: {
                resumen: {
                    decision: "Humano",
                    confianza: 0.95,
                    modeloPrincipal: "CLIP-v2",
                    explicacion: "Imagen auténtica con características naturales",
                    score: 0.95
                },
                detalles: {
                    analizadores: {
                        resultados: {
                            analizadorArtefactos: {
                                idAnalizador: "Artefactos",
                                tipo: "Forensic",
                                version: "1.0",
                                decision: "Humano",
                                score: 0.92,
                                confianza: 0.88,
                                processingTime: 1500,
                                explicacion: "No se detectaron artefactos de IA",
                                error: null,
                                votos: ["Humano", "Humano", "Humano"],
                                logs: ["Análisis de textura normal", "Patrones naturales detectados"]
                            },
                            analizadorColor: {
                                idAnalizador: "Color",
                                tipo: "Neural",
                                version: "2.1",
                                decision: "Humano",
                                score: 0.89,
                                confianza: 0.85,
                                processingTime: 800,
                                explicacion: "Distribución de color natural",
                                error: null,
                                votos: ["Humano", "Humano"],
                                logs: ["Paleta de colores coherente", "Sin anomalías detectadas"]
                            }
                        }
                    }
                }
            },
            redesEspejo: {
                id: "red_espejo_001",
                resultados: [
                    {
                        nodo: "Nodo-1",
                        decision: "Humano",
                        score: 0.91,
                        confianza: 0.87,
                        explicacion: "Análisis consistente",
                        error: null,
                        processingTime: 1200
                    }
                ]
            },
            redSuperior: {
                id: "red_superior_001",
                resultados: [
                    {
                        nodo: "Superior-1",
                        decision: "Humano",
                        score: 0.94,
                        confianza: 0.90,
                        explicacion: "Consenso de red superior",
                        error: null,
                        processingTime: 2000
                    }
                ]
            },
            consenso: {
                esAutentico: true,
                totalVotos: 5,
                algoritmo: "Ensemble Weighted",
                fuentes: [
                    { analizador: "Artefactos", processingTime: 1500 },
                    { analizador: "Color", processingTime: 800 },
                    { analizador: "Nodo-1", processingTime: 1200 },
                    { analizador: "Superior-1", processingTime: 2000 }
                ]
            },
            paraInforme: {
                metadatosArchivo: {
                    version: "Dragon3 Enterprise 2025",
                    tipoArchivo: "JPEG",
                    hashImagen: "sha256:abc123def456..."
                },
                contextoAnalisis: {
                    responsable: "Dragon3 Forensic Service"
                },
                explicacionExtendida: "Análisis completo realizado con múltiples modelos de IA"
            },
            seguridad: {
                fileHash: "sha256:abc123def456...",
                fileSize: "2.5 MB"
            },
            metadata: {
                timestamp: new Date(),
                version: "Dragon3 Enterprise 2025"
            },
            createdAt: new Date(),
            correlationId: "test_corr_123"
        };

        console.log('🧪 Generando informe de prueba...');
        
        const userId = 'test_user_123';
        const pdfPath = `/tmp/test_informe_${Date.now()}.pdf`;
        
        const nombrePDF = await generarInformeAnalisis(analisisPrueba, userId, pdfPath);
        
        console.log('✅ Informe generado exitosamente');
        console.log(`📄 Archivo: ${pdfPath}`);
        console.log(`📄 Nombre: ${nombrePDF}`);
        
        // Verificar que el archivo existe
        const fs = await import('fs');
        if (fs.existsSync(pdfPath)) {
            const stats = fs.statSync(pdfPath);
            console.log(`📊 Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log('✅ Archivo PDF creado correctamente');
        } else {
            console.log('❌ Error: El archivo PDF no se creó');
        }

    } catch (error) {
        console.error('❌ Error en prueba de informe:', error);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar prueba
testGeneracionInforme();
