/**
 * Dragon3 FAANG Enterprise - scripts/mi-espacio.js
 * Gustavo Herraiz © 2025 - Lead Architect
 * MULTITYPE ANALYSIS + AUTORELOAD HISTORIAL
 * DEPURACIÓN EXTREMA: Logs exhaustivos en frontend
 * (CORREGIDO: sin console.log, solo error handling UX profesional)
 *
 * VERSIÓN MEJORADA:
 * - Tabla de historial dinámica con ordenación, paginación y filtrado
 * - Visualización de JSON mejorada
 * - Gestión de archivos optimizada
 */

/**
 * Helper FAANG Enterprise: fetchPrivado
 * - Agrega automáticamente el token JWT (Bearer)
 * - Redirige al login si la sesión está caducada o el token no existe
 * - Maneja errores HTTP 401/403/440 con UX profesional
 */
async function fetchPrivado(url, options = {}) {
  const token = localStorage.token;
  if (!token) {
    alert("Sesión expirada. Por favor, inicia sesión.");
    window.location.href = "login.html";
    throw new Error("No autenticado");
  }
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + token;
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !options.headers['Content-Type']
  ) {
    options.headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (fetchError) {
    alert("Error de red. No se pudo conectar con el servidor.");
    throw fetchError;
  }

  if (!res.ok) {
    if ([401, 403, 440].includes(res.status)) {
      alert("Acceso no autorizado o sesión caducada. Inicia sesión de nuevo.");
      window.location.href = "login.html";
      throw new Error("Acceso no autorizado");
    }
    let errorMsg = "Error desconocido";
    try {
      const data = await res.json();
      errorMsg = data.error || data.message || errorMsg;
    } catch (jsonErr) { /* No parseable */ }
    alert(errorMsg);
    throw new Error(errorMsg);
  }
  return res;
}



// ===== VARIABLES GLOBALES PARA EL HISTORIAL =====
let currentHistorialData = [];
let currentSortColumn = 'date';
let currentSortDirection = 'desc';
let currentPage = 1;
const itemsPerPage = 15;
let usuario = null, rol = null, name = null, email = null, creditos = null;

// ===== FUNCIONES DEL HISTORIAL MEJORADO =====

function generarExplicabilidad(resultado) {
  let explicabilidad = [];
  if (resultado.firmaDigital === "sospechosa" || resultado.firmaDigital === "ausente") {
    explicabilidad.push("⚠️ Firma digital sospechosa o ausente.");
  }
  if (resultado.exif && resultado.exif.completitud > 0.8) {
    explicabilidad.push("ℹ️ Metadatos EXIF muy completos.");
  }
  if (resultado.exif && resultado.exif.modelo && resultado.exif.modelo.match(/AI|Synth|Unknown/i)) {
    explicabilidad.push("🤖 Modelo de cámara poco frecuente o artificial.");
  }
  if (resultado.historialEdicion && resultado.historialEdicion.length > 0) {
    explicabilidad.push("✏️ Se detectó historial de edición en el archivo.");
  }
  if (resultado.resumen && resultado.resumen.confianza !== undefined) {
    if (resultado.resumen.confianza > 0.85) {
      explicabilidad.push("✅ El modelo tiene alta confianza en la decisión.");
    } else if (resultado.resumen.confianza < 0.6) {
      explicabilidad.push("❔ La confianza del modelo es baja.");
    }
  }
  return explicabilidad;
}
/**
 * Carga el historial de análisis desde el servidor y actualiza estadísticas visuales
 */
