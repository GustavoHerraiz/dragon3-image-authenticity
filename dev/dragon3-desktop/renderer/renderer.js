const { ipcRenderer } = require('electron');
const path = require('path');

// ============================================================
//  ELEMENTOS DEL DOM
// ============================================================
const selectorProyecto = document.getElementById('selector-proyecto');
const btnNuevoProyecto = document.getElementById('btn-nuevo-proyecto');
const btnCrearProyecto = document.getElementById('btn-crear-proyecto');
const btnCancelarProyecto = document.getElementById('btn-cancelar-proyecto');
const formNuevoProyecto = document.getElementById('form-nuevo-proyecto');
const nombreProyectoInput = document.getElementById('nombre-proyecto');
const descripcionProyectoInput = document.getElementById('descripcion-proyecto');
const detallesProyecto = document.getElementById('detalles-proyecto');
const listaArchivosDiv = document.getElementById('lista-archivos');
const btnRefrescarArchivos = document.getElementById('btn-refrescar-archivos');
const btnEliminarCarpeta = document.getElementById('btn-eliminar-carpeta');
const btnGenerarPDF = document.getElementById('btn-generar-pdf');

const btnSeleccionarEntrada = document.getElementById('btn-seleccionar-entrada');
const rutaEntrada = document.getElementById('ruta-entrada');
const btnSellar = document.getElementById('btn-sellar');
const btnSellarLote = document.getElementById('btn-sellar-lote');
const btnEjecutarSellar = document.getElementById('btn-ejecutar-sellar');
const btnEjecutarLote = document.getElementById('btn-ejecutar-lote');
const btnCancelarSellado = document.getElementById('btn-cancelar-sellado');
const camposSellado = document.getElementById('campos-sellado');
const progresoSellado = document.getElementById('progreso-sellado');
const selectorSubcarpeta = document.getElementById('selector-subcarpeta');
const btnNuevaSubcarpeta = document.getElementById('btn-nueva-subcarpeta');

const clienteInput = document.getElementById('cliente');
const obraInput = document.getElementById('obra');
const coleccionInput = document.getElementById('coleccion');
const derechosInput = document.getElementById('derechos');
const emailContactoInput = document.getElementById('email-contacto');
const compartirBladeCheck = document.getElementById('compartir-blade');

const panelProgreso = document.getElementById('panel-progreso');
const progresoTexto = document.getElementById('progreso-texto');
const progresoContador = document.getElementById('progreso-contador');
const progresoBarra = document.getElementById('progreso-barra');
const progresoTiempo = document.getElementById('progreso-tiempo');
const progresoArchivo = document.getElementById('progreso-archivo');
const progresoEstado = document.getElementById('progreso-estado');
const btnCancelarLote = document.getElementById('btn-cancelar-lote');

const btnSeleccionarAnalisis = document.getElementById('btn-seleccionar-analisis');
const rutaAnalisis = document.getElementById('ruta-analisis');
const modoAnalisis = document.getElementById('modo-analisis');
const btnAnalizar = document.getElementById('btn-analizar');
const resultadoAnalisis = document.getElementById('resultado-analisis');

const modalPrompt = document.getElementById('modal-prompt');
const modalPromptTitulo = document.getElementById('modal-prompt-titulo');
const modalPromptInput = document.getElementById('modal-prompt-input');
const modalPromptAceptar = document.getElementById('modal-prompt-aceptar');
const modalPromptCancelar = document.getElementById('modal-prompt-cancelar');

const logsDiv = document.getElementById('logs');

// ============================================================
//  NUEVOS ELEMENTOS DE LICENCIA Y CONFIGURACIÓN
// ============================================================
const licenciaStatus = document.getElementById('licencia-status');
const btnActivarPremium = document.getElementById('btn-activar-premium');
const modalActivarPremium = document.getElementById('modal-activar-premium');
const btnCerrarActivarPremium = document.getElementById('btn-cerrar-activar-premium');
const btnCancelarActivarPremium = document.getElementById('btn-cancelar-activar-premium');
const btnActivarPremiumConfirmar = document.getElementById('btn-activar-premium-confirmar');
const inputEmailPremium = document.getElementById('input-email-premium');
const inputClavePremium = document.getElementById('input-clave-premium');
const mensajeActivacion = document.getElementById('mensaje-activacion');

const btnConfiguracion = document.getElementById('btn-configuracion');
const modalConfiguracion = document.getElementById('modal-configuracion');
const btnCerrarConfiguracion = document.getElementById('btn-cerrar-configuracion');
const btnGuardarConfiguracion = document.getElementById('btn-guardar-configuracion');
const btnCancelarConfiguracion = document.getElementById('btn-cancelar-configuracion');

const configRutaProyectos = document.getElementById('config-ruta-proyectos');
const btnConfigSeleccionarCarpeta = document.getElementById('btn-config-seleccionar-carpeta');
const configNombreAutor = document.getElementById('config-nombre-autor');
const configEmailAutor = document.getElementById('config-email-autor');
const configWebAutor = document.getElementById('config-web-autor');
const configTelefonoAutor = document.getElementById('config-telefono-autor');
const configDireccionAutor = document.getElementById('config-direccion-autor');
const configDescripcionAutor = document.getElementById('config-descripcion-autor');
const configRedesAutor = document.getElementById('config-redes-autor');
const configLogoPath = document.getElementById('config-logo-path');
const btnConfigSeleccionarLogo = document.getElementById('btn-config-seleccionar-logo');
const configDerechosDefecto = document.getElementById('config-derechos-defecto');
const configCompartirBladeDefecto = document.getElementById('config-compartir-blade-defecto');
const configColeccionDefecto = document.getElementById('config-coleccion-defecto');
const configPrefijoUsuario = document.getElementById('config-prefijo-usuario');

const configCarpetaEntrada = document.getElementById('config-carpeta-entrada');
const btnConfigSeleccionarCarpetaEntrada = document.getElementById('btn-config-seleccionar-carpeta-entrada');
const configActivarWatcher = document.getElementById('config-activar-watcher');
const configMoverOriginal = document.getElementById('config-mover-original');
const configMensaje = document.getElementById('config-mensaje');

const btnPendientes = document.getElementById('btn-pendientes');

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let rutaEntradaSeleccionada = null;
let rutaAnalisisSeleccionada = null;
let proyectos = [];
let carpetaProyectoActual = null;
let rutaActual = null;
let rutaBaseProyecto = null;
let procesoActivo = false;
let carpetaEntradaActual = '';

