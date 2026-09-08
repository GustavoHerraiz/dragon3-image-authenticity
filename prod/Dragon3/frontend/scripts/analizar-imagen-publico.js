// =========================================================================
// DRAGON3 - ANALIZADOR DE RESULTADOS CON EXPLICABILIDAD (v7.2)
// =========================================================================
// 
// VERSIÓN: 7.2.0
// FECHA: 2026-09-02
// 
// CAMBIOS v7.2:
// - ✅ CORREGIDO: Los <details> (incluyendo ml) se abren correctamente al hacer clic.
// - ✅ Añadida delegación de eventos en #resultadoSection para manejar cualquier summary.
// - ✅ Añadido listener directo a cada summary durante la creación para mayor robustez.
// - ✅ Eliminados duplicados y conflictos con e.preventDefault().
// - ✅ Mejorada la documentación interna.
// - ✅ Soportada la célula ML (modelo XGBoost) mostrando sus detalles completos.
// - ✅ Compatible con el formato de analizadores generado por generar-veredicto.js v2.3.3.
// =========================================================================

// =============================== DEBUG INICIAL ===============================
console.log('🔍 Verificando elementos del DOM:');
console.log('#resultadoSection:', document.getElementById('resultadoSection') ? 'EXISTE' : 'NO EXISTE');
console.log('#loadingSection:', document.getElementById('loadingSection') ? 'EXISTE' : 'NO EXISTE');
console.log('#errorMsg:', document.getElementById('errorMsg') ? 'EXISTE' : 'NO EXISTE');
console.log('💡 InnerHTML de #resultadoSection:', document.getElementById('resultadoSection')?.innerHTML?.length || 0, 'caracteres');

console.log('🚀 Página de resultados cargada (v7.2)');
console.log('🔍 localStorage keys:', Object.keys(localStorage));
console.log('🔍 dragon3AnalisisResultado:', localStorage.getItem('dragon3AnalisisResultado') ? 'EXISTE' : 'NO EXISTE');

// =============================== VARIABLES GLOBALES ===============================
let currentArchivoId = null;           // ID del último análisis mostrado
let wsExplicacion = null;              // Conexión WebSocket reutilizable (sin uso actual)

// =============================== FUNCIONES DE MODAL ===============================

function mostrarExplicacion(texto) {
    console.log('📢 [mostrarExplicacion] INICIO, texto recibido (primeros 200 caracteres):', texto?.substring(0, 200));
    let modal = document.getElementById('knnModal');
    if (!modal) {
        console.log('📢 [mostrarExplicacion] Creando modal desde cero');
        modal = document.createElement('div');
        modal.id = 'knnModal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 25px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            z-index: 10000; max-width: 90%; width: 600px; max-height: 80vh; overflow-y: auto;
            font-family: monospace; white-space: pre-wrap; border-top: 5px solid #3b82f6;
        `;
        const overlay = document.createElement('div');
        overlay.id = 'knnOverlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 9999;`;
        overlay.addEventListener('click', cerrarExplicacion);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    } else {
        console.log('📢 [mostrarExplicacion] Modal ya existente, limpiando contenido anterior');
        modal.innerHTML = '';
    }

    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    const title = document.createElement('h3');
    title.textContent = '🧠 Explicación de la Red Superior (KNN)';
    title.style.margin = '0'; title.style.color = '#1e3a8a';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none; border:none; font-size:24px; cursor:pointer;';
    closeBtn.addEventListener('click', cerrarExplicacion);
    headerDiv.appendChild(title); headerDiv.appendChild(closeBtn);

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px;';
    contentDiv.innerHTML = texto.replace(/\n/g, '<br>');

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Cerrar';
    closeButton.style.cssText = 'background:#3b82f6; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer;';
    closeButton.addEventListener('click', cerrarExplicacion);

    modal.appendChild(headerDiv);
    modal.appendChild(contentDiv);
    modal.appendChild(closeButton);

    document.getElementById('knnOverlay').style.display = 'block';
    modal.style.display = 'block';
    console.log('📢 [mostrarExplicacion] Modal mostrado (display block)');
}

