import sharp from 'sharp';
import readline from 'readline';

const SECRET = 'Lobosolitario1969$';
const BYTES_PER_POINT = 32;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function verificar(archivo) {
    console.log(`🔍 Auditoría MBH Final: ${archivo}`);
    const imagen = sharp(archivo);
    const metadata = await imagen.metadata();

    console.log("\n1️⃣  METADATOS (Supervivencia):");
    
    let etiquetaEncontrada = null;
    let exifData = null;
    
    if (metadata.exif) {
        console.log(`   📦 EXIF:      ✅ VIVO (${metadata.exif.length} bytes)`);
        
        // Convertir EXIF a string para búsqueda
        const exifStr = metadata.exif.toString('binary');
        
        // Buscar información de cámara/software
        const makeMatch = exifStr.match(/Make[\x00]*([^\x00]{1,50})/);
        const softwareMatch = exifStr.match(/Software[\x00]*([^\x00]{1,50})/);
        const artistMatch = exifStr.match(/Artist[\x00]*([^\x00]{1,200})/);
        const copyrightMatch = exifStr.match(/Copyright[\x00]*([^\x00]{1,100})/);
        
        if (makeMatch) {
            const camara = makeMatch[1].replace(/[^\x20-\x7E]/g, ' ').trim();
            console.log(`   📷 Equipo:    ${camara}`);
        }
        
        if (softwareMatch) {
            const software = softwareMatch[1].replace(/[^\x20-\x7E]/g, ' ').trim();
            console.log(`   🖥️  Software:  ${software}`);
        }
        
        if (copyrightMatch) {
            const copyright = copyrightMatch[1].replace(/[^\x20-\x7E]/g, ' ').trim();
            console.log(`   © Copyright: ${copyright}`);
        }
        
        // Buscar nuestra etiqueta en el campo Artist
        if (artistMatch) {
            try {
                const artistStr = artistMatch[1].replace(/[^\x20-\x7E]/g, '');
                const etiqueta = JSON.parse(artistStr);
                if (etiqueta.Sello_ID && etiqueta.Sello_ID.startsWith('MBH-')) {
                    etiquetaEncontrada = etiqueta.Sello_ID;
                    console.log(`   ✅ Etiqueta:  OK (${etiquetaEncontrada})`);
                    console.log(`   📝 Blade Corp: ${etiqueta.Certificacion || 'MBH (Made By Humans)'}`);
                }
            } catch (e) {
                // Si no es JSON, buscar MBH directamente en el string
                if (artistMatch[1].includes('MBH-')) {
                    const mbhMatch = artistMatch[1].match(/MBH-[A-F0-9]{8}/);
                    if (mbhMatch) {
                        etiquetaEncontrada = mbhMatch[0];
                        console.log(`   ✅ Etiqueta:  OK (${etiquetaEncontrada})`);
                    }
                } else {
                    console.log(`   ❌ Etiqueta:  NO ENCONTRADA EN EXIF`);
                }
            }
        } else {
            // Búsqueda alternativa en todo el EXIF
            const mbhMatch = exifStr.match(/MBH-[A-F0-9]{8}/);
            if (mbhMatch) {
                etiquetaEncontrada = mbhMatch[0];
                console.log(`   ✅ Etiqueta:  OK (${etiquetaEncontrada}) (encontrada en EXIF)`);
            } else {
                console.log(`   ❌ Etiqueta:  NO ENCONTRADA`);
            }
        }
    } else {
        console.log("   ❌ EXIF MUERTO o ausente");
    }

    console.log("\n2️⃣  FORENSE:");
    const { data: buffer, info } = await imagen.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const y = Math.floor(info.height * 0.8);
    const cx = Math.floor(info.width / 2);
    const puntos = [{x:cx-100,y}, {x:cx,y}, {x:cx+100,y}];
    let total = Buffer.alloc(0);
    puntos.forEach(p => total = Buffer.concat([total, leer(buffer, info.width, info.height, 4, p)]));

    rl.question('🔑 Clave: ', (k) => {
        const jsonStr = xor(total.toString('base64'), k);
        let idSello = null;
        try { 
            const json = JSON.parse(jsonStr.trim());
            if (json.id && json.id.startsWith('MBH-')) {
                idSello = json.id;
            }
        } catch (e) {}

        if (idSello) {
            console.log(`   ✅ Sello:     VÁLIDO (${idSello})`);
            if (etiquetaEncontrada && etiquetaEncontrada === idSello) {
                console.log(`   ✨ INTEGRIDAD: PERFECTA`);
                console.log(`   🎯 TRIPLE VERIFICACIÓN COMPLETADA:`);
                console.log(`      1. Sello invisible: ✅`);
                console.log(`      2. EXIF original: ✅`);
                console.log(`      3. Etiqueta Blade: ✅`);
            } else if (etiquetaEncontrada) {
                console.log(`   ⚠️  ATENCIÓN: Sello (${idSello}) y etiqueta (${etiquetaEncontrada}) NO coinciden`);
            }
        } else {
            console.log(`   ❌ Sello:     INVALIDO`);
        }
        rl.close();
    });
}

function leer(b,w,h,c,p) { 
    let o=Buffer.alloc(BYTES_PER_POINT),x=0; 
    for(let i=-4;i<=4;i++) {
        for(let j=-4;j<=4;j++){ 
            if(x>=32) return o; 
            const k=((p.y+i)*w+(p.x+j))*c; 
            if(k+3<b.length){ 
                o[x]=((b[k]&7)<<5)|((b[k+1]&7)<<2)|(b[k+2]&3); 
                x++; 
            }
        }
    } 
    return o; 
}

function xor(t,k) { 
    try{ 
        const b=Buffer.from(t,'base64'), K=Buffer.from(k), o=Buffer.alloc(b.length); 
        for(let i=0;i<b.length;i++) o[i]=b[i]^K[i%K.length]; 
        return o.toString(); 
    } catch(e){ return""; } 
}

if(process.argv[2]) verificar(process.argv[2]);