// ============================================================
//  FUNCIONES AUXILIARES
// ============================================================
function agregarLog(mensaje, tipo = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-${tipo}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
  logsDiv.appendChild(entry);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

function ocultarFormularioSellado() {
  camposSellado.style.display = 'none';
  btnSellar.style.display = 'inline-block';
  btnSellarLote.style.display = 'inline-block';
}

// ============================================================
//  LICENCIA (NUEVO)
// ============================================================
async function actualizarEstadoLicencia() {
  try {
    const estado = await ipcRenderer.invoke('obtener-estado-licencia');
    if (!estado) {
      licenciaStatus.textContent = '❌ Error de licencia';
      return;
    }
    // Mostrar mensaje con color según estado
    let color = '#ffd93d'; // amarillo por defecto
    if (estado.premium) {
      color = '#51cf66'; // verde
    } else if (estado.sellos_usados >= estado.limite) {
      color = '#ff6b6b'; // rojo
    }
    licenciaStatus.style.color = color;
    licenciaStatus.textContent = estado.mensaje || 'Licencia desconocida';
  } catch (err) {
    licenciaStatus.textContent = '❌ Error';
    agregarLog(`Error actualizando licencia: ${err.message}`, 'error');
  }
}

// ============================================================
//  CONTADOR DE PENDIENTES
// ============================================================
async function actualizarContadorPendientes() {
  try {
    const config = await ipcRenderer.invoke('obtener-perfil');
    const carpetaEntrada = config.carpeta_entrada || '';
    carpetaEntradaActual = carpetaEntrada;
    if (!carpetaEntrada) {
      btnPendientes.textContent = '📦 Pendientes (0)';
      return;
    }
    const total = await ipcRenderer.invoke('contar-pendientes', { carpetaEntrada });
    btnPendientes.textContent = `📦 Pendientes (${total})`;
  } catch (err) {
    btnPendientes.textContent = '📦 Pendientes (?)';
  }
}

// ============================================================
//  PROMPT PERSONALIZADO
// ============================================================
function mostrarPrompt(mensaje, valorPredeterminado = '') {
  return new Promise((resolve) => {
    modalPromptTitulo.textContent = mensaje;
    modalPromptInput.value = valorPredeterminado;
    modalPrompt.style.display = 'flex';
    modalPromptInput.focus();
    modalPromptInput.select();

    const limpiar = () => {
      modalPrompt.style.display = 'none';
      modalPromptAceptar.removeEventListener('click', aceptarHandler);
      modalPromptCancelar.removeEventListener('click', cancelarHandler);
      document.removeEventListener('keydown', keyHandler);
    };

    const aceptarHandler = () => {
      limpiar();
      resolve(modalPromptInput.value);
    };

    const cancelarHandler = () => {
      limpiar();
      resolve(null);
    };

    const keyHandler = (e) => {
      if (e.key === 'Enter') aceptarHandler();
      if (e.key === 'Escape') cancelarHandler();
    };

    modalPromptAceptar.addEventListener('click', aceptarHandler);
    modalPromptCancelar.addEventListener('click', cancelarHandler);
    document.addEventListener('keydown', keyHandler);
  });
}

// ============================================================
//  CONFIGURACIÓN
// ============================================================
async function cargarConfiguracion() {
  try {
    const config = await ipcRenderer.invoke('obtener-perfil');
    configRutaProyectos.value = config.ruta_proyectos || '';
    configNombreAutor.value = config.nombre_autor || '';
    configEmailAutor.value = config.email_usuario || '';
    configWebAutor.value = config.web_autor || '';
    configTelefonoAutor.value = config.telefono_autor || '';
    configDireccionAutor.value = config.direccion_autor || '';
    configDescripcionAutor.value = config.descripcion_autor || '';
    configRedesAutor.value = config.redes_sociales || '';
    configLogoPath.value = config.logo_path || '';
    configDerechosDefecto.value = config.derechos_por_defecto || 'Cesión de derechos al cliente, reservándose el de autoría';
    configCompartirBladeDefecto.checked = config.sincronizar_blade_por_defecto === 1;
    configColeccionDefecto.value = config.coleccion_por_defecto || '';
    configPrefijoUsuario.value = config.prefijo_usuario || '';
    configCarpetaEntrada.value = config.carpeta_entrada || '';
    configActivarWatcher.checked = config.activar_watcher !== undefined ? config.activar_watcher === 1 : true;
    configMoverOriginal.value = config.mover_original || 'mover';
    await actualizarContadorPendientes();
  } catch (err) {
    agregarLog(`Error cargando configuración: ${err.message}`, 'error');
  }
}

async function guardarConfiguracion() {
  const ruta = configRutaProyectos.value.trim();
  if (!ruta) {
    configMensaje.innerHTML = '<span style="color:#ff6b6b;">⚠️ La carpeta de proyectos es obligatoria.</span>';
    return;
  }

  const datos = {
    ruta_proyectos: ruta,
    nombre_autor: configNombreAutor.value.trim() || null,
    email_usuario: configEmailAutor.value.trim() || null,
    web_autor: configWebAutor.value.trim() || null,
    telefono_autor: configTelefonoAutor.value.trim() || null,
    direccion_autor: configDireccionAutor.value.trim() || null,
    descripcion_autor: configDescripcionAutor.value.trim() || null,
    redes_sociales: configRedesAutor.value.trim() || null,
    logo_path: configLogoPath.value.trim() || null,
    derechos_por_defecto: configDerechosDefecto.value,
    sincronizar_blade_por_defecto: configCompartirBladeDefecto.checked ? 1 : 0,
    coleccion_por_defecto: configColeccionDefecto.value.trim() || null,
    prefijo_usuario: configPrefijoUsuario.value.trim().toUpperCase() || null,
    carpeta_entrada: configCarpetaEntrada.value.trim() || null,
    mover_original: configMoverOriginal.value || 'mover',
    activar_watcher: configActivarWatcher.checked ? 1 : 0
  };

  try {
    await ipcRenderer.invoke('actualizar-perfil', datos);
    configMensaje.innerHTML = '<span style="color:#51cf66;">✅ Configuración guardada correctamente.</span>';
    agregarLog('✅ Configuración guardada correctamente', 'ok');
    await actualizarContadorPendientes();
    setTimeout(() => {
      modalConfiguracion.style.display = 'none';
      configMensaje.innerHTML = '';
    }, 1500);
  } catch (err) {
    configMensaje.innerHTML = `<span style="color:#ff6b6b;">❌ Error: ${err.message}</span>`;
    agregarLog(`❌ Error guardando configuración: ${err.message}`, 'error');
  }
}

// ============================================================
//  PROYECTOS Y ARCHIVOS
// ============================================================
async function cargarProyectos() {
  try {
    proyectos = await ipcRenderer.invoke('get-proyectos');
    const selectedValue = selectorProyecto.value;
    selectorProyecto.innerHTML = '<option value="">-- Crear nuevo --</option>';
    proyectos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const nombreMostrado = p.proyecto_nombre || `${p.cliente} - ${p.obra}`;
      opt.textContent = `${nombreMostrado} (${p.hash_suffix})`;
      selectorProyecto.appendChild(opt);
    });
    if (selectedValue && selectorProyecto.querySelector(`option[value="${selectedValue}"]`)) {
      selectorProyecto.value = selectedValue;
    }
    mostrarDetallesProyecto(selectorProyecto.value);
  } catch (err) {
    agregarLog(`Error cargando proyectos: ${err.message}`, 'error');
  }
}

