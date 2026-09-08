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

const configActivarWatcher = document.getElementById('config-activar-watcher');
const configMoverOriginal = document.getElementById('config-mover-original');
const configModoAutomatico = document.getElementById('config-modo-automatico');
const configProyectoDefecto = document.getElementById('config-proyecto-defecto');
const configSubcarpetaDefecto = document.getElementById('config-subcarpeta-defecto');
const configClienteDefecto = document.getElementById('config-cliente-defecto');
const configObraDefecto = document.getElementById('config-obra-defecto');

const configMensaje = document.getElementById('config-mensaje');

// ============================================================
//  NUEVO: EXPLORADOR DE CARPETAS
// ============================================================
const exploradorContainer = document.getElementById('explorador-container');
const arbolContainer = document.getElementById('arbol-container');

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
let arbolSellados = null;
let carpetaSeleccionada = null;

// ================================================================
// 🆕 FUNCIONES PARA EDITAR METADATOS
// ================================================================

/**
 * Abre el modal de edición de metadatos para una imagen sellada
 * @param {string} rutaImagen - Ruta completa de la imagen
 * @param {string} hash - Hash del sello (ej: 000001F)
 */
async function abrirEditorMetadatos(rutaImagen, hash) {
    try {
        // 1. Mostrar indicador de carga
        showToast('📤 Cargando metadatos...', 'info');

        // 2. Obtener metadatos actuales de la imagen
        const resultado = await ipcRenderer.invoke('leer-metadatos-imagen', {
            rutaImagen: rutaImagen
        });

        if (!resultado.ok) {
            showToast(`❌ Error al cargar metadatos: ${resultado.mensaje}`, 'error');
            return;
        }

        // 3. Buscar los metadatos en la base de datos (para obtener todos los campos)
        const selloDB = await ipcRenderer.invoke('obtener-sello-por-hash', { hash: hash });
        
        // 4. Preparar datos para el modal
        const metadatos = {
            cliente: selloDB?.cliente || resultado.metadatos?.artist || '',
            obra: selloDB?.obra || resultado.metadatos?.title || '',
            coleccion: selloDB?.coleccion || '',
            derechos: selloDB?.derechos || resultado.metadatos?.copyright || 'Todos los derechos reservados',
            email_contacto: selloDB?.email_contacto || '',
            compartir_blade: selloDB?.compartir_blade || 0
        };

        // 5. Abrir el modal delegando en el proceso principal
        await ipcRenderer.invoke('abrir-ventana-metadatos', { rutaImagen, metadatos, hash });
        recargarExplorador();

    } catch (err) {
        console.error('Error al abrir editor de metadatos:', err);
        showToast(`❌ Error: ${err.message}`, 'error');
    }
}


/**
 * Notifica que los metadatos se han actualizado (desde el modal)
 */
window.notificarMetadatosActualizados = function(datos) {
    showToast(`✅ Metadatos actualizados para ${datos.idCompleto || datos.hash}`, 'success');
    recargarExplorador();
    // Actualizar también el panel de detalles si está abierto
    if (imagenSeleccionada && imagenSeleccionada.hash === datos.hash) {
        cargarDetallesImagen(imagenSeleccionada.ruta);
    }
};

/**
 * Añade el botón "Editar metadatos" a los archivos sellados
 */
function añadirBotonEditarMetadatos(elementoArchivo, rutaImagen, hash) {
    // Buscar si ya existe el botón
    if (elementoArchivo.querySelector('.btn-editar-metadatos')) return;
    
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn-editar-metadatos';
    btnEditar.innerHTML = '📝';
    btnEditar.title = 'Editar metadatos';
    btnEditar.style.cssText = `
        background: rgba(255, 215, 0, 0.12);
        border: 1px solid rgba(255, 215, 0, 0.2);
        border-radius: 6px;
        color: #ffd700;
        padding: 4px 10px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 6px;
    `;
    btnEditar.addEventListener('mouseenter', () => {
        btnEditar.style.background = 'rgba(255, 215, 0, 0.2)';
    });
    btnEditar.addEventListener('mouseleave', () => {
        btnEditar.style.background = 'rgba(255, 215, 0, 0.12)';
    });
    btnEditar.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirEditorMetadatos(rutaImagen, hash);
    });
    
    // Añadir el botón al contenedor de acciones del archivo
    const accionesContainer = elementoArchivo.querySelector('.acciones-archivo') || elementoArchivo;
    accionesContainer.appendChild(btnEditar);
}

