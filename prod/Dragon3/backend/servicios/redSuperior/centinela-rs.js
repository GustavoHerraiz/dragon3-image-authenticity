/* MÓDULO: centinela-rs.js 
   OBJETIVO: Automatizar el flujo de evolución de la Red Superior.
*/
import { exec } from 'child_process';
import path from 'path';

// Configuración: Revisar cada 12 horas (en milisegundos)
const INTERVALO_REVISION = 12 * 60 * 60 * 1000; 

function despertar() {
    console.log(`[${new Date().toISOString()}] 🛡️ Centinela RS: Iniciando revisión de ciclo...`);

    // 1. Ejecutar Triaje para consolidar JSONs en CSV
    exec('node servicios/redSuperior/admin-rs.js', (err, stdout) => {
        if (err) return console.error("❌ Fallo en Centinela (Triaje):", err);
        
        // 2. Si el triaje encontró "Verdades Absolutas", reentrenar
        if (stdout.includes("Auto-etiquetados (Verdades Absolutas): 0")) {
            console.log("💤 Sin datos suficientes para evolucionar. Durmiendo.");
        } else {
            console.log("📈 Nuevos datos detectados. Disparando reentrenamiento...");
            exec('node servicios/redSuperior/reentrenar-rs.js', (err) => {
                if (!err) console.log("✅ Evolución completada con éxito.");
            });
        }
    });
}

// Iniciar ciclo
setInterval(despertar, INTERVALO_REVISION);
despertar(); // Primera ejecución al arrancar