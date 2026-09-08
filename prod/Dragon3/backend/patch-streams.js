/**
 * @file patch-streams.js
 * @description FAANG Hot-patch para GestorStreamsBidireccionalFAANG
 * @author Gustavo Herraiz
 * @date 2025-06-29
 */

import dragon from './utilidades/logger.js';
import fs from 'fs/promises';

async function aplicarPatch() {
  try {
    const archivoRuta = './servicios/imagen/analizadorImagen.js';
    const contenido = await fs.readFile(archivoRuta, 'utf8');
    
    // Buscar la función createConsumerGroupWithRetry y reemplazar su implementación
    let nuevaFuncion = `async createConsumerGroupWithRetry(stream, group, startId = '$', maxAttempts = 3) {
    // DESACTIVADO: Verificar si Redis Streams está disponible
    dragon.sePreocupa(\`[FAANG SAFE MODE] Consumer group creation bypassed for \${group}\`, {
      modulo: this.moduleName,
      stream,
      group,
      operation: 'createConsumerGroupWithRetry'
    });
    
    // Simular éxito sin intentar crear el grupo
    return {
      success: true,
      stream,
      group,
      mock: true
    };
  }`;
    
    // Utilizar regex para encontrar y reemplazar la función
    const regex = /async createConsumerGroupWithRetry\([^{]+{[\s\S]+?(?=})\s+}/;
    const patchedContenido = contenido.replace(regex, nuevaFuncion);
    
    // Verificar que se realizó el reemplazo
    if (patchedContenido === contenido) {
      throw new Error('No se encontró la función createConsumerGroupWithRetry');
    }
    
    await fs.writeFile(archivoRuta, patchedContenido);
    
    dragon.sonrie('🛡️ Patch aplicado correctamente al GestorStreamsBidireccionalFAANG', {
      modulo: 'patch-streams',
      timestamp: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    dragon.agoniza('❌ Error aplicando patch a GestorStreamsBidireccionalFAANG', error);
    return false;
  }
}

// Auto-ejecutar el patch
aplicarPatch().then(success => {
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
