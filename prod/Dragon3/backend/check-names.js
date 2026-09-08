// Importa tus constantes (ajusta la ruta si es necesaria)
import { STREAMS, CONSUMER_GROUPS } from './servicios/imagen/analizadorImagen.js';

console.log('--- VERIFICACIÓN DE IDENTIDADES ---');
console.log('Stream Status:', STREAMS.STATUS_UPDATES);
console.log('Group Status:', CONSUMER_GROUPS.STATUS_MONITORS);
console.log('Stream Perf:', STREAMS.PERFORMANCE_METRICS);
console.log('Group Perf:', CONSUMER_GROUPS.PERFORMANCE_COLLECTORS);