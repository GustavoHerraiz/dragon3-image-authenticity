/**
 * test/celulas-verificacion.js
 * 
 * Prueba de verificación de cada célula atómica.
 * Compara los campos clave que son comparables entre la célula y una verificación independiente.
 * 
 * AHORA LEE configuracion.json para usar los mismos parámetros de optimización
 * que las células (tamañoOptimizado, calidadOptimizada).
 * 
 * Uso: node test/celulas-verificacion.js [ruta-imagen]
 * Ejemplo: node test/celulas-verificacion.js ai.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import exifParser from 'exif-parser';
import jpeg from 'jpeg-js';

// Cargar células
import cargarImagen from '../celulas/cargar-imagen.js';
import extraerMetadatosExif from '../celulas/extraer-metadatos-exif.js';
import detectarHerramientaIA from '../celulas/detectar-herramienta-ia.js';
import detectarSellosAutenticidad from '../celulas/detectar-sellos-autenticidad.js';
import detectarPatronesForenses from '../celulas/detectar-patrones-forenses.js';
import detectarDobleCompresion from '../celulas/detectar-doble-compresion-sharp.js';
import detectarArtefactosIA from '../celulas/detectar-artefactos-ia.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
//  CARGAR CONFIGURACIÓN DE OPTIMIZACIÓN
// ============================================================
const configPath = path.join(__dirname, '..', 'configuracion.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = { optimizacion: { tamañoOptimizado: 128, calidadOptimizada: 80 } };
}
const TAMAÑO_OPT = config.optimizacion?.tamañoOptimizado || 128;
const CALIDAD_OPT = config.optimizacion?.calidadOptimizada || 80;

console.log(`🔧 Usando parámetros optimizados: tamaño=${TAMAÑO_OPT}, calidad=${CALIDAD_OPT}`);

// ============================================================
//  OBTENER IMAGEN
// ============================================================
const imagenPath = process.argv[2] || 'ai.jpg';
const rutaAbsoluta = path.resolve(imagenPath);

if (!fs.existsSync(rutaAbsoluta)) {
  console.error(`❌ Imagen no encontrada: ${rutaAbsoluta}`);
  process.exit(1);
}

const buffer = fs.readFileSync(rutaAbsoluta);
const base64 = buffer.toString('base64');

console.log('🧪 VERIFICACIÓN DE CÉLULAS ATÓMICAS');
console.log('===================================');
console.log(`📷 Imagen: ${rutaAbsoluta}`);
console.log('');

// ============================================================
//  FUNCIONES DE VERIFICACIÓN INDEPENDIENTE (con parámetros optimizados)
// ============================================================

async function verificarCargarImagen(bufferOriginal) {
  try {
    const metadata = await sharp(bufferOriginal).metadata();
    return {
      formato: metadata.format,
      ancho: metadata.width,
      alto: metadata.height,
      canales: metadata.channels,
      profundidad: metadata.bitDepth || 8
    };
  } catch (error) {
    return { error: error.message };
  }
}

function verificarExtraerMetadatosExif(bufferOriginal) {
  try {
    const parser = exifParser.create(bufferOriginal);
    const result = parser.parse();
    const exif = result.tags || {};
    const campos = {
      Make: exif.Make,
      Model: exif.Model,
      DateTimeOriginal: exif.DateTimeOriginal,
      CreateDate: exif.CreateDate,
      GPSLatitude: exif.GPSLatitude,
      GPSLongitude: exif.GPSLongitude,
      Software: exif.Software,
      Copyright: exif.Copyright
    };
    const hasExif = Object.values(campos).some(v => v !== undefined && v !== null);
    const hasGPS = !!(exif.GPSLatitude && exif.GPSLongitude);
    return { exif: campos, hasExif, hasGPS };
  } catch (error) {
    return { error: error.message };
  }
}

function verificarHerramientaIA(bufferOriginal) {
  try {
    const parser = exifParser.create(bufferOriginal);
    const result = parser.parse();
    const exif = result.tags || {};
    const texto = JSON.stringify(exif);
    const patrones = [
      /midjourney/i, /dall[-]?e/i, /stable\s*diffusion/i,
      /firefly/i, /leonardo\.ai/i, /bing\s*image\s*creator/i
    ];
    const encontrados = patrones.filter(p => p.test(texto));
    const confianza = Math.min(encontrados.length * 0.15, 1);
    return {
      esIA: confianza > 0.3,
      confianza: confianza,
      herramientasEncontradas: encontrados.map(p => p.source)
    };
  } catch {
    return { esIA: false, confianza: 0, herramientasEncontradas: [] };
  }
}

function verificarSellosAutenticidad(bufferOriginal) {
  try {
    const parser = exifParser.create(bufferOriginal);
    const result = parser.parse();
    const exif = result.tags || {};
    const texto = JSON.stringify(exif);
    const patrones = [/C2PA/i, /Truepic/i, /Content\s*Credentials/i, /CAI/i];
    const encontrados = patrones.filter(p => p.test(texto));
    const confianza = Math.min(encontrados.length * 0.2, 1);
    return {
      esIA: false,
      confianza: confianza,
      sellosEncontrados: encontrados.map(p => p.source)
    };
  } catch {
    return { esIA: false, confianza: 0, sellosEncontrados: [] };
  }
}

/**
 * Verifica patrones forenses usando el MISMO tamaño optimizado que la célula.
 */
