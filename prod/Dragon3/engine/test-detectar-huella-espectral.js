import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import detectarHuellaEspectral from './celulas/detectar-huella-espectral.js';

const DECISIONES_VALIDAS = new Set(['IA_EVIDENTE', 'HUMANO_EVIDENTE', 'INDETERMINADO', 'ERROR']);

function assertContratoBasico(res, { permitirFallo = false } = {}) {
  assert.equal(typeof res, 'object', 'La respuesta debe ser un objeto');
  assert.equal(typeof res.exito, 'boolean', 'exito debe ser booleano');
  if (!permitirFallo) {
    assert.equal(res.exito, true, 'Se esperaba exito=true para una entrada válida');
  }

  assert.equal(typeof res.resultado, 'object', 'resultado debe ser un objeto');
  assert.equal(typeof res.resultado.esIA, 'boolean', 'resultado.esIA debe ser booleano');
  assert.equal(typeof res.resultado.confianza, 'number', 'resultado.confianza debe ser number');
  assert.ok(res.resultado.confianza >= 0 && res.resultado.confianza <= 1, 'resultado.confianza debe estar en [0,1]');
  assert.equal(typeof res.resultado.explicacion, 'string', 'resultado.explicacion debe ser string');
  assert.ok(Array.isArray(res.resultado.evidencias), 'resultado.evidencias debe ser array');
  assert.equal(typeof res.resultado.peso, 'number', 'resultado.peso debe ser number');
  assert.ok(DECISIONES_VALIDAS.has(res.resultado.decision), `decision fuera de enum: ${res.resultado.decision}`);

  assert.equal(typeof res.metricas, 'object', 'metricas debe ser un objeto');
  assert.equal(typeof res.metricas.tiempoMs, 'number', 'metricas.tiempoMs debe ser number');
  assert.ok(res.metricas.tiempoMs >= 0, 'metricas.tiempoMs no puede ser negativo');

  assert.equal(typeof res.contexto, 'object', 'contexto debe ser un objeto (aunque vacío)');

  // Nunca debe filtrarse un Buffer binario completo en la respuesta pública.
  const serializado = JSON.stringify(res);
  assert.doesNotMatch(serializado, /"type":"Buffer"/, 'La respuesta no debe contener un Buffer serializado');
}

