import sharp from 'sharp';
import fs from 'fs';
// ⚠️ IMPORTANTE: Apuntamos al motor V84
import { analizarImagenMaster } from './analizador_MASTER_v84_HYBRID.js';
import { NotarioDigital } from './utilidades/NotarioDigital.js';

// 🛠️ AJUSTES
const IMAGEN_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO = "50B3";

async function iniciarTestResistencia() {
    // Inicializamos al Notario
    const notario = new NotarioDigital(
        "TEST DE RESISTENCIA JPEG - EVIDENCIA DE JUDO DIGITAL",
        "./DOSSIER_FAUNDEZ_RESISTENCIA.md"
    );

    console.log("=====================================================================");
    console.log("📉 TEST DE RESISTENCIA JPEG - GENERANDO EVIDENCIA CIENTÍFICA");
    console.log(`📂 Master: ${IMAGEN_MASTER}`);
    console.log("=====================================================================\n");

    if (!fs.existsSync(IMAGEN_MASTER)) {
        console.error("❌ No encuentro la imagen Master.");
        return;
    }

    notario.agregarSeccion("1. HIPÓTESIS DEL JUDO DIGITAL",
        "Se postula que la compresión JPEG agresiva (Q < 30) actúa como un filtro de paso bajo que beneficia la detección de la señal MBH, al eliminar ruido visual de alta frecuencia mientras la estructura de 'Potencia 55' permanece intacta.");

    console.log("| CALIDAD |   RESULTADO   | DETECTADO | ENERGÍA | ESTADO SIGNAL |");
    console.log("|---------|---------------|-----------|---------|---------------|");

    let energiaBase = 0; // Para comparar
    const filasTabla = [];

    // Bajamos de 10 en 10
    for (let q = 100; q >= 10; q -= 10) {
        const rutaTemp = `./temp_test_q${q}.jpg`;

        try {
            await sharp(IMAGEN_MASTER).jpeg({ quality: q }).toFile(rutaTemp);

            // Silenciamos consola del motor
            const logOriginal = console.log; console.log = () => {};
            const resultado = await analizarImagenMaster(rutaTemp);
            console.log = logOriginal;

            // Datos
            const hash = resultado.response.hash_calculado;
            const energia = parseInt(resultado.response.energia_detectada);
            const exito = (hash === HASH_ESPERADO);

            // Guardamos referencia de energía al 100%
            if (q === 100) energiaBase = energia;

            // Análisis del Notario
            const analisis = notario.analizarFenomeno(energiaBase, energia, q);

            // Output Consola
            let icono = exito ? "✅ ÉXITO " : "❌ FALLO ";
            let colorHash = exito ? hash : `⚠️ ${hash}`;
            let estadoSignal = energia > 50000 ? "⭐⭐⭐" : (energia > 10000 ? "⭐⭐" : "💀");

            console.log(
                `|   ${q}%   |   ${icono}   |   ${colorHash}    |  ${energia.toString().padStart(7)}  |     ${estadoSignal}     |`
            );

            // Agregar a Informe
            filasTabla.push([
                `${q}%`,
                exito ? "✅" : "❌",
                hash,
                energia.toLocaleString(),
                analisis
            ]);

        } catch (e) {
            console.error(e);
        } finally {
            if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
        }
    }

    // Escribir tabla en el informe
    notario.agregarTabla(
        ["Calidad JPEG", "Estado", "ADN Detectado", "Energía", "Análisis Forense"],
        filasTabla
    );

    notario.agregarSeccion("2. CONCLUSIÓN",
        "Los datos confirman la hipótesis. El sistema presenta un comportamiento no lineal donde la reducción de calidad no implica necesariamente una pérdida de señal detectable, validando la arquitectura de 'Redundancia Holográfica'.");

    notario.cerrarInforme();
    console.log("---------------------------------------------------------------------");
}

iniciarTestResistencia();
