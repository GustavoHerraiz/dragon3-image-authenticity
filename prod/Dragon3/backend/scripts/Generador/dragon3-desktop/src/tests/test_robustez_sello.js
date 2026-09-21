import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from '../backend/generadorMBH.js';
import { analizarImagenRapido } from '../backend/analizador_v6.js';

const TEST_ID = 0x12345;
const TEST_HASH = TEST_ID.toString(16).toUpperCase().padStart(7, '0');
const TEST_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'dragon3-robustez-'));
const inputPath = path.join(TEST_DIR, 'original.png');
const sealedPath = path.join(TEST_DIR, 'sellada.png');
const artifacts = [];
const testStartedAt = Date.now();
const TEST_TIMEOUT_MS = Number(process.env.DRAGON3_ROBUSTEZ_TIMEOUT || 12000);
const SOURCE_WIDTH = 768;
const SOURCE_HEIGHT = 512;

const record = {
    id: 1,
    id_numerico: TEST_ID,
    cliente: 'Dragon3 Test',
    obra: 'Imagen de robustez'
};

const db = {
    async obtenerPrefijo() { return 'TST'; },
    async obtenerConfiguracion() { return { prefijo_usuario: 'TST' }; },
    async obtenerSiguienteId() { return TEST_ID; },
    async buscarPorId() { return record; },
    async obtenerTodos() { return [record]; },
    async crearProyecto() { return record; },
    async registrarSello() {},
    async buscarPorHash(hash) {
        return hash === TEST_HASH ? record : null;
    }
};

const licenseManager = {
    async comprobarLimite() { return { ok: true }; },
    async incrementarSellosUsados() {}
};

function check(condition, message) {
    if (!condition) throw new Error(message);
}

async function createSource() {
    const width = SOURCE_WIDTH;
    const height = SOURCE_HEIGHT;
    const channels = 3;
    const pixels = Buffer.alloc(width * height * channels);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * channels;
            const texture = ((x * 17 + y * 31 + ((x * y) % 97)) % 41) - 20;
            pixels[index] = Math.max(0, Math.min(255, 90 + Math.round(x * 80 / width) + texture));
            pixels[index + 1] = Math.max(0, Math.min(255, 110 + Math.round(y * 70 / height) + texture));
            pixels[index + 2] = Math.max(0, Math.min(255, 145 + Math.round((x + y) * 45 / (width + height)) + texture));
        }
    }

    await sharp(pixels, { raw: { width, height, channels } }).png().toFile(inputPath);
}

async function writeArtifact(name, pipeline) {
    const output = path.join(TEST_DIR, `${name}.png`);
    await pipeline.toFile(output);
    artifacts.push(output);
    return output;
}

async function analyze(name, file, required = false) {
    const startedAt = Date.now();
    const result = await analizarImagenRapido(file, db, TEST_TIMEOUT_MS, true);
    const passed = result.identificado && result.hash === TEST_HASH;
    return { name, required, passed, elapsedMs: Date.now() - startedAt, result };
}