async function main() {
  const rutaTest = '/opt/dragon3/prod/Dragon3/test.jpg';
  assert.ok(fs.existsSync(rutaTest), `No existe la imagen de prueba: ${rutaTest}`);
  const bufferReal = fs.readFileSync(rutaTest);

  // ============================================================
  // 1. Entrada válida: Buffer nativo
  // ============================================================
  const res1 = await detectarHuellaEspectral({ payload: bufferReal }, { correlationId: 'test-1' });
  assertContratoBasico(res1);
  assert.equal(res1.contexto.correlationId, 'test-1', 'El contexto debe propagarse sin alterarse');
  console.log(`OK 1: Buffer nativo -> decision=${res1.resultado.decision} tiempoMs=${res1.metricas.tiempoMs.toFixed(2)}`);

  // ============================================================
  // 2. Entrada válida: string base64
  // ============================================================
  const base64 = bufferReal.toString('base64');
  const res2 = await detectarHuellaEspectral({ payload: base64 }, {});
  assertContratoBasico(res2);
  console.log(`OK 2: string base64 -> decision=${res2.resultado.decision}`);

  // ============================================================
  // 3. Entrada válida: string base64 con prefijo data URL
  // ============================================================
  const res3 = await detectarHuellaEspectral({ payload: `data:image/jpeg;base64,${base64}` }, {});
  assertContratoBasico(res3);
  console.log('OK 3: data URL con prefijo base64 aceptada');

  // ============================================================
  // 4. Entrada válida: objeto { buffer: base64 }
  // ============================================================
  const res4 = await detectarHuellaEspectral({ payload: { buffer: base64 } }, {});
  assertContratoBasico(res4);
  console.log('OK 4: objeto { buffer: base64 } aceptado');

  // ============================================================
  // 5. Entrada válida: objeto { bufferBase64 }
  // ============================================================
  const res5 = await detectarHuellaEspectral({ payload: { bufferBase64: base64 } }, {});
  assertContratoBasico(res5);
  console.log('OK 5: objeto { bufferBase64 } aceptado');

  // ============================================================
  // 6. Entrada válida: objeto { data }
  // ============================================================
  const res6 = await detectarHuellaEspectral({ payload: { data: base64 } }, {});
  assertContratoBasico(res6);
  console.log('OK 6: objeto { data } aceptado');

  // ============================================================
  // 7. Entrada válida: objeto { buffer: Buffer real }
  // ============================================================
  const res7 = await detectarHuellaEspectral({ payload: { buffer: bufferReal } }, {});
  assertContratoBasico(res7);
  console.log('OK 7: objeto { buffer: Buffer } aceptado');

  // ============================================================
  // 8. Entrada inválida: payload ausente -> no debe lanzar excepción
  // ============================================================
  const res8 = await detectarHuellaEspectral({ payload: undefined }, {});
  assertContratoBasico(res8, { permitirFallo: true });
  assert.equal(res8.exito, false, 'payload ausente debe producir exito=false, no una excepción');
  console.log('OK 8: payload ausente manejado sin lanzar excepción');

  // ============================================================
  // 9. Entrada inválida: tipo no soportado (number) -> no debe lanzar
  // ============================================================
  const res9 = await detectarHuellaEspectral({ payload: 12345 }, {});
  assertContratoBasico(res9, { permitirFallo: true });
  assert.equal(res9.exito, false, 'tipo no soportado debe producir exito=false');
  console.log('OK 9: payload de tipo no soportado manejado sin lanzar excepción');

  // ============================================================
  // 10. Entrada inválida: buffer vacío -> no debe lanzar
  // ============================================================
  const res10 = await detectarHuellaEspectral({ payload: Buffer.alloc(0) }, {});
  assertContratoBasico(res10, { permitirFallo: true });
  assert.equal(res10.exito, false, 'buffer vacío debe producir exito=false');
  console.log('OK 10: buffer vacío manejado sin lanzar excepción');

  // ============================================================
  // 11. Entrada inválida: base64 corrupto -> no debe lanzar
  // ============================================================
  const res11 = await detectarHuellaEspectral({ payload: '!!!no-es-base64-valido!!!' }, {});
  assertContratoBasico(res11, { permitirFallo: true });
  console.log(`OK 11: base64 corrupto manejado (exito=${res11.exito}) sin lanzar excepción`);

  // ============================================================
  // 12. Imagen demasiado pequeña (menor que un bloque 8x8) -> no debe lanzar
  // ============================================================
  const imagenDiminuta = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 10, b: 10 } }
  }).png().toBuffer();
  const res12 = await detectarHuellaEspectral({ payload: imagenDiminuta }, {});
  assertContratoBasico(res12, { permitirFallo: true });
  console.log(`OK 12: imagen diminuta manejada (exito=${res12.exito}) sin lanzar excepción`);

  // ============================================================
  // 13. Imagen sintética uniforme (sin ruido) -> debe procesar sin lanzar
  //     y no debe declararse HUMANO_EVIDENTE por una imagen sin textura real
  // ============================================================
  const imagenPlana = await sharp({
    create: { width: 128, height: 128, channels: 3, background: { r: 128, g: 128, b: 128 } }
  }).png().toBuffer();
  const res13 = await detectarHuellaEspectral({ payload: imagenPlana }, {});
  assertContratoBasico(res13);
  assert.notEqual(res13.resultado.decision, 'HUMANO_EVIDENTE', 'Una imagen plana sin textura no debe marcarse como evidencia clara de humano');
  console.log(`OK 13: imagen sintética plana -> decision=${res13.resultado.decision} (coherente, no falso HUMANO_EVIDENTE)`);

  // ============================================================
  // 14. Determinismo: misma entrada -> mismo resultado de decisión
  // ============================================================
  const resA = await detectarHuellaEspectral({ payload: bufferReal }, {});
  const resB = await detectarHuellaEspectral({ payload: bufferReal }, {});
  assert.equal(resA.resultado.decision, resB.resultado.decision, 'La célula debe ser determinista ante la misma entrada');
  assert.equal(resA.resultado.esIA, resB.resultado.esIA, 'esIA debe ser estable ante la misma entrada');
  console.log('OK 14: determinismo verificado (misma entrada -> mismo veredicto)');

  // ============================================================
  // 15. Rendimiento: no debe convertirse en cuello de botella del plan
  // ============================================================
  const LIMITE_MS = 500;
  assert.ok(res1.metricas.tiempoMs < LIMITE_MS, `La célula tardó ${res1.metricas.tiempoMs.toFixed(1)}ms, por encima del límite de ${LIMITE_MS}ms`);
  console.log(`OK 15: rendimiento dentro del límite (${res1.metricas.tiempoMs.toFixed(1)}ms < ${LIMITE_MS}ms)`);

  // ============================================================
  // 16. Ejecuciones repetidas no deben acumular estado ni crashear el proceso
  // ============================================================
  for (let i = 0; i < 10; i++) {
    const resLoop = await detectarHuellaEspectral({ payload: bufferReal }, {});
    assertContratoBasico(resLoop);
  }
  console.log('OK 16: 10 ejecuciones consecutivas sin fallos ni crash del proceso');

  console.log('\n✅ TODOS LOS TESTS DE detectar-huella-espectral PASARON');
}

main().catch((error) => {
  console.error('❌ FALLO EN TEST detectar-huella-espectral:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
