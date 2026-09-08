import crypto from 'crypto';

const SECRETO = 'DRAGON3_PREMIUM_SECRET_2026'; // Debe ser el mismo que en license.js

const email = 'gustavo.herraiz@gmail.com'; // Tu email

const clave = crypto.createHmac('sha256', SECRETO)
                    .update(email.toLowerCase().trim())
                    .digest('hex')
                    .toUpperCase()
                    .substring(0, 16);

console.log(`🔑 Clave para ${email}: ${clave}`);