async function verificarPatronesForenses(bufferOriginal) {
  try {
    const metadata = await sharp(bufferOriginal).metadata();
    const formato = metadata.format;
    const imagenGris = await sharp(bufferOriginal)
      .grayscale()
      .resize(TAMAÑO_OPT, TAMAÑO_OPT, { fit: 'fill' })
      .raw()
      .toBuffer();
    const pixeles = new Uint8Array(imagenGris);
    const lado = TAMAÑO_OPT;
    const total = pixeles.length;
    // Aplicar filtro de paso alto (media 3x3)
    const ruido = new Float32Array(total);
    for (let y = 1; y < lado - 1; y++) {
      for (let x = 1; x < lado - 1; x++) {
        const idx = y * lado + x;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ni = (y + dy) * lado + (x + dx);
            sum += pixeles[ni];
          }
        }
        const mediaLocal = sum / 9;
        ruido[idx] = pixeles[idx] - mediaLocal;
      }
    }
    let mediaRuido = 0;
    for (let i = 0; i < total; i++) mediaRuido += ruido[i];
    mediaRuido /= total;
    let varianzaRuido = 0;
    for (let i = 0; i < total; i++) {
      varianzaRuido += (ruido[i] - mediaRuido) ** 2;
    }
    varianzaRuido /= total;
    return { formato, varianzaRuido };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Verifica doble compresión usando la MISMA calidad optimizada que la célula.
 */
async function verificarDobleCompresion(bufferOriginal) {
  try {
    const metadata = await sharp(bufferOriginal).metadata();
    if (metadata.format !== 'jpeg') {
      return { error: 'No es JPEG' };
    }
    const tamañoOriginal = bufferOriginal.length;
    const recompressed = await sharp(bufferOriginal)
      .jpeg({ quality: CALIDAD_OPT, force: false })
      .toBuffer();
    const tamañoRecomp = recompressed.length;
    const diferencia = (tamañoOriginal - tamañoRecomp) / tamañoOriginal;
    const dobleCompresionTamanio = diferencia > 0.05;
    let tablaAnomala = false;
    try {
      const decoded = jpeg.decode(bufferOriginal, { useTArray: true });
      const qt = decoded.quantizationTables;
      if (qt && qt.length > 0) {
        const tabla = qt[0];
        let suma = 0;
        for (let i = 0; i < tabla.length; i++) suma += tabla[i];
        const promedio = suma / tabla.length;
        if (promedio < 5 || promedio > 50) tablaAnomala = true;
      }
    } catch (e) {}
    return { dobleCompresionTamanio, diferencia, tamañoOriginal, tamañoRecomp, tablaAnomala };
  } catch (error) {
    return { error: error.message };
  }
}

