import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src/backend');
const destDir = path.join(__dirname, '../dist_obf');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const filesToObfuscate = ['generadorMBH.js', 'MotorEspacial.js'];

filesToObfuscate.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  const code = fs.readFileSync(srcPath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    deadCodeInjection: true,
    debugProtection: true,
    disableConsoleOutput: true,
    renameGlobals: true,
    renameVariables: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
  });
  fs.writeFileSync(destPath, obfuscated.getObfuscatedCode());
  console.log(`✅ Ofuscado: ${file}`);
});
