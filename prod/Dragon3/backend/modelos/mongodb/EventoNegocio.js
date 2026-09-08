import mongoose from 'mongoose';

/**
 * EventoNegocio - Histórico de eventos de negocio Dragon3 FAANG
 * Cada documento = 1 evento/análisis individual, con metadatos completos para auditoría y BI.
 * No bloquea ni afecta el contador global. Solo añade persistencia forense.
 */

const EventoNegocioSchema = new mongoose.Schema({
  tipo: { type: String, required: true },               // Ej: 'analisisCompletados', 'archivosProcessados', etc.
  usuarioId: { type: String, default: null },            // Null si público
  correlationId: { type: String, required: true },       // Trazabilidad end-to-end
  imagenId: { type: String, required: true },            // ID único de imagen/archivo
  exito: { type: Boolean, default: true },               // true/false
  tiempoProcesoMs: { type: Number },                     // Performance real
  fileType: { type: String },                            // MIME type
  endpoint: { type: String },                            // Ruta/endpoint (opcional)
  tamanoArchivo: { type: Number },                       // Tamaño en bytes (opcional)
  etiqueta: { type: String },                            // Etiqueta de entrenamiento (opcional)
  timestamp: { type: Date, default: Date.now }           // Fecha/hora evento
}, { collection: 'eventosNegocio' });

const EventoNegocio = mongoose.models.EventoNegocio || mongoose.model('EventoNegocio', EventoNegocioSchema);

export default EventoNegocio;