// ============================================================
//  RECARGAR EXPLORADOR
// ============================================================
function recargarExplorador() {
    const proyectoSeleccionado = selectorProyecto?.value;
    if (proyectoSeleccionado && proyectoSeleccionado !== '-- Crear nuevo --') {
        // Recargar archivos del proyecto actual
        const proyecto = proyectos.find(p => p.id === parseInt(proyectoSeleccionado));
        if (proyecto) {
            const carpeta = rutaActual || carpetaProyectoActual;
            if (carpeta) {
                cargarArchivosProyecto(carpeta);
            }
        }
    }
    // También recargar el árbol de sellados
    cargarArbolSellados();
}

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
//  LICENCIA
// ============================================================
async function actualizarEstadoLicencia() {
  try {
    const estado = await ipcRenderer.invoke('obtener-estado-licencia');
    if (!estado) {
      licenciaStatus.textContent = '❌ Error de licencia';
      return;
    }
    let color = '#ffd93d';
    if (estado.premium) {
      color = '#51cf66';
    } else if (estado.sellos_usados >= estado.limite) {
      color = '#ff6b6b';
    }
    licenciaStatus.style.color = color;
    licenciaStatus.textContent = estado.mensaje || 'Licencia desconocida';
  } catch (err) {
    licenciaStatus.textContent = '❌ Error';
    agregarLog(`Error actualizando licencia: ${err.message}`, 'error');
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
//  EXPLORADOR DE CARPETAS (NUEVO)
// ============================================================
async function cargarArbolSellados() {
  try {
    const result = await ipcRenderer.invoke('obtener-arbol-sellados');
    if (!result.ok) {
      arbolContainer.innerHTML = `<span style="color:#888;">❌ ${result.error}</span>`;
      return;
    }
    arbolSellados = result.arbol;
    // 🔥 LIMPIAR CONTENEDOR ANTES DE RENDERIZAR
    arbolContainer.innerHTML = '';
    if (!arbolSellados || (arbolSellados.sellados.length === 0 && arbolSellados.subcarpetas.length === 0)) {
      arbolContainer.innerHTML = '<span style="color:#888;">📁 No hay imágenes selladas.</span>';
      return;
    }
    renderizarArbol(arbolSellados, arbolContainer, 0);
  } catch (err) {
    agregarLog(`Error cargando árbol de sellados: ${err.message}`, 'error');
    arbolContainer.innerHTML = `<span style="color:#ff6b6b;">❌ ${err.message}</span>`;
  }
}

function renderizarArbol(nodo, container, nivel) {
  const ul = document.createElement('ul');
  ul.style.cssText = `list-style:none;padding-left:${nivel * 16}px;margin:0;`;

  // Si la carpeta tiene imágenes selladas, mostrar la carpeta
  if (nodo.sellados.length > 0 || nodo.subcarpetas.length > 0) {
    const li = document.createElement('li');
    li.style.cssText = 'padding:2px 0;cursor:pointer;';
    
    const folderSpan = document.createElement('span');
    folderSpan.textContent = `📁 ${nodo.nombre} (${nodo.sellados.length})`;
    folderSpan.style.cssText = 'color:#ffd93d;font-weight:500;';
    folderSpan.addEventListener('click', () => {
      seleccionarCarpeta(nodo);
    });
    li.appendChild(folderSpan);
    ul.appendChild(li);

    // Mostrar imágenes selladas dentro de la carpeta
    if (nodo.sellados.length > 0) {
      const subUl = document.createElement('ul');
      subUl.style.cssText = `list-style:none;padding-left:16px;margin:0;`;
      nodo.sellados.forEach(img => {
        const imgLi = document.createElement('li');
        imgLi.style.cssText = 'padding:1px 0;font-size:13px;color:#8be9fd;';
        const imgSpan = document.createElement('span');
        imgSpan.textContent = `📄 ${img.nombre}`;
        imgSpan.style.cssText = 'cursor:pointer;';
        imgSpan.addEventListener('click', () => {
          agregarLog(`📄 Seleccionada: ${img.nombre}`, 'info');
          // Cargar la imagen en el panel de sellado
          rutaEntradaSeleccionada = img.ruta;
          rutaEntrada.textContent = img.ruta;
          camposSellado.style.display = 'block';
          btnSellar.style.display = 'none';
          btnSellarLote.style.display = 'inline-block';
        });
        imgLi.appendChild(imgSpan);
        subUl.appendChild(imgLi);
      });
      li.appendChild(subUl);
    }

    // Procesar subcarpetas recursivamente
    nodo.subcarpetas.forEach(sub => {
      renderizarArbol(sub, ul, nivel + 1);
    });
  }

  container.appendChild(ul);
}

async function seleccionarCarpeta(nodo) {
  carpetaSeleccionada = nodo;
  agregarLog(`📁 Carpeta seleccionada: ${nodo.nombre} (${nodo.sellados.length} imágenes)`, 'info');
  
  // 🔥 RECARGAR PROYECTOS PARA TENER LA LISTA ACTUALIZADA
  await cargarProyectos();
  
  // 🔥 BUSCAR PROYECTO POR NOMBRE EXACTO (después de recargar)
  const proyecto = proyectos.find(p => p.proyecto_nombre === nodo.nombre);

  if (proyecto) {
    // 🔥 SELECCIONAR EL PROYECTO EN EL SELECTOR
    selectorProyecto.value = proyecto.id;
    mostrarDetallesProyecto(proyecto.id);
    agregarLog(`✅ Proyecto seleccionado: ${proyecto.proyecto_nombre} (ID: ${proyecto.id})`, 'ok');
  } else {
    // Si no existe en BD, mostrar info básica
    detallesProyecto.style.display = 'block';
    document.getElementById('proy-nombre').textContent = nodo.nombre;
    document.getElementById('proy-descripcion').textContent = nodo.sellados.length > 0 ? 
      `📂 ${nodo.sellados.length} imágenes selladas (sin proyecto en BD)` : 
      '(carpeta sin imágenes selladas)';
    document.getElementById('proy-contador').textContent = nodo.sellados.length;
    
    // 🔥 ACTUALIZAR LA LISTA DE ARCHIVOS CON LAS IMÁGENES SELLADAS DE LA CARPETA
    const listaSellados = nodo.sellados.map(img => ({
      name: img.nombre,
      path: img.ruta,
      isDirectory: false
    }));
    listaArchivosDiv.innerHTML = '';
    if (listaSellados.length === 0) {
      listaArchivosDiv.innerHTML = '<span style="color:#888;">📂 No hay imágenes selladas en esta carpeta</span>';
    } else {
      let html = '<ul style="list-style:none;padding:0;margin:0;">';
      listaSellados.forEach(archivo => {
        const rutaEscapada = archivo.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += `
          <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1a2e;">
            <span style="cursor:pointer;color:#8be9fd;" onclick="window.electronAbrirArchivo('${rutaEscapada}')">
              📄 ${archivo.name}
            </span>
            <button onclick="window.electronEliminarArchivo('${rutaEscapada}')" 
                    style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;" 
                    title="Eliminar archivo">✖</button>
          </li>
        `;
      });
      html += '</ul>';
      listaArchivosDiv.innerHTML = html;
    }
  }

  // Actualizar ruta actual para navegación
  if (nodo.ruta) {
    rutaActual = nodo.ruta;
    rutaBaseProyecto = nodo.ruta;
  }
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
    configActivarWatcher.checked = config.activar_watcher !== undefined ? config.activar_watcher === 1 : true;
    configMoverOriginal.value = config.mover_original || 'mover';
    configModoAutomatico.value = config.modo_automatico !== undefined ? config.modo_automatico : 1;
    configSubcarpetaDefecto.value = config.subcarpeta_por_defecto || '';
    configClienteDefecto.value = config.cliente_por_defecto || '';
    configObraDefecto.value = config.obra_por_defecto || '';

    // Rellenar select de proyectos por defecto
    const proyectosList = await ipcRenderer.invoke('get-proyectos');
    configProyectoDefecto.innerHTML = '<option value="">-- Selecciona un proyecto --</option>';
    proyectosList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const nombreMostrado = p.proyecto_nombre || `${p.cliente} - ${p.obra}`;
      opt.textContent = `${nombreMostrado} (${p.hash_suffix})`;
      if (config.proyecto_por_defecto && parseInt(config.proyecto_por_defecto) === p.id) {
        opt.selected = true;
      }
      configProyectoDefecto.appendChild(opt);
    });
  } catch (err) {
    agregarLog(`Error cargando configuración: ${err.message}`, 'error');
  }
}

