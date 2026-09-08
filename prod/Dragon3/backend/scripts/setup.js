/**
 * setup.js - Configuración inicial del sistema MBH
 * EJECUTAR SOLO UNA VEZ para configurar la clave secreta
 */

import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, 'config');

// Crear directorio de configuración si no existe
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    console.log('📁 Directorio de configuración creado');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function setupSistema() {
    console.log('🔐 CONFIGURACIÓN DEL SISTEMA MBH');
    console.log('='.repeat(60));
    console.log('Este proceso SOLO se ejecuta UNA VEZ.');
    console.log('Generará una clave secreta para cifrar todos los sellos.');
    console.log('');

    // Preguntar si generar clave automática o manual
    rl.question('¿Generar clave automáticamente? (s/n): ', async (respuesta) => {
        let claveSecreta;

        if (respuesta.toLowerCase() === 's') {
            // Generar clave aleatoria segura (256 bits)
            claveSecreta = crypto.randomBytes(32).toString('hex');
            console.log('🔑 Clave generada automáticamente');
        } else {
            // Pedir clave personalizada
            claveSecreta = await new Promise((resolve) => {
                rl.question('Ingresa tu clave secreta (mínimo 16 caracteres): ', (clave) => {
                    if (clave.length < 16) {
                        console.log('❌ La clave debe tener al menos 16 caracteres');
                        process.exit(1);
                    }
                    resolve(clave);
                });
            });
        }

        // Crear hash de la clave (no almacenamos la clave directamente)
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(claveSecreta, salt, 100000, 32, 'sha256');

        // Configuración del sistema
        const config = {
            version: '2.0.0',
            fechaConfiguracion: new Date().toISOString(),
            algoritmo: 'AES-256-GCM',
            hash: hash.toString('hex'),
            salt: salt.toString('hex'),
            metadatos: {
                creadoPor: process.env.USER || 'sistema',
                hostname: require('os').hostname()
            }
        };

        // Guardar configuración
        fs.writeFileSync(
            join(CONFIG_DIR, 'config.json'),
            JSON.stringify(config, null, 2)
        );

        // Crear clave derivada para cifrado
        const claveCifrado = crypto.pbkdf2Sync(claveSecreta, salt, 100000, 32, 'sha256');

        // Cifrar y guardar la clave secreta (opcional, para verificación)
        const cifrador = crypto.createCipheriv('aes-256-gcm', claveCifrado, salt.slice(0, 12));
        const claveCifrada = Buffer.concat([
            cifrador.update(claveSecreta, 'utf8'),
            cifrador.final(),
            cifrador.getAuthTag()
        ]);

        fs.writeFileSync(
            join(CONFIG_DIR, 'secret.key'),
            claveCifrada.toString('base64')
        );

        console.log('\n' + '='.repeat(60));
        console.log('✅ CONFIGURACIÓN COMPLETADA');
        console.log('='.repeat(60));
        console.log('Clave configurada exitosamente.');
        console.log(`📁 Configuración guardada en: ${CONFIG_DIR}/`);
        console.log('');
        console.log('📋 INSTRUCCIONES:');
        console.log('1. GUARDA ESTA INFORMACIÓN EN UN LUGAR SEGURO:');
        if (respuesta.toLowerCase() === 's') {
            console.log(`   Clave generada: ${claveSecreta}`);
        }
        console.log('2. La clave NUNCA se almacena en texto plano.');
        console.log('3. Para usar el sistema:');
        console.log('   - node generadorMBH.js      # Para sellar imágenes');
        console.log('   - node verificar_sello.js   # Para verificar sellos');
        console.log('');
        console.log('⚠️  IMPORTANTE: Sin esta clave NO podrás verificar sellos.');
        console.log('   Si pierdes la clave, todos los sellos serán INUTILIZABLES.');
        console.log('='.repeat(60));

        rl.close();
    });
}

// Ejecutar configuración
setupSistema().catch(console.error);
