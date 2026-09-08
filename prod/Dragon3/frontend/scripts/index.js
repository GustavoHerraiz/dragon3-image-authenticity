// scripts/index.js
// Lógica de navegación y animaciones para index.html Blade Corporation
// Extraído del script inline original para cumplir CSP

// --- MÉTRICAS DRAGON3 ---
// Helper para enviar métricas al backend (AJAX)
function enviarMetricaFrontend(evento, detalle = {}) {
  try {
    fetch('/api/metricas-frontend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento,
        detalle,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.pathname
      })
    });
  } catch(e) {
    // Sin console.log, solo protección
  }
}

// --- Captura visita de página principal ---
document.addEventListener('DOMContentLoaded', function() {
  enviarMetricaFrontend('visita_pagina', { pagina: 'index.html' });
});

// Navegación por secciones
var verificadorMBHText = document.getElementById("verificadorMBHText");
if (verificadorMBHText) {
  verificadorMBHText.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'verificadorMBHText' });
    var anchor = document.querySelector("[data-scroll-to='hero']");
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var serviciosText = document.getElementById("serviciosText");
if (serviciosText) {
  serviciosText.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'serviciosText' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionServiciosContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var planesText = document.getElementById("planesText");
if (planesText) {
  planesText.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'planesText' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionPlanesContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var fAQsText = document.getElementById("fAQsText");
if (fAQsText) {
  fAQsText.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'fAQsText' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionFAQsContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var botom1 = document.getElementById("botom1");
if (botom1) {
  botom1.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'botom1' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionFormContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var titleContainer = document.getElementById("titleContainer");
if (titleContainer) {
  titleContainer.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'titleContainer' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionPlanesContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

var textLinkListItem1 = document.getElementById("textLinkListItem1");
if (textLinkListItem1) {
  textLinkListItem1.addEventListener("click", function () {
    enviarMetricaFrontend('click', { elemento: 'textLinkListItem1' });
    var anchor = document.querySelector(
      "[data-scroll-to='sectionFormContainer']"
    );
    if (anchor) {
      anchor.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

// Animación on-scroll (igual que original)
var scrollAnimElements = document.querySelectorAll("[data-animate-on-scroll]");
var observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting || entry.intersectionRatio > 0) {
        const targetElement = entry.target;
        // Captura evento de sección vista
        enviarMetricaFrontend('seccion_vista', { elemento: targetElement.id || targetElement.className });
        targetElement.classList.add("animate");
        observer.unobserve(targetElement);
      }
    }
  },
  {
    threshold: 0.15,
  }
);
for (let i = 0; i < scrollAnimElements.length; i++) {
  observer.observe(scrollAnimElements[i]);
}

document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('form[action="/api/contacto"]');
  if (!form) return;

  form.addEventListener('submit', async function(event) {
    event.preventDefault();

    const formData = new FormData(form);
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }

    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        form.reset();
        mostrarMensajeContacto('Gracias. Tu mensaje ha sido enviado correctamente.');
      } else {
        mostrarMensajeContacto('Error al enviar el mensaje. Inténtalo de nuevo.');
      }
    } catch (err) {
      mostrarMensajeContacto('Error de red o servidor. Vuelve a intentarlo más tarde.');
    }
  });

  function mostrarMensajeContacto(msg) {
    let div = document.getElementById('mensaje-contacto-estado');
    if (!div) {
      div = document.createElement('div');
      div.id = 'mensaje-contacto-estado';
      div.style.marginTop = '1em';
      div.style.fontWeight = 'bold';
      form.parentNode.appendChild(div);
    }
    div.textContent = msg;
  }
});
