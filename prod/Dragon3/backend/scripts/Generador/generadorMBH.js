import sharp from 'sharp';
import crypto from 'crypto';

const SECRET = 'MBH_SECRET_FROM_ENV';
const TOTAL_BYTES = 96;

class MBHGeneradorFinal {
    async sellarImagen(rutaEntrada, rutaSalida) {
        console.log(`🔐 Generando Sello MBH Final: ${rutaEntrada}`);

        // 1. LEER IMAGEN ORIGINAL
        const imagen = sharp(rutaEntrada);
        const metadata = await imagen.metadata();
        const buffer = await imagen.ensureAlpha().raw().toBuffer();
        const channels = 4;

        // 2. GENERAR SELLO INVISIBLE
        const id = `MBH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const hashVisible = crypto.createHash('sha256').update(buffer.slice(0, 10000)).digest('hex').slice(0, 16);

        let jsonPayload = JSON.stringify({
    id: id,
    h: hashVisible
        while (jsonPayload.length < TOTAL_BYTES) jsonPayload += " ";
        const cifrado = this.xorCifrar(jsonPayload, SECRET);
        const datos = Buffer.from(cifrado, 'base64');

        // 3. ESTEGANOGRAFÍA EN 3 PUNTOS
        const y = Math.floor(metadata.height * 0.8);
        const cx = Math.floor(metadata.width / 2);
        const puntos = [{x:cx-100,y}, {x:cx,y}, {x:cx+100,y}];
        const chunk = TOTAL_BYTES/3;

        puntos.forEach((p, i) => {
            this.escribir(buffer, metadata.width, metadata.height, channels, p, datos.slice(i*chunk, (i+1)*chunk));
        });

        // 4. CREAR IMAGEN CON METADATOS ORIGINALES (shar lo hace automáticamente)
        const bufferConPixeles = await sharp(rutaEntrada)
            .composite([{
                input: buffer,
                raw: { width: metadata.width, height: metadata.height, channels },
                top: 0, left: 0, blend: 'over'
            }])
            .withMetadata()  // ESTO PRESERVA EL EXIF ORIGINAL
            .png()
            .toBuffer();

        // 5. AÑADIR ETIQUETA BLADE COMO METADATO DE TEXTO
        // Usamos el truco de añadirla como "comment" en el EXIF
        const infoBlade = JSON.stringify({
            "Sello_ID": id,
            "Certificacion": "MBH (Made By Humans)",
            "Integridad": hashVisible,
            "Verificar": `https://bladecorporation.net/verify/${id}`
        });

        // Extraer metadatos existentes del buffer
        const metadataTemp = await sharp(bufferConPixeles).metadata();

        // Guardar imagen final con la etiqueta en un campo de metadatos
        await sharp(bufferConPixeles)
            .withMetadata({
                exif: {
                    IFD0: {
                        // Usamos Copyright y Artist para almacenar la info
                        Copyright: 'Blade Corporation 2025',
                        Artist: infoBlade  // Aquí almacenamos nuestra etiqueta JSON
                    }
                }
            })
            .toFile(rutaSalida);

        console.log(`✅ Sello Final: ${id}`);
        console.log(`   Etiqueta guardada en campo Artist del EXIF`);
        console.log(`   EXIF original PRESERVADO + Copyright añadido`);
    }

    xorCifrar(t, k) {
        const b = Buffer.from(t), K = Buffer.from(k), o = Buffer.alloc(b.length);
        for(let i = 0; i < b.length; i++) o[i] = b[i] ^ K[i % K.length];
        return o.toString('base64');
    }

    escribir(b,w,h,c,p,d) {
        let x = 0;
        for(let i = -4; i <= 4; i++) {
            for(let j = -4; j <= 4; j++) {
                if(x >= d.length) return;
                const k = ((p.y + i) * w + (p.x + j)) * c;
                if(k + 3 < b.length) {
                    b[k] = (b[k] & 248) | ((d[x] >> 5) & 7);
                    b[k + 1] = (b[k + 1] & 248) | ((d[x] >> 2) & 7);
                    b[k + 2] = (b[k + 2] & 252) | (d[x] & 3);
                    x++;
                }
            }
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    new MBHGeneradorFinal().sellarImagen(process.argv[2] || 'Atardecer.jpg', process.argv[3] || 'final.png');
}
