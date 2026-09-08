console.log('Preload cargado correctamente');
const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al renderer con el nombre dragon3Api
contextBridge.exposeInMainWorld('dragon3Api', {
  // Proyectos
  getProyectos: () => ipcRenderer.invoke('get-proyectos'),
  crearProyecto: (data) => ipcRenderer.invoke('crear-proyecto', data),

  // Operaciones
  sellarImagen: (data) => ipcRenderer.invoke('sellar-imagen', data),
  analizarImagen: (data) => ipcRenderer.invoke('analizar-imagen', data),
  seleccionarArchivo: () => ipcRenderer.invoke('seleccionar-archivo'),
  guardarImagen: (data) => ipcRenderer.invoke('guardar-imagen', data),

  // Diálogo para nuevo proyecto (sustituye a prompt)
  mostrarPrompt: (mensaje) => ipcRenderer.invoke('mostrar-prompt', mensaje),
});