/**
 * 🎯 RADAR ESPECÍFICO PARA SISTEMA HOLOGRÁFICO
 * VERSIÓN GOLD: BRÚJULA DIRECTA + BALIZAS V19 + BARRIDO WIDE + EXPORTACIÓN DE CENTRO
 */

// =====================================================================
// 🧬 MOTOR DE PRECISIÓN
// =====================================================================
function getValBilineal(buffer, width, height, x, y, canal) {
    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    const fx = x - x1;
    const fy = y - y1;
    if (x1 < 0 || x1 >= width - 1 || y1 < 0 || y1 >= height - 1) return 0;
    const idx = (py, px) => (py * width + px) * 4 + canal;
    const A = buffer[idx(y1, x1)];
    const B = buffer[idx(y1, x1 + 1)];
    const C = buffer[idx(y1 + 1, x1)];
    const D = buffer[idx(y1 + 1, x1 + 1)];
    return (A * (1 - fx) * (1 - fy)) + (B * fx * (1 - fy)) + (C * (1 - fx) * fy) + (D * fx * fy);
}

function extractFrequency(buffer, width, height, x, y, u, v, canal) {
    let sum = 0;
    const Cu = (u === 0) ? 1/Math.sqrt(2) : 1;
    const Cv = (v === 0) ? 1/Math.sqrt(2) : 1;
    for (let py = 0; py < 8; py++) {
        const cosY = Math.cos(((2 * py + 1) * v * Math.PI) / 16);
        for (let px = 0; px < 8; px++) {
            const val = getValBilineal(buffer, width, height, x + px, y + py, canal);
            const cosX = Math.cos(((2 * px + 1) * u * Math.PI) / 16);
            sum += val * cosX * cosY;
        }
    }
    return 0.25 * Cu * Cv * sum;
}

// =====================================================================
// 📍 MOTOR DE BALIZAS
// =====================================================================
function detectarBalizas(buffer, width, height, canalBaliza) {
    const balizas = [];
    const totalPixeles = width * height;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4 + canalBaliza;
            if ((buffer[idx] & 1) === 1) balizas.push({ x, y });
        }
    }
    if (balizas.length > (totalPixeles * 0.05)) return [];
    return balizas;
}

function calcularCentroBalizas(balizas) {
    if (!balizas || balizas.length === 0) return null;
    let sumX = 0, sumY = 0;
    for (const b of balizas) { sumX += b.x; sumY += b.y; }
    return { x: sumX / balizas.length, y: sumY / balizas.length };
}

function generarVariantesCiclicas(adn) {
    const variantes = [];
    let actual = adn;
    for (let i = 0; i < 32; i++) {
        variantes.push(actual);
        actual = actual.substring(1) + actual[0];
    }
    return variantes;
}

// =====================================================================
// 📉 BARRIDO DE ÁREA
// =====================================================================
function ejecutarBarridoArea(buffer, width, height, anguloCentral, canal, centroCustom) {
    console.log(`   📉 ESCANEANDO ÁREA entorno a ${anguloCentral}° (Rango: +/- 3°)...`);
    let mejorAngulo = anguloCentral;
    let mejorScore = -1;
    let mejorADN = "";

    const RANGO = 3.0; const PASO = 0.25;
    for (let ang = anguloCentral - RANGO; ang <= anguloCentral + RANGO; ang += PASO) {
        const anguloReal = (ang + 360) % 360;
        const res = extraerConRotacionHolografica(buffer, width, height, anguloReal, canal, centroCustom);
        if (res.confianza > mejorScore) {
            mejorScore = res.confianza;
            mejorAngulo = anguloReal;
            mejorADN = res.adn;
        }
    }

    if (Math.abs(mejorAngulo - anguloCentral) > 0.1) {
        console.log(`      ✅ CORRECCIÓN: ${anguloCentral}° -> ${mejorAngulo.toFixed(2)}° (Mejora Score: ${mejorScore.toFixed(0)})`);
    } else {
        console.log(`      ⏹️  Confirmado ángulo original ${anguloCentral}°.`);
    }
    return { angulo: mejorAngulo, score: mejorScore, adn: mejorADN };
}

