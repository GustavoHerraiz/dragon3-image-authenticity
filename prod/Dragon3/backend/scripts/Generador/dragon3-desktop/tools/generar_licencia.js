import fs from 'fs';
import { LicenseManager } from '../src/backend/license.js';

const privateKeyPem = fs.readFileSync('private.pem', 'utf8');
const email = process.argv[2] || 'cliente@ejemplo.com';
const tipo = process.argv[3] || 'premium';
const expiracion = process.argv[4] || 'null'; // o '2026-12-31T23:59:59.000Z'

const clave = LicenseManager.generarClave(email, tipo, expiracion, privateKeyPem);
console.log(`Clave de licencia para ${email} (${tipo}):`);
console.log(clave);