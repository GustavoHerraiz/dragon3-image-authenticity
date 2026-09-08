/**
 * ====================================================================
 * DRAGON3 - SCRIPT DE INVALIDACIÓN MANUAL DE TOKENS
 * ====================================================================
 * 
 * Script para invalidar manualmente los tokens de un usuario específico
 * incrementando su tokenVersion. Útil cuando se cambia el rol manualmente
 * en MongoDB Atlas.
 * 
 * USO:
 * node scripts/invalidate-user-tokens.js <email_o_id_usuario>
 * 
 * EJEMPLOS:
 * node scripts/invalidate-user-tokens.js usuario@ejemplo.com
 * node scripts/invalidate-user-tokens.js 507f1f77bcf86cd799439011
 * 
 * ====================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Usuario from "../modelos/mongodb/Usuario.js";

// Cargar variables de entorno
dotenv.config();

async function invalidateUserTokens(userIdentifier) {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dragon3');
        console.log('✅ Conectado a MongoDB');

        // Buscar usuario por email o ID
        let usuario;
        if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
            usuario = await Usuario.findById(userIdentifier);
        } else {
            usuario = await Usuario.findOne({ email: userIdentifier.toLowerCase() });
        }

        if (!usuario) {
            console.log('❌ Usuario no encontrado');
            return;
        }

        console.log(`📊 Usuario encontrado:`);
        console.log(`   - ID: ${usuario._id}`);
        console.log(`   - Email: ${usuario.email}`);
        console.log(`   - Nombre: ${usuario.name}`);
        console.log(`   - Rol actual: ${usuario.role}`);
        console.log(`   - TokenVersion actual: ${usuario.tokenVersion || 1}`);

        // Incrementar tokenVersion
        const nuevaVersion = (usuario.tokenVersion || 1) + 1;
        await Usuario.findByIdAndUpdate(
            usuario._id,
            { $set: { tokenVersion: nuevaVersion } }
        );

        console.log(`✅ TokenVersion actualizado a: ${nuevaVersion}`);
        console.log(`🔒 Todos los tokens anteriores del usuario han sido invalidados`);
        console.log(`💡 El usuario deberá iniciar sesión nuevamente para obtener un token válido`);

    } catch (error) {
        console.error('❌ Error invalidando tokens:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Obtener argumento de línea de comandos
const userIdentifier = process.argv[2];

if (!userIdentifier) {
    console.log('❌ Uso: node scripts/invalidate-user-tokens.js <email_o_id_usuario>');
    console.log('📝 Ejemplo: node scripts/invalidate-user-tokens.js usuario@ejemplo.com');
    process.exit(1);
}

// Ejecutar script
invalidateUserTokens(userIdentifier);
