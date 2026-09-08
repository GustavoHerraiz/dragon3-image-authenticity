import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar todas las células
import cargarImagen from '../celulas/cargar-imagen.js';
import extraerMetadatos from '../celulas/extraer-metadatos-exif.js';
import detectarHerramientaIA from '../celulas/detectar-herramienta-ia.js';
import detectarSellos from '../celulas/detectar-sellos-autenticidad.js';
import detectarPatrones from '../celulas/detectar-patrones-forenses.js';
import detectarArtefactos from '../celulas/detectar-artefactos-ia.js';
import detectarTextura from '../celulas/detectar-textura-ruido.js';
import generarVeredicto from '../celulas/generar-veredicto.js';

async function testHumana() {
  try {
    console.log('========================================');
    console.log('🧪 PRUEBA CON IMAGEN HUMANA (prueba.jpg)');
    console.log('========================================\n');
    
    // 1. Cargar imagen
    const imagePath = path.join(__dirname, '..', 'prueba.jpg');
    const buffer = fs.readFileSync(imagePath);
    const base64 = buffer.toString('base64');
    
    const carga = await cargarImagen({ payload: base64 }, {});
    if (!carga.exito) throw new Error('Error en cargar-imagen: ' + carga.error);
    console.log('✅ cargar-imagen');
    
    // 2-7. Ejecutar todas las células
    const exif = await extraerMetadatos({ payload: carga.resultado }, {});
    console.log('✅ extraer-metadatos-exif');
    
    const herramienta = await detectarHerramientaIA({ payload: exif.resultado }, {});
    console.log('✅ detectar-herramienta-ia');
    
    const sellos = await detectarSellos({ 
      payload: { 
        exif: exif.resultado.exif,
        hasExif: exif.resultado.hasExif,
        raw: exif.resultado.metadatosCompletos,
        metadatosCompletos: exif.resultado.metadatosCompletos,
        buffer: carga.resultado.buffer,
        hash: carga.resultado.hash
      }
    }, {});
    console.log('✅ detectar-sellos-autenticidad');
    
    const forenses = await detectarPatrones({ payload: carga.resultado }, {});
    console.log('✅ detectar-patrones-forenses');
    
    const artefactos = await detectarArtefactos({ payload: carga.resultado }, {});
    console.log('✅ detectar-artefactos-ia');
    
    const textura = await detectarTextura({ payload: carga.resultado }, {});
    console.log('✅ detectar-textura-ruido');
    
    // 8. Generar veredicto
    const veredicto = await generarVeredicto({
      payload: {
        'detectar-herramienta-ia': herramienta.resultado,
        'detectar-sellos-autenticidad': sellos.resultado,
        'detectar-patrones-forenses': forenses.resultado,
        'detectar-artefactos-ia': artefactos.resultado,
        'detectar-textura-ruido': textura.resultado,
        'extraer-metadatos-exif': exif.resultado
      }
    }, {});
    
    console.log('✅ generar-veredicto');
    console.log('\n========================================');
    console.log('📊 VEREDICTO FINAL');
    console.log('========================================');
    console.log('🤖 ¿Es IA?', veredicto.resultado.esIA);
    console.log('📊 Confianza:', (veredicto.resultado.confianza * 100).toFixed(1) + '%');
    console.log('📝 Explicación:', veredicto.resultado.explicacion);
    console.log('========================================');
    console.log('📊 Detalles:');
    console.log('   - Células procesadas:', veredicto.resultado.detalles.totalCelulas);
    console.log('   - Votos IA:', veredicto.resultado.detalles.votosIA);
    console.log('   - Votos Humano:', veredicto.resultado.detalles.votosHumano);
    console.log('   - Confianza IA:', (veredicto.resultado.detalles.confianzaIA * 100).toFixed(1) + '%');
    console.log('   - Decisión por:', veredicto.resultado.detalles.decisionPor);
    console.log('========================================');
    console.log('🔍 Resultados individuales:');
    veredicto.resultado.detalles.resultados.forEach(r => {
      const decision = r.esIA ? 'IA' : 'Humano';
      console.log(`   - ${r.celula}: ${decision} (conf: ${(r.confianza * 100).toFixed(0)}%, peso: ${r.peso})`);
    });
    console.log('========================================');
    
    // Mostrar tiempos de forenses
    const forensesData = veredicto.resultado.detalles.resultados.find(r => r.celula === 'detectar-patrones-forenses');
    if (forensesData && forensesData.tiempoProcesamientoMs) {
      console.log('⏱️  Tiempo detectar-patrones-forenses:', forensesData.tiempoProcesamientoMs.toFixed(2), 'ms');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

testHumana();