async function cargarHistorial() {
  const tbody = document.querySelector('#tablaHistorialAnalisis tbody');
  const contador = document.getElementById('contadorHistorial');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="spinner-analisis"><div class="loader" aria-hidden="true"></div><span>Cargando historial...</span></div></td></tr>';

  try {
    const res = await fetchPrivado('/api/archivos/mis-archivos');
    const data = await res.json();

    if (!Array.isArray(data)) throw new Error("El backend no devolvió el formato esperado.");

    currentHistorialData = data;
    renderHistorialTable();
    updatePagination();

    // NUEVO: Actualiza las gráficas tras cargar el historial
    renderEstadisticasGraficas();

    if (contador) {
      const totalItems = getFilteredData().length;
      const showingItems = Math.min(itemsPerPage, totalItems);
      contador.textContent = `Mostrando ${showingItems} de ${totalItems} análisis`;
    }
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:#fd6a6a">${e.message}</td></tr>`;
    if (contador) contador.textContent = 'Error al cargar el historial';
  }
}

/**
 * Renderiza las gráficas de estadísticas visuales (tipos y decisiones)
 */
function renderEstadisticasGraficas() {
  // Cuenta por tipo
  const tipos = { imagen: 0, pdf: 0, video: 0 };
  // Cuenta por decisión
  const decisiones = { humano: 0, artificial: 0, indeterminado: 0 };
  currentHistorialData.forEach(a => {
    if (a.tipo && tipos[a.tipo] !== undefined) tipos[a.tipo]++;
    const decision = (a.resultado?.resumen?.decision || a.decision || 'indeterminado').toLowerCase();
    if (decisiones[decision] !== undefined) decisiones[decision]++;
  });

  // Gráfica tipos
  const ctxTipos = document.getElementById('graficaTipos');
  if (ctxTipos) {
    // Destruye instancia previa si existe
    if (ctxTipos._chart) ctxTipos._chart.destroy();
    ctxTipos._chart = new Chart(ctxTipos, {
      type: 'doughnut',
      data: {
        labels: ['Imagen', 'PDF', 'Video'],
        datasets: [{
          data: [tipos.imagen, tipos.pdf, tipos.video],
          backgroundColor: ['#16dfac', '#4c51bf', '#fd6a6a']
        }]
      },
      options: {
        plugins: { legend: { display: true, position: 'bottom' } },
        responsive: false
      }
    });
  }

  // Gráfica decisiones
  const ctxDecisiones = document.getElementById('graficaDecisiones');
  if (ctxDecisiones) {
    if (ctxDecisiones._chart) ctxDecisiones._chart.destroy();
    ctxDecisiones._chart = new Chart(ctxDecisiones, {
      type: 'doughnut',
      data: {
        labels: ['Humano', 'Artificial', 'Indeterminado'],
        datasets: [{
          data: [decisiones.humano, decisiones.artificial, decisiones.indeterminado],
          backgroundColor: ['#16dfac', '#fd6a6a', '#718096']
        }]
      },
      options: {
        plugins: { legend: { display: true, position: 'bottom' } },
        responsive: false
      }
    });
  }
}

/**
 * Renderiza la tabla de historial con los datos actuales
 */
function renderHistorialTable() {
  const tbody = document.querySelector('#tablaHistorialAnalisis tbody');
  if (!tbody) return;

  // Aplicar filtros y ordenación
  const filteredData = getFilteredData();

  // Aplicar paginación
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  // Actualizar contador
  const contador = document.getElementById('contadorHistorial');
  if (contador) {
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    contador.textContent = `Mostrando ${startIndex + 1}-${endIndex} de ${filteredData.length} análisis`;
  }

  // Renderizar filas
  tbody.innerHTML = paginatedData.length > 0
    ? paginatedData.map(a => renderAnalisisHistorialRow(a)).join('')
    : '<tr><td colspan="6">No se encontraron análisis con los filtros aplicados.</td></tr>';
}

/**
 * Obtiene los datos filtrados según los criterios actuales
 */
