import { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import chokidar from 'chokidar';

import os from 'os'; // ← Añade esta línea

import { DragonDB } from './src/backend/database.js';
import { GeneradorMBH } from './src/backend/generadorMBH.js';
import { LicenseManager } from './src/backend/license.js';
import { analizarImagenMBH } from './src/backend/analizador_v5.js';
import { analizarImagenRapido } from './src/backend/analizador_v6.js';
import { telemetry } from './src/backend/telemetry.js';
import { generarInformeProyecto } from './src/backend/reportePDF.js';
import { crearMenu } from './menu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE = 'Main';

// ✅ RUTA FIJA PARA PROYECTOS
let proyectosBasePath = path.join(os.homedir(), '.dragon3', 'Dragon3_Projects');

if (!fs.existsSync(proyectosBasePath)) {
  fs.mkdirSync(proyectosBasePath, { recursive: true });
  telemetry.info(MODULE, `📁 Carpeta base de proyectos creada: ${proyectosBasePath}`);
}

// ✅ DB CON RUTA FIJA (usando database.js)
const db = new DragonDB(); // ← Importante: sin parámetros
const licenseManager = new LicenseManager(db);
const generador = new GeneradorMBH(db, licenseManager);

let configWindow;
let mainWindow;
let tray = null;
const rutasProyectos = new Map();
let watcher = null;
let imagenPendiente = null;
let isBackground = false;

// ============================================================
//  DETECTAR MODO SEGUNDO PLANO
// ============================================================
const args = process.argv.slice(1);
if (args.includes('--background') || args.includes('--hidden')) {
  isBackground = true;
  telemetry.info(MODULE, '🐉 Dragon3 iniciado en modo segundo plano');
}

// ============================================================
//  ARRANQUE AUTOMÁTICO CON EL SISTEMA
// ============================================================
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true
});

// ============================================================
//  NOTIFICACIONES NATIVAS
// ============================================================
function enviarNotificacion(titulo, mensaje, tipo = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notificacion-nativa', { titulo, mensaje, tipo });
  }
  try {
    if (tray && !tray.isDestroyed()) {
      let icon = nativeImage.createFromPath(path.join(__dirname, 'resources', 'icon.ico'));
      if (icon.isEmpty()) icon = nativeImage.createEmpty();
      tray.displayBalloon({
        icon: icon,
        title: titulo,
        content: mensaje,
        iconType: tipo === 'ok' ? 'info' : tipo === 'error' ? 'error' : 'warning'
      });
    }
  } catch (err) {
    telemetry.debug(MODULE, `Globo en tray no soportado: ${err.message}`);
  }
  try {
    let iconPath = path.join(__dirname, 'resources', 'icon.ico');
    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
    const notification = { title: titulo, body: mensaje, icon, silent: false, timeoutType: 'default' };
    const notif = new Notification(notification);
    notif.show();
  } catch (err) {
    telemetry.debug(MODULE, `Notificación nativa no soportada: ${err.message}`);
  }
}