async function guardarConfiguracion() {
  const ruta = configRutaProyectos.value.trim();
  if (!ruta) {
    configMensaje.innerHTML = '<span style="color:#ff6b6b;">⚠️ La carpeta raíz de proyectos es obligatoria.</span>';
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
    mover_original: configMoverOriginal.value || 'mover',
    activar_watcher: configActivarWatcher.checked ? 1 : 0,
    modo_automatico: parseInt(configModoAutomatico.value) || 1,
    proyecto_por_defecto: configProyectoDefecto.value ? parseInt(configProyectoDefecto.value) : null,
    subcarpeta_por_defecto: configSubcarpetaDefecto.value.trim() || null,
    cliente_por_defecto: configClienteDefecto.value.trim() || null,
    obra_por_defecto: configObraDefecto.value.trim() || null
  };

  try {
    await ipcRenderer.invoke('actualizar-perfil', datos);
    configMensaje.innerHTML = '<span style="color:#51cf66;">✅ Configuración guardada correctamente.</span>';
    agregarLog('✅ Configuración guardada correctamente', 'ok');
    // Recargar el árbol de sellados
    cargarArbolSellados();
    // Actualizar el estado de licencia
    actualizarEstadoLicencia();
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
        // 🔥 OBTENER PREFIJO PARA FILTRAR SOLO IMÁGENES SELLADAS
        const config = await ipcRenderer.invoke('obtener-perfil');
        const prefijo = config.prefijo_usuario || 'DEM';
        const patronSellado = new RegExp(`_${prefijo}_[0-9A-F]{7}\\.png$`, 'i');

        const archivos = await ipcRenderer.invoke('listar-archivos', { carpeta });
        if (!archivos || archivos.length === 0) {
            listaArchivosDiv.innerHTML = '<span style="color:#888;">📂 La carpeta está vacía</span>';
            return;
        }

        // 🔥 FILTRAR SOLO IMÁGENES SELLADAS (excluir carpetas y originales)
        const archivosSellados = archivos.filter(a => {
            if (a.isDirectory) return false;
            return patronSellado.test(a.name);
        });

        if (archivosSellados.length === 0) {
            listaArchivosDiv.innerHTML = '<span style="color:#888;">📂 No hay imágenes selladas en esta carpeta</span>';
            return;
        }

        const ordenados = archivosSellados.sort((a, b) => a.name.localeCompare(b.name));
        let html = '<ul style="list-style:none;padding:0;margin:0;">';
        
        // 🔥 BOTÓN PARA SUBIR DE CARPETA
        if (rutaBaseProyecto && carpeta !== rutaBaseProyecto) {
            const parentPath = path.dirname(carpeta);
            const parentEscapado = parentPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += `
                <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1a2e;">
                    <span style="cursor:pointer;color:#ffd93d;" onclick="navegarA('${parentEscapado}')">📂 .. (Subir)</span>
                </li>
            `;
        }

        // 🔥 RECORRER ARCHIVOS Y AÑADIR BOTÓN 📝
        ordenados.forEach(archivo => {
            const nombre = archivo.name;
            const rutaCompleta = archivo.path;
            const esCarpeta = archivo.isDirectory;
            const icono = esCarpeta ? '📁' : '📄';
            const color = esCarpeta ? '#ffd93d' : '#8be9fd';
            const rutaEscapada = rutaCompleta.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const onclick = esCarpeta ? `navegarA('${rutaEscapada}')` : `window.electronAbrirArchivo('${rutaEscapada}')`;
            const eliminarFunc = esCarpeta ? 'window.electronEliminarCarpeta' : 'window.electronEliminarArchivo';
            
            // 🔥 DETECTAR SI ES UNA IMAGEN SELLADA (para mostrar botón 📝)
            const matchSellado = nombre.match(/_([A-Z0-9]{3,4})_([0-9A-F]{7})\.png$/i);
            const esSellada = !!matchSellado;
            
            html += `
                <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1a2e;">
                    <span style="cursor:pointer;color:${color};" onclick="${onclick}">
                        ${icono} ${nombre}
                    </span>
                    <div>
                        ${esSellada ? `<button onclick="window.electronEditarMetadatos('${rutaEscapada}')" style="background:none;border:none;color:#ffd93d;cursor:pointer;font-size:14px;margin-right:8px;" title="Editar metadatos">📝</button>` : ''}
                        <button onclick="${eliminarFunc}('${rutaEscapada}')" 
                                style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;" 
                                title="${esCarpeta ? 'Eliminar carpeta' : 'Eliminar archivo'}">✖</button>
                    </div>
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
//  NOTIFICACIÓN DE IMAGEN DETECTADA
// ============================================================
let notificacionTimeout = null;

ipcRenderer.on('imagen-detectada', (event, { ruta }) => {
  const nombre = path.basename(ruta);
  agregarLog(`📁 Imagen detectada en carpeta vigilada: ${nombre}`, 'info');

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
      agregarLog(`⏰ Notificación cerrada por timeout: ${nombre}`, 'warn');
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
      agregarLog(`⏹️ Imagen descartada: ${nombre}`, 'warn');
    }
  });
});

// ============================================================
//  LISTENERS
// ============================================================

// --- LICENCIA: ACTIVAR PREMIUM ---
btnActivarPremium.addEventListener('click', () => {
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

// --- SELECTORES DE CARPETA Y LOGO ---
btnConfigSeleccionarCarpeta.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('seleccionar-carpeta');
  if (result) configRutaProyectos.value = result;
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
    // Recargar el árbol de sellados
    cargarArbolSellados();
    // Actualizar el estado de licencia
    actualizarEstadoLicencia();
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
    // Recargar el árbol de sellados
    cargarArbolSellados();
  } catch (err) {
    agregarLog(`❌ Error creando subcarpeta: ${err.message}`, 'error');
  }
});

// --- REFRESCAR Y ELIMINAR CARPETA ---
btnRefrescarArchivos.addEventListener('click', async () => {
  if (rutaActual) {
    await cargarArchivosProyecto(rutaActual);
    agregarLog('🔄 Archivos actualizados', 'info');
    cargarArbolSellados();
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
    cargarArbolSellados();
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

      // 🔥 ACTUALIZAR EL ESTADO DE LICENCIA DESPUÉS DE UN SELLADO EXITOSO
      await actualizarEstadoLicencia();

    } else if (resultado.error && resultado.error.includes('Demo agotada')) {
      agregarLog(`❌ ${resultado.error}`, 'error');
      progresoSellado.textContent = '❌ Demo agotada';
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
      // 🔥 ACTUALIZAR EL ESTADO DE LICENCIA DESPUÉS DE UN LOTE EXITOSO
      await actualizarEstadoLicencia();
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
//  EDITAR METADATOS DE UNA IMAGEN SELLADA
// ============================================================
window.electronEditarMetadatos = async (ruta) => {
    try {
        // 🔍 EXTRAER HASH DEL NOMBRE DEL ARCHIVO
        const nombre = path.basename(ruta);
        const match = nombre.match(/_([A-Z0-9]{3,4})_([0-9A-F]{7})\.png$/i);
        if (!match) {
            agregarLog('❌ No se pudo extraer el hash del archivo', 'error');
            return;
        }
        const hash = match[2].toUpperCase();
        const prefijo = match[1].toUpperCase();

        agregarLog(`📝 Editando metadatos de: ${nombre} (${hash})`, 'info');

        // 1. OBTENER METADATOS ACTUALES DE LA DB
        const selloDB = await ipcRenderer.invoke('obtener-sello-por-hash', { hash: hash });
        if (!selloDB) {
            agregarLog(`❌ No se encontró el sello ${hash} en la base de datos`, 'error');
            return;
        }

        // 2. PREPARAR DATOS PARA EL MODAL
        const metadatos = {
            cliente: selloDB.cliente || '',
            obra: selloDB.obra || '',
            coleccion: selloDB.coleccion || '',
            derechos: selloDB.derechos || 'Todos los derechos reservados',
            email_contacto: selloDB.email_contacto || '',
            compartir_blade: selloDB.compartir_blade || 0
        };

        // 3. CREAR MODAL DINÁMICAMENTE EN EL DOM
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-metadatos-overlay';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: #1e1e2f;
            border-radius: 16px;
            padding: 30px 35px;
            max-width: 520px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.06);
            animation: slideUp 0.3s ease;
        `;

        modalContent.innerHTML = `
            <!-- HEADER -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <h2 style="color:#fff;font-size:20px;font-weight:600;display:flex;align-items:center;gap:10px;">
                    📝 Editar metadatos
                    <span style="background:rgba(255,215,0,0.15);color:#ffd700;font-size:12px;padding:2px 10px;border-radius:20px;">${hash}</span>
                </h2>
                <button id="btn-close-modal-metadatos" style="background:none;border:none;color:#888;font-size:24px;cursor:pointer;">✕</button>
            </div>

            <!-- INFO -->
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#aaa;border:1px solid rgba(255,255,255,0.04);">
                <span>🖼️ Imagen:</span>
                <strong style="color:#fff;font-family:'Courier New',monospace;font-size:13px;">${nombre}</strong>
            </div>

            <!-- MENSAJES -->
            <div id="modal-metadatos-mensaje" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:13px;"></div>

            <!-- FORMULARIO -->
            <form id="form-metadatos-modal" autocomplete="off">
                <div style="margin-bottom:14px;">
                    <label style="color:#ccc;font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Cliente <span style="color:#ff6b6b;">*</span></label>
                    <input type="text" id="input-cliente-modal" value="${metadatos.cliente}" placeholder="Nombre del cliente" style="width:100%;background:#2a2a3f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;">
                </div>
                <div style="margin-bottom:14px;">
                    <label style="color:#ccc;font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Obra <span style="color:#ff6b6b;">*</span></label>
                    <input type="text" id="input-obra-modal" value="${metadatos.obra}" placeholder="Título de la obra" style="width:100%;background:#2a2a3f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;">
                </div>
                <div style="margin-bottom:14px;">
                    <label style="color:#ccc;font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Colección</label>
                    <input type="text" id="input-coleccion-modal" value="${metadatos.coleccion || ''}" placeholder="Colección (opcional)" style="width:100%;background:#2a2a3f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;">
                </div>
                <div style="margin-bottom:14px;">
                    <label style="color:#ccc;font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Derechos</label>
                    <input type="text" id="input-derechos-modal" value="${metadatos.derechos}" placeholder="Ej: Todos los derechos reservados" style="width:100%;background:#2a2a3f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;">
                </div>
                <div style="margin-bottom:14px;">
                    <label style="color:#ccc;font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Email de contacto</label>
                    <input type="email" id="input-email-modal" value="${metadatos.email_contacto || ''}" placeholder="Email para contacto" style="width:100%;background:#2a2a3f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;">
                </div>
                <div style="display:flex;align-items:center;gap:10px;padding:6px 0;margin-bottom:14px;">
                    <input type="checkbox" id="input-compartir-modal" ${metadatos.compartir_blade ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffd700;cursor:pointer;">
                    <label for="input-compartir-modal" style="color:#ccc;font-size:13px;cursor:pointer;">🔗 Compartir metadatos con Blade Verification Network</label>
                </div>
            </form>

            <!-- FOOTER -->
            <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
                <button id="btn-cancelar-modal-metadatos" style="background:rgba(255,255,255,0.06);border:none;border-radius:10px;padding:10px 24px;color:#aaa;font-size:14px;font-weight:500;cursor:pointer;">Cancelar</button>
                <button id="btn-guardar-modal-metadatos" style="background:#ffd700;border:none;border-radius:10px;padding:10px 24px;color:#1a1a2e;font-size:14px;font-weight:500;cursor:pointer;">💾 Guardar cambios</button>
            </div>
        `;

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // ============================================================
        // 4. EVENTOS DEL MODAL
        // ============================================================

        // Cerrar
        const cerrarModal = () => {
            modalOverlay.remove();
        };

        document.getElementById('btn-close-modal-metadatos').addEventListener('click', cerrarModal);
        document.getElementById('btn-cancelar-modal-metadatos').addEventListener('click', cerrarModal);

        // Cerrar al hacer clic fuera
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) cerrarModal();
        });

        // Cerrar con ESC
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                cerrarModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // ============================================================
        // 5. GUARDAR METADATOS
        // ============================================================

        document.getElementById('btn-guardar-modal-metadatos').addEventListener('click', async () => {
            const cliente = document.getElementById('input-cliente-modal').value.trim();
            const obra = document.getElementById('input-obra-modal').value.trim();

            if (!cliente || !obra) {
                const mensaje = document.getElementById('modal-metadatos-mensaje');
                mensaje.style.display = 'block';
                mensaje.style.background = 'rgba(255,60,60,0.12)';
                mensaje.style.border = '1px solid rgba(255,60,60,0.2)';
                mensaje.style.color = '#ff6b6b';
                mensaje.textContent = '⚠️ Cliente y obra son obligatorios.';
                return;
            }

            const metadatosNuevos = {
                cliente: cliente,
                obra: obra,
                coleccion: document.getElementById('input-coleccion-modal').value.trim() || null,
                derechos: document.getElementById('input-derechos-modal').value.trim() || 'Todos los derechos reservados',
                email_contacto: document.getElementById('input-email-modal').value.trim() || '',
                compartir_blade: document.getElementById('input-compartir-modal').checked ? 1 : 0
            };

            // Deshabilitar botón
            const btnGuardar = document.getElementById('btn-guardar-modal-metadatos');
            btnGuardar.disabled = true;
            btnGuardar.textContent = '⏳ Guardando...';

            try {
                const resultado = await ipcRenderer.invoke('actualizar-metadatos', {
                    rutaImagen: ruta,
                    metadatos: metadatosNuevos
                });

                const mensaje = document.getElementById('modal-metadatos-mensaje');
                mensaje.style.display = 'block';

                if (resultado.ok) {
                    mensaje.style.background = 'rgba(60,255,60,0.08)';
                    mensaje.style.border = '1px solid rgba(60,255,60,0.15)';
                    mensaje.style.color = '#5fdf5f';
                    mensaje.textContent = `✅ ${resultado.mensaje || 'Metadatos actualizados correctamente'}`;
                    
                    agregarLog(`✅ Metadatos actualizados para ${resultado.idCompleto || hash}`, 'ok');
                    
                    // Recargar después de 1.5s
                    setTimeout(() => {
                        cerrarModal();
                        recargarExplorador();
                        // Actualizar el panel de detalles si está abierto
                        if (window.imagenSeleccionada && window.imagenSeleccionada.hash === hash) {
                            // recargar detalles si existe función
                        }
                    }, 1500);
                } else {
                    mensaje.style.background = 'rgba(255,60,60,0.12)';
                    mensaje.style.border = '1px solid rgba(255,60,60,0.2)';
                    mensaje.style.color = '#ff6b6b';
                    mensaje.textContent = `❌ ${resultado.mensaje || 'Error al actualizar metadatos'}`;
                    btnGuardar.disabled = false;
                    btnGuardar.textContent = '💾 Guardar cambios';
                }
            } catch (err) {
                const mensaje = document.getElementById('modal-metadatos-mensaje');
                mensaje.style.display = 'block';
                mensaje.style.background = 'rgba(255,60,60,0.12)';
                mensaje.style.border = '1px solid rgba(255,60,60,0.2)';
                mensaje.style.color = '#ff6b6b';
                mensaje.textContent = `❌ Error: ${err.message}`;
                btnGuardar.disabled = false;
                btnGuardar.textContent = '💾 Guardar cambios';
            }
        });

        // Enfocar primer campo
        setTimeout(() => document.getElementById('input-cliente-modal').focus(), 100);

    } catch (err) {
        agregarLog(`❌ Error editando metadatos: ${err.message}`, 'error');
        console.error(err);
    }
};