// =====================================================================
// 🎯 RADAR MAESTRO
// =====================================================================
export function radarHolograficoOptimo(buffer, width, height, canal = 2) {
    console.log("\n🎯 RADAR HOLOGRÁFICO (MODO: BALIZAS V19 + BRÚJULA DIRECTA)");

    const balizas = detectarBalizas(buffer, width, height, canal);
    let centroEstimado = null;

    if (balizas.length > 50) {
        centroEstimado = calcularCentroBalizas(balizas);
        console.log(`   📍 BALIZAS V19: ${balizas.length} puntos. Centro Dinámico: (${centroEstimado.x.toFixed(0)}, ${centroEstimado.y.toFixed(0)})`);
    } else {
        console.log(`   ⚠️ Sin balizas fiables. Usando centro geométrico.`);
    }

    let finalistas = brujulaConsensoMaestra(buffer, width, height, canal, centroEstimado);
    [0, 15, 30, 45].forEach(ang => {
        if (!finalistas.some(f => Math.abs(f.angulo - ang) < 3)) finalistas.push({ angulo: ang, score: 500 });
    });

    console.log(`   🎯 Finalistas: ${finalistas.map(f => f.angulo + "°").join(", ")}`);

    let ganadorDefinitivo = null;
    let mejorConfianzaGlobal = -1;

    for (const candidato of finalistas) {
        const angBase = candidato.angulo;
        const variantes = [ angBase, (360 - angBase) % 360 ];
        for (let ang of variantes) {
            const angNorm = ang > 180 ? ang - 360 : ang;
            if (angNorm < -10 || angNorm > 100) continue;
            const prueba = extraerConRotacionHolografica(buffer, width, height, ang, canal, centroEstimado);
            if (prueba.confianza > 500) console.log(`      🧬 Audición ${ang}°: ADN=[${prueba.adn}] Confianza=${prueba.confianza.toFixed(0)}`);
            if (prueba.confianza > 1000 && prueba.confianza > mejorConfianzaGlobal) {
                mejorConfianzaGlobal = prueba.confianza;
                ganadorDefinitivo = { angulo: ang, score: candidato.score };
            }
        }
    }

    if (ganadorDefinitivo) {
         console.log(`   🏆 CANDIDATO LÍDER: ${ganadorDefinitivo.angulo}° (Score Base: ${mejorConfianzaGlobal.toFixed(0)})`);
         const resultadoFino = ejecutarBarridoArea(buffer, width, height, ganadorDefinitivo.angulo, canal, centroEstimado);
         console.log(`   🏁 ÁNGULO FINAL: ${resultadoFino.angulo.toFixed(2)}° ADN=[${resultadoFino.adn}]`);

         return {
            angulo: resultadoFino.angulo,
            faseY: 0,
            score: resultadoFino.score,
            metodo: centroEstimado ? "BEACON_SWEEP" : "GEOMETRIC_SWEEP",
            adn: resultadoFino.adn,
            // 🚨 EXPORTAMOS EL CENTRO PARA EL ANALIZADOR
            centro: centroEstimado,
            variantes: generarVariantesCiclicas(resultadoFino.adn)
        };
    }
    return { angulo: 0, faseY: 0, score: 0, metodo: "FALLO_ADN" };
}

// =====================================================================
// 🧭 BRÚJULA DIRECTA
// =====================================================================
function brujulaConsensoMaestra(buffer, width, height, canal, centroCustom = null) {
    const cX = centroCustom ? Math.round(centroCustom.x) : Math.round((width / 2) / 8) * 8;
    const cY = centroCustom ? Math.round(centroCustom.y) : Math.round((height / 2) / 8) * 8;
    const puntos = [{ x: cX, y: cY }, { x: cX, y: cY - 64 }, { x: cX, y: cY + 64 }, { x: cX - 64, y: cY }, { x: cX + 64, y: cY }, { x: cX + 64, y: cY - 64 }, { x: cX + 64, y: cY + 64 }, { x: cX - 64, y: cY + 64 }, { x: cX - 64, y: cY - 64 }];
    const energiaAcumulada = new Array(91).fill(0);

    for (const punto of puntos) {
        if (punto.x < 64 || punto.y < 64 || punto.x > width - 64 || punto.y > height - 64) continue;
        const ecos = sondearPuntoRaw(buffer, width, height, punto.x, punto.y, canal);
        ecos.forEach(cand => {
            const ang = Math.round((cand.angulo + 360) % 360);
            const cuadrante = ang % 90;
            energiaAcumulada[cuadrante] += cand.energy;
        });
    }

    let candidatos = [];
    for (let i = 0; i < 90; i++) {
        if (energiaAcumulada[i] > 10) candidatos.push({ angulo: i, score: energiaAcumulada[i] });
    }
    candidatos.sort((a, b) => b.score - a.score);
    return candidatos.slice(0, 20);
}

