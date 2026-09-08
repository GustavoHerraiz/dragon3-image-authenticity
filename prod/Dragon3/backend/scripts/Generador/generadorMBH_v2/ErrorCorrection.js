/**
 * 🛡️ CORRECCIÓN DE ERRORES MANUAL
 *
 * Implementa código Hamming(31,26) + paridad extendida
 * Puede corregir 1 error y detectar 2 errores
 *
 * Sin dependencias externas.
 */

export class ErrorCorrection {

    /**
     * Codifica 26 bits de datos con 5 bits de paridad Hamming + 1 bit de paridad total
     * Resultado: 32 bits con corrección de errores
     */
    static encode(data26bits) {
        // Asegurarse de que son solo 26 bits
        data26bits = data26bits & 0x3FFFFFF;

        // Posiciones de bits de paridad: 1, 2, 4, 8, 16 (base 1)
        // En base 0: 0, 1, 3, 7, 15

        let encoded = 0;
        let dataPos = 0;

        // Construir palabra de 31 bits con espacios para paridad
        for (let i = 0; i < 31; i++) {
            const pos = i + 1; // Posición base-1

            // Si es potencia de 2, es bit de paridad (saltarlo por ahora)
            if ((pos & (pos - 1)) === 0) {
                continue;
            }

            // Copiar bit de datos
            const bit = (data26bits >>> (25 - dataPos)) & 1;
            encoded |= (bit << (30 - i));
            dataPos++;
        }

        // Calcular bits de paridad
        for (let parityPos = 0; parityPos < 5; parityPos++) {
            const parityBit = 1 << parityPos; // 1, 2, 4, 8, 16
            let parity = 0;

            for (let i = 1; i <= 31; i++) {
                if ((i & parityBit) !== 0) {
                    const bitPos = 30 - (i - 1);
                    parity ^= (encoded >>> bitPos) & 1;
                }
            }

            const bitPos = 30 - (parityBit - 1);
            encoded |= (parity << bitPos);
        }

        // Bit 32: paridad total (detecta errores dobles)
        let totalParity = 0;
        for (let i = 0; i < 31; i++) {
            totalParity ^= (encoded >>> i) & 1;
        }

        encoded |= (totalParity << 31);

        return encoded >>> 0;
    }

    /**
     * Decodifica 32 bits con corrección de error
     * Retorna: { data: 26 bits, corrected: boolean, uncorrectable: boolean }
     */
    static decode(encoded32bits) {
        encoded32bits = encoded32bits >>> 0;

        // Separar paridad total
        const totalParity = (encoded32bits >>> 31) & 1;
        const encoded31 = encoded32bits & 0x7FFFFFFF;

        // Calcular paridad total recibida
        let receivedParity = 0;
        for (let i = 0; i < 31; i++) {
            receivedParity ^= (encoded31 >>> i) & 1;
        }

        // Calcular síndrome (posición del error)
        let syndrome = 0;
        for (let parityPos = 0; parityPos < 5; parityPos++) {
            const parityBit = 1 << parityPos;
            let parity = 0;

            for (let i = 1; i <= 31; i++) {
                if ((i & parityBit) !== 0) {
                    const bitPos = 30 - (i - 1);
                    parity ^= (encoded31 >>> bitPos) & 1;
                }
            }

            if (parity !== 0) {
                syndrome |= parityBit;
            }
        }

        let corrected = false;
        let uncorrectable = false;
        let correctedData = encoded31;

        if (syndrome !== 0) {
            // Hay error
            if (receivedParity !== totalParity) {
                // Error simple - CORREGIR
                const errorPos = 30 - (syndrome - 1);
                correctedData ^= (1 << errorPos);
                corrected = true;
            } else {
                // Error doble - NO CORREGIBLE
                uncorrectable = true;
                return { data: 0, corrected: false, uncorrectable: true };
            }
        }

        // Extraer 26 bits de datos
        let data26 = 0;
        let dataPos = 0;

        for (let i = 0; i < 31; i++) {
            const pos = i + 1;

            // Saltar bits de paridad
            if ((pos & (pos - 1)) === 0) {
                continue;
            }

            const bit = (correctedData >>> (30 - i)) & 1;
            data26 |= (bit << (25 - dataPos));
            dataPos++;
        }

        return { data: data26, corrected, uncorrectable };
    }

    /**
     * Test de funcionamiento
     */
    static test() {
        console.log("🧪 Test de corrección de errores:\n");

        const testData = 0x1A2B3C4; // 26 bits
        console.log(`   Datos originales: ${testData.toString(16).padStart(7, '0')}`);

        const encoded = ErrorCorrection.encode(testData);
        console.log(`   Codificado:       ${encoded.toString(16).padStart(8, '0')}`);

        // Sin error
        const decoded1 = ErrorCorrection.decode(encoded);
        console.log(`   Sin error:        ${decoded1.data.toString(16).padStart(7, '0')} ${decoded1.corrected ? '(corregido)' : '✅'}`);

        // Con 1 error
        const corrupted1 = encoded ^ (1 << 15);
        const decoded2 = ErrorCorrection.decode(corrupted1);
        console.log(`   1 bit flipado:    ${decoded2.data.toString(16).padStart(7, '0')} ${decoded2.corrected ? '✅ (corregido)' : '❌'}`);

        // Con 2 errores
        const corrupted2 = encoded ^ (1 << 15) ^ (1 << 20);
        const decoded3 = ErrorCorrection.decode(corrupted2);
        console.log(`   2 bits flipados:  ${decoded3.uncorrectable ? '❌ No corregible (detectado)' : 'ERROR'}\n`);

        return decoded1.data === testData && decoded2.data === testData && decoded3.uncorrectable;
    }
}

// Auto-test si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    const success = ErrorCorrection.test();
    console.log(success ? "✅ Tests pasados" : "❌ Tests fallidos");
    process.exit(success ? 0 : 1);
}
