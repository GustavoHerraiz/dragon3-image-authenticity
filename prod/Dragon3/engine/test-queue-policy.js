import assert from 'node:assert/strict';
import fs from 'node:fs';
import Orquestador from './orquestador.js';

async function main() {
  const orquestadorSource = fs.readFileSync('./orquestador.js', 'utf8');
  const colaSource = fs.readFileSync('./cola.js', 'utf8');

  assert.match(
    orquestadorSource,
    /const usaCola = this\._esCelulaPesada\(celula\.id\);/,
    'Las células pesadas deben usar siempre la cola.'
  );

  assert.match(
    colaSource,
    /cola\.process\('procesar-celula',\s*concurrenciaSerial|cola\.process\('procesar-celula',\s*1/,
    'La cola de Sharp debe serializar trabajos en concurrencia 1.'
  );

  const plan = {
    nombre: 'test-queue-policy',
    salidaFinal: { resultado: '$.resultadoFinal' },
    células: [
      { id: 'cargar-imagen', ruta: './celulas/cargar-imagen.js', entrada: {} },
      { id: 'ligera-1', ruta: './celulas/detectar-tipo-archivo.js', entrada: {} },
      { id: 'detectar-colores', ruta: './celulas/detectar-colores.js', entrada: {} },
      { id: 'detectar-textura-ruido', ruta: './celulas/detectar-textura-ruido.js', entrada: {} },
      { id: 'generar-veredicto', ruta: './celulas/generar-veredicto.js', entrada: {} }
    ]
  };

  const orquestador = new Orquestador(plan);
  let active = 0;
  let peak = 0;

  orquestador._ejecutarCelula = async function (celula) {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;

    return {
      exito: true,
      resultado: { ok: true, celulaId: celula.id },
      contexto: {}
    };
  };

  await orquestador.ejecutar({});

  assert.equal(
    peak,
    1,
    `Se esperaba serializar las células pesadas, pero el pico de concurrencia fue ${peak}.`
  );

  console.log(`OK: pico de concurrencia observado = ${peak}`);
}

main().catch((error) => {
  console.error('FALLO:', error.message);
  process.exitCode = 1;
});