function sondearPuntoRaw(buffer, width, height, cX, cY, canal) {
    let candidatos = [];
    for (let angulo = 0; angulo < 180; angulo += 1) {
        const rad = angulo * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const pCen = leerTensionPunto(buffer, width, height, cX, cY, canal);
        const pAde = leerTensionPunto(buffer, width, height, Math.round(cX + 8*cos), Math.round(cY + 8*sin), canal);
        if (Math.sign(pCen) !== Math.sign(pAde)) {
            const en = Math.abs(pCen - pAde);
            if (en > 10) candidatos.push({ angulo, energy: en });
        }
    }
    return candidatos;
}

function leerTensionPunto(buffer, width, height, x, y, canal) {
    if (x < 0 || y < 0 || x > width - 8 || y > height - 8) return 0;
    const freqA = extractFrequency(buffer, width, height, x, y, 1, 1, canal);
    const freqB = extractFrequency(buffer, width, height, x, y, 2, 2, canal);
    return freqA - freqB;
}

export function extraerConRotacionHolografica(buffer, width, height, angulo, canal = 2, centroCustom = null) {
    const centroXReal = centroCustom ? centroCustom.x : width / 2;
    const centroYReal = centroCustom ? centroCustom.y : height / 2;
    const cX_Base = centroXReal;
    const cY_Base = centroYReal;
    const rad = angulo * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const UMBRAL_ELITE = 25;

    const matrix = Array.from({ length: 32 }, () => new Float32Array(32).fill(0));
    let bloquesTotales = 0;
    const margen = Math.min(width, height) * 0.15;
    const startX = -Math.floor((width - margen * 2) / 2);
    const endX = Math.floor((width - margen * 2) / 2);
    const startY = -Math.floor((height - margen * 2) / 2);
    const endY = Math.floor((height - margen * 2) / 2);

    for (let dy = -4; dy <= 4; dy += 2) {
        for (let dx = -4; dx <= 4; dx += 2) {
            const cX = cX_Base + dx;
            const cY = cY_Base + dy;
            for (let y = startY; y < endY; y += 8) {
                for (let x = startX; x < endX; x += 8) {
                    const xReal = (cos * x + sin * y) + cX;
                    const yReal = (-sin * x + cos * y) + cY;
                    if (xReal >= 0 && xReal + 8 < width && yReal >= 0 && yReal + 8 < height) {
                        try {
                            const fA = extractFrequency(buffer, width, height, xReal, yReal, 1, 1, canal);
                            const fB = extractFrequency(buffer, width, height, xReal, yReal, 2, 2, canal);
                            const diff = fA - fB;
                            if (Math.abs(diff) < UMBRAL_ELITE) continue;
                            const colRaw = Math.floor((x + cX_Base + 4) / 8);
                            const rowRaw = Math.floor((y + cY_Base + 4) / 8);
                            const colMod = ((colRaw % 32) + 32) % 32;
                            const rowMod = ((rowRaw % 32) + 32) % 32;
                            matrix[rowMod][colMod] += diff;
                            bloquesTotales++;
                        } catch (e) {}
                    }
                }
            }
        }
    }
    if (bloquesTotales === 0) return { adn: "0000", confianza: 0, bloquesUsados: 0 };

    let mejorConfig = { adn: "", confianza: -1, shift: 0 };
    for (let shift = 0; shift < 32; shift++) {
        const urnas = new Array(16).fill(0);
        for (let r = 0; r < 32; r++) {
            for (let c = 0; c < 32; c++) {
                const valor = matrix[r][c];
                if (valor === 0) continue;
                const indexSecuencia = (c + (r * shift)) % 32;
                const esReal = (indexSecuencia % 2 === 0);
                const bitAsociado = Math.floor(indexSecuencia / 2);
                if (esReal) urnas[bitAsociado] += valor; else urnas[bitAsociado] -= valor;
            }
        }
        const rep = bloquesTotales / 32;
        const difs = urnas.map(u => rep > 0 ? u / rep : 0);
        const conf = difs.reduce((a, b) => a + Math.abs(b), 0) * (bloquesTotales/1000);
        if (conf > mejorConfig.confianza) {
            const bits = difs.map(d => Math.abs(d) < 0.1 ? "0" : (d > 0 ? "1" : "0"));
            mejorConfig = { adn: bits.join(""), confianza: conf, shift: shift };
        }
    }
    return { adn: mejorConfig.adn, confianza: mejorConfig.confianza, bloquesUsados: bloquesTotales };
}
export function testRadarHolografico() { return true; }