function mostrarDetallesProyecto(idProyecto) {
  if (!idProyecto) {
    detallesProyecto.style.display = 'none';
    listaArchivosDiv.innerHTML = '<span style="color:#888;">Selecciona un proyecto para ver sus archivos</span>';
    carpetaProyectoActual = null;
    rutaActual = null;
    rutaBaseProyecto = null;
    return;
  }
  const proyecto = proyectos.find(p => p.id === parseInt(idProyecto));
  if (!proyecto) {
    detallesProyecto.style.display = 'none';
    carpetaProyectoActual = null;
    rutaActual = null;
    rutaBaseProyecto = null;
    return;
  }
  detallesProyecto.style.display = 'block';
  document.getElementById('proy-nombre').textContent = proyecto.proyecto_nombre || 'Sin nombre';
  document.getElementById('proy-descripcion').textContent = proyecto.descripcion || '(sin descripción)';

  (async () => {
    try {
      const total = await ipcRenderer.invoke('contar-sellos', { proyectoId: idProyecto });
      document.getElementById('proy-contador').textContent = total || 0;
    } catch (err) {
      document.getElementById('proy-contador').textContent = '?';
      agregarLog(`Error contando sellos: ${err.message}`, 'error');
    }
  })();

  (async () => {
    try {
      const carpeta = await ipcRenderer.invoke('obtener-ruta-proyecto', { proyectoId: idProyecto });
      if (carpeta) {
        carpetaProyectoActual = carpeta;
        rutaBaseProyecto = carpeta;
        rutaActual = carpeta;
        await cargarArchivosProyecto(carpeta);
      } else {
        carpetaProyectoActual = null;
        rutaActual = null;
        rutaBaseProyecto = null;
        listaArchivosDiv.innerHTML = '<span style="color:#888;">Carpeta no encontrada</span>';
      }
    } catch (err) {
      agregarLog(`Error obteniendo carpeta: ${err.message}`, 'error');
    }
  })();
}

