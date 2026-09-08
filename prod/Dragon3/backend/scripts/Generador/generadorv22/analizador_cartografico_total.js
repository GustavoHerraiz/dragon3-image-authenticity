import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// =========================================================
// 🗺️ OPERACIÓN CARTÓGRAFO V2: RASTREO PROFUNDO MULTI-CANDIDATO
// =========================================================

const DIR_TORTURA = './RESULTADOS_FAUNDEZ_V23_FINAL/TORTURA/';
const DIR_MASTER  = './RESULTADOS_FAUNDEZ_V23_FINAL/';
const TARGET_ADN  = "0101000010110011"; // 50B3

async function iniciarOperacion() {
    console.log("==================================================");
    console.log("🚀 INICIANDO ESCANEO DE PROFUNDIDAD (TOP 5 POR ARCHIVO)");
    console.log("==================================================");

    let archivosAnalizar = [];

    // 1. CARGAR MASTER
    if (fs.existsSync(DIR_MASTER)) {
        const masters = fs.readdirSync(DIR_MASTER).filter(f => f.includes("Jerome_Master") && f.endsWith(".png"));
        if (masters.length > 0) archivosAnalizar.push({ nombre: "00_MASTER", ruta: path.join(DIR_MASTER, masters[0]) });
    }

    // 2. CARGAR TORTURA
    if (fs.existsSync(DIR_TORTURA)) {
        const pruebas = fs.readdirSync(DIR_TORTURA).filter(f => f.match(/^F\d+_\d+\.jpg$/));
        pruebas.sort();
        pruebas.forEach(f => archivosAnalizar.push({ nombre: f, ruta: path.join(DIR_TORTURA, f) }));
    } else {
        console.log(`❌ ERROR: No existe ${DIR_TORTURA}`);
        return;
    }

    console.log(`📂 Objetivos: ${archivosAnalizar.length}`);
    console.log("--------------------------------------------------");

    let todosLosHallazgos = [];

    // 3. EJECUTAR ESCÁNER DETALLADO
    for (const obj of archivosAnalizar) {
        console.log(`\n🕵️  Analizando ${obj.nombre}...`);

        try {
            // Obtenemos ARRAY de candidatos, no solo uno
            const candidatos = await escanearImagenTop5(obj.ruta);

            if (candidatos.length === 0) {
                console.log("   ❌ Sin rastro del sello.");
            } else {
                candidatos.forEach((c, i) => {
                    // Guardamos para el informe global
                    todosLosHallazgos.push({ archivo: obj.nombre, ...c, rank: i + 1 });

                    const estado = c.distancia === 0 ? "✅✅" : (c.distancia <= 2 ? "✅⚠️" : "⚠️");
                    console.log(`   ${i+1}. ${estado} Hash: ${c.hash} (Err: ${c.distancia}) | Energía: ${c.energia.toFixed(0).padStart(7)} | 📍 [X:${c.x}, Y:${c.y}]`);
                });
            }
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }
    }

    generarMapaDeCalor(todosLosHallazgos);
}

// 👁️ MOTOR OMNISCIENTE QUE DEVUELVE LISTA
async function escanearImagenTop5(ruta) {
    const inputRaw = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = inputRaw.info;
    const buffer = inputRaw.data;
    const canal = 2; // Azul

    let candidatos = [];

    // BARRIDO TOTAL
    for (let fy = 0; fy < 256; fy++) {
        for (let fx = 0; fx < 16; fx++) {
            const res = extraerADNEnFase(buffer, width, height, fx, fy, canal);
            const dist = calcularDistanciaHamming(res.adn, TARGET_ADN);

            // GUARDAMOS TODO LO QUE TENGA MENOS DE 5 ERRORES (SEAMOS GENEROSOS PARA VER EL RASTRO)
            if (dist <= 4) {
                candidatos.push({
                    hash: parseInt(res.adn, 2).toString(16).toUpperCase().padStart(4, '0'),
                    adn: res.adn,
                    distancia: dist,
                    energia: res.energia,
                    x: fx, y: fy
                });
            }
        }
    }

    // ORDENAR: 1. Menos Errores, 2. Más Energía
    candidatos.sort((a, b) => {
        if (a.distancia !== b.distancia) return a.distancia - b.distancia;
        return b.energia - a.energia;
    });

    // DEVOLVER TOP 5
    return candidatos.slice(0, 5);
}

