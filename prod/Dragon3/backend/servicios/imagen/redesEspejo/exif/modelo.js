/**
 * ====================================================================
 * DRAGON3 FAANG - RED ESPEJO EXIF - MODELO PRINCIPAL (HARDENED)
 * ====================================================================
 * Versión: 4.0.0-FAANG (adaptado para tolerancia de payloads)
 *
 * Cambios clave:
 * - Normaliza inputs (payload completo / payload.exif / archivoId + payload JSON)
 * - Reconstruye vector de 9 features desde metadatos EXIF crudos si faltan datosNormalizadosParaRedExif
 * - Validación y normalización de features (siempre 9 floats en [0,1])
 * - Logging defensivo y mensajes de warning claras
 *
 * ====================================================================
 */

import pkg from "synaptic";
const { Network, Layer, Trainer } = pkg;

import dragonLogger from "../../../../utilidades/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// === Para ESM: __dirname compatible ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Arquitectura de red: 9 entradas (features), 4 ocultas, 1 salida ===
const FEATURE_COUNT = 9;
const inputLayer = new Layer(FEATURE_COUNT);
const hiddenLayer = new Layer(4);
const outputLayer = new Layer(1);
inputLayer.project(hiddenLayer);
hiddenLayer.project(outputLayer);
let nn = new Network({
  input: inputLayer,
  hidden: [hiddenLayer],
  output: outputLayer,
});
let trainer = new Trainer(nn);

// === Carga de pesos entrenados desde archivo local (si existe) ===
try {
  const PESOS_PATH = path.join(__dirname, "pesos.json");
  if (fs.existsSync(PESOS_PATH)) {
    const pesos = JSON.parse(fs.readFileSync(PESOS_PATH));
    nn = Network.fromJSON(pesos);
    dragonLogger.sonrie(
      "[EXIF MIRROR] Pesos Synaptic cargados desde archivo local",
      "redesEspejo/exif/modelo.js",
      "EXIF_MIRROR_WEIGHTS_FILE"
    );
  } else {
    dragonLogger.sePreocupa(
      "[EXIF MIRROR] No hay pesos.json, usando pesos aleatorios",
      "redesEspejo/exif/modelo.js",
      "EXIF_MIRROR_WEIGHTS_MISSING"
    );
  }
} catch (err) {
  dragonLogger.agoniza(
    "[EXIF MIRROR] Error cargando pesos de archivo",
    err,
    "redesEspejo/exif/modelo.js",
    "EXIF_MIRROR_WEIGHTS_FILE_ERROR"
  );
}

/**
 * Normaliza las distintas formas en que puede llegar el payload desde analizadorImagen.js
 * Acepta:
 *  - { idImagen, datos: { datosNormalizadosParaRedExif: [...] , todosLosMetadatosExifParseados: {...} } }
 *  - { payload: { exif: { idImagen, datos, datosNormalizadosParaRedExif } } }
 *  - { archivoId, payload: '{"exif":{...}}' }
 *  - y variantes.
 * Devuelve { idImagen, datos } garantizados (datos puede ser null).
 */
function normalizeInput(input) {
  if (!input) return { idImagen: null, datos: null };

  // Si ya viene en la forma esperada
  if (input.idImagen && input.datos) {
    return { idImagen: input.idImagen, datos: input.datos };
  }

  // Si viene payload JSON string en fields (por ejemplo desde Redis fields)
  if (typeof input.payload === "string") {
    try {
      const parsed = JSON.parse(input.payload);
      input.payload = parsed;
    } catch (e) {
      // no fatal, seguimos
    }
  }

  // payload.exif
  if (input.payload && input.payload.exif) {
    const ex = input.payload.exif;
    const idImagen = ex.idImagen || input.archivoId || input.fileId || null;
    const datos = ex.datos || ex || input.payload.exif;
    return { idImagen, datos };
  }

  // payload directamente con estructura exif-like
  if (input.exif && typeof input.exif === "object") {
    const ex = input.exif;
    const idImagen = ex.idImagen || input.archivoId || null;
    const datos = ex.datos || ex;
    return { idImagen, datos };
  }

  // Si viene archivoId/archivoId y datosNormalizados directo
  if ((input.archivoId || input.archivoID || input.fileId) && input.datosNormalizadosParaRedExif) {
    const idImagen = input.archivoId || input.archivoID || input.fileId;
    return { idImagen, datos: { datosNormalizadosParaRedExif: input.datosNormalizadosParaRedExif, todosLosMetadatosExifParseados: input.todosLosMetadatosExifParseados || null } };
  }

  // Si la propia entrada tiene datosNormalizadosParaRedExif
  if (input.datosNormalizadosParaRedExif || input.todosLosMetadatosExifParseados) {
    return { idImagen: input.idImagen || input.archivoId || null, datos: input };
  }

  // Último recurso: devolver nulls para que el caller reciba respuesta consistente
  return { idImagen: input.idImagen || input.archivoId || null, datos: null };
}