async function cargarArchivosProyecto(carpeta) {
  if (!carpeta) {
    listaArchivosDiv.innerHTML = '<span style="color:#888;">Selecciona un proyecto para ver sus archivos</span>';
    return;
  }
  rutaActual = carpeta;
  listaArchivosDiv.innerHTML = '<span style="color:#aaa;">⏳ Cargando archivos...</span>';
  try {
    const archivos = await ipcRenderer.invoke('listar-archivos', { carpeta });
    if (!archivos || archivos.length === 0) {
      listaArchivosDiv.innerHTML = '<span style="color:#888;">📂 La carpeta está vacía</span>';
      return;
    }
    const ordenados = archivos.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    let html = '<ul style="list-style:none;padding:0;margin:0;">';
    if (rutaBaseProyecto && carpeta !== rutaBaseProyecto) {
      const parentPath = path.dirname(carpeta);
      const parentEscapado = parentPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1a2e;">
          <span style="cursor:pointer;color:#ffd93d;" onclick="navegarA('${parentEscapado}')">📂 .. (Subir)</span>
        </li>
      `;
    }
    ordenados.forEach(archivo => {
      const nombre = archivo.name;
      const rutaCompleta = archivo.path;
      const esCarpeta = archivo.isDirectory;
      const icono = esCarpeta ? '📁' : '📄';
      const color = esCarpeta ? '#ffd93d' : '#8be9fd';
      const rutaEscapada = rutaCompleta.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const onclick = esCarpeta ? `navegarA('${rutaEscapada}')` : `window.electronAbrirArchivo('${rutaEscapada}')`;
      const eliminarFunc = esCarpeta ? 'window.electronEliminarCarpeta' : 'window.electronEliminarArchivo';
      html += `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1a2e;">
          <span style="cursor:pointer;color:${color};" onclick="${onclick}">
            ${icono} ${nombre}
          </span>
          <button onclick="${eliminarFunc}('${rutaEscapada}')" 
                  style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;" 
                  title="${esCarpeta ? 'Eliminar carpeta' : 'Eliminar archivo'}">✖</button>
        </li>
      `;
    });
    html += '</ul>';
    listaArchivosDiv.innerHTML = html;
  } catch (err) {
    listaArchivosDiv.innerHTML = `<span style="color:#ff6b6b;">❌ Error al cargar archivos: ${err.message}</span>`;
    agregarLog(`Error cargando archivos de ${carpeta}: ${err.message}`, 'error');
  }
}

window.navegarA = async function(ruta) {
  if (!ruta) return;
  if (rutaBaseProyecto && !ruta.startsWith(rutaBaseProyecto)) {
    agregarLog('No se puede acceder fuera del proyecto', 'error');
    return;
  }
  rutaActual = ruta;
  await cargarArchivosProyecto(ruta);
};

async function cargarSubcarpetas(proyectoId) {
  if (!proyectoId) {
    selectorSubcarpeta.innerHTML = '<option value="">(Raíz del proyecto)</option>';
    return;
  }
  try {
    const carpetas = await ipcRenderer.invoke('listar-subcarpetas', { proyectoId });
    selectorSubcarpeta.innerHTML = '<option value="">(Raíz del proyecto)</option>';
    carpetas.forEach(nombre => {
      const opt = document.createElement('option');
      opt.value = nombre;
      opt.textContent = nombre;
      selectorSubcarpeta.appendChild(opt);
    });
  } catch (err) {
    agregarLog(`Error cargando subcarpetas: ${err.message}`, 'error');
  }
}

// ============================================================
//  NOTIFICACIÓN DE IMAGEN DETECTADA (CARPETA CALIENTE)
// ============================================================
let notificacionTimeout = null;

ipcRenderer.on('imagen-detectada', (event, { ruta }) => {
  const nombre = path.basename(ruta);
  agregarLog(`📁 Imagen detectada en carpeta caliente: ${nombre}`, 'info');

  const notificacionDiv = document.createElement('div');
  notificacionDiv.id = 'notificacion-hotfolder';
  notificacionDiv.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; border: 2px solid #ffd93d; padding: 20px 30px;
    border-radius: 8px; z-index: 1000; max-width: 600px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.8);
    text-align: center;
  `;
  notificacionDiv.innerHTML = `
    <h3 style="margin:0 0 10px 0; color:#ffd93d;">📁 Nueva imagen detectada</h3>
    <p style="margin:0 0 10px 0; font-size:14px; color:#ccc;">
      <strong>${nombre}</strong>
    </p>
    <div style="display:flex; gap:10px; justify-content:center;">
      <button id="btn-sellar-ahora" style="background:#0f3460; border:none; color:white; padding:8px 20px; border-radius:4px; cursor:pointer;">🔒 Sellar ahora</button>
      <button id="btn-descartar-imagen" style="background:#555; border:none; color:white; padding:8px 20px; border-radius:4px; cursor:pointer;">Descartar</button>
    </div>
  `;
  document.body.appendChild(notificacionDiv);

  if (notificacionTimeout) clearTimeout(notificacionTimeout);
  notificacionTimeout = setTimeout(async () => {
    if (notificacionDiv.parentNode) {
      notificacionDiv.remove();
      try {
        await ipcRenderer.invoke('mover-archivo-pendiente', { ruta });
        agregarLog(`📦 Imagen movida a Pendientes por timeout: ${nombre}`, 'info');
        await actualizarContadorPendientes();
      } catch (err) {
        agregarLog(`❌ Error moviendo imagen a Pendientes: ${err.message}`, 'error');
      }
    }
  }, 30000);

  document.getElementById('btn-sellar-ahora').addEventListener('click', () => {
    rutaEntradaSeleccionada = ruta;
    rutaEntrada.textContent = ruta;
    camposSellado.style.display = 'block';
    btnSellar.style.display = 'none';
    btnSellarLote.style.display = 'inline-block';
    if (notificacionDiv.parentNode) {
      notificacionDiv.remove();
      clearTimeout(notificacionTimeout);
    }
    agregarLog(`🔒 Imagen cargada para sellar: ${nombre}`, 'ok');
  });

  document.getElementById('btn-descartar-imagen').addEventListener('click', async () => {
    if (notificacionDiv.parentNode) {
      notificacionDiv.remove();
      clearTimeout(notificacionTimeout);
      try {
        await ipcRenderer.invoke('mover-archivo-pendiente', { ruta });
        agregarLog(`📦 Imagen descartada y movida a Pendientes: ${nombre}`, 'info');
        await actualizarContadorPendientes();
      } catch (err) {
        agregarLog(`❌ Error moviendo imagen a Pendientes: ${err.message}`, 'error');
      }
    }
  });
});

// ============================================================
//  LISTENERS
// ============================================================

// --- LICENCIA: ACTIVAR PREMIUM (NUEVO) ---
btnActivarPremium.addEventListener('click', () => {
  // Pre-rellenar email con el del perfil (si existe)
  (async () => {
    try {
      const perfil = await ipcRenderer.invoke('obtener-perfil');
      inputEmailPremium.value = perfil.email_usuario || '';
    } catch (e) {
      inputEmailPremium.value = '';
    }
  })();
  inputClavePremium.value = '';
  mensajeActivacion.innerHTML = '';
  modalActivarPremium.style.display = 'flex';
});

btnCerrarActivarPremium.addEventListener('click', () => {
  modalActivarPremium.style.display = 'none';
  mensajeActivacion.innerHTML = '';
});

btnCancelarActivarPremium.addEventListener('click', () => {
  modalActivarPremium.style.display = 'none';
  mensajeActivacion.innerHTML = '';
});

modalActivarPremium.addEventListener('click', (e) => {
  if (e.target === modalActivarPremium) {
    modalActivarPremium.style.display = 'none';
    mensajeActivacion.innerHTML = '';
  }
});

btnActivarPremiumConfirmar.addEventListener('click', async () => {
  const email = inputEmailPremium.value.trim();
  const clave = inputClavePremium.value.trim().toUpperCase();

  if (!email) {
    mensajeActivacion.innerHTML = '<span style="color:#ff6b6b;">❌ Introduce tu email.</span>';
    return;
  }
  if (!clave) {
    mensajeActivacion.innerHTML = '<span style="color:#ff6b6b;">❌ Introduce la clave de activación.</span>';
    return;
  }

  mensajeActivacion.innerHTML = '<span style="color:#ffd93d;">⏳ Verificando clave...</span>';
  btnActivarPremiumConfirmar.disabled = true;

  try {
    const result = await ipcRenderer.invoke('activar-licencia', { clave, email });
    if (result.ok) {
      mensajeActivacion.innerHTML = `<span style="color:#51cf66;">✅ ${result.mensaje || 'Licencia activada correctamente.'}</span>`;
      agregarLog(`✅ Licencia Premium activada para ${email}`, 'ok');
      await actualizarEstadoLicencia();
      setTimeout(() => {
        modalActivarPremium.style.display = 'none';
        mensajeActivacion.innerHTML = '';
        btnActivarPremiumConfirmar.disabled = false;
      }, 2000);
    } else {
      mensajeActivacion.innerHTML = `<span style="color:#ff6b6b;">❌ ${result.error || 'Error desconocido'}</span>`;
      agregarLog(`❌ Error activando Premium: ${result.error}`, 'error');
      btnActivarPremiumConfirmar.disabled = false;
    }
  } catch (err) {
    mensajeActivacion.innerHTML = `<span style="color:#ff6b6b;">❌ Error: ${err.message}</span>`;
    agregarLog(`❌ Error activando Premium: ${err.message}`, 'error');
    btnActivarPremiumConfirmar.disabled = false;
  }
});

// --- CONFIGURACIÓN ---
btnConfiguracion.addEventListener('click', () => {
  cargarConfiguracion();
  modalConfiguracion.style.display = 'flex';
  configMensaje.innerHTML = '';
});

btnCerrarConfiguracion.addEventListener('click', () => { modalConfiguracion.style.display = 'none'; });
btnCancelarConfiguracion.addEventListener('click', () => { modalConfiguracion.style.display = 'none'; configMensaje.innerHTML = ''; });
btnGuardarConfiguracion.addEventListener('click', guardarConfiguracion);
modalConfiguracion.addEventListener('click', (e) => {
  if (e.target === modalConfiguracion) {
    modalConfiguracion.style.display = 'none';
    configMensaje.innerHTML = '';
  }
});

// --- PENDIENTES ---
btnPendientes.addEventListener('click', async () => {
  if (!carpetaEntradaActual) {
    agregarLog('❌ No hay carpeta de entrada configurada.', 'error');
    return;
  }
  const result = await ipcRenderer.invoke('abrir-pendientes', { carpetaEntrada: carpetaEntradaActual });
  if (result.ok) {
    agregarLog('📂 Carpeta Pendientes abierta', 'info');
  } else {
    agregarLog(`❌ Error abriendo Pendientes: ${result.error}`, 'error');
  }
});

// --- SELECTORES DE CARPETA Y LOGO ---
btnConfigSeleccionarCarpeta.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('seleccionar-carpeta');
  if (result) configRutaProyectos.value = result;
});