// MOTOR MATEMÁTICO (FORENSE PURO)
function extraerADNEnFase(buffer, width, height, fx, fy, canal) {
    let urnas = new Array(16).fill(0);
    const PI_16 = Math.PI / 16;
    for (let y = fy; y < height - 16; y += 256) {
        for (let x = 0; x < width - 16; x += 16) {
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy;
                if (py < 0 || py >= height - 8) continue;
                const ix = Math.floor(x + fx);
                const iy = Math.floor(py);

                let s1A = 0, s2A = 0, s1B = 0, s2B = 0;
                for (let bj = 0; bj < 8; bj++) {
                    const row = (iy + bj) * width;
                    const cosY1 = Math.cos((2 * bj + 1) * PI_16);
                    const cosY2 = Math.cos((2 * bj + 1) * 2 * PI_16);
                    for (let bi = 0; bi < 8; bi++) {
                        const v = buffer[(row + (ix + bi)) * 4 + canal];
                        s1A += v * Math.cos((2 * bi + 1) * PI_16) * cosY1;
                        s2A += v * Math.cos((2 * bi + 1) * 2 * PI_16) * cosY2;
                    }
                }
                const ixB = ix + 8;
                for (let bj = 0; bj < 8; bj++) {
                    const row = (iy + bj) * width;
                    const cosY1 = Math.cos((2 * bj + 1) * PI_16);
                    const cosY2 = Math.cos((2 * bj + 1) * 2 * PI_16);
                    for (let bi = 0; bi < 8; bi++) {
                        const v = buffer[(row + (ixB + bi)) * 4 + canal];
                        s1B += v * Math.cos((2 * bi + 1) * PI_16) * cosY1;
                        s2B += v * Math.cos((2 * bi + 1) * 2 * PI_16) * cosY2;
                    }
                }
                t += ((s1A - s2A) - (s1B - s2B));
            }
            urnas[(x / 16) % 16] += t;
        }
    }
    let energia = 0;
    let adn = "";
    for (let v of urnas) {
        energia += Math.abs(v);
        adn += (v > 0) ? "1" : "0";
    }
    return { adn, energia };
}

function calcularDistanciaHamming(adn1, adn2) {
    let d = 0;
    for (let i = 0; i < 16; i++) if (adn1[i] !== adn2[i]) d++;
    return d;
}

function generarMapaDeCalor(hallazgos) {
    console.log("\n\n=================================================================================");
    console.log("📍 MAPA DE POSICIONES CONFIRMADAS (Mínimo Común Múltiplo)");
    console.log("=================================================================================");

    let clusters = {};

    // Agrupamos solo los hallazgos de alta calidad (Error <= 2)
    hallazgos.filter(h => h.distancia <= 2).forEach(h => {
        const key = `X:${h.x}, Y:${h.y}`;
        if (!clusters[key]) clusters[key] = { count: 0, files: [] };
        clusters[key].count++;
        clusters[key].files.push(h.archivo);
    });

    // Ordenar por frecuencia de aparición
    const ranking = Object.entries(clusters).sort((a,b) => b[1].count - a[1].count);

    ranking.forEach(([coord, data]) => {
        console.log(`\n🎯 COORDENADA MAESTRA: [${coord}]`);
        console.log(`   🔥 Aparece en ${data.count} pruebas.`);
        console.log(`   📂 Archivos: ${data.files.join(", ")}`);
    });

    console.log("\n💡 CONCLUSIÓN PARA EL DRAGON FINAL:");
    if (ranking.length > 0) {
        console.log(`   El sistema debe buscar SIEMPRE en: ${ranking.map(r => `[${r[0]}]`).join(" y ")}`);
        console.log("   Cualquier otra búsqueda es perder el tiempo.");
    } else {
        console.log("   ⚠️ No hay consenso claro. Analiza los logs individuales de arriba.");
    }
}

iniciarOperacion();
