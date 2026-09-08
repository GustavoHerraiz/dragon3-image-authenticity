// build-sandbox.js
import bytenode from 'bytenode';
import fs from 'fs';
import path from 'path';

const filesToProtect = [
    './sandbox_build/matematicas/MotorEspacial.js',
    './sandbox_build/generadorMBH.js',
    './sandbox_build/analizador_v5.js'
];

console.log("🚀 Iniciando blindaje de Dragon3 Core...");

filesToProtect.forEach(file => {
    if (fs.existsSync(file)) {
        // Compila el archivo a Bytecode (.jsc)
        bytenode.compileFile({
            filename: file,
            output: file.replace('.js', '.jsc')
        });

        // ELIMINA el archivo original .js (¡Crucial para la seguridad!)
        fs.unlinkSync(file);
        console.log(`✅ Blindado: ${path.basename(file)} -> .jsc`);
    }
});

console.log("🔒 Proceso completado. Los fuentes originales han sido destruidos en la carpeta build.");
