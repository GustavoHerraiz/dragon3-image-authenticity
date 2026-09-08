import mongoose from "mongoose";
import dotenv from "dotenv";
import Usuario from "../modelos/mongodb/Usuario.js";

dotenv.config();

(async function() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dragon3');
        console.log("✅ Conectado a MongoDB");

        const usuarios = await Usuario.find({}, { email: 1, _id: 1, name: 1, role: 1, tokenVersion: 1 });
        if (usuarios.length === 0) {
            console.log("❌ No se encontraron usuarios en la colección.");
        } else {
            console.log("📋 Lista de usuarios encontrados:");
            usuarios.forEach(u => {
                console.log(`ID: ${u._id} | EMAIL: (${u.email}) | NOMBRE: ${u.name} | ROL: ${u.role} | tokenVersion: ${u.tokenVersion}`);
            });
        }
    } catch (error) {
        console.error("❌ Error al listar usuarios:", error);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Desconectado de MongoDB");
    }
})();
