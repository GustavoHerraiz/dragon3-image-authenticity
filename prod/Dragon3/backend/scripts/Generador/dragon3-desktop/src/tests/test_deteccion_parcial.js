import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from '../backend/generadorMBH.js';
import { MotorForenseV6 } from '../backend/analizador_v6.js';

const TEST_ID = 0x12345;
const TEST_HASH = TEST_ID.toString(16).toUpperCase().padStart(7, '0');
const TEST_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'dragon3-parcial-'));
const inputPath = path.join(TEST_DIR, 'original.png');
const sealedPath = path.join(TEST_DIR, 'sellada.png');
const attackedPath = path.join(TEST_DIR, 'q10.png');

const record = { id: 1, cliente: 'Dragon3 Test', obra: 'Detección parcial' };
const db = {
    async obtenerPrefijo() { return 'TST'; },
    async obtenerConfiguracion() { return { prefijo_usuario: 'TST' }; },
    async obtenerSiguienteId() { return TEST_ID; },
    async buscarPorId() { return record; },
    async registrarSello() {},
    async buscarPorHash(hash) { return hash === TEST_HASH ? record : null; }
};
const licenseManager = {
    async comprobarLimite() { return { ok: true }; },
    async incrementarSellosUsados() {}
};

function payloadBits(id) {
    const checksum = (((id & 0x3FFF) ^ (id >> 14)) * 19);
    const payload = ((id << 4) | ((checksum ^ (checksum >> 6)) & 0x0F)) >>> 0;
    const bits = [];
    for (let index = 31; index >= 0; index--) {
        const bit = (payload >>> index) & 1;
        bits.push(bit, bit ^ 1);
    }
    return bits;
}

function scoreCandidate(medias, id) {
    const expected = payloadBits(id);
    let weightedAgreement = 0;
    let totalConfidence = 0;
    let knownPairs = 0;

    for (let pair = 0; pair < 32; pair++) {
        const observed = medias[pair * 2] - medias[pair * 2 + 1];
        const confidence = Math.abs(observed);
        if (confidence < 1) continue;
        const expectedSign = expected[pair * 2] === 1 ? 1 : -1;
        weightedAgreement += expectedSign * observed;
        totalConfidence += confidence;
        knownPairs++;
    }

    return {
        id,
        hash: id.toString(16).toUpperCase().padStart(7, '0'),
        knownPairs,
        confidence: totalConfidence,
        normalizedScore: totalConfidence ? weightedAgreement / totalConfidence : 0
    };
}

async function main() {
    const width = 768;
    const height = 512;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 3;
            const texture = ((x * 17 + y * 31 + ((x * y) % 97)) % 41) - 20;
            pixels[index] = Math.max(0, Math.min(255, 90 + Math.round(x * 80 / width) + texture));
            pixels[index + 1] = Math.max(0, Math.min(255, 110 + Math.round(y * 70 / height) + texture));
            pixels[index + 2] = Math.max(0, Math.min(255, 145 + Math.round((x + y) * 45 / (width + height)) + texture));
        }
    }
    await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(inputPath);

    const generator = new GeneradorMBH(db, licenseManager);
    const generated = await generator.sellarImagen(inputPath, sealedPath, {
        id_numerico: TEST_ID,
        proyectoId: record.id,
        cliente: record.cliente,
        obra: record.obra
    });
    if (!generated.ok) throw new Error(generated.error || 'No se pudo generar el sello');

    await sharp(sealedPath).jpeg({ quality: 20, chromaSubsampling: '4:4:4' }).toFile(attackedPath);
    const { data, info } = await sharp(attackedPath).png().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const metrics = MotorForenseV6.extraerConMetricas(data, info, 0, 0);

    const candidates = [TEST_ID, 1, 2, 3, 0x10000, 0x12344, 0x12346, 0xABCDE, 0xFFFFFF];
    const ranking = candidates
        .map(id => scoreCandidate(metrics.medias, id))
        .sort((left, right) => right.normalizedScore - left.normalizedScore);

    console.log(JSON.stringify({
        expectedHash: TEST_HASH,
        observedBits: metrics.bits,
        pairs: metrics.pairs,
        score: metrics.score,
        ranking,
        winner: ranking[0]?.hash === TEST_HASH && ranking[0].knownPairs >= 8 && ranking[0].normalizedScore > (ranking[1]?.normalizedScore || 0) + 0.1
    }, null, 2));

    if (!ranking[0] || ranking[0].hash !== TEST_HASH || ranking[0].knownPairs < 8 || ranking[0].normalizedScore <= (ranking[1]?.normalizedScore || 0) + 0.1) {
        throw new Error('La detección parcial no produjo un candidato suficientemente confiable');
    }
}

try {
    await main();
} finally {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
}