// ============================================================
//  WATCHER (VIGILA LA CARPETA RAÍZ RECURSIVAMENTE)
// ============================================================
function iniciarWatcher(carpeta) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (!carpeta || !fs.existsSync(carpeta)) {
    telemetry.warn(MODULE, `Carpeta raíz no válida: ${carpeta}`);
    return;
  }

  // Obtener prefijo para ignorar archivos ya sellados
  let prefijo = '';

  watcher = chokidar.watch(carpeta, {
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
    ignored: (path) => /(^|[\/\\])\../.test(path) || path.includes('Originales'),
    persistent: true,
    ignoreInitial: true,
    depth: undefined // recursivo
  });

  watcher.on('add', async (filePath) => {
    // Solo imágenes
    if (!filePath.match(/\.(jpg|jpeg|png|tiff|bmp)$/i)) return;

    // 🔥 OBTENER PREFIJO PARA IGNORAR ARCHIVOS YA SELLADOS
    const config = await db.obtenerConfiguracion();
    prefijo = config.prefijo_usuario || 'DEM';
    
    // 🔥 SI EL ARCHIVO YA TIENE EL FORMATO DE SELLO, IGNORARLO
    const basename = path.basename(filePath);
    const patronSellado = new RegExp(`_${prefijo}_[0-9A-F]{7}\\.(png|jpg|jpeg|tiff|bmp)$`, 'i');
    if (patronSellado.test(basename)) {
      telemetry.debug(MODULE, `⏭️ Archivo ya sellado, ignorado: ${basename}`);
      return;
    }

    telemetry.info(MODULE, `📁 Archivo detectado: ${filePath}`);

    const modoAutomatico = Number(config.modo_automatico) || 1;

    telemetry.info(MODULE, `🔧 Modo automático: ${modoAutomatico}`);

    if (modoAutomatico === 1) {
      // ============================================================
      //  MODO AUTOMÁTICO (crea proyecto automáticamente por carpeta)
      // ============================================================
      telemetry.info(MODULE, `🔒 Sellando automáticamente: ${path.basename(filePath)}`);
      try {
        // Obtener el nombre de la carpeta donde está la imagen (será el proyecto)
        const carpetaProyecto = path.basename(path.dirname(filePath));
        const outputDir = path.dirname(filePath);

        // Buscar si ya existe un proyecto con ese nombre
        const todosProyectos = await db.obtenerTodos();
        let proyecto = todosProyectos.find(p => p.proyecto_nombre === carpetaProyecto);

        // Si no existe, crearlo automáticamente
        if (!proyecto) {
          const idNumerico = await db.obtenerSiguienteId();
          proyecto = await db.crearProyecto(
            idNumerico,
            config.cliente_por_defecto || 'Sin cliente',
            config.obra_por_defecto || 'Sin obra',
            carpetaProyecto,
            config.coleccion_por_defecto || null,
            config.derechos_por_defecto || 'Todos los derechos reservados',
            config.email_usuario || '',
            config.sincronizar_blade_por_defecto || 0,
            false,
            `Proyecto automático: ${carpetaProyecto}`
          );
          telemetry.info(MODULE, `📁 Proyecto creado automáticamente: ${carpetaProyecto} (ID: ${proyecto.id})`);
        }

        const cliente = config.cliente_por_defecto || 'Sin cliente';
        const obra = config.obra_por_defecto || 'Sin obra';
        const coleccion = config.coleccion_por_defecto || null;
        const derechos = config.derechos_por_defecto || 'Todos los derechos reservados';
        const email_contacto = config.email_usuario || '';
        const compartir_blade = config.sincronizar_blade_por_defecto || 0;

        const resultado = await generador.sellarImagen(filePath, null, {
          id_numerico: 0,
          cliente,
          obra,
          proyecto_nombre: carpetaProyecto,
          coleccion,
          derechos,
          email_contacto,
          compartir_blade,
          outputDir,
          proyectoId: proyecto.id
        });

        if (resultado.ok) {
          telemetry.info(MODULE, `✅ Sellado automático completado: ${resultado.id}`);
          enviarNotificacion('✅ Imagen sellada', `ID: ${resultado.id}\n${path.basename(filePath)}`, 'ok');
          
          // 🔥 Notificar al frontend para que recargue el árbol y actualice la licencia
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('recargar-arbol');
            mainWindow.webContents.send('actualizar-licencia');
          }
        } else {
          telemetry.error(MODULE, `❌ Error en sellado automático: ${resultado.error}`);
          enviarNotificacion('❌ Error al sellar', resultado.error, 'error');
        }
      } catch (err) {
        telemetry.error(MODULE, `❌ Error crítico en sellado automático: ${err.message}`);
        enviarNotificacion('❌ Error crítico', err.message, 'error');
      }
    } else {
      // ============================================================
      //  MODO MANUAL (con interfaz)
      // ============================================================
      telemetry.info(MODULE, `🔄 Modo manual: enviando notificación para ${path.basename(filePath)}`);
      imagenPendiente = filePath;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('imagen-detectada', { ruta: filePath });
      } else {
        createWindow();
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('imagen-detectada', { ruta: filePath });
          }
        }, 1500);
      }
    }
  });

  telemetry.info(MODULE, `👁️ Watcher iniciado en: ${carpeta} (recursivo)`);
}

function detenerWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    telemetry.info(MODULE, '👁️ Watcher detenido');
  }
}

// ============================================================
//  VENTANAS
// ============================================================
function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
  });
  configWindow.loadFile('renderer/configWindow.html');
  configWindow.on('closed', () => { configWindow = null; });
}

function createWindow(forzarMostrar = false) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    show: forzarMostrar || !isBackground,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      enableBlinkFeatures: 'Prompt',
    },
  });
  if (isBackground && !tray) createTray();
  mainWindow.loadFile('renderer/index.html');
  mainWindow.on('closed', () => { mainWindow = null; });

  const menu = crearMenu({
    nuevoProyecto: () => { if (mainWindow) mainWindow.webContents.send('menu-nuevo-proyecto'); },
    abrirProyecto: () => { if (mainWindow) mainWindow.webContents.send('menu-abrir-proyecto'); },
    generarInforme: () => { if (mainWindow) mainWindow.webContents.send('menu-generar-informe'); },
    abrirConfiguracion: () => { if (mainWindow) mainWindow.webContents.send('menu-abrir-configuracion'); },
    activarPremium: () => { if (mainWindow) mainWindow.webContents.send('menu-activar-premium'); },
    manualUsuario: () => { if (mainWindow) mainWindow.webContents.send('menu-manual-usuario'); },
    acercaDe: () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Acerca de Dragon3',
        message: '🐉 Dragon3 - Marca de Agua Forense',
        detail: `Versión: 1.0\n\nSistema de protección forense para fotógrafos profesionales.\nIntegra Stardust + Vogel y metadatos forenses.\n\n© 2026 Blade Corporation`
      });
    },
    soporte: () => { shell.openExternal('mailto:gustavo.herraiz@gmail.com'); }
  });
  Menu.setApplicationMenu(menu);
}