/**
 * Si datos.datosNormalizadosParaRedExif no existe, intenta construir un vector de 9 features
 * a partir de todosLosMetadatosExifParseados (si están presentes).
 * Devuelve array[9] normalizado.
 */
function buildFeaturesFromExifMetadatos(metadatos) {
  try {
    if (!metadatos || typeof metadatos !== "object") {
      return Array(FEATURE_COUNT).fill(0.5);
    }

    // Helpers para normalizar
    const to01 = (v, max = 1) => {
      if (v === undefined || v === null || isNaN(Number(v))) return 0.5;
      const n = Number(v);
      if (max <= 0) return 0.5;
      const r = Math.min(1, Math.max(0, n / max));
      return Math.round(r * 1000) / 1000;
    };

    // 0 Make presente => 1 o 0.5
    const fMake = metadatos.Make ? 1 : 0.5;
    const fModel = metadatos.Model ? 1 : 0.5;

    // Fecha: si existe DateTimeOriginal -> plausible (0.1..0.3), si no -> alto (>0.8)
    let fFecha = 0.85;
    if (metadatos.DateTimeOriginal || metadatos.DateTime) {
      fFecha = 0.25;
    }

    const fAutor = metadatos.Artist || metadatos.Creator ? 1 : 0.5;

    // Software mapping heuristic: known IA keywords -> ~0.1, editors ~0.5, camera tools ~0.8
    const software = (metadatos.Software || metadatos.CreatorTool || "").toString().toLowerCase();
    let fSoftware = 0.5;
    if (software) {
      if (/(diffusion|midjourney|stable|dall|openai|gpt-image|imagen)/i.test(software)) fSoftware = 0.12;
      else if (/(photoshop|lightroom|gimp|affinity)/i.test(software)) fSoftware = 0.5;
      else fSoftware = 0.8;
    } else {
      fSoftware = 0.3;
    }

    // Exposure time: map fraction or seconds to [0,1] by cap e.g. 1s->1.0, 1/1000->0.01 approx.
    let expRaw = metadatos.ExposureTime || metadatos.ShutterSpeedValue || null;
    let fExpo = 0.5;
    if (expRaw) {
      // try to parse "1/125" or numeric
      try {
        let val = expRaw;
        if (typeof val === "string" && val.includes("/")) {
          const [a, b] = val.split("/").map(x => Number(x));
          if (b && !isNaN(a) && !isNaN(b)) val = a / b;
        }
        fExpo = to01(val, 1); // cap at 1s
      } catch { fExpo = 0.5; }
    }

    // ISO normalize to max 6400
    const iso = metadatos.ISOSpeedRatings || metadatos.ISO || null;
    const fISO = iso ? to01(iso, 6400) : 0.5;

    // Focal length normalize to 200mm cap
    const focal = metadatos.FocalLength || metadatos.FocalLengthIn35mmFormat || null;
    const fFocal = focal ? to01(focal, 200) : 0.5;

    // Width normalize to 8000px
    const width = metadatos.ExifImageWidth || metadatos.ImageWidth || metadatos.Width || null;
    const fWidth = width ? to01(width, 8000) : 0.5;

    const feats = [fMake, fModel, fFecha, fAutor, fSoftware, fExpo, fISO, fFocal, fWidth].map(x =>
      Number.isFinite(x) ? Math.min(1, Math.max(0, +x)) : 0.5
    );

    // Ensure length 9
    while (feats.length < FEATURE_COUNT) feats.push(0.5);

    return feats.slice(0, FEATURE_COUNT);
  } catch (e) {
    dragonLogger.sePreocupa("[EXIF MIRROR] buildFeaturesFromExifMetadatos failed", "redesEspejo/exif/modelo.js", "FEATURES_BUILD_ERROR", { error: e.message });
    return Array(FEATURE_COUNT).fill(0.5);
  }
}