function getFilteredData() {
  let filteredData = [...currentHistorialData];
  const searchInput = document.getElementById('inputBusquedaHistorial');
  const tipoFilter = document.getElementById('filtroTipoHistorial');
  const decisionFilter = document.getElementById('filtroDecisionHistorial');

  // Aplicar filtro de búsqueda
  if (searchInput && searchInput.value) {
    const searchTerm = searchInput.value.toLowerCase();
    filteredData = filteredData.filter(a =>
      (a.nombreOriginal && a.nombreOriginal.toLowerCase().includes(searchTerm)) ||
      (a.tipo && a.tipo.toLowerCase().includes(searchTerm)) ||
      (a.resultado?.resumen?.decision && a.resultado.resumen.decision.toLowerCase().includes(searchTerm))
    );
  }

  // Aplicar filtro por tipo
  if (tipoFilter && tipoFilter.value) {
    filteredData = filteredData.filter(a => a.tipo && a.tipo.toLowerCase() === tipoFilter.value);
  }

  // Aplicar filtro por decisión
  if (decisionFilter && decisionFilter.value) {
    filteredData = filteredData.filter(a => {
      const decision = a.resultado?.resumen?.decision || a.decision || 'indeterminado';
      return decision.toLowerCase() === decisionFilter.value;
    });
  }

  // Aplicar ordenación
  filteredData.sort((a, b) => {
    let valA, valB;

    switch (currentSortColumn) {
      case 'date':
        valA = new Date(a.createdAt || 0);
        valB = new Date(b.createdAt || 0);
        return currentSortDirection === 'asc' ? valA - valB : valB - valA;

      case 'name':
        valA = a.nombreOriginal || '';
        valB = b.nombreOriginal || '';
        return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

      case 'type':
        valA = a.tipo || '';
        valB = b.tipo || '';
        return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

      case 'confidence':
        valA = a.resultado?.resumen?.confianza || a.confianza || 0;
        valB = b.resultado?.resumen?.confianza || b.confianza || 0;
        return currentSortDirection === 'asc' ? valA - valB : valB - valA;

      case 'decision':
        valA = a.resultado?.resumen?.decision || a.decision || '';
        valB = b.resultado?.resumen?.decision || b.decision || '';
        return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

      default:
        return 0;
    }
  });

  return filteredData;
}

/**
 * Asegura que las URLs tengan el prefijo /api/ si es necesario
 */
function ensureApiPrefix(url) {
  if (!url) return null;

  // Si ya es la ruta correcta completa
  if (url.startsWith('/api/archivos/')) return url;

  // Caso: empieza por /api/ pero falta /archivos/
  if (url.startsWith('/api/')) {
    // /descargas/analisis/ID  -> /api/archivos/descargas/analisis/ID
    return url.replace(/^\/api\//, '/archivos/');
  }

  // Normalizar removiendo barras iniciales
  let clean = url.replace(/^\/+/, '');

  // Si el backend te devuelve descargas/analisis/ID directamente
  if (clean.startsWith('descargas/analisis/')) {
    return '/api/archivos/' + clean;
  }

  // Si devuelve archivos/descargas/... (raro pero por si acaso)
  if (clean.startsWith('archivos/descargas/')) {
    return '/api/' + clean;
  }

  // Fallback genérico: ante cualquier valor relativo, anteponer el prefijo correcto
  return '/api/archivos/' + clean;
}

// === Modifica la función renderAnalisisHistorialRow para envolver el pdfUrl ===
function renderAnalisisHistorialRow(a) {
  const fecha = a.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
  const nombre = a.nombreOriginal || a.nombreArchivo || a.archivo || "—";
  const tipo = a.tipo || "—";
  const confianza = typeof a.resultado?.resumen?.confianza === 'number'
    ? (a.resultado.resumen.confianza * 100).toFixed(1) + "%"
    : (a.confianza || "—");
  const decision = a.resultado?.resumen?.decision || a.decision || "Indeterminado";

  let badgeClass = "badge-indeterminado";
  let badgeIcon = "";
  if (decision.toLowerCase() === "autentico" || decision.toLowerCase() === "auténtico") {
    badgeClass = "badge-autentico";
    badgeIcon = "🟢";
  } else if (decision.toLowerCase() === "artificial") {
    badgeClass = "badge-artificial";
    badgeIcon = "🔴";
  } else {
    badgeIcon = "⚪";
  }

  // NUEVO: asegurar prefijo correcto si existe pdfUrl
 const pdfHref = a.pdfUrl || null;

  return `
    <tr data-id="${a._id}">
  <td>${fecha}</td>
  <td title="${nombre}">${nombre}</td>
  <td>${tipo}</td>
  <td>${confianza}</td>
  <td><span class="badge ${badgeClass}">${badgeIcon} ${decision.charAt(0).toUpperCase() + decision.slice(1)}</span></td>
  <td>
    <button class="action-btn secundario" onclick="mostrarJsonModal('${a._id}')" title="Ver detalles">🔍</button>
    ${pdfHref ? `<button class="action-btn" onclick="descargarPDF('${a._id}', '${pdfHref}')" title="Descargar PDF">📄</button>` : ''}
    <button class="action-btn danger" onclick="mostrarConfirmacionBorrado('${a._id}', '${nombre.replace(/'/g, "\\'")}')" title="Eliminar">🗑️</button>
  </td>
</tr>
  `;
}

/**
 * Actualiza la paginación según los datos actuales
 */
function updatePagination() {
  const pagination = document.getElementById('paginacionHistorial');
  if (!pagination) return;

  const filteredData = getFilteredData();
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})" aria-label="Página anterior">«</button>`;
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  if (startPage > 1) {
    html += `<button onclick="changePage(1)">1</button>`;
    if (startPage > 2) html += `<span>...</span>`;
  }
  for (let i = startPage; i <= endPage; i++) {
    html += `<button ${i === currentPage ? 'class="active"' : ''} onclick="changePage(${i})" aria-label="Página ${i}">${i}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span>...</span>`;
    html += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
  }
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})" aria-label="Página siguiente">»</button>`;

  pagination.innerHTML = html;
}

