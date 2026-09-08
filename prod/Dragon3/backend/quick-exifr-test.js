// quick-exifr-test.js
import * as exifr from 'exifr';
import fs from 'fs';

(async () => {
  try {
    const buf = fs.readFileSync('/ruta/a/una/imagen/real.jpg'); // usa una imagen real que subas a Dragon
    const meta = await exifr.parse(buf, { tiff: true, ifd0: true, exif: true, userComment: true });
    console.log(meta);
  } catch (e) {
    console.error(e);
  }
})();