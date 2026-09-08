/**
 * ============================================================================
 * 🐲 DRAGON3 - HYDRA CORE V1.0 (PRODUCCIÓN)
 * ============================================================================
 * Motor unificado de Esteganografía Holográfica (Nano-Hydra).
 * Incluye:
 * - Generador V15.3 (Inyección)
 * - Analizador V15.4 (Detección Hunter)
 * - Motor Espacial (Caché de Patrones)
 * - Early Exit (Optimización de Velocidad)
 */

import sharp from 'sharp';
import crypto from 'crypto';

// --- CONFIGURACIÓN MAESTRA ---
const CONFIG = {
    TILE_SIZE: 256,         // Nano-Tiles para resistencia a recortes
    SCAN_STEP: 2,           // Precisión de fase (Hunter Mode)
    DENSIDAD_STARDUST: 40,  // Puntos por tile
    PUNTOS_ALPHA: 30,       // Geometría Vogel por tile
    GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
    UMBRAL_EXITO: 0.95,     // Si confianza > 95%, parar de escanear (Early Exit)
    POTENCIA_MARCA: 30      // Intensidad del diferencial (+/- 30)
};

// ============================================================================
// 🧠 MOTOR ESPACIAL (Caché de Matemáticas)
// ============================================================================
class MotorEspacial {
    constructor(privateKey) {
        this.privateKey = privateKey;
        this.patronVogel = null;
        this.patronStardust = null;
        this.inicializar();
    }

    inicializar() {
        // 1. Pre-calcular VOGEL (Alpha)
        this.patronVogel = [];
        const radioVogel = (CONFIG.TILE_SIZE / 2) * 0.85;
        const scale = radioVogel / Math.sqrt(CONFIG.PUNTOS_ALPHA);

        for (let i = 0; i < CONFIG.PUNTOS_ALPHA; i++) {
            const r = scale * Math.sqrt(i);
            const theta = i * CONFIG.GOLDEN_ANGLE;
            this.patronVogel.push({
                x: r * Math.cos(theta),
                y: r * Math.sin(theta)
            });
        }

        // 2. Pre-calcular STARDUST (Diferencial)
        this.patronStardust = [];
        const prng = this._crearPRNG(this.privateKey);
        const margen = 8;

        for (let i = 0; i < CONFIG.DENSIDAD_STARDUST; i++) {
            this.patronStardust.push({
                x: Math.floor(prng() * (CONFIG.TILE_SIZE - margen * 2)) + margen,
                y: Math.floor(prng() * (CONFIG.TILE_SIZE - margen * 2)) + margen,
                bitIndex: i % 16
            });
        }
        // console.log(`[HydraCore] 🧠 Motor Espacial Iniciado (Patrones en RAM).`);
    }

    _crearPRNG(semilla) {
        let h = 0x811c9dc5;
        for (let i = 0; i < semilla.length; i++) { h ^= semilla.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return function() {
            h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
            return ((h ^= h >>> 16) >>> 0) / 4294967296;
        };
    }
}

// ============================================================================
// 📦 CLASE PRINCIPAL
// ============================================================================
export class HydraCore {

    constructor(secretKey) {
        if (!secretKey) throw new Error("HydraCore necesita una SECRET_KEY");
        this.motor = new MotorEspacial(secretKey);
    }

