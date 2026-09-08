// ============================================
// FUNCIÓN DE LIMPIEZA PREVENTIVA
// ============================================
function limpiarCacheAnalisisAnterior() {
    localStorage.removeItem("dragon3AnalisisResultado");
    localStorage.removeItem("correlationId");
    localStorage.removeItem("dragon3-resultado-publico");
}

/**
 * Dragon3 - scripts/analizador.js (Estética Blade, upload con validación)
 * CORREGIDO: Estructura try-catch completa
 */
document.addEventListener('DOMContentLoaded', function() {
    limpiarCacheAnalisisAnterior();
    const $ = id => document.getElementById(id);

    // Debug: Verificar que el formulario existe
    console.log("🔍 Formulario encontrado:", $('uploadForm') ? "Sí" : "No");

    if ($('uploadForm')) {
        $('uploadForm').onsubmit = async function(ev) {
            ev.preventDefault();
            const archivoInput = $('archivo');

            if (!archivoInput || !archivoInput.files[0]) {
                mostrarError("Selecciona un archivo para analizar.");
                return;
            }

            const archivo = archivoInput.files[0];
            const formData = new FormData();
            formData.append("archivo", archivo);

            mostrarCarga();
            ocultarError();

            try {
                console.log("📤 Enviando archivo:", archivo.name, "tipo:", archivo.type);

                const res = await fetch("/analizar-imagen-publico", {
                    method: "POST",
                    body: formData
                });

                console.log("📊 Status:", res.status, res.statusText);

                // Primero verificar si es JSON
                const contentType = res.headers.get('content-type') || '';
                const esJson = contentType.includes('application/json');

                if (!esJson) {
                    const texto = await res.text();
                    console.error("❌ El servidor no devolvió JSON:", texto.substring(0, 500));

                    // Intentar extraer JSON si viene en HTML
                    const match = texto.match(/{.*}/s);
                    if (match) {
                        try {
                            const data = JSON.parse(match[0]);
                            procesarRespuesta(data, res.ok);
                            return;
                        } catch (parseError) {
                            throw new Error("Respuesta no es JSON válido");
                        }
                    } else {
                        throw new Error("El servidor respondió con HTML en lugar de JSON");
                    }
                }

                // Si es JSON, parsear normalmente
                const data = await res.json();
                procesarRespuesta(data, res.ok);

            } catch (error) {
                console.error("❌ ERROR EN ANÁLISIS:", error);
                mostrarError("Error: " + error.message);
                ocultarCarga();
            }
        };
    } else {
        console.error("❌ No se encontró el formulario con id 'uploadForm'");
    }

    // Modal JSON
    window.verJsonAnalisis = function(btn, resultado) {
        if (document.getElementById('jsonModalAnalisis')) return;
        const modal = document.createElement('div');
        modal.className = 'analisis-json-modal';
        modal.id = 'jsonModalAnalisis';
        modal.innerHTML = `
            <button class="close-json-modal" onclick="document.body.removeChild(document.getElementById('jsonModalAnalisis'))">&times;</button>
            <h3 style="color:var(--accent-green);font-size:1.08em;">JSON de análisis</h3>
            <pre>${JSON.stringify(resultado, null, 2)}</pre>
        `;
        document.body.appendChild(modal);
    };
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function mostrarError(mensaje) {
    const errorMsg = document.getElementById('errorMsg');
    if (errorMsg) {
        errorMsg.textContent = mensaje;
        errorMsg.style.display = "block";
    }
}

function ocultarError() {
    const errorMsg = document.getElementById('errorMsg');
    if (errorMsg) errorMsg.style.display = "none";
}

function mostrarCarga() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (loadingSpinner) loadingSpinner.style.display = "";
    if (analyzeBtn) analyzeBtn.setAttribute("aria-busy", "true");
}

function ocultarCarga() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (loadingSpinner) loadingSpinner.style.display = "none";
    if (analyzeBtn) analyzeBtn.setAttribute("aria-busy", "false");
}

function procesarRespuesta(data, esExitoso) {
    if (!esExitoso) {
        const errorMsg = data.error || `Error ${data.statusCode || 500}`;
        throw new Error(errorMsg);
    }

    if (!data.resultado) {
        throw new Error("El servidor no devolvió resultados válidos");
    }

    // Guardar resultado
    localStorage.setItem("dragon3AnalisisResultado", JSON.stringify(data.resultado));
    console.log("✅ Resultado guardado:", data.resultado.resumen?.decision || "Sin decisión");

    // Redirigir
    setTimeout(() => {
        window.location.href = "analizar-imagen-publico.html";
    }, 100);
}

// ============================================
// RENDER ANÁLISIS ACCORDION RESULTADO
// ============================================
function renderAnalisisAccordion(resultado, titulo) {
    if (!resultado || typeof resultado !== "object") return "<div>Error: resultado no estructurado.</div>";

    const resumen = resultado.resumen || {};
    const icono = resumen.icono || "";
    const decision = resumen.decision || "Indeterminado";
    const confianza = resumen.confianza || "—";
    const score = (typeof resumen.score === "number") ? (resumen.score * 100).toFixed(1) + "%" : "";
    const archivoId = resultado.imagenId || resumen.archivoId || "—";
    const correlationId = resumen.correlationId || resultado.correlationId || "—";
    const timestamp = resumen.timestamp ? new Date(resumen.timestamp).toLocaleString() : "—";

    let badge = "analisis-badge analisis-indeterminado";
    if (/autentic|humano/i.test(decision)) badge = "analisis-badge analisis-autentico";
    else if (/artificial/i.test(decision)) badge = "analisis-badge analisis-artificial";

    return `
    <details class="analisis-card" open>
        <summary>
            <span>${titulo || "Nuevo análisis"}</span>
            <span class="${badge}">${icono} ${decision}</span>
            <span class="analisis-score">Confianza: ${confianza}${score ? ', Score: ' + score : ''}</span>
            <span style="margin-left:auto; color:#94a3b8; font-size:0.97em;">ID: ${archivoId}</span>
        </summary>
        <div class="analisis-detalles">
            <b>Decisión:</b> ${decision} <br>
            <b>ID archivo:</b> ${archivoId} <br>
            <b>Correlation ID:</b> ${correlationId} <br>
            <b>Fecha análisis:</b> ${timestamp} <br>
            <b>Motivo:</b> ${resumen.motivoPrincipal || "—"} <br>
            <div class="analisis-botones">
                <button class="button" onclick='window.verJsonAnalisis(this, ${JSON.stringify(resultado)})'>Ver JSON</button>
            </div>
        </div>
    </details>
    `.trim();
}