btnConfigSeleccionarCarpetaEntrada.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('seleccionar-carpeta');
  if (result) {
    configCarpetaEntrada.value = result;
    await actualizarContadorPendientes();
  }
});

btnConfigSeleccionarLogo.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('guardar-archivo', {
    defaultPath: 'logo.png',
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'] }]
  });
  if (result) configLogoPath.value = result;
});

// --- NUEVO PROYECTO ---
btnNuevoProyecto.addEventListener('click', () => {
  formNuevoProyecto.style.display = 'block';
  btnNuevoProyecto.style.display = 'none';
  nombreProyectoInput.value = '';
  descripcionProyectoInput.value = '';
  setTimeout(() => nombreProyectoInput.focus(), 100);
});

btnCancelarProyecto.addEventListener('click', () => {
  formNuevoProyecto.style.display = 'none';
  btnNuevoProyecto.style.display = 'inline-block';
});

btnCrearProyecto.addEventListener('click', async () => {
  const nombreProyecto = nombreProyectoInput.value.trim();
  if (!nombreProyecto) {
    agregarLog('❌ Escribe un nombre para el proyecto', 'error');
    nombreProyectoInput.focus();
    return;
  }
  const descripcion = descripcionProyectoInput.value.trim() || null;
  const cliente = clienteInput.value.trim() || 'Sin cliente';
  const obra = obraInput.value.trim() || 'Sin obra';
  const coleccion = coleccionInput.value.trim() || null;
  const derechos = derechosInput.value.trim() || 'Todos los derechos reservados';
  const email_contacto = emailContactoInput.value.trim() || '';
  const compartir_blade = compartirBladeCheck.checked ? 1 : 0;

  try {
    const proyecto = await ipcRenderer.invoke('crear-proyecto', {
      cliente, obra, proyecto_nombre: nombreProyecto, coleccion, derechos, email_contacto, compartir_blade, descripcion
    });
    agregarLog(`📁 Proyecto creado: "${nombreProyecto}"${descripcion ? ` - ${descripcion}` : ''}`, 'ok');
    await cargarProyectos();
    selectorProyecto.value = proyecto.id;
    selectorProyecto.dispatchEvent(new Event('change'));
    nombreProyectoInput.value = '';
    descripcionProyectoInput.value = '';
    formNuevoProyecto.style.display = 'none';
    btnNuevoProyecto.style.display = 'inline-block';
  } catch (err) {
    agregarLog(`❌ Error creando proyecto: ${err.message}`, 'error');
  }
});

// --- SELECTOR DE PROYECTO ---
selectorProyecto.addEventListener('change', async () => {
  formNuevoProyecto.style.display = 'none';
  btnNuevoProyecto.style.display = 'inline-block';
  const id = selectorProyecto.value;
  if (!id) {
    clienteInput.value = '';
    obraInput.value = '';
    detallesProyecto.style.display = 'none';
    carpetaProyectoActual = null;
    rutaActual = null;
    rutaBaseProyecto = null;
    listaArchivosDiv.innerHTML = '<span style="color:#888;">Selecciona un proyecto para ver sus archivos</span>';
    await cargarSubcarpetas(null);
    return;
  }
  const proyecto = proyectos.find(p => p.id === parseInt(id));
  if (proyecto) {
    clienteInput.value = '';
    obraInput.value = '';
    mostrarDetallesProyecto(id);
    await cargarSubcarpetas(id);
  }
});