/**
 * Renderiza una fila de la tabla de historial (bloque CORRECTO para descarga PDF con JWT)
 */
function renderAnalisisHistorialRow(a) {
  const fecha = a.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
  const nombre = a.nombreOriginal || a.nombreArchivo || a.archivo || "—";
  const tipo = a.tipo || "—";
  const confianza = typeof a.resultado?.resumen?.confianza === 'number'
    ? (a.resultado.resumen.confianza * 100).toFixed(1) + "%"
    : (a.confianza || "—");
  const decision = a.resultado?.resumen?.decision || a.decision || "Indeterminado";

  let badgeClass = "badge-indeterminado";
  let badgeIcon = "";
  if (decision.toLowerCase() === "autentico" || decision.toLowerCase() === "auténtico") {
    badgeClass = "badge-autentico";
    badgeIcon = "🟢";
  } else if (decision.toLowerCase() === "artificial") {
    badgeClass = "badge-artificial";
    badgeIcon = "🔴";
  } else {
    badgeIcon = "⚪";
  }

  // Asegura prefijo correcto si existe pdfUrl
  const pdfHref = a.pdfUrl ? ensureApiPrefix(a.pdfUrl) : null;

  return `
    <tr data-id="${a._id}">
      <td>${fecha}</td>
      <td title="${nombre}">${nombre}</td>
      <td>${tipo}</td>
      <td>${confianza}</td>
      <td><span class="badge ${badgeClass}">${badgeIcon} ${decision.charAt(0).toUpperCase() + decision.slice(1)}</span></td>
      <td>
        <button class="action-btn secundario" onclick="mostrarJsonModal('${a._id}')" title="Ver detalles">🔍</button>
        ${pdfHref ? `<button class="action-btn" onclick="descargarPDF('${a._id}', '${pdfHref}')" title="Descargar PDF">📄</button>` : ''}
        <button class="action-btn danger" onclick="mostrarConfirmacionBorrado('${a._id}', '${nombre.replace(/'/g, "\\'")}')" title="Eliminar">🗑️</button>
      </td>
    </tr>
  `;
}

/**
 * Muestra el modal con los detalles del análisis en JSON y su explicabilidad
 * Resalta los factores clave que justifican la decisión
 */
