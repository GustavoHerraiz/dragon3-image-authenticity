/**
 * ====================================================================
 * DRAGON3 - SCRIPT DE ACTUALIZACIÓN TOKEN VERSION
 * ====================================================================
 * 
 * Script para actualizar usuarios existentes con el campo tokenVersion
 * que se requiere para la invalidación automática de tokens.
 * 
 * USO:
 * node scripts/update-token-version.js
 * 
 * ====================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Usuario from "../modelos/mongodb/Usuario.js";

// Cargar variables de entorno
dotenv.config();

async function updateTokenVersion() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dragon3');
        console.log('✅ Conectado a MongoDB');

        // Buscar usuarios sin tokenVersion
        const usuariosSinTokenVersion = await Usuario.find({ tokenVersion: { $exists: false } });
        console.log(`📊 Encontrados ${usuariosSinTokenVersion.length} usuarios sin tokenVersion`);

        if (usuariosSinTokenVersion.length === 0) {
            console.log('✅ Todos los usuarios ya tienen tokenVersion');
            return;
        }

        // Actualizar usuarios
        const updatePromises = usuariosSinTokenVersion.map(usuario => 
            Usuario.findByIdAndUpdate(
                usuario._id,
                { $set: { tokenVersion: 1 } },
                { new: true }
            )
        );

        await Promise.all(updatePromises);
        console.log(`✅ Actualizados ${usuariosSinTokenVersion.length} usuarios con tokenVersion = 1`);

        // Verificar actualización
        const usuariosActualizados = await Usuario.find({ tokenVersion: { $exists: true } });
        console.log(`📊 Total usuarios con tokenVersion: ${usuariosActualizados.length}`);

    } catch (error) {
        console.error('❌ Error actualizando tokenVersion:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar script
updateTokenVersion();