// ============================================================
//  TRAY
// ============================================================
function createTray() {
  if (tray) return;
  let iconPath = path.join(__dirname, 'resources', 'icon.ico');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🐉 Abrir Dragon3',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow(true);
        }
      }
    },
    {
      label: '⚙️ Configuración',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('menu-abrir-configuracion');
        } else {
          createWindow(true);
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('menu-abrir-configuracion');
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: '❌ Salir',
      click: () => {
        if (watcher) watcher.close();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('🐉 Dragon3');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow(true);
    }
  });
  telemetry.info(MODULE, '👁️ Icono en la bandeja creado');
}

// ============================================================
//  APP
// ============================================================
app.whenReady().then(async () => {
  await db._ensureOpen();
  const config = await db.obtenerConfiguracion();

  if (config.ruta_proyectos) {
    proyectosBasePath = config.ruta_proyectos;
    telemetry.info(MODULE, `📁 Ruta de proyectos configurada: ${proyectosBasePath}`);
  }

  createTray();

  if (!config.ruta_proyectos) {
    createConfigWindow();
  } else {
    createWindow();
    if (config.activar_watcher && config.ruta_proyectos) {
      iniciarWatcher(config.ruta_proyectos);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!config.ruta_proyectos) createConfigWindow();
      else createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !watcher) app.quit();
});

// ============================================================
//  MANEJADORES IPC
// ============================================================
ipcMain.handle('get-proyectos', async () => {
  try { return await db.obtenerTodos(); }
  catch (err) { telemetry.error(MODULE, `Error get-proyectos: ${err.message}`); throw err; }
});