// --- GENERAR INFORME PDF ---
btnGenerarPDF.addEventListener('click', async () => {
  const idProyecto = selectorProyecto.value;
  if (!idProyecto) {
    agregarLog('❌ Primero selecciona un proyecto', 'error');
    return;
  }
  const proyecto = proyectos.find(p => p.id === parseInt(idProyecto));
  if (!proyecto) {
    agregarLog('❌ Proyecto no encontrado', 'error');
    return;
  }
  const result = await ipcRenderer.invoke('guardar-archivo', {
    defaultPath: `Informe_${proyecto.proyecto_nombre || 'proyecto'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (!result) {
    agregarLog('📄 Generación de PDF cancelada', 'info');
    return;
  }
  agregarLog(`📄 Generando informe PDF para "${proyecto.proyecto_nombre}"...`, 'info');
  try {
    await ipcRenderer.invoke('generar-informe-pdf', { proyectoId: parseInt(idProyecto), rutaSalida: result });
    agregarLog(`✅ Informe PDF generado: ${result}`, 'ok');
  } catch (err) {
    agregarLog(`❌ Error generando PDF: ${err.message}`, 'error');
  }
});

// --- SUBCARPETAS ---
btnNuevaSubcarpeta.addEventListener('click', async () => {
  const idProyecto = selectorProyecto.value;
  if (!idProyecto) {
    agregarLog('Primero selecciona un proyecto', 'error');
    return;
  }
  const idNumerico = parseInt(idProyecto);
  if (isNaN(idNumerico)) {
    agregarLog('ID de proyecto inválido', 'error');
    return;
  }
  const nombre = await mostrarPrompt('Nombre de la nueva carpeta:');
  if (!nombre) return;
  try {
    await ipcRenderer.invoke('crear-subcarpeta', { proyectoId: idNumerico, nombre });
    agregarLog(`📁 Subcarpeta creada: ${nombre}`, 'ok');
    await cargarSubcarpetas(idNumerico);
    selectorSubcarpeta.value = nombre;
  } catch (err) {
    agregarLog(`❌ Error creando subcarpeta: ${err.message}`, 'error');
  }
});

// --- REFRESCAR Y ELIMINAR CARPETA ---
btnRefrescarArchivos.addEventListener('click', async () => {
  if (rutaActual) {
    await cargarArchivosProyecto(rutaActual);
    agregarLog('🔄 Archivos actualizados', 'info');
  } else {
    agregarLog('No hay carpeta seleccionada', 'error');
  }
});

btnEliminarCarpeta.addEventListener('click', async () => {
  const idProyecto = selectorProyecto.value;
  if (!idProyecto) {
    agregarLog('No hay proyecto seleccionado', 'error');
    return;
  }
  const proyecto = proyectos.find(p => p.id === parseInt(idProyecto));
  if (!proyecto) return;
  if (!confirm(`¿Eliminar el proyecto "${proyecto.proyecto_nombre || proyecto.cliente}" y todos sus archivos?`)) return;
  try {
    await ipcRenderer.invoke('eliminar-proyecto', { proyectoId: parseInt(idProyecto) });
    agregarLog(`🗑️ Proyecto eliminado: ${proyecto.proyecto_nombre || proyecto.cliente}`, 'ok');
    await cargarProyectos();
    selectorProyecto.value = '';
    selectorProyecto.dispatchEvent(new Event('change'));
    carpetaProyectoActual = null;
    rutaActual = null;
    rutaBaseProyecto = null;
    listaArchivosDiv.innerHTML = '<span style="color:#888;">Selecciona un proyecto para ver sus archivos</span>';
    await cargarSubcarpetas(null);
  } catch (err) {
    agregarLog(`❌ Error eliminando proyecto: ${err.message}`, 'error');
  }
});

// --- SELECCIONAR IMAGEN (sellado) ---
btnSeleccionarEntrada.addEventListener('click', async () => {
  try {
    const ruta = await ipcRenderer.invoke('seleccionar-archivo');
    if (ruta) {
      rutaEntradaSeleccionada = ruta;
      rutaEntrada.textContent = ruta;
    } else {
      rutaEntradaSeleccionada = null;
      rutaEntrada.textContent = '';
    }
  } catch (err) {
    agregarLog(`Error al seleccionar archivo: ${err.message}`, 'error');
  }
});

// --- BOTONES PRINCIPALES ---
btnSellar.addEventListener('click', () => {
  if (!rutaEntradaSeleccionada) {
    agregarLog('❌ Primero selecciona una imagen con "Seleccionar imagen"', 'error');
    return;
  }
  camposSellado.style.display = 'block';
  btnSellar.style.display = 'none';
  btnSellarLote.style.display = 'inline-block';
});

btnSellarLote.addEventListener('click', () => {
  camposSellado.style.display = 'block';
  btnSellarLote.style.display = 'none';
  btnSellar.style.display = 'inline-block';
});

btnCancelarSellado.addEventListener('click', () => {
  ocultarFormularioSellado();
});

// --- EJECUTAR SELLADO INDIVIDUAL ---
btnEjecutarSellar.addEventListener('click', async () => {
  if (!rutaEntradaSeleccionada) {
    agregarLog('❌ No hay imagen seleccionada para sellar', 'error');
    return;
  }

  const idProyecto = selectorProyecto.value;
  const subcarpeta = selectorSubcarpeta.value || null;
  const cliente = clienteInput.value.trim() || 'Sin cliente';
  const obra = obraInput.value.trim() || 'Sin obra';
  const coleccion = coleccionInput.value.trim() || null;
  const derechos = derechosInput.value.trim() || 'Todos los derechos reservados';
  const email_contacto = emailContactoInput.value.trim() || '';
  const compartir_blade = compartirBladeCheck.checked ? 1 : 0;

  let proyecto_nombre = null;
  if (idProyecto) {
    const proyecto = proyectos.find(p => p.id === parseInt(idProyecto));
    if (proyecto) proyecto_nombre = proyecto.proyecto_nombre;
  }

  agregarLog(`Sellando: ${rutaEntradaSeleccionada} para ${cliente} - ${obra}`);
  progresoSellado.textContent = '⏳ Procesando...';

  try {
    const resultado = await ipcRenderer.invoke('sellar-imagen', {
      rutaEntrada: rutaEntradaSeleccionada,
      cliente, obra, proyecto_nombre, coleccion, derechos, email_contacto, compartir_blade,
      idNumerico: 0,
      proyectoId: idProyecto ? parseInt(idProyecto) : null,
      subcarpeta
    });

    if (resultado.ok) {
      agregarLog(`✅ Sellado exitoso. ID: ${resultado.id}`, 'ok');
      progresoSellado.textContent = `✅ Sellado en: ${resultado.ruta}`;

      if (idProyecto) {
        agregarLog(`💾 Imagen guardada automáticamente en la carpeta del proyecto`, 'ok');
        const carpetaARecargar = rutaActual || rutaBaseProyecto;
        if (carpetaARecargar) {
          await cargarArchivosProyecto(carpetaARecargar);
        } else {
          const carpeta = await ipcRenderer.invoke('obtener-ruta-proyecto', { proyectoId: parseInt(idProyecto) });
          if (carpeta) {
            carpetaProyectoActual = carpeta;
            rutaBaseProyecto = carpeta;
            rutaActual = carpeta;
            await cargarArchivosProyecto(carpeta);
          }
        }
      } else {
        const guardado = await ipcRenderer.invoke('guardar-imagen', {
          rutaOrigen: resultado.ruta,
          nombreSugerido: `${resultado.id}_${path.basename(rutaEntradaSeleccionada)}`
        });
        if (guardado) {
          agregarLog(`💾 Copia guardada en: ${guardado}`, 'ok');
        }
      }
    } else if (resultado.error && resultado.error.includes('Demo agotada')) {
      agregarLog(`❌ ${resultado.error}`, 'error');
      progresoSellado.textContent = '❌ Demo agotada';
      // Actualizar estado de licencia para que se refleje en el header
      await actualizarEstadoLicencia();
    } else {
      agregarLog(`❌ Error al sellar: ${resultado.error}`, 'error');
      progresoSellado.textContent = '❌ Falló';
    }
  } catch (err) {
    agregarLog(`❌ Error en sellado: ${err.message}`, 'error');
    progresoSellado.textContent = '❌ Falló';
  } finally {
    ocultarFormularioSellado();
  }
});

// --- EJECUTAR SELLADO POR LOTES ---
btnEjecutarLote.addEventListener('click', async () => {
  if (procesoActivo) {
    agregarLog('Ya hay un sellado en curso', 'error');
    return;
  }

  const rutas = await ipcRenderer.invoke('seleccionar-archivos-multiples');
  if (!rutas || rutas.length === 0) {
    agregarLog('No se seleccionaron archivos', 'error');
    return;
  }

  const idProyecto = selectorProyecto.value;
  if (!idProyecto) {
    agregarLog('Primero selecciona un proyecto', 'error');
    return;
  }

  const subcarpeta = selectorSubcarpeta.value || null;
  const cliente = clienteInput.value.trim() || 'Sin cliente';
  const obra = obraInput.value.trim() || 'Sin obra';
  const coleccion = coleccionInput.value.trim() || null;
  const derechos = derechosInput.value.trim() || 'Todos los derechos reservados';
  const email_contacto = emailContactoInput.value.trim() || '';
  const compartir_blade = compartirBladeCheck.checked ? 1 : 0;

  const proyecto = proyectos.find(p => p.id === parseInt(idProyecto));
  const proyecto_nombre = proyecto?.proyecto_nombre || null;

  const carpetaBase = await ipcRenderer.invoke('obtener-ruta-proyecto', { proyectoId: parseInt(idProyecto) });
  if (!carpetaBase) {
    agregarLog('❌ No se encontró la carpeta del proyecto en disco.', 'error');
    return;
  }

  let outputDir = carpetaBase;
  if (subcarpeta) {
    outputDir = path.join(carpetaBase, subcarpeta);
  }

  agregarLog(`🚀 Iniciando sellado lote de ${rutas.length} imágenes para ${cliente} - ${obra}`, 'info');
  procesoActivo = true;
  panelProgreso.style.display = 'block';
  btnCancelarLote.style.display = 'inline-block';

  try {
    const resultado = await ipcRenderer.invoke('sellar-lote', {
      rutas,
      metadatosComunes: {
        cliente, obra, proyecto_nombre, coleccion, derechos, email_contacto, compartir_blade,
        proyectoId: parseInt(idProyecto),
        outputDir,
        subcarpeta
      }
    });

    if (resultado.ok) {
      agregarLog(`✅ Sellado lote completado: ${resultado.procesados} imágenes procesadas, ${resultado.fallidos} fallos`, 'ok');
      await cargarArchivosProyecto(outputDir);
    } else {
      agregarLog(`❌ Error en sellado lote: ${resultado.error}`, 'error');
    }
  } catch (err) {
    agregarLog(`❌ Error en sellado lote: ${err.message}`, 'error');
  } finally {
    procesoActivo = false;
    ocultarFormularioSellado();
  }
});

// --- PROGRESO DE LOTE ---
ipcRenderer.on('progreso-sellado', (event, data) => {
  const { total, procesados, fallidos, rutaActual, estado, tiempoEstimado, tiempoTranscurrido, porc, cancelable } = data;

  panelProgreso.style.display = 'block';
  progresoBarra.style.width = `${porc}%`;
  progresoContador.textContent = `${procesados} / ${total}`;

  const tiempoMostrar = tiempoEstimado > 0
    ? `⏱️ ${tiempoTranscurrido}s (est. ${tiempoEstimado}s)`
    : `⏱️ ${tiempoTranscurrido}s`;
  progresoTiempo.textContent = tiempoMostrar;

  if (rutaActual) {
    const nombre = path.basename(rutaActual);
    progresoArchivo.textContent = `📄 ${nombre}`;
  } else if (estado === 'iniciando') {
    progresoArchivo.textContent = '🔄 Iniciando...';
  } else if (estado === 'finalizado') {
    progresoArchivo.textContent = '✅ Completado';
  } else if (estado === 'cancelado') {
    progresoArchivo.textContent = '❌ Cancelado';
  }

  if (estado === 'procesando') {
    progresoEstado.textContent = `⏳ Procesando... (${fallidos > 0 ? fallidos + ' fallos' : 'sin fallos'})`;
    progresoTexto.textContent = `Sellando imágenes...`;
  } else if (estado === 'finalizado') {
    progresoEstado.textContent = `✅ Finalizado (${fallidos} fallos)`;
    progresoTexto.textContent = `✅ Sellado completado`;
    btnCancelarLote.style.display = 'none';
    procesoActivo = false;
  } else if (estado === 'cancelado') {
    progresoEstado.textContent = '❌ Cancelado por el usuario';
    progresoTexto.textContent = '❌ Proceso cancelado';
    btnCancelarLote.style.display = 'none';
    procesoActivo = false;
  } else if (estado === 'error') {
    progresoEstado.textContent = '❌ Error en el proceso';
    progresoTexto.textContent = '❌ Error';
    btnCancelarLote.style.display = 'none';
    procesoActivo = false;
  }

  if (cancelable && estado === 'procesando') {
    btnCancelarLote.style.display = 'inline-block';
  } else {
    btnCancelarLote.style.display = 'none';
  }
});

// --- CANCELAR LOTE ---
btnCancelarLote.addEventListener('click', async () => {
  if (!procesoActivo) return;
  if (!confirm('¿Cancelar el sellado en curso?')) return;
  try {
    await ipcRenderer.invoke('cancelar-sellado-lote');
    agregarLog('⏹️ Cancelando sellado...', 'warn');
  } catch (err) {
    agregarLog(`❌ Error cancelando: ${err.message}`, 'error');
  }
});

// --- ANÁLISIS ---
btnSeleccionarAnalisis.addEventListener('click', async () => {
  try {
    const ruta = await ipcRenderer.invoke('seleccionar-archivo');
    if (ruta) { rutaAnalisisSeleccionada = ruta; rutaAnalisis.textContent = ruta; }
  } catch (err) { agregarLog(`Error al seleccionar archivo: ${err.message}`, 'error'); }
});

btnAnalizar.addEventListener('click', async () => {
  if (!rutaAnalisisSeleccionada) {
    agregarLog('Primero selecciona una imagen para analizar', 'error');
    return;
  }
  const modo = modoAnalisis.value;
  agregarLog(`Analizando (${modo}): ${rutaAnalisisSeleccionada}`);
  resultadoAnalisis.innerHTML = '⏳ Analizando...';
  try {
    const resultado = await ipcRenderer.invoke('analizar-imagen', { ruta: rutaAnalisisSeleccionada, modo });
    if (resultado.identificado) {
      resultadoAnalisis.innerHTML = `
        <div class="resultado-ok">
          <h3>✅ Identificado</h3>
          <p><strong>ID:</strong> ${resultado.hash}</p>
          <p><strong>Cliente:</strong> ${resultado.cliente}</p>
          <p><strong>Obra:</strong> ${resultado.obra}</p>
          <p><strong>Veredicto:</strong> ${resultado.veredicto}</p>
          <p><strong>Integridad legal:</strong> ${resultado.integridad_legal || '✅'}</p>
        </div>
      `;
      agregarLog(`✅ Analizado: ${resultado.hash} - ${resultado.veredicto}`, 'ok');
    } else {
      resultadoAnalisis.innerHTML = `<div class="resultado-error">❌ ${resultado.veredicto || resultado.error}</div>`;
      agregarLog(`❌ No identificado`, 'error');
    }
  } catch (err) {
    agregarLog(`❌ Error en análisis: ${err.message}`, 'error');
    resultadoAnalisis.innerHTML = `<div class="resultado-error">❌ Error: ${err.message}</div>`;
  }
});

// ============================================================
//  FUNCIONES GLOBALES
// ============================================================
window.electronAbrirArchivo = (ruta) => {
  ipcRenderer.invoke('abrir-archivo', { ruta }).catch(err => {
    agregarLog(`Error al abrir archivo: ${err.message}`, 'error');
  });
};

window.electronEliminarArchivo = async (ruta) => {
  if (!confirm(`¿Eliminar este archivo?\n${ruta}`)) return;
  try {
    await ipcRenderer.invoke('eliminar-archivo', { ruta });
    agregarLog(`🗑️ Archivo eliminado: ${path.basename(ruta)}`, 'ok');
    if (rutaActual) await cargarArchivosProyecto(rutaActual);
  } catch (err) {
    agregarLog(`❌ Error eliminando archivo: ${err.message}`, 'error');
  }
};

window.electronEliminarCarpeta = async (ruta) => {
  if (!confirm(`¿Eliminar esta carpeta y todo su contenido?\n${ruta}`)) return;
  try {
    await ipcRenderer.invoke('eliminar-carpeta', { ruta });
    agregarLog(`🗑️ Carpeta eliminada: ${path.basename(ruta)}`, 'ok');
    if (rutaActual) await cargarArchivosProyecto(rutaActual);
  } catch (err) {
    agregarLog(`❌ Error eliminando carpeta: ${err.message}`, 'error');
  }
};


// ============================================================
//  EVENTOS DEL MENÚ PERSONALIZADO (VERSIÓN ROBUSTA)
// ============================================================
ipcRenderer.on('menu-nuevo-proyecto', () => {
  agregarLog('📌 Menú: Nuevo proyecto', 'debug');
  if (typeof btnNuevoProyecto !== 'undefined' && btnNuevoProyecto) {
    btnNuevoProyecto.click();
  } else {
    agregarLog('⚠️ Botón "Nuevo proyecto" no encontrado.', 'error');
  }
});

ipcRenderer.on('menu-abrir-proyecto', () => {
  agregarLog('📌 Menú: Abrir proyecto', 'debug');
  if (typeof selectorProyecto !== 'undefined' && selectorProyecto) {
    selectorProyecto.focus();
  } else {
    agregarLog('⚠️ Selector de proyectos no encontrado.', 'error');
  }
});

ipcRenderer.on('menu-generar-informe', () => {
  agregarLog('📌 Menú: Generar informe PDF', 'debug');
  if (typeof btnGenerarPDF !== 'undefined' && btnGenerarPDF) {
    btnGenerarPDF.click();
  } else {
    agregarLog('⚠️ Botón "Generar informe PDF" no encontrado.', 'error');
  }
});

ipcRenderer.on('menu-abrir-configuracion', () => {
  agregarLog('📌 Menú: Configuración', 'debug');
  if (typeof btnConfiguracion !== 'undefined' && btnConfiguracion) {
    btnConfiguracion.click();
  } else {
    agregarLog('⚠️ Botón "Configuración" no encontrado.', 'error');
  }
});

ipcRenderer.on('menu-activar-premium', () => {
  agregarLog('📌 Menú: Activar Premium', 'debug');
  if (typeof btnActivarPremium !== 'undefined' && btnActivarPremium) {
    btnActivarPremium.click();
  } else {
    agregarLog('⚠️ Botón "Activar Premium" no encontrado.', 'error');
  }
});

ipcRenderer.on('menu-manual-usuario', () => {
  agregarLog('📌 Menú: Manual de usuario', 'debug');
  const btnAyuda = document.getElementById('btn-ayuda');
  if (btnAyuda) {
    btnAyuda.click();
  } else {
    agregarLog('📖 Manual de usuario: consulta la documentación en la web de Dragon3.', 'info');
    // Opcional: abrir enlace
    // shell.openExternal('https://www.bladecorporation.net/docs/dragon3-manual');
  }
});

// ============================================================
//  INICIALIZACIÓN
// ============================================================
cargarProyectos();
cargarConfiguracion().catch(() => {});
actualizarEstadoLicencia();
agregarLog('🚀 Dragon3 listo');