function mostrarJsonModal(analysisId) {
  const analysis = currentHistorialData.find(a => a._id === analysisId);
  if (!analysis) {
    alert("No se encontraron los detalles del análisis seleccionado.");
    return;
  }
  const resultado = analysis.resultado || analysis;

  // --- Generar explicabilidad ---
  let explicabilidad = [];
  // Ejemplo: firma digital sospechosa
  if (resultado.firmaDigital === "sospechosa" || resultado.firmaDigital === "ausente") {
    explicabilidad.push("⚠️ Firma digital sospechosa o ausente.");
  }
  // Ejemplo: metadatos EXIF muy completos (o inusuales)
  if (resultado.exif && resultado.exif.completitud > 0.8) {
    explicabilidad.push("ℹ️ Metadatos EXIF muy completos.");
  }
  // Ejemplo: modelo de cámara poco frecuente
  if (resultado.exif && resultado.exif.modelo && resultado.exif.modelo.match(/AI|Synth|Unknown/i)) {
    explicabilidad.push("🤖 Modelo de cámara poco frecuente o artificial.");
  }
  // Ejemplo: historial de edición detectado
  if (resultado.historialEdicion && resultado.historialEdicion.length > 0) {
    explicabilidad.push("✏️ Se detectó historial de edición en el archivo.");
  }
  // Ejemplo: confianza alta/baja
  if (resultado.resumen && resultado.resumen.confianza !== undefined) {
    if (resultado.resumen.confianza > 0.85) {
      explicabilidad.push("✅ El modelo tiene alta confianza en la decisión.");
    } else if (resultado.resumen.confianza < 0.6) {
      explicabilidad.push("❔ La confianza del modelo es baja.");
    }
  }

  // Render explicabilidad + JSON
  window.mostrarDetallesAnalisis({
    explicabilidad,
    ...resultado
  });
}

/**
 * Elimina un análisis del historial
 */