ipcMain.handle('crear-proyecto', async (event, { cliente, obra, proyecto_nombre, coleccion, derechos, email_contacto, compartir_blade, descripcion }) => {
  try {
    const idNumerico = await db.obtenerSiguienteId();
    const nombreCarpeta = proyecto_nombre || `Proyecto_${idNumerico}`;
    const proyecto = await db.crearProyecto(
      idNumerico,
      cliente || 'Sin cliente',
      obra || 'Sin obra',
      nombreCarpeta,
      coleccion || null,
      derechos || 'Todos los derechos reservados',
      email_contacto || '',
      compartir_blade ? 1 : 0,
      false,
      descripcion || null
    );
    const projectFolder = path.join(proyectosBasePath, nombreCarpeta);
    rutasProyectos.set(proyecto.id, projectFolder);
    if (!fs.existsSync(projectFolder)) fs.mkdirSync(projectFolder, { recursive: true });
    return proyecto;
  } catch (err) {
    telemetry.error(MODULE, `Error crear-proyecto: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('guardar-configuracion-inicial', async (event, data) => {
  try {
    await db.actualizarConfiguracion({
      ruta_proyectos: data.ruta_proyectos,
      nombre_autor: data.nombre_autor || null,
      email_usuario: data.email_usuario || null,
      derechos_por_defecto: data.derechos_por_defecto || 'Cesión de derechos al cliente, reservándose el de autoría',
      compartir_blade_por_defecto: data.compartir_blade_por_defecto ? 1 : 0,
      prefijo_usuario: data.prefijo_usuario || null,
      web_autor: data.web_autor || null,
      telefono_autor: data.telefono_autor || null,
      direccion_autor: data.direccion_autor || null,
      descripcion_autor: data.descripcion_autor || null,
      redes_sociales: data.redes_sociales || null,
      logo_path: data.logo_path || null,
      coleccion_por_defecto: data.coleccion_por_defecto || null,
      mover_original: data.mover_original || 'mover',
      activar_watcher: data.activar_watcher !== undefined ? data.activar_watcher : 1,
      modo_automatico: data.modo_automatico !== undefined ? data.modo_automatico : 1,
      proyecto_por_defecto: data.proyecto_por_defecto || null,
      subcarpeta_por_defecto: data.subcarpeta_por_defecto || null,
      cliente_por_defecto: data.cliente_por_defecto || null,
      obra_por_defecto: data.obra_por_defecto || null
    });
    if (data.prefijo_usuario) {
      await db.run('UPDATE licencia SET prefijo_usuario = ? WHERE rowid = 1', data.prefijo_usuario);
    }
    if (!fs.existsSync(data.ruta_proyectos)) fs.mkdirSync(data.ruta_proyectos, { recursive: true });
    proyectosBasePath = data.ruta_proyectos;
    if (configWindow) configWindow.close();
    createWindow();
    if (data.activar_watcher && data.ruta_proyectos) {
      iniciarWatcher(data.ruta_proyectos);
    }
    return { ok: true };
  } catch (err) {
    telemetry.error(MODULE, `Error guardando configuración inicial: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('seleccionar-carpeta', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow || configWindow, {
      properties: ['openDirectory'],
      title: 'Selecciona una carpeta'
    });
    return result.canceled ? null : result.filePaths[0];
  } catch (err) {
    telemetry.error(MODULE, `Error seleccionar-carpeta: ${err.message}`);
    return null;
  }
});

// --- ELIMINAR PROYECTO ---
ipcMain.handle('eliminar-proyecto', async (event, { proyectoId }) => {
  try {
    const id = parseInt(proyectoId);
    if (isNaN(id)) throw new Error('ID de proyecto inválido');
    const proyecto = await db.buscarPorId(id);
    if (!proyecto) throw new Error('Proyecto no encontrado');
    let folderName = proyecto.proyecto_nombre || `${proyecto.cliente}_${proyecto.obra}` || `Proyecto_${proyecto.id}`;
    const folderPath = path.join(proyectosBasePath, folderName);
    if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
    rutasProyectos.delete(id);
    await db.eliminarProyecto(id);
    return { ok: true };
  } catch (err) {
    telemetry.error(MODULE, `Error eliminando proyecto: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('obtener-ruta-proyecto', async (event, { proyectoId }) => {
  try {
    const id = parseInt(proyectoId);
    if (isNaN(id)) return null;
    if (rutasProyectos.has(id)) return rutasProyectos.get(id);
    const proyecto = await db.buscarPorId(id);
    if (!proyecto) return null;
    const folderName = proyecto.proyecto_nombre || `${proyecto.cliente}_${proyecto.obra}`;
    if (!folderName) return null;
    const folderPath = path.join(proyectosBasePath, folderName);
    if (fs.existsSync(folderPath)) {
      rutasProyectos.set(id, folderPath);
      return folderPath;
    }
    return null;
  } catch (err) {
    telemetry.error(MODULE, `Error obtener-ruta-proyecto: ${err.message}`);
    return null;
  }
});

// --- SUBCARPETAS ---
ipcMain.handle('listar-subcarpetas', async (event, { proyectoId }) => {
  try {
    const id = parseInt(proyectoId);
    if (isNaN(id)) return [];
    const proyecto = await db.buscarPorId(id);
    if (!proyecto) return [];
    const folderName = proyecto.proyecto_nombre || `${proyecto.cliente}_${proyecto.obra}`;
    if (!folderName) return [];
    const basePath = path.join(proyectosBasePath, folderName);
    if (!fs.existsSync(basePath)) return [];
    const items = fs.readdirSync(basePath, { withFileTypes: true });
    return items.filter(item => item.isDirectory()).map(item => item.name);
  } catch (err) {
    telemetry.error(MODULE, `Error listando subcarpetas: ${err.message}`);
    return [];
  }
});

ipcMain.handle('crear-subcarpeta', async (event, { proyectoId, nombre }) => {
  try {
    const id = parseInt(proyectoId);
    if (isNaN(id)) throw new Error('ID de proyecto inválido');
    const proyecto = await db.buscarPorId(id);
    if (!proyecto) throw new Error('Proyecto no encontrado');
    const folderName = proyecto.proyecto_nombre || `${proyecto.cliente}_${proyecto.obra}` || `Proyecto_${proyecto.id}`;
    const basePath = path.join(proyectosBasePath, folderName);
    const newPath = path.join(basePath, nombre);
    if (fs.existsSync(newPath)) throw new Error('La carpeta ya existe');
    fs.mkdirSync(newPath, { recursive: true });
    telemetry.info(MODULE, `📁 Subcarpeta creada: ${newPath}`);
    return { ok: true, path: newPath };
  } catch (err) {
    telemetry.error(MODULE, `Error creando subcarpeta: ${err.message}`);
    throw err;
  }
});

// --- SELLADO INDIVIDUAL ---
ipcMain.handle('sellar-imagen', async (event, { rutaEntrada, cliente, obra, proyecto_nombre, coleccion, derechos, email_contacto, compartir_blade, idNumerico, proyectoId, subcarpeta }) => {
  try {
    let outputDir = path.dirname(rutaEntrada);
    let folderName = null;
    if (proyectoId) {
      const id = parseInt(proyectoId);
      if (isNaN(id)) throw new Error('ID de proyecto inválido');
      const proyecto = await db.buscarPorId(id);
      if (proyecto) {
        let baseDir = rutasProyectos.get(id);
        if (!baseDir) {
          folderName = proyecto.proyecto_nombre || `${proyecto.cliente}_${proyecto.obra}` || `Proyecto_${proyecto.id}`;
          baseDir = path.join(proyectosBasePath, folderName);
          rutasProyectos.set(id, baseDir);
        }
        outputDir = baseDir;
        if (subcarpeta && subcarpeta.trim() !== '') outputDir = path.join(outputDir, subcarpeta.trim());
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      } else {
        throw new Error(`Proyecto con ID ${id} no encontrado en BD`);
      }
    } else if (proyecto_nombre) {
      folderName = proyecto_nombre;
      outputDir = path.join(proyectosBasePath, folderName);
      if (subcarpeta && subcarpeta.trim() !== '') outputDir = path.join(outputDir, subcarpeta.trim());
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    }

    const config = await db.obtenerConfiguracion();
    const resultado = await generador.sellarImagen(rutaEntrada, null, {
      id_numerico: idNumerico || 0,
      cliente: cliente || config.cliente_por_defecto || 'Por determinar',
      obra: obra || 'Sin obra',
      proyecto_nombre: folderName,
      coleccion: coleccion || null,
      derechos: derechos || config.derechos_por_defecto || 'Todos los derechos reservados',
      email_contacto: email_contacto || config.email_usuario || '',
      compartir_blade: compartir_blade || config.sincronizar_blade_por_defecto || 0,
      outputDir,
      proyectoId: proyectoId || null
    });

    if (resultado.ok && imagenPendiente && imagenPendiente === rutaEntrada) {
      const configActual = await db.obtenerConfiguracion();
      const moverOpcion = configActual.mover_original || 'mover';
      const dirname = path.dirname(rutaEntrada);
      const basename = path.basename(rutaEntrada);
      const originalDir = path.join(dirname, 'Originales');
      if (moverOpcion === 'mover') {
        if (!fs.existsSync(originalDir)) fs.mkdirSync(originalDir, { recursive: true });
        fs.renameSync(rutaEntrada, path.join(originalDir, basename));
        telemetry.info(MODULE, `📦 Original movido a: ${originalDir}`);
      } else if (moverOpcion === 'eliminar') {
        fs.unlinkSync(rutaEntrada);
        telemetry.info(MODULE, `🗑️ Original eliminado: ${rutaEntrada}`);
      }
      imagenPendiente = null;
    }
    return resultado;
  } catch (error) {
    telemetry.error(MODULE, `Error sellar-imagen: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

// --- SELLADO POR LOTES ---
let procesoActivo = false;
let cancelarProcesamiento = false;

ipcMain.handle('sellar-lote', async (event, { rutas, metadatosComunes }) => {
  if (procesoActivo) throw new Error('Ya hay un proceso de sellado en curso.');
  procesoActivo = true;
  cancelarProcesamiento = false;
  const resultados = { ok: [], fallos: [] };
  const total = rutas.length;
  let procesados = 0, fallidos = 0;
  let tiempoInicio = Date.now();
  let tiempos = [];

  const enviarProgreso = (rutaActual = null, estado = 'procesando') => {
    const elapsed = (Date.now() - tiempoInicio) / 1000;
    const media = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
    const restantes = total - procesados;
    const tiempoEstimado = media > 0 ? media * restantes : 0;
    event.sender.send('progreso-sellado', {
      total, procesados, fallidos, rutaActual, estado,
      tiempoEstimado: Math.round(tiempoEstimado),
      tiempoTranscurrido: Math.round(elapsed),
      porc: total > 0 ? Math.round((procesados / total) * 100) : 0,
      cancelable: true
    });
  };

  try {
    enviarProgreso(null, 'iniciando');
    const baseMetadatos = {
      cliente: metadatosComunes.cliente || 'Sin cliente',
      obra: metadatosComunes.obra || 'Sin obra',
      proyecto_nombre: metadatosComunes.proyecto_nombre || null,
      coleccion: metadatosComunes.coleccion || null,
      derechos: metadatosComunes.derechos || 'Todos los derechos reservados',
      email_contacto: metadatosComunes.email_contacto || '',
      compartir_blade: metadatosComunes.compartir_blade || 0,
      proyectoId: metadatosComunes.proyectoId || null,
      outputDir: metadatosComunes.outputDir || null,
      subcarpeta: metadatosComunes.subcarpeta || null
    };
    for (let i = 0; i < total; i++) {
      if (cancelarProcesamiento) {
        enviarProgreso(null, 'cancelado');
        throw new Error('Procesamiento cancelado');
      }
      const ruta = rutas[i];
      enviarProgreso(ruta, 'procesando');
      try {
        const resultado = await generador.sellarImagen(ruta, null, baseMetadatos);
        if (resultado.ok) resultados.ok.push({ ruta, rutaSalida: resultado.ruta, id: resultado.id });
        else { resultados.fallos.push({ ruta, error: resultado.error }); fallidos++; }
      } catch (err) { resultados.fallos.push({ ruta, error: err.message }); fallidos++; }
      procesados++;
      tiempos.push((Date.now() - tiempoInicio) / 1000);
      enviarProgreso(ruta, 'procesando');
    }
    enviarProgreso(null, 'finalizado');
    return { ok: true, resultados, total, procesados, fallidos };
  } catch (err) {
    enviarProgreso(null, 'error');
    return { ok: false, error: err.message, resultados };
  } finally {
    procesoActivo = false;
    cancelarProcesamiento = false;
  }
});

ipcMain.handle('cancelar-sellado-lote', async () => {
  if (procesoActivo) { cancelarProcesamiento = true; return { ok: true }; }
  return { ok: false, error: 'No hay proceso activo' };
});

// --- ANÁLISIS ---
ipcMain.handle('analizar-imagen', async (event, { ruta, modo = 'rapido' }) => {
  try {
    if (modo === 'forense') return await analizarImagenMBH(ruta, db, 540000);
    else return await analizarImagenRapido(ruta, db, 15000, true);
  } catch (error) {
    telemetry.error(MODULE, `Error analizar-imagen: ${error.message}`);
    return { identificado: false, error: error.message };
  }
});

// --- DIÁLOGOS ---
ipcMain.handle('seleccionar-archivo', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  } catch (err) { telemetry.error(MODULE, `Error seleccionar-archivo: ${err.message}`); return null; }
});

ipcMain.handle('seleccionar-archivos-multiples', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff'] }],
    });
    return result.canceled ? null : result.filePaths;
  } catch (err) { telemetry.error(MODULE, `Error seleccionar-archivos-multiples: ${err.message}`); return null; }
});

