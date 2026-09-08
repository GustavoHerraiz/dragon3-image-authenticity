import crypto from 'crypto';

export class MotorEspacial {

    /**
     * Calcula el "Centro Fantasma" de la espiral.
     * CAMBIO CLAVE: Ya NO usa el hash de la imagen para ubicarse.
     * Solo usa dimensiones + clave privada.
     * Resultado: El sello siempre está en el mismo sitio para un tamaño dado.
     */
    static calcularCentroUnico(ancho, alto, hashImagen, clavePrivada) {
        // Usamos hashImagen solo como 'salt' opcional o lo ignoramos para la geometría
        // Para máxima estabilidad, usamos solo dimensiones y clave.
        const semillaGeometria = `${ancho}-${alto}-${clavePrivada}`;

        const hash = crypto.createHash('sha256').update(semillaGeometria).digest('hex');
        const val = parseInt(hash.substring(0, 8), 16);

        // Definimos zona segura (centro 60% de la imagen)
        const margenX = Math.floor(ancho * 0.2);
        const margenY = Math.floor(alto * 0.2);
        const zonaSeguraW = ancho - (2 * margenX);
        const zonaSeguraH = alto - (2 * margenY);

        return {
            x: margenX + (val % zonaSeguraW),
            y: margenY + ((val >> 16) % zonaSeguraH) // Usamos bits altos para Y
        };
    }

    static obtenerPuntosEspiral(ancho, alto, centro) {
        const puntos = [];
        const phi = 1.61803398875;
        const radioInicial = Math.min(ancho, alto) * 0.02; // 2% del tamaño
        const vueltas = 8;
        const puntosPorVuelta = 12; // Más densidad para redundancia

        let angulo = 0;
        let radio = radioInicial;

        // Generamos puntos siguiendo la espiral logarítmica
        for (let i = 0; i < vueltas * puntosPorVuelta; i++) {
            // Coordenadas polares a cartesianas
            const x = Math.floor(centro.x + radio * Math.cos(angulo));
            const y = Math.floor(centro.y + radio * Math.sin(angulo));

            // Solo añadimos si está dentro de la imagen y lejos de bordes
            if (x > 10 && x < ancho - 10 && y > 10 && y < alto - 10) {
                puntos.push({ x, y });
            }

            angulo += (Math.PI * 2) / puntosPorVuelta;
            radio *= 1.05; // Crecimiento suave
        }

        return puntos;
    }
}
