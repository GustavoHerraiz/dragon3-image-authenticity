import { Menu, app, shell, dialog } from 'electron';

/**
 * Crea el menú personalizado de Dragon3
 * @param {Object} handlers - Objeto con las funciones que se ejecutarán al hacer clic en cada elemento
 * @returns {Menu} Menú de Electron
 */
export function crearMenu(handlers) {
  const template = [
    // ============================================================
    //  MENÚ ARCHIVO
    // ============================================================
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo proyecto',
          accelerator: 'CmdOrCtrl+N',
          click: handlers.nuevoProyecto || (() => {})
        },
        {
          label: 'Abrir proyecto',
          accelerator: 'CmdOrCtrl+O',
          click: handlers.abrirProyecto || (() => {})
        },
        { type: 'separator' },
        {
          label: 'Generar informe PDF',
          accelerator: 'CmdOrCtrl+P',
          click: handlers.generarInforme || (() => {})
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },

    // ============================================================
    //  MENÚ EDICIÓN
    // ============================================================
    {
      label: 'Edición',
      submenu: [
        {
          label: 'Configuración',
          accelerator: 'CmdOrCtrl+,',
          click: handlers.abrirConfiguracion || (() => {})
        },
        {
          label: 'Activar Premium',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: handlers.activarPremium || (() => {})
        }
      ]
    },

    // ============================================================
    //  MENÚ VER
    // ============================================================
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // ============================================================
    //  MENÚ VENTANA
    // ============================================================
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { role: 'front' }
      ]
    },

    // ============================================================
    //  MENÚ AYUDA
    // ============================================================
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Manual de usuario',
          accelerator: 'F1',
          click: handlers.manualUsuario || (() => {})
        },
        { type: 'separator' },
        {
          label: 'Acerca de Dragon3',
          click: handlers.acercaDe || (() => {
            dialog.showMessageBox({
              type: 'info',
              title: 'Acerca de Dragon3',
              message: '🐉 Dragon3 - Marca de Agua Forense',
              detail: `Versión: 1.0\n\nSistema de protección forense para fotógrafos profesionales.\nIntegra Stardust + Vogel y metadatos forenses.\n\n© 2026 Blade Corporation`
            });
          })
        },
        {
          label: 'Soporte',
          click: handlers.soporte || (() => {
            shell.openExternal('mailto:gustavo.herraiz@gmail.com');
          })
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}