async function main() {
    await createSource();

    const generator = new GeneradorMBH(db, licenseManager);
    const generated = await generator.sellarImagen(inputPath, sealedPath, {
        id_numerico: TEST_ID,
        proyectoId: record.id,
        cliente: record.cliente,
        obra: record.obra
    });
    check(generated.ok, `El generador no pudo crear el sello: ${generated.error || 'error desconocido'}`);

    const results = [];
    const cleanPath = path.join(TEST_DIR, 'sin-sello.png');
    await sharp({
        create: { width: 768, height: 512, channels: 3, background: { r: 33, g: 66, b: 99 } }
    }).png().toFile(cleanPath);
    const cleanResult = await analizarImagenRapido(cleanPath, db, 12000, false);
    check(!cleanResult.identificado, 'La imagen limpia produjo un falso positivo');
    results.push(await analyze('PNG original sellado', sealedPath, true));

    for (let quality = 100; quality >= 5; quality -= 5) {
        const file = await writeArtifact(`jpeg-q${quality}`, sharp(sealedPath).jpeg({ quality, chromaSubsampling: '4:4:4' }));
        results.push(await analyze(`JPEG Q${quality}`, file, quality >= 20));
    }

    const sealedRaw = await sharp(sealedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const noisyPixels = Buffer.from(sealedRaw.data);
    for (let index = 0; index < noisyPixels.length; index += 4) {
        const noise = ((index * 17) % 19) - 9;
        noisyPixels[index] = Math.max(0, Math.min(255, noisyPixels[index] + noise));
        noisyPixels[index + 1] = Math.max(0, Math.min(255, noisyPixels[index + 1] + noise));
        noisyPixels[index + 2] = Math.max(0, Math.min(255, noisyPixels[index + 2] - noise));
    }

    const attacks = {
        'PNG reexportado': sharp(sealedPath).png({ compressionLevel: 9 }),
        'Escala 50%': sharp(sealedPath).resize({ width: 384 }),
        'Escala 25%': sharp(sealedPath).resize({ width: 192 }),
        'Escala 33%': sharp(sealedPath).resize({ width: 256 }),
        'Escala 75%': sharp(sealedPath).resize({ width: 576 }),
        'Escala 90%': sharp(sealedPath).resize({ width: 691 }),
        'Escala 110%': sharp(sealedPath).resize({ width: 845 }),
        'Escala 125%': sharp(sealedPath).resize({ width: 960 }),
        'Escala 150%': sharp(sealedPath).resize({ width: 1152 }),
        'Escala 200%': sharp(sealedPath).resize({ width: 1536 }),
        'Rotación 90 grados': sharp(sealedPath).rotate(90),
        'Rotación 180 grados': sharp(sealedPath).rotate(180),
        'Rotación arbitraria 15 grados': sharp(sealedPath).rotate(15, { background: '#808080' }),
        'Rotación arbitraria 30 grados': sharp(sealedPath).rotate(30, { background: '#808080' }),
        'Espejo vertical': sharp(sealedPath).flip(),
        'Espejo horizontal': sharp(sealedPath).flop(),
        'Desenfoque sigma 0.5': sharp(sealedPath).blur(0.5),
        'Desenfoque sigma 1.5': sharp(sealedPath).blur(1.5),
        'Desenfoque sigma 3': sharp(sealedPath).blur(3),
        'Realce de nitidez': sharp(sealedPath).sharpen(),
        'Mediana 3x3': sharp(sealedPath).median(3),
        'Brillo reducido': sharp(sealedPath).modulate({ brightness: 0.6 }),
        'Brillo aumentado': sharp(sealedPath).modulate({ brightness: 1.4 }),
        'Saturación reducida': sharp(sealedPath).modulate({ saturation: 0.2 }),
        'Escala de grises': sharp(sealedPath).grayscale(),
        'Gamma bajo': sharp(sealedPath).gamma(1.8),
        'Ruido RGB determinista': sharp(noisyPixels, { raw: sealedRaw.info }),
        'Recorte central': sharp(sealedPath).extract({ left: 96, top: 64, width: 576, height: 384 }),
        'Recorte lateral izquierdo': sharp(sealedPath).extract({ left: 0, top: 64, width: 576, height: 384 }),
        'Recorte lateral derecho': sharp(sealedPath).extract({ left: 192, top: 64, width: 576, height: 384 }),
        'Recorte superior': sharp(sealedPath).extract({ left: 96, top: 0, width: 576, height: 384 }),
        'Recorte inferior': sharp(sealedPath).extract({ left: 96, top: 128, width: 576, height: 384 }),
        'WebP Q50': sharp(sealedPath).webp({ quality: 50 }),
        'WebP Q10': sharp(sealedPath).webp({ quality: 10 }),
        'TIFF LZW': sharp(sealedPath).tiff({ compression: 'lzw' }),
        'JPEG Q70 dos generaciones': sharp(sealedPath).jpeg({ quality: 70 }).jpeg({ quality: 70 }),
        'JPEG Q30 dos generaciones': sharp(sealedPath).jpeg({ quality: 30 }).jpeg({ quality: 30 }),
        'JPEG Q30 y escala 50%': sharp(sealedPath).resize({ width: 384 }).jpeg({ quality: 30, chromaSubsampling: '4:4:4' }),
        'JPEG Q30 y escala 75%': sharp(sealedPath).resize({ width: 576 }).jpeg({ quality: 30, chromaSubsampling: '4:4:4' }),
        'Doble JPEG Q20 y escala 125%': sharp(sealedPath).resize({ width: 960 }).jpeg({ quality: 20 }).jpeg({ quality: 20 }),
        'Doble rotación y JPEG Q30': sharp(sealedPath).rotate(180).jpeg({ quality: 30 }),
        'Doble recorte y escala 75%': sharp(sealedPath).extract({ left: 96, top: 64, width: 576, height: 384 }).resize({ width: 432 }),
        'Doble desenfoque y JPEG Q30': sharp(sealedPath).blur(1.5).jpeg({ quality: 30 }),
        'Doble escala y WebP Q20': sharp(sealedPath).resize({ width: 576 }).resize({ width: 384 }).webp({ quality: 20 }),
        'Doble gris y JPEG Q20': sharp(sealedPath).grayscale().jpeg({ quality: 20 }),
        'Doble brillo y nitidez': sharp(sealedPath).modulate({ brightness: 0.7 }).sharpen(),
        'Triple recorte escala JPEG': sharp(sealedPath).extract({ left: 96, top: 64, width: 576, height: 384 }).resize({ width: 384 }).jpeg({ quality: 30 }),
        'Triple rotación escala JPEG': sharp(sealedPath).rotate(90).resize({ width: 576 }).jpeg({ quality: 30 }),
        'Triple espejo escala WebP': sharp(sealedPath).flop().resize({ width: 576 }).webp({ quality: 20 }),
        'Triple desenfoque escala JPEG': sharp(sealedPath).blur(1.5).resize({ width: 576 }).jpeg({ quality: 30 }),
        'Triple gris gamma JPEG': sharp(sealedPath).grayscale().gamma(1.8).jpeg({ quality: 30 }),
        'Triple brillo saturación JPEG': sharp(sealedPath).modulate({ brightness: 0.7, saturation: 0.3 }).jpeg({ quality: 30 }),
        'Triple nitidez WebP escala': sharp(sealedPath).sharpen().resize({ width: 576 }).webp({ quality: 20 }),
        'Triple recorte rotación JPEG': sharp(sealedPath).extract({ left: 96, top: 64, width: 576, height: 384 }).rotate(180).jpeg({ quality: 30 })
    };

    for (const [name, pipeline] of Object.entries(attacks)) {
        const file = await writeArtifact(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), pipeline);
        results.push(await analyze(name, file));
    }

    const required = results.filter(result => result.required);
    const exploratory = results.filter(result => !result.required);
    const failedRequired = required.filter(result => !result.passed);

    console.log(JSON.stringify({
        testDir: TEST_DIR,
        selloEsperado: TEST_HASH,
        required: required.map(({ name, passed, elapsedMs, result }) => ({
            name,
            passed,
            elapsedMs,
            identificado: result.identificado,
            hash: result.hash,
            score: result.score,
            pairs: result.pairs,
            error: result.error
        })),
        exploratory: exploratory.map(({ name, passed, elapsedMs, result }) => ({
            name,
            passed,
            elapsedMs,
            identificado: result.identificado,
            hash: result.hash,
            score: result.score,
            pairs: result.pairs,
            escala: result.escala,
            rotacion: result.rotacion,
            error: result.error
        })),
        summary: {
            execution: {
                startedAt: new Date(testStartedAt).toISOString(),
                durationMs: Date.now() - testStartedAt,
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                timeoutMs: TEST_TIMEOUT_MS,
                source: {
                    width: SOURCE_WIDTH,
                    height: SOURCE_HEIGHT,
                    channels: 3,
                    type: 'PNG sintético texturado, gradientes RGB y ruido determinista'
                },
                registeredCandidates: 1,
                testId: TEST_ID,
                testHash: TEST_HASH
            },
            cleanRejected: !cleanResult.identificado,
            requiredPassed: required.length - failedRequired.length,
            requiredTotal: required.length,
            exploratoryDetected: exploratory.filter(result => result.passed).length,
            exploratoryTotal: exploratory.length
        }
    }, null, 2));

    if (failedRequired.length > 0) {
        throw new Error(`Fallaron ${failedRequired.length} pruebas obligatorias: ${failedRequired.map(result => result.name).join(', ')}`);
    }
}

try {
    await main();
} finally {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
}
