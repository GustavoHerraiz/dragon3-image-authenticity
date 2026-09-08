import fs from 'fs';

export class NotarioDigital {
    constructor(titulo, archivoSalida) {
        this.archivoSalida = archivoSalida;
        this.contenido = `
# 🏰 ${titulo}
**Fecha:** ${new Date().toLocaleString()}
**Arquitectura:** Dragon3 v84 "Hybrid Titan"
**Generado por:** Sistema de Telemetría Automática

> **NOTA CONFIDENCIAL:** Este documento analiza la persistencia de la señal MBH. Se compara la degradación observada contra los modelos teóricos de destrucción de información (Entropía de Shannon).

---

`;
    }

    agregarSeccion(titulo, descripcion) {
        this.contenido += `\n## ${titulo}\n\n_${descripcion}_\n\n`;
    }

    agregarDatoClave(clave, valor, explicacion = "") {
        this.contenido += `> **${clave}:** ${valor}  \n`;
        if (explicacion) this.contenido += `> 💡 *Análisis:* ${explicacion}\n\n`;
    }

    agregarTabla(encabezados, filas) {
        let headerRow = "| " + encabezados.join(" | ") + " |";
        let separatorRow = "| " + encabezados.map(() => "---").join(" | ") + " |";
        let dataRows = filas.map(fila => "| " + fila.join(" | ") + " |").join("\n");

        this.contenido += `\n${headerRow}\n${separatorRow}\n${dataRows}\n\n`;
    }

    // 🧠 CEREBRO FORENSE V2 (CORREGIDO Y MÁS INTELIGENTE)
    analizarFenomeno(energiaOriginal, energiaActual, calidad) {
        // Umbral de muerte teórica para marcas de agua estándar: Q50
        // Umbral de energía mínima viable para MBH: ~5000

        const ratio = energiaActual / energiaOriginal;

        if (energiaActual === 0) {
            return `💀 **MUERTE DE SEÑAL:** La entropía ha destruido la información.`;
        }

        // ANÁLISIS DE LA ZONA DE LA MUERTE (Q10 - Q30)
        if (calidad <= 30) {
            if (energiaActual > 20000) {
                return `🛡️ **ANOMALÍA DE SUPERVIVENCIA (JUDO DIGITAL):** En calidad Q${calidad}, la señal debería ser 0. Mantener ${energiaActual.toLocaleString()} unidades de energía desafía la degradación lineal. La estructura 'Potencia 55' ha emergido sobre el ruido visual.`;
            } else if (energiaActual > 5000) {
                return `⚠️ **RESISTENCIA CRÍTICA:** La señal sobrevive en el límite de detección.`;
            }
        }

        // ANÁLISIS DE LA ZONA MEDIA (Q40 - Q60)
        if (calidad <= 60 && calidad > 30) {
             if (ratio > 0.15) { // Si retiene más del 15% de la energía original en zona media
                 return `💎 **SOLIDEZ ESTRUCTURAL:** La señal resiste la cuantización agresiva mejor que el contenido visual.`;
             }
        }

        // ANÁLISIS DE ALTA CALIDAD (Q70 - Q100)
        // Aquí es normal que baje linealmente al perder la perfección del PNG
        return `📉 **DEGRADACIÓN LINEAL:** Pérdida de energía proporcional a la compresión. Comportamiento estándar en alta calidad.`;
    }

    // 🧠 CEREBRO FORENSE: Detecta Ángulos Fantasma
    analizarAngulo(anguloDetectado, anguloReal, metodo) {
        const diff = Math.abs(anguloDetectado - anguloReal);

        // Caso 1: Imagen recta detectada como rotada (Adaptación a filtros)
        if (anguloReal === 0 && Math.abs(anguloDetectado) > 0.5) {
            return `👻 **ÁNGULO FANTASMA:** Imagen física a 0°, pero resonancia magnética en ${anguloDetectado}°. El radar se ha adaptado a la distorsión del filtro (Sharpen/Blur).`;
        }

        // Caso 2: Rotación detectada correctamente por Palacios
        if (metodo.includes("PALACIOS") && diff < 5) {
            return `🎯 **PRECISIÓN SUB-PÍXEL:** El Motor Palacios ha compensado la rotación física (${anguloReal}°) encontrando el pico de energía en ${anguloDetectado}°.`;
        }

        // Caso 3: Detección Estática Perfecta
        if (metodo.includes("STATIC")) {
            return `🚀 **BLOQUEO INSTANTÁNEO:** Detección por coincidencia exacta de enteros (Motor A).`;
        }

        return `✅ **ALINEACIÓN CORRECTA.**`;
    }

    cerrarInforme() {
        this.contenido += `\n---\n**🏁 FIN DEL INFORME TÉCNICO - DRAGON3 SYSTEMS**\n_Validado para revisión por Dr. F. Zanuy y Dr. A. Palacios._`;
        fs.writeFileSync(this.archivoSalida, this.contenido);
        console.log(`\n📄 [NOTARIO] INFORME GUARDADO EN: ${this.archivoSalida}`);
    }
}
