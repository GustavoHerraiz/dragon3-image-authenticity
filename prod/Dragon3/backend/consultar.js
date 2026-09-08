import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://gustavoherraiz:Lobosolitario@proyectodragon.yvzan.mongodb.net/dragon?retryWrites=true&w=majority&appName=ProyectoDragon';
const archivoId = process.argv[2];

if (!archivoId) {
    console.error('Uso: node consultar.js <archivoId>');
    process.exit(1);
}

const client = new MongoClient(uri);

try {
    await client.connect();
    const db = client.db('dragon');
    
    // Probar en colecciones probables
    const colecciones = ['analisis_archivos', 'analisisarchivos', 'historialAnalisis'];
    let encontrado = null;
    
    for (const nombreColeccion of colecciones) {
        const col = db.collection(nombreColeccion);
        // Buscar por diferentes campos posibles
        const doc = await col.findOne({ 
            $or: [
                { 'resumen.archivoId': archivoId },
                { 'archivoId': archivoId },
                { 'archivo_id': archivoId },
                { 'id': archivoId },
                { 'metadata.archivoId': archivoId }
            ]
        });
        if (doc) {
            encontrado = doc;
            console.error(`✅ Encontrado en colección: ${nombreColeccion}`);
            break;
        }
    }
    
    if (encontrado) {
        console.log(JSON.stringify(encontrado, null, 2));
    } else {
        console.error(`❌ No se encontró análisis para archivoId: ${archivoId}`);
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await client.close();
}