async function borrarAnalisis(analysisId) {
  try {
    // Mostrar estado de carga
    const row = document.querySelector(`tr[data-id="${analysisId}"]`);
    if (row) {
      row.style.opacity = '0.5';
      row.querySelectorAll('button').forEach(btn => btn.disabled = true);
    }

    // Enviar solicitud de eliminación
    await fetchPrivado(`/api/archivos/borrar/${analysisId}`, { // <----- CAMBIO AQUÍ
      method: 'DELETE'
    });

    // Actualizar los datos locales y la UI
    currentHistorialData = currentHistorialData.filter(a => a._id !== analysisId);
    renderHistorialTable();
    updatePagination();

    // Mostrar feedback al usuario
    const alertas = document.getElementById('alertas');
    if (alertas) {
      alertas.textContent = "Análisis eliminado correctamente.";
      alertas.classList.remove('oculto');
      alertas.classList.add('success');
      setTimeout(() => {
        alertas.classList.add('oculto');
        alertas.classList.remove('success');
      }, 3000);
    }
  } catch(e) {
    // Error handling
    const row = document.querySelector(`tr[data-id="${analysisId}"]`);
    if (row) {
      row.style.opacity = '';
      row.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
    alert("Error al eliminar el análisis: " + (e.message || "Error desconocido"));
  }
}

/**
 * Cambia a una página específica del historial
 */
function changePage(page) {
  currentPage = page;
  renderHistorialTable();
  updatePagination();

  // Desplazamiento suave a la parte superior de la tabla
  const historialSection = document.getElementById('historialAnalisis');
  if (historialSection) {
    window.scrollTo({
      top: historialSection.offsetTop - 20,
      behavior: 'smooth'
    });
  }
}

// ===== FUNCIONES PRINCIPALES =====



document.addEventListener('DOMContentLoaded', async function() {
  const $ = id => document.getElementById(id);

  // === Helper FAANG: Explicabilidad ===
  function generarExplicabilidad(resultado) {
    let explicabilidad = [];
    if (resultado.firmaDigital === "sospechosa" || resultado.firmaDigital === "ausente") {
      explicabilidad.push("⚠️ Firma digital sospechosa o ausente.");
    }
    if (resultado.exif && resultado.exif.completitud > 0.8) {
      explicabilidad.push("ℹ️ Metadatos EXIF muy completos.");
    }
    if (resultado.exif && resultado.exif.modelo && resultado.exif.modelo.match(/AI|Synth|Unknown/i)) {
      explicabilidad.push("🤖 Modelo de cámara poco frecuente o artificial.");
    }
    if (resultado.historialEdicion && resultado.historialEdicion.length > 0) {
      explicabilidad.push("✏️ Se detectó historial de edición en el archivo.");
    }
    if (resultado.resumen && resultado.resumen.confianza !== undefined) {
      if (resultado.resumen.confianza > 0.85) {
        explicabilidad.push("✅ El modelo tiene alta confianza en la decisión.");
      } else if (resultado.resumen.confianza < 0.6) {
        explicabilidad.push("❔ La confianza del modelo es baja.");
      }
    }
    return explicabilidad;
  }

  // ==== NAVBAR/LOGOUT ====
  if ($('btnHome')) $('btnHome').onclick = () => { window.location.href = 'index.html'; };
  if ($('btnLogout')) $('btnLogout').onclick = function() {
    localStorage.removeItem('token');
    window.location.href = "login.html";
  };

  // ==== AUTENTICACIÓN Y PERFIL ====
  if (!localStorage.token || localStorage.token.trim() === "") {
    alert("Sesión no iniciada o expirada. Por favor, inicia sesión.");
    window.location.href = "login.html";
    return;
  }

  try {
    const perfilRes = await fetchPrivado('/auth/verify');
    const usuario = await perfilRes.json();

    const name = usuario.name || usuario.username || usuario.email || 'Usuario';
    const email = usuario.email || '';
    const rol = usuario.role || 'normal';
    const creditos = typeof usuario.credits === 'number' ? usuario.credits : null;

    if ($('nombreUsuario')) $('nombreUsuario').textContent = name;
    if ($('tipoUsuario')) $('tipoUsuario').textContent = rol;
    if ($('emailUsuario')) $('emailUsuario').textContent = email;
    if ($('creditosUsuario')) $('creditosUsuario').textContent = creditos !== null ? `| Créditos: ${creditos}` : "";

    if ($('datosPerfil')) {
      $('datosPerfil').innerHTML = `
        <ul>
          <li><b>Nombre:</b> ${name}</li>
          <li><b>Email:</b> ${email}</li>
          <li><b>Rol:</b> ${rol}</li>
          <li><b>Créditos:</b> ${creditos !== null ? creditos : ""}</li>
        </ul>
      `;
    }

    if ($('adminPanel')) $('adminPanel').classList.toggle('oculto', rol !== 'admin' && rol !== 'superadmin');
    if ($('enterprisePanel')) $('enterprisePanel').classList.toggle('oculto', rol !== 'enterprise');

    if ($('alertas')) {
      $('alertas').textContent = `¡Bienvenido, ${name}!`;
      $('alertas').classList.remove('oculto');
      setTimeout(() => { $('alertas').classList.add('oculto'); }, 2500);
    }

    const table = $('tablaHistorialAnalisis');
    if (table) {
      table.addEventListener('sortTable', (e) => {
        currentSortColumn = e.detail.column;
        currentSortDirection = e.detail.direction;
        renderHistorialTable();
      });
      table.addEventListener('filterTable', () => {
        currentPage = 1;
        renderHistorialTable();
        updatePagination();
      });
    }

    cargarHistorial();

    // ==== MULTITYPE ANALYSIS (Imagen/PDF/Video) ====
    if ($('formAnalizarArchivo')) {
      $('formAnalizarArchivo').addEventListener('submit', async function(ev) {
        ev.preventDefault();
        const input = $('inputArchivo');
        const file = input && input.files ? input.files[0] : null;
        const spinner = $('spinnerAnalisis');
        const resultadoDiv = $('resultadoAnalisis');
        const trazabilidadDiv = $('trazabilidadAnalisis');

        // Muestra el spinner al iniciar análisis
        spinner.classList.remove('oculto');

        if (!file) {
          resultadoDiv.textContent = "Selecciona un archivo para analizar.";
          resultadoDiv.style.color = "#fd6a6a";
          spinner.classList.add('oculto');
          return;
        }

        resultadoDiv.textContent = "";
        trazabilidadDiv.classList.add('oculto');
        resultadoDiv.style.color = "";

        const formData = new FormData();
        formData.append('archivo', file);

        try {
          const res = await fetchPrivado('/api/analizar-imagen', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();

          spinner.classList.add('oculto');

          if (data && data.resultado && data.resultado.resumen) {
            const resumen = data.resultado.resumen;
            const tipo = data.tipo || resumen.tipo || "—";
            let confianza = "—";
            if (typeof resumen.confianza === 'number') confianza = (resumen.confianza * 100).toFixed(1) + "%";
            const decision = resumen.decision || "Indeterminado";
            const nombre = resumen.nombreOriginal || data.nombreArchivo || file.name;
            const archivoId = data.analisisId || resumen.archivoId || "—";
            const timestamp = data.timestamp || resumen.timestamp || (new Date()).toLocaleString();

            // Generar explicabilidad usando el helper FAANG
            const explicabilidad = typeof generarExplicabilidad === 'function' ? generarExplicabilidad(data.resultado) : [];

            const explicacionBackend = resumen.explicacion || "";
            const explicacionExtendida = data.resultado.paraInforme?.explicacionExtendida || "";

            let badgeClass = "badge-indeterminado";
            let badgeText = decision.charAt(0).toUpperCase() + decision.slice(1);
            let badgeIcon = "⚪"; // Default icon

            // Normalización de decisión para badges
            const decisionLower = decision.toLowerCase();
            if (decisionLower.includes("autentic") || decisionLower.includes("auténtico") || decisionLower.includes("humano")) {
              badgeClass = "badge-autentico";
              badgeIcon = "🟢";
            } else if (decisionLower.includes("artificial") || decisionLower.includes("ia")) {
              badgeClass = "badge-artificial";
              badgeIcon = "🔴";
            }

            // Construir URL de descarga segura
            const urlPDF = data.urlInforme ? ensureApiPrefix(data.urlInforme) : null;

            resultadoDiv.innerHTML = `
              <div style="margin-bottom:0.8em;">
                <h2 style="color:var(--accent-green);margin-bottom:0.2em;">Resumen del análisis</h2>
                <table style="width:100%;background:rgba(24,34,55,0.17);border-radius:8px;padding:0.7em 0.3em;border-collapse:separate;margin-bottom:0.6em;">
                  <tr>
                    <td><b>Nombre</b></td>
                    <td>${nombre}</td>
                  </tr>
                  <tr>
                    <td><b>Tipo</b></td>
                    <td>${tipo}</td>
                  </tr>
                  <tr>
                    <td><b>Confianza</b></td>
                    <td>${confianza}</td>
                  </tr>
                  <tr>
                    <td><b>Decisión</b></td>
                    <td><span class="badge ${badgeClass}">${badgeIcon} ${badgeText}</span></td>
                  </tr>
                  <tr>
                    <td><b>ID Análisis</b></td>
                    <td>${archivoId}</td>
                  </tr>
                  <tr>
                    <td><b>Fecha</b></td>
                    <td>${timestamp}</td>
                  </tr>
                </table>
                ${explicacionBackend
                  ? `<div style="margin-bottom:0.4em;">
                      <b>Explicación del sistema:</b>
                      <span style="display:block;margin-top:0.2em;">${explicacionBackend}</span>
                    </div>`
                  : ''
                }
                ${explicacionExtendida
                  ? `<div style="margin-bottom:0.6em;">
                      <b>Explicación forense relevante:</b>
                      <span style="display:block;margin-top:0.2em;">${explicacionExtendida}</span>
                    </div>`
                  : ''
                }
                ${explicabilidad.length
                  ? `<div style="margin-bottom:0.6em;">
                      <b>Factores clave:</b>
                      <ul style="margin:0.3em 0 0 1em;padding:0;">
                        ${explicabilidad.map(e => `<li>${e}</li>`).join('')}
                      </ul>
                    </div>`
                  : ''
                }
                <div style="display:flex;gap:1em;flex-wrap:wrap;margin-top:1em;">
                  ${urlPDF ? `<button class="action-btn" onclick="descargarPDF('${archivoId}', '${urlPDF}')" style="margin-bottom:0.6em;"><span style="vertical-align:middle;">📄</span> Descargar Informe PDF</button>` : ""}
                  <button type="button" class="action-btn secundario" id="btnVerJsonAnalisis" style="margin-bottom:0.6em;">🔍 Ver JSON detallado</button>
                </div>
              </div>
            `;

            const btnJson = $('btnVerJsonAnalisis');
            if (btnJson) {
              btnJson.onclick = function() {
                if (window.mostrarDetallesAnalisis) {
                    window.mostrarDetallesAnalisis(data.resultado);
                } else if (window.mostrarJsonModal) {
                    // Fallback si mostrarDetallesAnalisis no está expuesto pero mostrarJsonModal sí (para el historial)
                    // Aquí podríamos necesitar adaptar los datos si mostrarJsonModal espera un ID
                    alert("Detalles JSON disponibles en el historial.");
                }
              };
            }

            trazabilidadDiv.innerHTML = "";
            trazabilidadDiv.classList.add('oculto');

            // Recargar historial para mostrar el nuevo análisis
            if (window.cargarHistorial) {
                window.cargarHistorial();
            }

          } else if (data && data.error) {
            resultadoDiv.textContent = data.error;
            resultadoDiv.style.color = "#fd6a6a";
          } else {
            resultadoDiv.textContent = "El servidor no devolvió un resultado válido.";
            resultadoDiv.style.color = "#fd6a6a";
          }
        } catch(e) {
          spinner.classList.add('oculto');
          resultadoDiv.textContent = e.message || "Error analizando el archivo.";
          resultadoDiv.style.color = "#fd6a6a";
        }
      });
    }

  } catch(e) {
    if ($('alertas')) {
      $('alertas').textContent = "No se pudo cargar el perfil. ¿Sesión caducada?";
      $('alertas').classList.remove('oculto');
    }
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
    return;
  }
});

/**
 * Dragon3 FAANG — Descarga PDF con autenticación JWT (NATIVO)
 * Usa token en URL para garantizar compatibilidad total con Chrome y gestores de descarga.
 */
async function descargarPDF(analisisId, pdfUrl) {
  const token = localStorage.token;
  if (!token) {
    alert("Sesión expirada. Por favor, inicia sesión.");
    window.location.href = "login.html";
    return;
  }

  try {
    // Asegurar prefijo correcto
    let urlBase = pdfUrl;
    if (!urlBase.startsWith('/api/')) {
        // Lógica de prefijo simple si ensureApiPrefix no es global
        urlBase = '/api/archivos/descargas/analisis/' + analisisId;
    }

    // Construir URL con token (Query Param)
    const separator = urlBase.includes('?') ? '&' : '?';
    const finalUrl = `${urlBase}${separator}token=${token}`;

    // Forzar descarga nativa
    const link = document.createElement('a');
    link.href = finalUrl;
    link.target = '_blank'; // Abre en nueva pestaña por seguridad
    link.download = `Informe_${analisisId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (e) {
    alert("Error iniciando la descarga: " + e.message);
  }
}

window.descargarPDF = descargarPDF;


// ===== EXPOSICIÓN DE FUNCIONES GLOBALES =====
window.cargarHistorial = cargarHistorial;
window.borrarAnalisis = borrarAnalisis;
window.mostrarJsonModal = mostrarJsonModal;
window.changePage = changePage;
window.mostrarConfirmacionBorrado = function(analysisId, analysisName) {
  if (window.mostrarConfirmacionBorradoModal) {
    window.mostrarConfirmacionBorradoModal(analysisId, analysisName);
  }
};
