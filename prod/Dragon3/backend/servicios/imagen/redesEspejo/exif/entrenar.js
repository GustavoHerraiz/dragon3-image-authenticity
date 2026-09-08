import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const synaptic = require('synaptic'); // CommonJS import

import fs from 'fs';
import path from 'path';
import dragonLogger from '../../../../utilidades/logger.js'; // Tu logger ESM

const FEATURE_COUNT = 9;
const PESOS_PATH = path.join(process.cwd(), 'pesos.json');

// === CONSTRUCCIÓN MANUAL DE LAYERS (igual que modelo.js) ===
const inputLayer = new synaptic.Layer(FEATURE_COUNT);
const hiddenLayer = new synaptic.Layer(4);
const outputLayer = new synaptic.Layer(1);
inputLayer.project(hiddenLayer);
hiddenLayer.project(outputLayer);

const nn = new synaptic.Network({
  input: inputLayer,
  hidden: [hiddenLayer],
  output: outputLayer,
});
const trainer = new synaptic.Trainer(nn);

const dataset = [
  { input: [1,0,1,1,0,1,1,1,1], output: [1] },
  { input: [1,0,1,0,1,1,1,1,1], output: [0] },
  { input: [0,0,0,0,0,0,0,0,0], output: [0.5] }
];

dragonLogger.sonrie(
  `[EXIF TRAIN] Entrenamiento iniciado | dataset size: ${dataset.length}`,
  'redEspejoExif',
  'train',
  { feature_count: FEATURE_COUNT }
);

try {
  trainer.train(dataset, {
    rate: 0.1,
    iterations: 20000,
    error: 0.01,
    shuffle: true,
    log: (details) => {
      dragonLogger.zen(
        `[EXIF TRAIN] Progreso: iteración ${details.iterations}, error: ${details.error}`,
        'redEspejoExif',
        'train',
        { details }
      );
    },
    cost: synaptic.Trainer.cost.MSE
  });

  dragonLogger.sonrie(
    '[EXIF TRAIN] Entrenamiento completado',
    'redEspejoExif',
    'train',
    { dataset_size: dataset.length }
  );

  // Ahora sí: pesos.json correcto y compatible con fromJSON (modelo.js)
  const pesos = nn.toJSON();
  fs.writeFileSync(PESOS_PATH, JSON.stringify(pesos, null, 2));
  dragonLogger.sonrie(
    '[EXIF TRAIN] Pesos y estructura guardados en pesos.json (estructura synaptic manual/layers)',
    'redEspejoExif',
    'train',
    { ruta: PESOS_PATH, output_size: Buffer.byteLength(JSON.stringify(pesos)) }
  );
} catch (err) {
  dragonLogger.agoniza(
    '[EXIF TRAIN] Error durante entrenamiento o guardado de pesos',
    err,
    'redEspejoExif',
    'train',
    { ruta: PESOS_PATH, stack: err?.stack }
  );
  process.exit(1);
}