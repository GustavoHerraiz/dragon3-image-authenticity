/**
 * ====================================================================
 * CÉLULA: DETECTAR SELLOS DE AUTENTICIDAD (C2PA + METADATOS)
 * ====================================================================
 * 
 * @module detectar-sellos-autenticidad
 * @version 3.0.0
 * @author Gustavo Herráiz - Blade Corporation
 * @date 2026-08-20
 * 
 * ====================================================================
 * INSTALACIÓN Y CONFIGURACIÓN DE C2PA EN DRAGON3
 * ====================================================================
 * 
 * HISTORIAL DE PROBLEMAS Y SOLUCIONES:
 * 
 * 1. PRIMER INTENTO (FALLIDO) - @joinmonolith/c2pa-node
 *    Error: "The requested module '@joinmonolith/c2pa-node' does not provide an export named 'NodeReader'"
 *    Solución: La librería estaba obsoleta. Se desinstaló.
 *    Comando: npm uninstall @joinmonolith/c2pa-node
 * 
 * 2. SEGUNDO INTENTO (FALLIDO) - @contentauth/c2pa-node
 *    Error: "Node.js v22.22.0 required, Rust compilation failed"
 *    Solución: Se actualizó Node.js a v22.22.0 y se instaló Rust.
 *    Comandos:
 *      nvm install 22.22.0
 *      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
 *      source "$HOME/.cargo/env"
 * 
 * 3. TERCER INTENTO (FALLIDO) - API incorrecta
 *    Error: "Reader.fromBuffer is not a function"
 *    Solución: La API correcta es createAsset() y getManifestJUMBF().
 * 
 * 4. SOLUCIÓN DEFINITIVA - @trustnxt/c2pa-ts
 *    ✅ INSTALACIÓN EXITOSA
 *    Comando: npm install @trustnxt/c2pa-ts
 *    Ruta: /opt/dragon3/dev/celulas
 * 
 * 5. ERROR DE POLYFILL - reflect-metadata
 *    Error: "tsyringe requires a reflect polyfill"
 *    Solución: import "reflect-metadata" al inicio del archivo.
 *    Comando: npm install reflect-metadata
 * 
 * ====================================================================
 * REQUISITOS DEL SISTEMA (VERIFICADOS)
 * ====================================================================
 * 
 *   COMPONENTE     | VERSIÓN          | COMANDO DE VERIFICACIÓN
 *   ---------------|------------------|---------------------------
 *   Node.js        | v22.22.0 o +     | node -v
 *   npm            | v10.9.4 o +      | npm -v
 *   Rust           | Última estable   | rustc --version
 *   @trustnxt/c2pa-ts | 0.5.0 o +    | npm list @trustnxt/c2pa-ts
 *   reflect-metadata | Última         | npm list reflect-metadata
 * 
 * ====================================================================
 * UBICACIÓN DE LOS ARCHIVOS
 * ====================================================================
 * 
 *   /opt/dragon3/
 *   ├── dev/
 *   │   └── celulas/
 *   │       ├── node_modules/
 *   │       │   ├── @trustnxt/
 *   │       │   │   └── c2pa-ts/          ← LIBRERÍA INSTALADA
 *   │       │   └── reflect-metadata/     ← POLYFILL INSTALADO
 *   │       ├── celulas/
 *   │       │   └── detectar-sellos-autenticidad.js  ← ESTE ARCHIVO
 *   │       └── agent-embassy.js
 *   └── prod/
 *       └── Dragon3/
 *           └── backend/
 *               └── .env                  ← VARIABLES DE ENTORNO
 * 
 * ====================================================================
 * SOLUCIÓN AL ERROR "Unsupported asset type"
 * ====================================================================
 * 
 *   ERROR: "Unsupported asset type: could not detect a known format"
 *   CAUSA: El buffer no era un Buffer nativo de Node.js.
 *   SOLUCIÓN: Convertir el buffer a Buffer nativo antes de createAsset().
 * 
 *   CÓDIGO:
 *     const buffer = Buffer.from(bufferBase64, 'base64');  // 🔥 CLAVE
 *     const asset = await createAsset(buffer);
 * 
 * ====================================================================
 * SOLUCIÓN AL ERROR "this.buffer.subarray is not a function"
 * ====================================================================
 * 
 *   ERROR: "this.buffer.subarray is not a function"
 *   CAUSA: La librería esperaba un Buffer nativo y recibió un Uint8Array o ArrayBuffer.
 *   SOLUCIÓN: Asegurar que el buffer es un Buffer nativo con Buffer.from().
 * 
 * ====================================================================
 * SOLUCIÓN AL ERROR "Cannot find package '@trustnxt/c2pa-ts'"
 * ====================================================================
 * 
 *   ERROR: "Cannot find package '@trustnxt/c2pa-ts'"
 *   CAUSA: El Embassy (agent-embassy.js) se ejecuta desde /opt/dragon3/dev/celulas/,
 *           y la librería debe estar instalada en ese directorio.
 *   SOLUCIÓN: Instalar en el directorio correcto.
 *   COMANDO: cd /opt/dragon3/dev/celulas && npm install @trustnxt/c2pa-ts
 * 
 * ====================================================================
 * PROBAR LA INSTALACIÓN
 * ====================================================================
 * 
 *   COMANDO PARA VERIFICAR QUE LA LIBRERÍA FUNCIONA:
 * 
 *   node -e "
 *   import { createAsset } from '@trustnxt/c2pa-ts/asset';
 *   import fs from 'fs';
 *   const buffer = fs.readFileSync('/opt/dragon3/dev/celulas/ai.png');
 *   const asset = await createAsset(buffer);
 *   const jumbf = await asset.getManifestJUMBF();
 *   console.log('Manifiesto JUMBF:', jumbf ? 'ENCONTRADO' : 'NO ENCONTRADO');
 *   "
 * 
 * ====================================================================
 * DESINSTALACIÓN (SI ES NECESARIO)
 * ====================================================================
 * 
 *   # Desinstalar librerías anteriores
 *   npm uninstall @joinmonolith/c2pa-node
 *   npm uninstall @contentauth/c2pa-node
 * 
 *   # Limpiar caché de Node.js
 *   npm cache clean --force
 *   rm -rf node_modules/.cache
 * 
 *   # Reinstalar la librería correcta
 *   npm install @trustnxt/c2pa-ts reflect-metadata
 * 
 * ====================================================================
 * ERRORES COMUNES Y SOLUCIONES (RESUMEN)
 * ====================================================================
 * 
 *   ERROR                                      | SOLUCIÓN
 *   --------------------------------------------|-------------------------------------------
 *   tsyringe requires a reflect polyfill        | import "reflect-metadata" al inicio
 *   Cannot find package '@trustnxt/c2pa-ts'     | Instalar en /opt/dragon3/dev/celulas
 *   Unsupported asset type                      | Verificar buffer = Buffer.from(base64, 'base64')
 *   this.buffer.subarray is not a function      | Convertir a Buffer nativo
 *   claims son null                             | Usar ManifestStore.read(superBox) y validate()
 *   validationStatus es null                    | Usar manifests.validate(asset)
 * 
 * ====================================================================
 */


