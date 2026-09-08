const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

// Cargar tu secreto desde el .env
dotenv.config({ path: path.resolve(__dirname, './.env') });

const payload = {
    id: "689f02a29cf14634fa963fdc",
    username: "gustavo.herraiz",
    role: "enterprise"
};

const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });

console.log("\n🚀 TU TOKEN PARA LA SANDBOX (Válido 1 año):\n");
console.log(token);
console.log("\n------------------------------------------");