function cerrarExplicacion() {
    const modal = document.getElementById('knnModal');
    const overlay = document.getElementById('knnOverlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    console.log('🔚 [cerrarExplicacion] Modal y overlay ocultos');
}

function mostrarErrorExplicacion(error) {
    console.error('❌ [mostrarErrorExplicacion]', error);
    alert('❌ Error al obtener explicación: ' + error);
}

// =============================== CONEXIÓN WEBSOCKET (NO UTILIZADA ACTUALMENTE) ===============================
function conectarWebSocketExplicacion() {
    if (wsExplicacion && (wsExplicacion.readyState === WebSocket.OPEN || wsExplicacion.readyState === WebSocket.CONNECTING)) {
        console.log('🔌 [WebSocket] Conexión ya existente (estado:', wsExplicacion.readyState, ')');
        return wsExplicacion;
    }
    const wsUrl = 'wss://www.bladecorporation.net/ws';
    console.log('🔌 [WebSocket] Creando nueva conexión a', wsUrl);
    wsExplicacion = new WebSocket(wsUrl);
    wsExplicacion.onopen = () => {
        console.log('✅ [WebSocket] CONECTADO');
    };
    wsExplicacion.onmessage = (event) => {
        console.log('📩 [WebSocket] Mensaje recibido (longitud:', event.data.length, ')');
        try {
            const data = JSON.parse(event.data);
            console.log('📄 [WebSocket] Datos parseados:', data);
            if (data.type === 'explanation_response') {
                console.log('✅ [WebSocket] Respuesta de tipo explanation_response, llamando a mostrarExplicacion');
                mostrarExplicacion(data.explicacion);
            } else if (data.type === 'explanation_error') {
                console.error('❌ [WebSocket] Error del servidor:', data.error);
                mostrarErrorExplicacion(data.error);
            } else if (data.type === 'connected') {
                console.log('🔌 [WebSocket] Conexión establecida con el servidor');
            } else {
                console.warn('⚠️ [WebSocket] Tipo de mensaje no esperado:', data.type);
            }
        } catch (err) {
            console.error('❌ [WebSocket] Error al parsear JSON:', err, 'Datos crudos:', event.data);
            mostrarErrorExplicacion('Error al procesar la respuesta del servidor.');
        }
    };
    wsExplicacion.onerror = (err) => {
        console.error('❌ [WebSocket] Error de conexión:', err);
    };
    wsExplicacion.onclose = (event) => {
        console.log('🔌 [WebSocket] Conexión cerrada. Código:', event.code, 'Razón:', event.reason);
        wsExplicacion = null;
    };
    return wsExplicacion;
}

// =============================== FUNCIONES AUXILIARES (BOTONES ESTILIZADOS) ===============================
function crearBotonEstilizado(texto, colorInicio, colorFin) {
    const btn = document.createElement('button');
    btn.textContent = texto;
    btn.style.cssText = `
        background: linear-gradient(135deg, ${colorInicio} 0%, ${colorFin} 100%);
        color: white; border: none; padding: 15px 30px; border-radius: 10px;
        cursor: pointer; font-weight: bold; font-size: 16px;
        display: flex; align-items: center; gap: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2); transition: all 0.3s ease;
    `;
    btn.addEventListener('mouseover', () => {
        btn.style.transform = 'translateY(-3px)';
        btn.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
    });
    btn.addEventListener('mouseout', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
    });
    return btn;
}