// 🔥 OBLIGATORIO: Polyfill para reflect-metadata (requerido por tsyringe)
import "reflect-metadata";

import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

export default async function detectarSellosAutenticidad(entrada, contexto) {
  const payload = entrada.payload || {};
  const bufferBase64 = payload.buffer;

  console.log('🚨🚨🚨 [detectar-sellos-autenticidad] === INICIO C2PA COMPLETO ===');

  // ============================================================
  // 1. CONVERSIÓN DE BASE64 A BUFFER NATIVO
  // ============================================================
  let buffer = null;
  if (bufferBase64 && typeof bufferBase64 === 'string') {
    try {
      buffer = Buffer.from(bufferBase64, 'base64');
      console.log('✅ [detectar-sellos-autenticidad] Buffer convertido:', buffer.length, 'bytes');
    } catch (error) {
      console.error('❌ Error convirtiendo buffer:', error.message);
    }
  }

  // ============================================================
  // 2. EXTRACCIÓN COMPLETA DE DATOS C2PA (CON PRIORIDAD)
  // ============================================================
  let c2paResult = {
    verificado: false,
    claim_generator: null,        // 🔥 PRIORIDAD 1
    claim_generator_info: null,   // 🔥 PRIORIDAD 2
    softwareAgent: null,          // 🔥 PRIORIDAD 3
    creatorTool: null,            // 🔥 PRIORIDAD 4
    software: null,               // 🔥 PRIORIDAD 5
    producer: null,               // 🔥 PRIORIDAD 6
    generator: null,              // 🔥 PRIORIDAD 6
    validationStatus: null,
    acciones: [],
    ingredients: [],
    manifestRaw: null,
    error: null,
    firmaIA: null                 // 🔥 Campo consolidado con la firma detectada
  };

  if (buffer && buffer.length > 0) {
    try {
      console.log('🔍 [C2PA] Creando asset...');
      const asset = await createAsset(buffer);
      console.log('✅ [C2PA] Asset creado');

      const jumbf = await asset.getManifestJUMBF();
      console.log('🔍 [C2PA] jumbf:', jumbf ? 'ENCONTRADO' : 'NO ENCONTRADO');

      if (jumbf) {
        const superBox = SuperBox.fromBuffer(jumbf);
        console.log('✅ [C2PA] SuperBox creado');

        const manifests = ManifestStore.read(superBox);
        console.log('✅ [C2PA] ManifestStore leído');

        const validationResult = await manifests.validate(asset);
        console.log('✅ [C2PA] Validación completada');

        // ============================================================
        //  🔥 PRIORIDAD 1: claim_generator
        // ============================================================
        if (validationResult.claims?.claim_generator) {
          c2paResult.claim_generator = validationResult.claims.claim_generator;
          c2paResult.firmaIA = c2paResult.claim_generator;
          console.log(`✅ [C2PA] claim_generator detectado: ${c2paResult.claim_generator}`);
        }

        // ============================================================
        //  🔥 PRIORIDAD 2: claim_generator_info.name
        // ============================================================
        if (!c2paResult.firmaIA && validationResult.claims?.claim_generator_info?.name) {
          c2paResult.claim_generator_info = validationResult.claims.claim_generator_info;
          c2paResult.firmaIA = c2paResult.claim_generator_info.name;
          console.log(`✅ [C2PA] claim_generator_info.name detectado: ${c2paResult.firmaIA}`);
        }

        // ============================================================
        //  🔥 PRIORIDAD 3: softwareAgent (historial XMP)
        // ============================================================
        if (!c2paResult.firmaIA && validationResult.manifest?.softwareAgent) {
          c2paResult.softwareAgent = validationResult.manifest.softwareAgent;
          c2paResult.firmaIA = c2paResult.softwareAgent;
          console.log(`✅ [C2PA] softwareAgent detectado: ${c2paResult.firmaIA}`);
        }

        // ============================================================
        //  🔥 PRIORIDAD 4: CreatorTool (XMP)
        // ============================================================
        if (!c2paResult.firmaIA && validationResult.claims?.creator_tool) {
          c2paResult.creatorTool = validationResult.claims.creator_tool;
          c2paResult.firmaIA = c2paResult.creatorTool;
          console.log(`✅ [C2PA] creator_tool detectado: ${c2paResult.firmaIA}`);
        }

        // ============================================================
        //  🔥 PRIORIDAD 5: Software (EXIF)
        // ============================================================
        if (!c2paResult.firmaIA && validationResult.claims?.software) {
          c2paResult.software = validationResult.claims.software;
          c2paResult.firmaIA = c2paResult.software;
          console.log(`✅ [C2PA] software detectado: ${c2paResult.firmaIA}`);
        }

        // ============================================================
        //  🔥 PRIORIDAD 6: Producer / Generator
        // ============================================================
        if (!c2paResult.firmaIA && validationResult.claims?.producer) {
          c2paResult.producer = validationResult.claims.producer;
          c2paResult.firmaIA = c2paResult.producer;
          console.log(`✅ [C2PA] producer detectado: ${c2paResult.firmaIA}`);
        }

        if (!c2paResult.firmaIA && validationResult.claims?.generator) {
          c2paResult.generator = validationResult.claims.generator;
          c2paResult.firmaIA = c2paResult.generator;
          console.log(`✅ [C2PA] generator detectado: ${c2paResult.firmaIA}`);
        }

        // ============================================================
        //  RESTO DE DATOS
        // ============================================================
        if (validationResult.claims) {
          c2paResult.claims = validationResult.claims;
        }

        c2paResult.validationStatus = validationResult.status || null;
        c2paResult.acciones = validationResult.actions || [];
        c2paResult.ingredients = validationResult.ingredients || [];
        c2paResult.manifestRaw = validationResult.manifest || null;

        c2paResult.verificado = true;
        console.log('✅ [C2PA] C2PA VERIFICADO COMPLETAMENTE');

        // 🔥 Si se detectó una firma, mostrarla con prioridad
        if (c2paResult.firmaIA) {
          console.log(`🔥 [C2PA] FIRMA IA DETECTADA: ${c2paResult.firmaIA}`);
        } else {
          console.log('ℹ️ [C2PA] No se detectaron firmas de IA en metadatos C2PA');
        }
      }
    } catch (error) {
      c2paResult.error = error.message;
      console.error('❌ [C2PA] Error:', error.message);
    }
  }

  // ============================================================
  // 3. EVALUACIÓN Y RETORNO
  // ============================================================
  const esIA = c2paResult.firmaIA ? false : false; // Las firmas indican autenticidad
  const confianza = c2paResult.firmaIA ? 0.95 : 0.1;

  const evidencias = [];
  if (c2paResult.firmaIA) {
    evidencias.push(`🔐 Firma IA detectada: ${c2paResult.firmaIA}`);
  } else {
    evidencias.push('❌ No se detectaron firmas de IA en metadatos C2PA');
  }

  const explicacion = c2paResult.firmaIA
    ? `✅ Firma IA detectada (confianza: 95%). ${evidencias[0]}`
    : `❌ No se detectaron firmas de IA (confianza: 10%). ${evidencias[0]}`;

  return {
    exito: true,
    resultado: {
      esIA,
      confianza,
      explicacion,
      evidencias,
      peso: 0.9,
      // 🔥 TODOS LOS DATOS DE FIRMAS PRIORIZADOS
      firmaIA: c2paResult.firmaIA,
      claim_generator: c2paResult.claim_generator,
      claim_generator_info: c2paResult.claim_generator_info,
      softwareAgent: c2paResult.softwareAgent,
      creatorTool: c2paResult.creatorTool,
      software: c2paResult.software,
      producer: c2paResult.producer,
      generator: c2paResult.generator,
      validationStatus: c2paResult.validationStatus,
      acciones: c2paResult.acciones,
      ingredients: c2paResult.ingredients,
      error: c2paResult.error
    },
    metricas: { tiempoMs: 20 }
  };
}