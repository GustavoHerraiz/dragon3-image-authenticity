import RS from './redSuperior.js';
import { CATEGORIAS } from './redSuperior.js';

async function runIntegrityTest() {
    console.log("🚀 Iniciando Test de Integridad RS (Contexto MBH)...");
    
    // No llamamos a initialize() porque el Singleton ya gestiona su estado interno

    try {
        const tests = [
            {
                name: "CASO 1: IA CAMUFLADA (Override MBH)",
                features: Array(90).fill(0).map(() => Math.random() * 0.2),
                opciones: { 
                    herramientas: "Midjourney v6, C2PA detected",
                    localAnalyzers: [0.9, 0.9, 0.1, 0.1, 0.1]
                },
                esperado: CATEGORIAS.IA_GENERADO
            },
            {
                name: "CASO 2: HUMANO PROFESIONAL (Filtros Adobe)",
                features: Array(90).fill(0).map(() => 0.4 + Math.random() * 0.2), 
                opciones: { 
                    herramientas: "Adobe Photoshop CC 2017",
                    localAnalyzers: [0.2, 0.3, 0.8, 0.1, 0.1] 
                },
                esperado: CATEGORIAS.HUMANO
            },
            {
                name: "CASO 3: REPLICANTE (Patrón de Aprendizaje)",
                // RUEDO SINTÉTICO: Evitamos el 0.9 plano para activar la red
                features: Array(90).fill(0).map((_, i) => i % 2 === 0 ? 0.95 : 0.85),
                opciones: { 
                    herramientas: "unknown", 
                    localAnalyzers: [0.1, 0.1, 0.1, 0.1, 0.1] 
                },
                esperado: CATEGORIAS.IA_GENERADO
            }
        ];

        for (const t of tests) {
            // El Singleton RS ya tiene el método predecir listo
            const res = await RS.predecir(t.features, t.opciones);
            const pass = res.categoria === t.esperado;
            
            console.log(`\n[${pass ? '✅' : '❌'}] ${t.name}`);
            console.log(`   - Veredicto: ${res.categoria.toUpperCase()}`);
            console.log(`   - Confianza: ${(res.confianza * 100).toFixed(4)}%`);
            console.log(`   - Raw Scores: [ H:${(res.scores[0]).toFixed(4)} | IA:${(res.scores[1]).toFixed(4)} | E:${(res.scores[2]).toFixed(4)} ]`);
        }

    } catch (error) {
        console.error("❌ Error Crítico:", error);
    }
}

runIntegrityTest();