ipcMain.handle('guardar-imagen', async (event, { rutaOrigen, nombreSugerido }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: nombreSugerido || 'imagen_sellada.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (!result.canceled && result.filePath) { fs.copyFileSync(rutaOrigen, result.filePath); return result.filePath; }
    return null;
  } catch (err) { telemetry.error(MODULE, `Error guardar-imagen: ${err.message}`); return null; }
});

ipcMain.handle('guardar-archivo', async (event, { defaultPath, filters }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultPath || 'archivo.pdf',
      filters: filters || [{ name: 'Todos', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePath;
  } catch (err) { telemetry.error(MODULE, `Error guardar-archivo: ${err.message}`); return null; }
});

// --- GESTIÓN DE CARPETAS Y ARCHIVOS ---
ipcMain.handle('listar-archivos', async (event, { carpeta }) => {
  try {
    if (!fs.existsSync(carpeta)) return [];
    const files = fs.readdirSync(carpeta, { withFileTypes: true });
    return files.map(file => ({ name: file.name, path: path.join(carpeta, file.name), isDirectory: file.isDirectory() }));
  } catch (err) { telemetry.error(MODULE, `Error listando archivos: ${err.message}`); throw err; }
});

ipcMain.handle('eliminar-archivo', async (event, { ruta }) => {
  try {
    if (!fs.existsSync(ruta)) throw new Error('El archivo no existe');
    if (fs.statSync(ruta).isDirectory()) throw new Error('Es una carpeta');
    fs.unlinkSync(ruta);
    telemetry.info(MODULE, `🗑️ Archivo eliminado: ${ruta}`);
    return { ok: true };
  } catch (err) { telemetry.error(MODULE, `Error eliminando archivo: ${err.message}`); throw err; }
});

ipcMain.handle('eliminar-carpeta', async (event, { ruta }) => {
  try {
    if (!fs.existsSync(ruta)) throw new Error('La carpeta no existe');
    if (!fs.statSync(ruta).isDirectory()) throw new Error('No es una carpeta');
    fs.rmSync(ruta, { recursive: true, force: true });
    telemetry.info(MODULE, `🗑️ Carpeta eliminada: ${ruta}`);
    return { ok: true };
  } catch (err) { telemetry.error(MODULE, `Error eliminando carpeta: ${err.message}`); throw err; }
});

ipcMain.handle('abrir-archivo', async (event, { ruta }) => {
  try {
    if (!fs.existsSync(ruta)) throw new Error('El archivo no existe');
    await shell.openPath(ruta);
    telemetry.info(MODULE, `📂 Archivo abierto: ${ruta}`);
    return { ok: true };
  } catch (err) { telemetry.error(MODULE, `Error abriendo archivo: ${err.message}`); throw err; }
});

// --- LICENCIAS ---
ipcMain.handle('obtener-estado-licencia', async () => {
  try { return await licenseManager.obtenerEstado(); }
  catch (err) { telemetry.error(MODULE, `Error obtener-estado-licencia: ${err.message}`); return null; }
});

ipcMain.handle('activar-licencia', async (event, { clave, email }) => {
  try {
    const result = await licenseManager.activarPremium(clave, email);
    return result;
  } catch (err) {
    telemetry.error(MODULE, `Error activar-licencia: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('generar-clave', async (event, { email }) => {
  try {
    const clave = licenseManager.generarClave(email);
    return { ok: true, clave };
  } catch (err) {
    telemetry.error(MODULE, `Error generar-clave: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// --- CONTAR SELLOS ---
ipcMain.handle('contar-sellos', async (event, { proyectoId }) => {
  try {
    const id = parseInt(proyectoId);
    if (isNaN(id)) return 0;
    return await db.contarSellosPorProyecto(id);
  } catch (err) {
    telemetry.error(MODULE, `Error contando sellos: ${err.message}`);
    return 0;
  }
});

// ✅ AÑADE AQUÍ EL NUEVO HANDLER
ipcMain.handle('obtener-sello-por-hash', async (event, { hash }) => {
    try {
        if (!hash) return null;
        const sello = await db.get('SELECT * FROM sellos WHERE hash_suffix = ?', hash);
        return sello || null;
    } catch (err) {
        telemetry.error(MODULE, `Error obteniendo sello por hash: ${err.message}`, { hash });
        return null;
    }
});

// --- PERFIL / CONFIGURACIÓN ---
ipcMain.handle('obtener-perfil', async () => {
  try {
    const config = await db.obtenerConfiguracion();
    return {
      nombre_autor: config.nombre_autor || '',
      email_usuario: config.email_usuario || '',
      web_autor: config.web_autor || '',
      telefono_autor: config.telefono_autor || '',
      logo_path: config.logo_path || '',
      direccion_autor: config.direccion_autor || '',
      descripcion_autor: config.descripcion_autor || '',
      redes_sociales: config.redes_sociales || '',
      prefijo_usuario: config.prefijo_usuario || '',
      ruta_proyectos: config.ruta_proyectos || '',
      coleccion_por_defecto: config.coleccion_por_defecto || '',
      derechos_por_defecto: config.derechos_por_defecto || 'Todos los derechos reservados',
      sincronizar_blade_por_defecto: config.sincronizar_blade_por_defecto || 0,
      mover_original: config.mover_original || 'mover',
      activar_watcher: config.activar_watcher !== undefined ? config.activar_watcher : 1,
      modo_automatico: config.modo_automatico !== undefined ? config.modo_automatico : 1,
      proyecto_por_defecto: config.proyecto_por_defecto || null,
      subcarpeta_por_defecto: config.subcarpeta_por_defecto || null,
      cliente_por_defecto: config.cliente_por_defecto || null,
      obra_por_defecto: config.obra_por_defecto || null
    };
  } catch (err) {
    telemetry.error(MODULE, `Error obtener-perfil: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('actualizar-perfil', async (event, perfil) => {
  try {
    const camposPermitidos = [
      'nombre_autor', 'email_usuario', 'web_autor', 'telefono_autor',
      'logo_path', 'direccion_autor', 'descripcion_autor', 'redes_sociales',
      'ruta_proyectos', 'coleccion_por_defecto',
      'derechos_por_defecto', 'sincronizar_blade_por_defecto', 'prefijo_usuario',
      'mover_original', 'activar_watcher',
      'modo_automatico', 'proyecto_por_defecto', 'subcarpeta_por_defecto',
      'cliente_por_defecto', 'obra_por_defecto'
    ];
    const datos = {};
    for (const key of camposPermitidos) {
      if (perfil[key] !== undefined) datos[key] = perfil[key];
    }
    await db.actualizarConfiguracion(datos);

    if (perfil.prefijo_usuario) {
      await db.run('UPDATE licencia SET prefijo_usuario = ? WHERE rowid = 1', perfil.prefijo_usuario);
      telemetry.info(MODULE, `Prefijo de usuario actualizado en licencia: ${perfil.prefijo_usuario}`);
    }

    if (perfil.ruta_proyectos) proyectosBasePath = perfil.ruta_proyectos;

    // Reiniciar watcher si cambia la configuración
    const config = await db.obtenerConfiguracion();
    if (config.activar_watcher && config.ruta_proyectos) {
      iniciarWatcher(config.ruta_proyectos);
    } else {
      detenerWatcher();
    }

    telemetry.info(MODULE, 'Perfil del fotógrafo actualizado');
    return { ok: true };
  } catch (err) {
    telemetry.error(MODULE, `Error actualizar-perfil: ${err.message}`);
    throw err;
  }
});

// ==========================================================
// ✅ NUEVO: ACTUALIZAR METADATOS DE UNA IMAGEN SELLADA
// ==========================================================
ipcMain.handle('actualizar-metadatos', async (event, { rutaImagen, metadatos }) => {
    try {
        // Importar dinámicamente el módulo
        const { actualizarMetadatos } = await import('./src/backend/actualizarMetadatos.js');
        
        telemetry.info(MODULE, `📝 Recibida solicitud de actualización de metadatos para: ${path.basename(rutaImagen)}`);
        
        const resultado = await actualizarMetadatos(rutaImagen, metadatos, db);
        
        if (resultado.ok) {
            telemetry.info(MODULE, `✅ Metadatos actualizados correctamente: ${resultado.idCompleto}`);
            // Notificar al frontend que se actualizó la licencia (por si cambió algo)
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('actualizar-licencia');
                mainWindow.webContents.send('recargar-arbol');
            }
        } else {
            telemetry.error(MODULE, `❌ Error actualizando metadatos: ${resultado.mensaje}`);
        }
        
        return resultado;
        
    } catch (err) {
        telemetry.error(MODULE, `❌ Error en handler actualizar-metadatos: ${err.message}`, { stack: err.stack });
        return {
            ok: false,
            mensaje: `Error: ${err.message}`
        };
    }
});

// ==========================================================
// ✅ NUEVO: LEER METADATOS DE UNA IMAGEN SELLADA
// ==========================================================
ipcMain.handle('leer-metadatos-imagen', async (event, { rutaImagen }) => {
    try {
        const { leerMetadatosImagen } = await import('./src/backend/actualizarMetadatos.js');
        
        telemetry.debug(MODULE, `📤 Leyendo metadatos de: ${path.basename(rutaImagen)}`);
        
        const resultado = await leerMetadatosImagen(rutaImagen);
        return resultado;
        
    } catch (err) {
        telemetry.error(MODULE, `❌ Error en handler leer-metadatos-imagen: ${err.message}`, { stack: err.stack });
        return {
            ok: false,
            mensaje: `Error: ${err.message}`
        };
    }
});

// --- GENERAR INFORME PDF ---
ipcMain.handle('generar-informe-pdf', async (event, { proyectoId, rutaSalida }) => {
  try {
    return await generarInformeProyecto(proyectoId, rutaSalida, db);
  } catch (err) {
    telemetry.error(MODULE, `Error generando PDF: ${err.message}`);
    throw err;
  }
});

// ============================================================
//  EXPLORADOR DE CARPETAS CON IMÁGENES SELLADAS
// ============================================================

/**
 * Obtiene el árbol de carpetas que contienen imágenes selladas
 * a partir de la carpeta raíz de proyectos.
 */
ipcMain.handle('obtener-arbol-sellados', async () => {
  try {
    const config = await db.obtenerConfiguracion();
    const raiz = config.ruta_proyectos || proyectosBasePath;
    
    if (!raiz || !fs.existsSync(raiz)) {
      return { ok: false, error: 'Carpeta raíz no encontrada' };
    }

    // Obtener prefijo para identificar imágenes selladas
    const prefijo = config.prefijo_usuario || 'DEM';
    const patronSellado = new RegExp(`_${prefijo}_[0-9A-F]{7}\\.png$`, 'i');

    // Construir árbol de carpetas con imágenes selladas
    const arbol = construirArbolSellados(raiz, patronSellado);
    
    return { ok: true, arbol, raiz };
  } catch (err) {
    telemetry.error(MODULE, `Error obteniendo árbol de sellados: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

/**
 * Función recursiva para construir el árbol de carpetas con imágenes selladas
 */
function construirArbolSellados(dir, patronSellado) {
  const resultado = {
    nombre: path.basename(dir),
    ruta: dir,
    sellados: [],
    subcarpetas: []
  };

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    // Primero, buscar imágenes selladas en esta carpeta
    for (const item of items) {
      if (item.isFile() && patronSellado.test(item.name)) {
        resultado.sellados.push({
          nombre: item.name,
          ruta: path.join(dir, item.name)
        });
      }
    }

    // Luego, procesar subcarpetas recursivamente (solo si contienen sellados o subcarpetas con sellados)
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'Originales') {
        const subDir = path.join(dir, item.name);
        const subArbol = construirArbolSellados(subDir, patronSellado);
        // Solo añadir si tiene sellados o subcarpetas con sellados
        if (subArbol.sellados.length > 0 || subArbol.subcarpetas.length > 0) {
          resultado.subcarpetas.push(subArbol);
        }
      }
    }

    // Ordenar carpetas alfabéticamente
    resultado.subcarpetas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return resultado;
  } catch (err) {
    telemetry.debug(MODULE, `Error leyendo carpeta ${dir}: ${err.message}`);
    return resultado;
  }
}

// ============================================================
//  LOG DE INICIO
// ============================================================
telemetry.info(MODULE, `🐉 Dragon3 iniciado. Proyectos en: ${proyectosBasePath}`);