import fs from 'fs';

// 1. EL MOLDE MAESTRO (Datos Reales extraídos por ti)
const MAESTRO_QUICO = {
    hash_suffix: "d760",
    cliente: "Quico Melero",
    obra: "Atardecer",
    balizas: [
        { name: "Sancho_0", x: 0, y: 0, z: 6604, hex: "d760" },
        { name: "Sancho_1", x: 0, y: 1, z: 6429, hex: "d760" },
        { name: "Maestro_N", x: 2, y: 0, z: 4416, hex: "d760" },
        { name: "Everest", x: 3, y: 4, z: 5719, hex: "27ca" },
        { name: "Faro", x: 4, y: 4, z: 5810, hex: "20ca" },
        { name: "W_Pilar_A", x: 4, y: 3, z: 5707, hex: "20cb" },
        { name: "W_Pilar_B", x: 6, y: 3, z: 6022, hex: "289f" },
        { name: "Nucleo_Base", x: 3, y: 3, z: 4426, hex: "b06b" },
        { name: "Vertebral", x: 3, y: 5, z: 6058, hex: "27ca" },
        { name: "Esquina_NE", x: 7, y: 0, z: 6420, hex: "289f" },
        { name: "Singularidad", x: 7, y: 7, z: 5955, hex: "d061" }
    ]
};

const db = [MAESTRO_QUICO];

// 2. GENERACIÓN DE 99 SELLOS ALEATORIOS (Población de Control)
const clientes = ["Empresa Alpha", "Galeria Beta", "Estudio Gamma", "Coleccion Delta", "Arte Epsilon"];

for (let i = 1; i <= 99; i++) {
    const randomSuffix = Math.floor(Math.random() * 65535).toString(16).padStart(4, '0');
    db.push({
        hash_suffix: randomSuffix,
        cliente: `${clientes[i % clientes.length]} ${100 + i}`,
        obra: `Obra Random #${i}`,
        balizas: MAESTRO_QUICO.balizas.map(b => ({
            name: b.name,
            x: b.x,
            y: b.y,
            z: Math.floor(Math.random() * 200) + 50, // Fuerza mucho menor para el control
            hex: Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')
        }))
    });
}

// 3. GUARDAR BASE DE DATOS
const content = `export const BASE_DE_DATOS_SELLOS = ${JSON.stringify(db, null, 4)};`;
fs.writeFileSync('base_datos_sellos.js', content);

console.log("\n============================================================");
console.log("✅ BASE DE DATOS V19 GENERADA CON ÉXITO");
console.log(`- Registros: 100`);
console.log(`- Balizas por Sello: 11 (Malla Tron)`);
console.log(`- Registro Maestro: Quico Melero (ADN d760)`);
console.log("============================================================\n");