// =============================== RENDERIZADO PRINCIPAL ===============================
function mostrarResultado(resultado) {
    console.log('🎨 Renderizando resultado ENRIQUECIDO (v7.2)...');
    const section = document.getElementById("resultadoSection");
    const loadingSection = document.getElementById("loadingSection");
    const errorMsg = document.getElementById("errorMsg");
    if (!section) { console.error('❌ CRÍTICO: #resultadoSection no encontrado'); return; }
    if (loadingSection) loadingSection.style.display = 'none';
    if (errorMsg) errorMsg.style.display = 'none';

    // Extraer datos
    const resumen = resultado.resumen || {};
    const detalles = resultado.detalles || {};
    const metadata = resultado.metadata || {};
    const analizadores = detalles.analizadores || {};
    const consenso = detalles.consenso || {};
    const totalAnalizadores = Object.keys(analizadores).length;
    const analizadoresExitosos = Object.values(analizadores).filter(a => a.exitoso === true).length;
    const tiempoPromedio = totalAnalizadores > 0 ?
        Object.values(analizadores).reduce((sum, a) => sum + (a.processingTime || 0), 0) / totalAnalizadores : 0;

    // Decisión y clases
    let badgeClass = 'analisis-indeterminado';
    let badgeIcon = '❓';
    let badgeText = 'Indeterminado';
    const decision = (resumen.decision || '').toLowerCase();
    if (decision.includes('humano') || decision.includes('autentic')) {
        badgeClass = 'analisis-autentico'; badgeIcon = '✅'; badgeText = 'Humano/Auténtico';
    } else if (decision.includes('artificial') || decision.includes('ia')) {
        badgeClass = 'analisis-artificial'; badgeIcon = '🤖'; badgeText = 'Artificial/IA';
    }

    // Limpiar section y construir todo con DOM
    section.innerHTML = '';
    section.style.cssText = 'display: block !important; width:100%; background:transparent;';

    // ----- BANNER PRINCIPAL (construido con DOM) -----
    const banner = document.createElement('div');
    banner.className = 'analisis-banner';
    banner.style.cssText = `
        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
        color: white; padding: 30px; border-radius: 15px; margin-bottom: 25px;
        box-shadow: 0 10px 30px rgba(59,130,246,0.3); position: relative; overflow: hidden;
    `;
    const decor = document.createElement('div');
    decor.style.cssText = 'position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 50%;';
    banner.appendChild(decor);
    const flexDiv = document.createElement('div');
    flexDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 2; flex-wrap: wrap; gap: 15px;';
    const leftDiv = document.createElement('div');
    const titleH1 = document.createElement('h1');
    titleH1.style.margin = '0 0 10px 0'; titleH1.style.fontSize = '32px'; titleH1.style.display = 'flex'; titleH1.style.alignItems = 'center';
    titleH1.innerHTML = `${badgeIcon} Análisis Dragon3 FAANG`;
    const pExplic = document.createElement('p');
    pExplic.style.margin = '0'; pExplic.style.opacity = '0.9'; pExplic.style.fontSize = '18px';
    pExplic.textContent = resumen.explicacion || 'Análisis de imagen completo';
    leftDiv.appendChild(titleH1); leftDiv.appendChild(pExplic);
    const rightDiv = document.createElement('div');
    rightDiv.style.cssText = 'background: rgba(255,255,255,0.2); padding:20px; border-radius:12px; text-align:center; min-width:200px; backdrop-filter:blur(10px);';
    const decisionLabel = document.createElement('div'); decisionLabel.style.fontSize = '14px'; decisionLabel.style.opacity = '0.9'; decisionLabel.textContent = 'DECISIÓN FINAL';
    const badgeSpan = document.createElement('div');
    badgeSpan.className = `analisis-badge ${badgeClass}`;
    badgeSpan.style.cssText = 'font-size:24px; font-weight:bold; padding:10px 25px; border-radius:30px; margin:10px 0; display:inline-block;';
    badgeSpan.textContent = resumen.decision || badgeText;
    const confSpan = document.createElement('div'); confSpan.style.fontSize = '16px';
    confSpan.innerHTML = `Confianza: <strong>${typeof resumen.confianza === 'number' ? (resumen.confianza * 100).toFixed(1) + '%' : 'N/A'}</strong>`;
    rightDiv.appendChild(decisionLabel); rightDiv.appendChild(badgeSpan); rightDiv.appendChild(confSpan);
    flexDiv.appendChild(leftDiv); flexDiv.appendChild(rightDiv);
    banner.appendChild(flexDiv);
    section.appendChild(banner);

    // ----- PANEL DE ESTADÍSTICAS RÁPIDAS (4 tarjetas) -----
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:15px; margin-bottom:25px;';
    const stats = [
        { label: '📊 Score Humano', value: typeof resumen.score === 'number' ? (resumen.score*100).toFixed(1)+'%' : 'N/A', sub: resumen.score ? (resumen.score*100).toFixed(0)+'/100 puntos' : '', color: '#10b981' },
        { label: '⏱️ Tiempo Total', value: resumen.tiempoTotal ? resumen.tiempoTotal+'ms' : '—', sub: tiempoPromedio ? 'Promedio: '+tiempoPromedio.toFixed(0)+'ms' : '', color: '#6366f1' },
        { label: '🔬 Analizadores', value: totalAnalizadores, sub: analizadoresExitosos+' exitosos', color: '#8b5cf6' },
        { label: '🏷️ Etiquetas', value: (resumen.etiquetas && resumen.etiquetas.length) ? resumen.etiquetas.length+' tags' : 'Sin etiquetas', sub: '', color: '#1e293b' }
    ];
    stats.forEach(stat => {
        const card = document.createElement('div');
        card.style.cssText = 'background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 15px rgba(0,0,0,0.05);';
        const labelDiv = document.createElement('div'); labelDiv.style.cssText = 'font-size:14px; color:#64748b; margin-bottom:5px;'; labelDiv.textContent = stat.label;
        const valueDiv = document.createElement('div'); valueDiv.style.cssText = `font-size:32px; font-weight:bold; color:${stat.color};`; valueDiv.textContent = stat.value;
        const subDiv = document.createElement('div'); subDiv.style.cssText = 'font-size:12px; color:#94a3b8;'; subDiv.textContent = stat.sub;
        card.appendChild(labelDiv); card.appendChild(valueDiv); card.appendChild(subDiv);
        statsGrid.appendChild(card);
    });
    section.appendChild(statsGrid);

    // ----- TRAZABILIDAD -----
    const trazabilidad = document.createElement('div');
    trazabilidad.style.cssText = 'background:#f8fafc; border-radius:10px; padding:20px; margin-bottom:25px; border-left:4px solid #94a3b8;';
    trazabilidad.innerHTML = `
        <h3 style="margin:0 0 15px 0; color:#475569;">📋 Información de Trazabilidad</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px,1fr)); gap:15px;">
            <div><strong>ID de Correlación:</strong><br><code style="background:#e2e8f0; padding:5px 10px; border-radius:5px; font-size:12px; display:inline-block; margin-top:5px;">${resumen.correlationId || metadata.correlationId || 'N/A'}</code></div>
            <div><strong>ID del Archivo:</strong><br><code style="background:#e2e8f0; padding:5px 10px; border-radius:5px; font-size:12px; display:inline-block; margin-top:5px;">${resumen.archivoId || metadata.archivoId || 'N/A'}</code></div>
            <div><strong>Fecha/Hora:</strong><br><span style="color:#475569;">${resumen.timestamp ? new Date(resumen.timestamp).toLocaleString() : 'N/A'}</span></div>
            <div><strong>Modelo Principal:</strong><br><span style="color:#475569;">${resumen.modeloPrincipal || 'Dragon3_FAANG_V25'}</span></div>
        </div>
    `;
    section.appendChild(trazabilidad);

    // ----- ANALIZADORES DETALLADOS (acordeones) -----
    if (totalAnalizadores > 0) {
        const analizadoresTitle = document.createElement('h2');
        analizadoresTitle.style.cssText = 'color:#1e293b; margin:30px 0 20px 0; font-size:24px; display:flex; align-items:center;';
        analizadoresTitle.innerHTML = `🔍 Analizadores Detallados <span style="margin-left:10px; font-size:14px; background:#e2e8f0; color:#475569; padding:2px 10px; border-radius:10px;">${totalAnalizadores} módulos</span>`;
        section.appendChild(analizadoresTitle);
        const analizadoresArray = Object.entries(analizadores).sort((a,b) => (b[1].processingTime || 0) - (a[1].processingTime || 0));
        for (const [nombre, datos] of analizadoresArray) {
            if (!datos) continue;
            const meta = datos.meta || {};
            const evaluacion = datos.evaluacion || {};
            const narrativa = datos.narrativa || {};
            const forense = datos.forense || {};
            const veredicto = evaluacion.veredicto || datos.decision || 'N/A';
            const confianza = evaluacion.confianza || datos.confianza || 0;
            let analizadorIcon = '🔬', analizadorColor = '#6b7280';
            if (nombre.includes('FFT')) { analizadorIcon = '🌊'; analizadorColor = '#0ea5e9'; }
            else if (nombre.includes('ELA')) { analizadorIcon = '🔍'; analizadorColor = '#f59e0b'; }
            else if (nombre.includes('MBH')) { analizadorIcon = '⚔️'; analizadorColor = '#ef4444'; }
            else if (nombre.includes('Exif')) { analizadorIcon = '📷'; analizadorColor = '#8b5cf6'; }
            else if (nombre.includes('C2PA')) { analizadorIcon = '🔏'; analizadorColor = '#10b981'; }
            else if (nombre.includes('Validator')) { analizadorIcon = '✅'; analizadorColor = '#84cc16'; }
            else if (nombre.includes('Resolucion')) { analizadorIcon = '📐'; analizadorColor = '#f97316'; }
            // Si es la célula ML, asignar icono específico
            if (nombre === 'ml') { analizadorIcon = '🧠'; analizadorColor = '#8b5cf6'; }
            let veredictoClass = 'analisis-indeterminado';
            if (veredicto.toLowerCase().includes('humano')) veredictoClass = 'analisis-autentico';
            else if (veredicto.toLowerCase().includes('artificial')) veredictoClass = 'analisis-artificial';
            const details = document.createElement('details');
            details.style.cssText = 'margin-bottom:15px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:white; box-shadow:0 3px 10px rgba(0,0,0,0.05);';
            const summary = document.createElement('summary');
            summary.style.cssText = `padding:20px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; list-style:none; background:linear-gradient(90deg, ${analizadorColor}20 0%, transparent 100%); border-left:4px solid ${analizadorColor}; flex-wrap: wrap; gap: 10px;`;
            const leftSummary = document.createElement('div'); leftSummary.style.cssText = 'display:flex; align-items:center; gap:15px; flex-wrap: wrap;';
            const iconCircle = document.createElement('div'); iconCircle.style.cssText = `width:50px; height:50px; background:${analizadorColor}; color:white; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink: 0;`;
            iconCircle.textContent = analizadorIcon;
            const textDiv = document.createElement('div');
            const nameDiv = document.createElement('div'); nameDiv.style.cssText = 'font-weight:bold; font-size:18px; color:#1e293b;'; nameDiv.textContent = meta.nombre || nombre;
            const metaDiv = document.createElement('div'); metaDiv.style.cssText = 'font-size:14px; color:#64748b; margin-top:3px;';
            metaDiv.textContent = `${meta.id || ''} • v${datos.version || meta.version || '1.0.0'} • ${datos.processingTime || 0}ms`;
            textDiv.appendChild(nameDiv); textDiv.appendChild(metaDiv);
            leftSummary.appendChild(iconCircle); leftSummary.appendChild(textDiv);
            const rightSummary = document.createElement('div'); rightSummary.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; gap:5px;';
            const badgeSpan2 = document.createElement('span'); badgeSpan2.className = `analisis-badge ${veredictoClass}`; badgeSpan2.style.cssText = 'padding:6px 15px; border-radius:20px; font-weight:bold; font-size:14px;'; badgeSpan2.textContent = veredicto;
            const infoSpan = document.createElement('div'); infoSpan.style.cssText = 'display:flex; gap:10px; font-size:12px; color:#64748b; flex-wrap: wrap;';
            infoSpan.innerHTML = `<span>Confianza: <strong>${(confianza*100).toFixed(1)}%</strong></span><span>•</span><span>Tiempo: <strong>${datos.processingTime || 0}ms</strong></span><span>•</span><span>${datos.exitoso ? '✅ Éxito' : '❌ Fallo'}</span>`;
            rightSummary.appendChild(badgeSpan2); rightSummary.appendChild(infoSpan);
            summary.appendChild(leftSummary); summary.appendChild(rightSummary);
            details.appendChild(summary);
            const contentDivDetails = document.createElement('div'); contentDivDetails.style.cssText = 'padding:0 20px 20px 20px;';
            if (narrativa.titulo || narrativa.explicacion_humana) {
                const narrDiv = document.createElement('div'); narrDiv.style.cssText = 'background:#f0f9ff; border-radius:8px; padding:15px; margin:15px 0; border-left:4px solid #0ea5e9;';
                if (narrativa.titulo) { const t = document.createElement('div'); t.style.cssText = 'font-weight:bold; color:#0369a1; margin-bottom:5px;'; t.textContent = narrativa.titulo; narrDiv.appendChild(t); }
                if (narrativa.explicacion_humana) { const p = document.createElement('div'); p.style.cssText = 'color:#1e293b;'; p.textContent = narrativa.explicacion_humana; narrDiv.appendChild(p); }
                if (narrativa.explicacion_tecnica) { const tech = document.createElement('div'); tech.style.cssText = 'margin-top:10px; font-size:12px; color:#64748b;'; tech.innerHTML = `<em>${narrativa.explicacion_tecnica}</em>`; narrDiv.appendChild(tech); }
                contentDivDetails.appendChild(narrDiv);
            }
            if (forense.raw_data || forense.herramientas) {
                const forenseDiv = document.createElement('div'); forenseDiv.style.cssText = 'margin:15px 0;';
                const title = document.createElement('div'); title.style.cssText = 'font-weight:bold; color:#475569; margin-bottom:10px;'; title.textContent = '🕵️ Datos Forenses';
                const preF = document.createElement('pre'); preF.style.cssText = 'background:#1e293b; color:#e2e8f0; border-radius:8px; padding:15px; font-family:monospace; font-size:12px; max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;';
                preF.textContent = JSON.stringify(forense, null, 2);
                forenseDiv.appendChild(title); forenseDiv.appendChild(preF);
                contentDivDetails.appendChild(forenseDiv);
            }
            const metaFooter = document.createElement('div'); metaFooter.style.cssText = 'background:#f8fafc; border-radius:8px; padding:15px; margin-top:15px; font-size:12px; color:#64748b; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:10px;';
            if (meta.ts_start) metaFooter.innerHTML += `<div><strong>Inicio:</strong> ${new Date(meta.ts_start).toLocaleTimeString()}</div>`;
            if (meta.ts_end) metaFooter.innerHTML += `<div><strong>Fin:</strong> ${new Date(meta.ts_end).toLocaleTimeString()}</div>`;
            if (meta.ms) metaFooter.innerHTML += `<div><strong>Duración:</strong> ${meta.ms}ms</div>`;
            if (evaluacion.peso) metaFooter.innerHTML += `<div><strong>Peso en decisión:</strong> ${evaluacion.peso}</div>`;
            if (datos.flags) {
                const flagsStr = Object.entries(datos.flags).filter(([k,v]) => v).map(([k]) => k).join(', ') || 'ninguno';
                metaFooter.innerHTML += `<div><strong>Flags:</strong> ${flagsStr}</div>`;
            }
            contentDivDetails.appendChild(metaFooter);
            details.appendChild(contentDivDetails);
            section.appendChild(details);
            
            // ============================================================
            // PARCHE: Asegurar que este details se abre al hacer clic en su summary
            // ============================================================
            // Añadir un listener directo al summary de este details
            const sum = details.querySelector('summary');
            if (sum) {
                sum.style.cursor = 'pointer';
                sum.addEventListener('click', function(e) {
                    // Alternar el estado open del details
                    details.open = !details.open;
                    // No prevenir el comportamiento por defecto para no interferir
                });
            }
        } // fin del bucle de analizadores
    }

    // ----- CONSENSO -----
    if (consenso && Object.keys(consenso).length > 0) {
        const consensoDiv = document.createElement('div');
        consensoDiv.style.cssText = 'background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius:10px; padding:25px; margin:30px 0; border:2px solid #10b981;';
        consensoDiv.innerHTML = `
            <h3 style="margin:0 0 20px 0; color:#065f46; display:flex; align-items:center; flex-wrap: wrap; gap: 10px;">
                🤝 Consenso de Analizadores
                ${consenso.decision ? `<span style="margin-left:15px; background:#10b981; color:white; padding:5px 15px; border-radius:20px; font-size:14px;">${consenso.decision}</span>` : ''}
            </h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:15px;">
                ${consenso.totalAnalizadores ? `<div style="text-align:center;"><div style="font-size:12px; color:#059669;">Total Analizadores</div><div style="font-size:36px; font-weight:bold; color:#10b981;">${consenso.totalAnalizadores}</div></div>` : ''}
                ${consenso.totalOmitidos ? `<div style="text-align:center;"><div style="font-size:12px; color:#b45309;">Omitidos</div><div style="font-size:36px; font-weight:bold; color:#f59e0b;">${consenso.totalOmitidos}</div></div>` : ''}
                ${consenso.porcentajeAutentico !== undefined ? `<div style="text-align:center;"><div style="font-size:12px; color:#059669;">% Auténtico</div><div style="font-size:36px; font-weight:bold; color:#10b981;">${(consenso.porcentajeAutentico * 100).toFixed(1)}%</div></div>` : ''}
                ${consenso.totalVotos ? `<div style="text-align:center;"><div style="font-size:12px; color:#7c3aed;">Votos Válidos</div><div style="font-size:36px; font-weight:bold; color:#8b5cf6;">${consenso.totalVotos}</div></div>` : ''}
            </div>
            ${consenso.analizadoresIncluidos ? `<div style="margin-top:20px;"><div style="font-size:14px; color:#047857; margin-bottom:10px;"><strong>Analizadores Incluidos:</strong></div><div style="display:flex; flex-wrap:wrap; gap:8px;">${consenso.analizadoresIncluidos.map(a => `<span style="background:#d1fae5; color:#065f46; padding:4px 12px; border-radius:15px; font-size:12px;">${a.nombre || a.id || 'Analizador'}</span>`).join('')}</div></div>` : ''}
            ${consenso.analizadoresOmitidos && consenso.analizadoresOmitidos.length > 0 ? `<div style="margin-top:15px;"><div style="font-size:14px; color:#b45309; margin-bottom:10px;"><strong>Analizadores Omitidos:</strong></div><div style="display:flex; flex-wrap:wrap; gap:8px;">${consenso.analizadoresOmitidos.map(a => `<span style="background:#fef3c7; color:#92400e; padding:4px 12px; border-radius:15px; font-size:12px;">${a.nombre || a.id || 'Analizador'}</span>`).join('')}</div></div>` : ''}
        `;
        section.appendChild(consensoDiv);
    }

    // ----- BOTONES DE ACCIÓN (Nuevo Análisis, Ver JSON, Copiar Resultado) -----
    const accionesDiv = document.createElement('div');
    accionesDiv.style.cssText = 'display: flex; justify-content: center; gap: 15px; margin: 40px 0; flex-wrap: wrap;';
    
    // Botón: Nuevo Análisis
    const btnNuevo = crearBotonEstilizado('🔍 Nuevo Análisis', '#3b82f6', '#1d4ed8');
    btnNuevo.addEventListener('click', () => window.location.href = 'analizador.html');
    accionesDiv.appendChild(btnNuevo);
    
    // Botón: Ver JSON Completo
    const btnVerJson = crearBotonEstilizado('📋 Ver JSON Completo', '#8b5cf6', '#7c3aed');
    btnVerJson.id = 'btnVerJson';
    accionesDiv.appendChild(btnVerJson);
    
    // Botón: Copiar Resultado
    const btnCopiar = crearBotonEstilizado('📋 Copiar Resultado', '#10b981', '#059669');
    btnCopiar.addEventListener('click', () => copiarResultado(resumen));
    accionesDiv.appendChild(btnCopiar);
    
    section.appendChild(accionesDiv);

    // ----- CONTENEDOR JSON (oculto inicialmente) -----
    const jsonContainer = document.createElement('div');
    jsonContainer.id = 'jsonContainer';
    jsonContainer.style.display = 'none';
    jsonContainer.style.marginTop = '20px';
    const jsonInner = document.createElement('div');
    jsonInner.style.cssText = 'background:#1e293b; border-radius:12px; padding:25px; color:white; position:relative; box-shadow:0 10px 40px rgba(0,0,0,0.3);';
    const jsonHeader = document.createElement('div'); jsonHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;';
    const jsonTitleH = document.createElement('h3'); jsonTitleH.textContent = 'JSON Completo del Análisis'; jsonTitleH.style.margin = '0'; jsonTitleH.style.color = '#60a5fa'; jsonTitleH.style.fontSize = '20px';
    const btnGroup = document.createElement('div'); btnGroup.style.cssText = 'display:flex; gap:10px; flex-wrap: wrap;';
    const btnCopiarJSON = document.createElement('button'); btnCopiarJSON.textContent = '📋 Copiar'; btnCopiarJSON.style.cssText = 'background:#3b82f6; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:8px;';
    btnCopiarJSON.addEventListener('click', () => copiarJSON());
    const btnDescargarJSON = document.createElement('button'); btnDescargarJSON.textContent = '💾 Descargar'; btnDescargarJSON.style.cssText = 'background:#10b981; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:8px;';
    btnDescargarJSON.addEventListener('click', () => descargarJSON(resumen.archivoId));
    btnGroup.appendChild(btnCopiarJSON); btnGroup.appendChild(btnDescargarJSON);
    jsonHeader.appendChild(jsonTitleH); jsonHeader.appendChild(btnGroup);
    jsonInner.appendChild(jsonHeader);
    const pre = document.createElement('pre'); pre.id = 'jsonPre'; pre.style.cssText = 'background:#2d2d2d; color:#e0e0e0; padding:20px; border-radius:8px; overflow:auto; max-height:600px; font-size:13px; line-height:1.5; margin:0; white-space:pre-wrap; word-wrap:break-word; font-family:monospace;';
    pre.textContent = JSON.stringify(resultado, null, 2);
    jsonInner.appendChild(pre);
    jsonContainer.appendChild(jsonInner);
    section.appendChild(jsonContainer);

    // Evento para mostrar/ocultar JSON
    btnVerJson.addEventListener('click', () => {
        const isHidden = jsonContainer.style.display === 'none' || jsonContainer.style.display === '';
        jsonContainer.style.display = isHidden ? 'block' : 'none';
        btnVerJson.innerHTML = isHidden ? '🙈 Ocultar JSON' : '📋 Ver JSON Completo';
        if (isHidden) jsonContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Funciones auxiliares para copiar/descargar JSON
    function copiarResultado(resumen) {
        const texto = `Resultado del Análisis Dragon3:
Decisión: ${resumen.decision || 'N/A'}
Confianza: ${typeof resumen.confianza === 'number' ? (resumen.confianza * 100).toFixed(1) + '%' : 'N/A'}
Score Humano: ${typeof resumen.score === 'number' ? (resumen.score * 100).toFixed(1) + '%' : 'N/A'}
Explicación: ${resumen.explicacion || 'N/A'}
Correlation ID: ${resumen.correlationId || 'N/A'}
Archivo ID: ${resumen.archivoId || 'N/A'}
Fecha: ${resumen.timestamp ? new Date(resumen.timestamp).toLocaleString() : 'N/A'}`;
        navigator.clipboard.writeText(texto).then(() => {
            const original = btnCopiar.innerHTML;
            btnCopiar.innerHTML = '✅ Copiado!';
            setTimeout(() => btnCopiar.innerHTML = original, 2000);
        }).catch(err => alert('Error al copiar: ' + err));
    }
    
    function copiarJSON() {
        const preElem = document.getElementById('jsonPre');
        if (preElem) {
            navigator.clipboard.writeText(preElem.textContent).then(() => {
                const original = btnCopiarJSON.innerHTML;
                btnCopiarJSON.innerHTML = '✅ Copiado!';
                setTimeout(() => btnCopiarJSON.innerHTML = original, 2000);
            }).catch(err => alert('Error al copiar JSON: ' + err));
        }
    }
    
    function descargarJSON(archivoId) {
        const preElem = document.getElementById('jsonPre');
        if (preElem) {
            const blob = new Blob([preElem.textContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analisis-dragon3-${archivoId || Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    // ============================================================
    // PARCHE DE DELEGACIÓN DE EVENTOS PARA TODOS LOS DETAILS
    // ============================================================
    // Esto asegura que cualquier summary, incluso los añadidos dinámicamente,
    // abra su details padre al hacer clic. Se ejecuta después de renderizar.
    setTimeout(() => {
        const container = document.getElementById('resultadoSection');
        if (container) {
            // Eliminar listeners anteriores para evitar duplicados (si los hubiera)
            // Pero como no tenemos referencia, simplemente añadimos el nuevo.
            // Usamos un flag para evitar múltiples asignaciones.
            if (!container._detailsListenerAdded) {
                container.addEventListener('click', function(e) {
                    const summary = e.target.closest('summary');
                    if (summary) {
                        const details = summary.closest('details');
                        if (details) {
                            // Alternar el estado open
                            details.open = !details.open;
                        }
                    }
                });
                container._detailsListenerAdded = true;
                console.log('🔧 [PARCHE] Delegación de eventos para details activada.');
            }
        }
    }, 100);

    console.log('✅ Resultado ENRIQUECIDO renderizado con todos los datos (v7.2)');
}

// =============================== FUNCIONES DE ERROR Y DIAGNÓSTICO ===============================
function mostrarError(mensaje) {
    const errorDiv = document.getElementById('errorMsg');
    if (errorDiv) {
        errorDiv.textContent = mensaje;
        errorDiv.style.display = 'block';
    }
    const loading = document.getElementById('loadingSection');
    if (loading) loading.style.display = 'none';
    const section = document.getElementById('resultadoSection');
    if (section) section.style.display = 'none';
    console.error('❌ [mostrarError]', mensaje);
}

function mostrarDebugInfo() {
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'background:#fef2f2; border:1px solid #ef4444; padding:15px; margin:20px; border-radius:8px;';
    debugDiv.innerHTML = '<strong>🔍 Información de diagnóstico:</strong><br>Ver consola para más detalles.';
    document.body.appendChild(debugDiv);
    console.warn('⚠️ [mostrarDebugInfo] Panel de diagnóstico añadido');
}

// =============================== INICIALIZACIÓN ===============================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM cargado, buscando resultado...');
    try {
        const resultadoJSON = localStorage.getItem('dragon3AnalisisResultado');
        if (!resultadoJSON) {
            console.error('❌ No se encontró resultado en localStorage');
            mostrarError('No se encontró resultado de análisis. Por favor, sube una imagen primero.');
            return;
        }
        const resultado = JSON.parse(resultadoJSON);
        if (!resultado || typeof resultado !== 'object') throw new Error('Resultado no válido');
        mostrarResultado(resultado);
        const loadingSection = document.getElementById('loadingSection');
        if (loadingSection) loadingSection.style.display = 'none';
    } catch (error) {
        console.error('❌ Error procesando resultado:', error);
        mostrarError('Error cargando el análisis: ' + error.message);
        mostrarDebugInfo();
    }
});