async function verificarArtefactosIA(bufferOriginal) {
  try {
    const imagen = await sharp(bufferOriginal)
      .grayscale()
      .resize(128, 128, { fit: 'fill' })
      .raw()
      .toBuffer();
    const pixeles = new Uint8Array(imagen);
    const total = pixeles.length;
    let media = 0;
    for (let i = 0; i < total; i++) media += pixeles[i];
    media /= total;
    const numBloques = 8;
    const lado = 128;
    const bloqueSize = lado / numBloques;
    let varianzaLocalPromedio = 0;
    for (let by = 0; by < numBloques; by++) {
      for (let bx = 0; bx < numBloques; bx++) {
        let sum = 0, count = 0;
        const yStart = by * bloqueSize;
        const yEnd = (by + 1) * bloqueSize;
        const xStart = bx * bloqueSize;
        const xEnd = (bx + 1) * bloqueSize;
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = y * lado + x;
            sum += pixeles[idx];
            count++;
          }
        }
        const mediaLocal = sum / count;
        let varLocal = 0;
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = y * lado + x;
            varLocal += (pixeles[idx] - mediaLocal) ** 2;
          }
        }
        varLocal /= count;
        varianzaLocalPromedio += varLocal;
      }
    }
    varianzaLocalPromedio /= (numBloques * numBloques);
    let autocorrelacion = 0;
    for (let i = 0; i < total - 1; i++) {
      autocorrelacion += (pixeles[i] - media) * (pixeles[i+1] - media);
    }
    autocorrelacion /= (total - 1);
    const ruidoUniforme = varianzaLocalPromedio < 40;
    const ruidoPeriodico = Math.abs(autocorrelacion) > 800;
    const esIA = ruidoUniforme || ruidoPeriodico;
    const confianza = (ruidoUniforme ? 0.3 : 0) + (ruidoPeriodico ? 0.4 : 0);
    return { esIA, confianza, varianzaLocalPromedio, autocorrelacion };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================================
//  COMPARACIÓN CON TOLERANCIA
// ============================================================

function compararCampos(obtenido, esperado, campos, tolerancias = {}) {
  const diferencias = [];
  for (const campo of campos) {
    const valObtenido = obtenido[campo];
    const valEsperado = esperado[campo];
    const tol = tolerancias[campo] || 0;
    if (typeof valObtenido === 'number' && typeof valEsperado === 'number') {
      if (Math.abs(valObtenido - valEsperado) > tol) {
        diferencias.push({ campo, esperado: valEsperado, obtenido: valObtenido, tolerancia: tol });
      }
    } else {
      if (valObtenido !== valEsperado) {
        diferencias.push({ campo, esperado: valEsperado, obtenido: valObtenido });
      }
    }
  }
  return diferencias;
}

// ============================================================
//  EJECUCIÓN DE PRUEBAS
// ============================================================

const resultados = {};

console.log('🔬 Ejecutando verificación de células...\n');

// 1. cargar-imagen
console.log('📌 Verificando cargar-imagen...');
const celdaCargar = await cargarImagen({ payload: base64 }, {});
const verifCargar = await verificarCargarImagen(buffer);
const difsCargar = compararCampos(celdaCargar.resultado, verifCargar, ['formato', 'ancho', 'alto', 'canales', 'profundidad']);
resultados['cargar-imagen'] = { celula: celdaCargar.resultado, verificacion: verifCargar, coincide: difsCargar.length === 0, diferencias: difsCargar };

// 2. extraer-metadatos-exif
console.log('📌 Verificando extraer-metadatos-exif...');
const celdaExif = await extraerMetadatosExif({ payload: celdaCargar.resultado }, {});
const verifExif = verificarExtraerMetadatosExif(buffer);
const difsExif = compararCampos(celdaExif.resultado, verifExif, ['hasExif', 'hasGPS']);
resultados['extraer-metadatos-exif'] = { celula: celdaExif.resultado, verificacion: verifExif, coincide: difsExif.length === 0, diferencias: difsExif };

// 3. detectar-herramienta-ia
console.log('📌 Verificando detectar-herramienta-ia...');
const celdaHerramienta = await detectarHerramientaIA({ payload: celdaExif.resultado }, {});
const verifHerramienta = verificarHerramientaIA(buffer);
const difsHerramienta = compararCampos(celdaHerramienta.resultado, verifHerramienta, ['esIA', 'confianza']);
resultados['detectar-herramienta-ia'] = { celula: celdaHerramienta.resultado, verificacion: verifHerramienta, coincide: difsHerramienta.length === 0, diferencias: difsHerramienta };