/**
 * Extrae vector de 9 features FAANG desde datos.datosNormalizadosParaRedExif o desde metadatos crudos.
 * Garantiza normalización numérica y longitud exacta.
 */
function extractFeaturesFAANG(datos) {
  if (!datos || typeof datos !== "object") {
    return Array(FEATURE_COUNT).fill(0.5);
  }

  // Si ya vienen datosNormalizadosParaRedExif válidos, usar
  const raw = datos.datosNormalizadosParaRedExif || datos.datosNormalizados || null;
  if (Array.isArray(raw) && raw.length >= 1) {
    const feats = raw.slice(0, FEATURE_COUNT).map(x => {
      let v = Number(x);
      if (!Number.isFinite(v)) return 0.5;
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      return Math.round(v * 1000) / 1000;
    });
    while (feats.length < FEATURE_COUNT) feats.push(0.5);
    // sanity check: if too many values not numeric -> fallback
    const invalidCount = feats.filter(f => typeof f !== "number" || Number.isNaN(f)).length;
    if (invalidCount === 0) return feats;
    // else fallback to metadatos
  }

  // Fallback: intentar construir desde todosLosMetadatosExifParseados
  const metadatos = datos.todosLosMetadatosExifParseados || datos.metadatosExif || datos.metadatos || null;
  if (metadatos && typeof metadatos === "object") {
    const built = buildFeaturesFromExifMetadatos(metadatos);
    return built;
  }

  // Último recurso: vector neutro
  return Array(FEATURE_COUNT).fill(0.5);
}

/**
 * Clasificación y justificación forense FAANG Enterprise (idéntica a la lógica anterior,
 * pero ahora más defensiva).
 */
function classificaExifForenseFAANG(features, datos) {
  const [
    fMake,
    fModel,
    fFecha,
    fAutor,
    fSoftware,
    fExpo,
    fISO,
    fFocal,
    fWidth
  ] = features;

  let razones = [];
  let penalizaIA = false, penalizaEdicion = false, refuerzaCamara = false, refuerzaAbundancia = false;

  if (fSoftware <= 0.15) {
    razones.push("Software identificado como IA generativa (heurístico).");
    penalizaIA = true;
  }
  if (fSoftware > 0.4 && fSoftware < 0.6) {
    razones.push("Software de edición detectado (Photoshop/GIMP heurístico).");
    penalizaEdicion = true;
  }
  if (fMake > 0.9 && fModel > 0.9) {
    razones.push("Fabricante y modelo de cámara presentes.");
    refuerzaCamara = true;
  } else if (fMake > 0.9 || fModel > 0.9) {
    razones.push("Solo fabricante o modelo presentes.");
  } else {
    razones.push("Fabricante/modelo ausentes o borrados.");
  }

  if (fFecha <= 0.3) {
    razones.push("Fecha de captura plausible.");
  } else if (fFecha > 0.8) {
    razones.push("Fecha de captura ausente o incoherente.");
  }

  if (fAutor > 0.9) razones.push("Campo de autoría presente.");

  const camposPlausibles = [fExpo, fISO, fFocal, fWidth].filter(x => x > 0.4).length;
  if (camposPlausibles >= 3) {
    razones.push("Parámetros físicos plausibles (exposición, ISO, focal, dimensiones).");
    refuerzaAbundancia = true;
  } else {
    razones.push("Parámetros físicos insuficientes o dudosos.");
  }

  if (penalizaIA) {
    return {
      clase: "ai",
      warning: metodoForenseFAANG("IA", razones, features, datos)
    };
  }
  if (penalizaEdicion && !(refuerzaCamara || refuerzaAbundancia)) {
    return {
      clase: "indeterminado",
      warning: metodoForenseFAANG("INDETERMINADO (edición sin evidencia de captura)", razones, features, datos)
    };
  }
  if (refuerzaCamara && refuerzaAbundancia && !penalizaIA && !penalizaEdicion) {
    return {
      clase: "humana",
      warning: metodoForenseFAANG("HUMANO (alta confianza)", razones, features, datos)
    };
  }
  if ((refuerzaCamara || refuerzaAbundancia) && !penalizaIA && !penalizaEdicion) {
    return {
      clase: "humana",
      warning: metodoForenseFAANG("HUMANO (plausible)", razones, features, datos)
    };
  }
  return {
    clase: "indeterminado",
    warning: metodoForenseFAANG("INDETERMINADO (escaso/ambiguo)", razones, features, datos)
  };
}