    /**
     * INYECTA el sello invisible en una imagen.
     * @param {string} rutaEntrada - Path a la imagen original
     * @param {string} rutaSalida - Path donde guardar
     * @param {string} hashID - Identificador hexadecimal de 4 caracteres (ej: "d760")
     */
    async sellar(rutaEntrada, rutaSalida, hashID) {
        const image = sharp(rutaEntrada);
        const { data: buffer, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const w = info.width;
        const h = info.height;
        const ch = 4; // Canales RGBA

        // Iterar por tiles (Grid)
        for (let y = 0; y <= h - CONFIG.TILE_SIZE; y += CONFIG.TILE_SIZE) {
            for (let x = 0; x <= w - CONFIG.TILE_SIZE; x += CONFIG.TILE_SIZE) {
                this._inyectarTile(buffer, w, h, x, y, hashID);
            }
        }

        // Guardar PNG optimizado
        await sharp(buffer, { raw: { width: w, height: h, channels: ch } })
            .png({ compressionLevel: 9, adaptiveFiltering: true })
            .toFile(rutaSalida);

        return true;
    }

    _inyectarTile(buffer, w, h, offX, offY, hashID) {
        const centerX = offX + (CONFIG.TILE_SIZE / 2);
        const centerY = offY + (CONFIG.TILE_SIZE / 2);

        // A. ALPHA
        for (const p of this.motor.patronVogel) {
            const px = Math.floor(centerX + p.x);
            const py = Math.floor(centerY + p.y);
            const idx = (py * w + px) * 4;
            buffer[idx + 3] |= 1; // Marcar LSB Alpha
        }

        // B. STARDUST
        for (const p of this.motor.patronStardust) {
            const targetBit = (parseInt(hashID, 16) >> (15 - p.bitIndex)) & 1;
            const delta = targetBit ? CONFIG.POTENCIA_MARCA : -CONFIG.POTENCIA_MARCA;

            const ax = Math.floor(offX + p.x);
            const ay = Math.floor(offY + p.y);
            const bx = ax + 3;

            this._aplicarDeltaBloque(buffer, w, h, ax, ay, delta); // Bloque A
            this._aplicarDeltaBloque(buffer, w, h, bx, ay, -delta); // Bloque B (Inverso)
        }
    }

    _aplicarDeltaBloque(buf, w, h, x0, y0, delta) {
        for(let dy=0; dy<3; dy++) {
            for(let dx=0; dx<3; dx++) {
                const px = x0 + dx; const py = y0 + dy;
                if(px >= w || py >= h) continue;
                const i = (py * w + px) * 4;
                // Clamp 0-255
                buf[i] = Math.max(0, Math.min(255, buf[i] + delta));     // R
                buf[i+1] = Math.max(0, Math.min(255, buf[i+1] + delta)); // G
                buf[i+2] = Math.max(0, Math.min(255, buf[i+2] + delta)); // B
            }
        }
    }

    /**
     * DETECTA el sello en una imagen (Hunter Scan).
     * @param {string} rutaImagen - Imagen a analizar
     * @returns {Object} { detectado: bool, hash: string, confianza: float }
     */
    async detectar(rutaImagen) {
        const { data: buffer, info } = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let mejorConfianza = 0;
        let mejorHash = null;

        // Bucle Hunter Scan (XY)
        // Optimizacion: Early Exit

        for (let y = 0; y <= info.height - CONFIG.TILE_SIZE; y += CONFIG.SCAN_STEP) {
            for (let x = 0; x <= info.width - CONFIG.TILE_SIZE; x += CONFIG.SCAN_STEP) {

                const res = this._analizarTile(buffer, info.width, info.height, x, y);

                if (res && res.confianza > 0.65) {
                    if (res.hash === '0000') continue; // Ignorar ruido

                    if (res.confianza > mejorConfianza) {
                        mejorConfianza = res.confianza;
                        mejorHash = res.hash;
                    }

                    // ⚡ EARLY EXIT: Si encontramos un sello perfecto, nos vamos ya.
                    if (mejorConfianza >= CONFIG.UMBRAL_EXITO) {
                        return { detectado: true, hash: mejorHash, confianza: mejorConfianza };
                    }
                }
            }
            // Segunda comprobación de salida rápida por filas
            if (mejorConfianza >= CONFIG.UMBRAL_EXITO) break;
        }

        return {
            detectado: mejorConfianza > 0.70, // Umbral mínimo de aceptación
            hash: mejorHash,
            confianza: mejorConfianza
        };
    }

    _analizarTile(buffer, w, h, offX, offY) {
        // Nota: Omitimos verificación Alpha para máxima velocidad y robustez (Bypass)

        const votos = new Uint16Array(32); // 0-15: unos, 16-31: ceros

        for (const p of this.motor.patronStardust) {
            const ax = Math.floor(offX + p.x);
            const ay = Math.floor(offY + p.y);
            const bx = ax + 3;

            const valA = this._leerBrilloBloque(buffer, w, h, ax, ay);
            const valB = this._leerBrilloBloque(buffer, w, h, bx, ay);

            if (valA > valB + 2.0) votos[p.bitIndex]++;       // Voto 1
            else if (valB > valA + 2.0) votos[p.bitIndex + 16]++; // Voto 0
        }

        let hash = 0; let bits = 0; let confSum = 0;
        for (let i = 0; i < 16; i++) {
            const unos = votos[i]; const ceros = votos[i+16];
            const total = unos + ceros;
            if (total > 0) {
                bits++;
                confSum += Math.max(unos, ceros) / total;
                if (unos > ceros) hash |= (1 << (15 - i));
            }
        }

        if (bits < 10) return null; // Poca información

        return {
            hash: hash.toString(16).padStart(4, '0'),
            confianza: confSum / 16
        };
    }

    _leerBrilloBloque(buf, w, h, x0, y0) {
        let sum = 0, count = 0;
        for(let dy=0; dy<3; dy++) for(let dx=0; dx<3; dx++) {
            const px = x0 + dx; const py = y0 + dy;
            if (px < w && py < h) {
                const i = (py * w + px) * 4;
                sum += buf[i] + buf[i+1] + buf[i+2];
                count += 3;
            }
        }
        return count > 0 ? sum / count : 0;
    }
}