// ============================================================
//  EVENTOS DEL MENÚ PERSONALIZADO
// ============================================================
ipcRenderer.on('menu-nuevo-proyecto', () => {
  if (btnNuevoProyecto) btnNuevoProyecto.click();
});

ipcRenderer.on('menu-abrir-proyecto', () => {
  if (selectorProyecto) selectorProyecto.focus();
});

ipcRenderer.on('menu-generar-informe', () => {
  if (btnGenerarPDF) btnGenerarPDF.click();
});

ipcRenderer.on('menu-abrir-configuracion', () => {
  if (btnConfiguracion) btnConfiguracion.click();
});

ipcRenderer.on('menu-activar-premium', () => {
  if (btnActivarPremium) btnActivarPremium.click();
});

ipcRenderer.on('menu-manual-usuario', () => {
  const btnAyuda = document.getElementById('btn-ayuda');
  if (btnAyuda) btnAyuda.click();
  else agregarLog('📖 Manual de usuario: consulta la web.', 'info');
});

// ============================================================
//  RECARGAR ÁRBOL (NUEVO)
// ============================================================
ipcRenderer.on('recargar-arbol', () => {
  cargarArbolSellados();
});

// ============================================================
//  ACTUALIZAR LICENCIA (NUEVO)
// ============================================================
ipcRenderer.on('actualizar-licencia', () => {
  actualizarEstadoLicencia();
});

// ============================================================
//  NOTIFICACIONES NATIVAS
// ============================================================
ipcRenderer.on('notificacion-nativa', (event, { titulo, mensaje, tipo }) => {
  agregarLog(`🔔 ${titulo}: ${mensaje}`, tipo || 'info');
});

// ============================================================
//  INICIALIZACIÓN
// ============================================================
cargarProyectos();
cargarConfiguracion().catch(() => {});
actualizarEstadoLicencia();
cargarArbolSellados();
agregarLog('🚀 Dragon3 listo');