function metodoForenseFAANG(tipo, razones, features, datos) {
  return [
    `Clasificación forense: ${tipo}`,
    ...razones,
    `Vector de features: [${features.map(x => x.toFixed(2)).join(", ")}]`,
    `Metadatos EXIF (sample): ${JSON.stringify(datos?.todosLosMetadatosExifParseados || datos, null, 0).slice(0, 1000)}`
  ].join(" | ");
}

/**
 * Análisis FAANG de vector de features EXIF normalizados.
 * Recibe múltiples formas de input (ver normalizeInput) y devuelve contrato estable.
 */
export async function analizar(rawInput) {
  const timestamp = new Date().toISOString();
  try {
    const { idImagen, datos } = normalizeInput(rawInput);

    // Logging inicial con resumen mínimo (no imprimir todo para no spamear)
    dragonLogger.respira("[EXIF MIRROR] analizar() invoked", "redesEspejo/exif/modelo.js", "EXIF_MIRROR_ANALYZE_INVOCED", {
      idImagen,
      hasDatos: !!datos,
      timestamp
    });

    if (!datos) {
      dragonLogger.sePreocupa("[EXIF MIRROR] No hay datos EXIF en payload", "redesEspejo/exif/modelo.js", "EXIF_MIRROR_NO_DATOS", { idImagen });
      return {
        idImagen,
        score: 0,
        clase: "indeterminado",
        warning: "No hay datos EXIF en el payload recibido.",
        features: Array(FEATURE_COUNT).fill(0.5),
        exif: datos,
        timestamp
      };
    }

    // Extraer/normalizar features
    const features = extractFeaturesFAANG(datos);

    // Inferencia con la red neuronal (robusta a excepciones)
    let score = 0;
    try {
      const out = nn.activate(features);
      score = Array.isArray(out) ? Number(out[0]) : Number(out) || 0;
      if (!Number.isFinite(score)) score = 0;
    } catch (e) {
      dragonLogger.sePreocupa("[EXIF MIRROR] NN activation failed, returning score 0", "redesEspejo/exif/modelo.js", "EXIF_MIRROR_NN_ACTIVATION_FAIL", { error: e.message });
      score = 0;
    }

    // Clasificación forense
    const { clase, warning } = classificaExifForenseFAANG(features, datos);

    dragonLogger.respira(
      "[EXIF MIRROR] Análisis completado",
      "redesEspejo/exif/modelo.js",
      "EXIF_MIRROR_ANALISIS",
      { idImagen, score, clase, timestamp }
    );

    return {
      idImagen,
      score,
      clase,     // "humana", "ai", "indeterminado"
      warning,   // explicación SIEMPRE presente
      features,  // vector de 9 features normalizados
      exif: datos, // objeto completo recibido, para trazabilidad forense
      timestamp
    };
  } catch (err) {
    dragonLogger.agoniza(
      "[EXIF MIRROR] Error en análisis",
      err,
      "redesEspejo/exif/modelo.js",
      "EXIF_MIRROR_ANALYSIS_ERROR"
    );
    return {
      idImagen: rawInput?.idImagen || rawInput?.archivoId || null,
      score: 0,
      clase: "indeterminado",
      warning: "ERROR interno: " + (err && err.message ? err.message : "unknown"),
      features: Array(FEATURE_COUNT).fill(0.5),
      exif: rawInput,
      timestamp: new Date().toISOString()
    };
  }
}

// Export default sigue proporcionando compatibilidad con distintos loaders
export default { analizar };