// 4. detectar-sellos-autenticidad
console.log('📌 Verificando detectar-sellos-autenticidad...');
const celdaSellos = await detectarSellosAutenticidad({ payload: celdaExif.resultado }, {});
const verifSellos = verificarSellosAutenticidad(buffer);
const difsSellos = compararCampos(celdaSellos.resultado, verifSellos, ['esIA']);
resultados['detectar-sellos-autenticidad'] = { celula: celdaSellos.resultado, verificacion: verifSellos, coincide: difsSellos.length === 0, diferencias: difsSellos };

// 5. detectar-patrones-forenses (con tolerancia ampliada)
console.log('📌 Verificando detectar-patrones-forenses...');
const celdaPatrones = await detectarPatronesForenses({ payload: celdaCargar.resultado }, {});
const verifPatrones = await verificarPatronesForenses(buffer);
const difsPatrones = compararCampos(celdaPatrones.resultado, verifPatrones, ['formato', 'varianzaRuido'], { varianzaRuido: 200 });
resultados['detectar-patrones-forenses'] = { celula: celdaPatrones.resultado, verificacion: verifPatrones, coincide: difsPatrones.length === 0, diferencias: difsPatrones };

// 6. detectar-doble-compresion-sharp (con tolerancia ampliada)
console.log('📌 Verificando detectar-doble-compresion-sharp...');
const celdaDoble = await detectarDobleCompresion({ payload: celdaCargar.resultado }, {});
const verifDoble = await verificarDobleCompresion(buffer);
const difsDoble = compararCampos(celdaDoble.resultado, verifDoble, ['dobleCompresionTamanio', 'diferencia', 'tablaAnomala'], { diferencia: 0.1 });
resultados['detectar-doble-compresion-sharp'] = { celula: celdaDoble.resultado, verificacion: verifDoble, coincide: difsDoble.length === 0, diferencias: difsDoble };

// 7. detectar-artefactos-ia
console.log('📌 Verificando detectar-artefactos-ia...');
const celdaArtefactos = await detectarArtefactosIA({ payload: celdaCargar.resultado }, {});
const verifArtefactos = await verificarArtefactosIA(buffer);
const difsArtefactos = compararCampos(celdaArtefactos.resultado, verifArtefactos, ['esIA', 'confianza', 'varianzaLocalPromedio', 'autocorrelacion'], { confianza: 0.0001, varianzaLocalPromedio: 1, autocorrelacion: 1 });
resultados['detectar-artefactos-ia'] = { celula: celdaArtefactos.resultado, verificacion: verifArtefactos, coincide: difsArtefactos.length === 0, diferencias: difsArtefactos };

// ============================================================
//  RESUMEN FINAL
// ============================================================

console.log('\n📊 RESUMEN DE VERIFICACIÓN DE CÉLULAS');
console.log('======================================');
let todasCoinciden = true;
for (const [nombre, res] of Object.entries(resultados)) {
  const estado = res.coincide ? '✅' : '❌';
  console.log(`${estado} ${nombre}: coincide=${res.coincide}`);
  if (!res.coincide) {
    todasCoinciden = false;
    console.log(`   ❌ Diferencias encontradas:`);
    for (const diff of res.diferencias) {
      const msg = diff.tolerancia !== undefined
        ? `${diff.campo}: esperado=${diff.esperado}, obtenido=${diff.obtenido} (tol=${diff.tolerancia})`
        : `${diff.campo}: esperado=${diff.esperado}, obtenido=${diff.obtenido}`;
      console.log(`      - ${msg}`);
    }
  }
  // Mostrar resumen
  const celKeys = Object.keys(res.celula).slice(0, 4).join(', ');
  const verKeys = Object.keys(res.verificacion).slice(0, 4).join(', ');
  console.log(`   Célula (${celKeys}): ${JSON.stringify(res.celula).substring(0, 150)}...`);
  console.log(`   Verif  (${verKeys}): ${JSON.stringify(res.verificacion).substring(0, 150)}...`);
}

console.log('');
if (todasCoinciden) {
  console.log('✅ TODAS LAS CÉLULAS COINCIDEN CON LA VERIFICACIÓN INDEPENDIENTE.');
} else {
  console.log('❌ ALGUNA CÉLULA NO COINCIDE. REVISAR LAS DIFERENCIAS INDICADAS.');
}

console.log('\n✅ Prueba finalizada.');