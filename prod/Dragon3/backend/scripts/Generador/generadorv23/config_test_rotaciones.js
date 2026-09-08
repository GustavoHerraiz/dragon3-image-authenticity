// Configuración específica para tests de rotación
export const CONFIG_TEST = {
    // Rutas (ajustar según tu sistema)
    CARPETA_IMAGENES: '/var/www/Dragon3/backend/scripts/Generador/imagenes_tortura',

    // Archivos de test (ajustar nombres según tus archivos)
    ARCHIVOS_TEST: {
        ROT_15: 'F3_01_Giro15_JPG80.jpg',
        ROT_45: 'F3_02_Giro45_JPG80.jpg',
        ROT_90: 'F3_03_Giro90_JPG70.jpg',
        ROT_5_CROP: 'F4_01_CAOS_Giro5_Crop.jpg',
        ROT_RRSS: 'F5_01_SIMULACION_RRSS_1080.jpg'
    },

    // ADN esperado en todas las imágenes
    ADN_ESPERADO: '50B3',

    // Configuración de debug
    DEBUG: {
        nivel: 'DETALLADO', // 'MINIMO', 'NORMAL', 'DETALLADO', 'COMPLETO'
        guardar_logs: true,
        carpeta_logs: './logs_rotaciones'
    },

    // Umbrales para considerar éxito
    UMBRALES: {
        confianza_minima: 100,
        tiempo_maximo: 10000 // ms
    }
};
