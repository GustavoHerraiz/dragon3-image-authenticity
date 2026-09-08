import fs from 'fs';

const clientes = ["Empresa Alpha", "Galeria Beta", "Estudio Gamma", "Coleccion Delta", "Arte Epsilon"];
const obras = ["Paisaje", "Retrato", "Abstracción", "Urbano", "Naturaleza"];

const db = [
    { hash_suffix: "d760", cliente: "Quico Melero", obra: "Atardecer" } // Registro Maestro
];

// Generar 99 adicionales
for (let i = 1; i <= 99; i++) {
    const randomSuffix = Math.floor(Math.random() * 65535).toString(16).padStart(4, '0');
    db.push({
        hash_suffix: randomSuffix,
        cliente: `${clientes[i % clientes.length]} ${100 + i}`,
        obra: `${obras[i % obras.length]} #${i}`
    });
}

// Guardar como archivo de datos
const content = `export const BASE_DE_DATOS_SELLOS = ${JSON.stringify(db, null, 4)};`;
fs.writeFileSync('base_datos_sellos.js', content);

console.log("✅ Creado: base_datos_sellos.js con 100 registros.");
