Aquí tienes el Documento de Arquitectura y Configuración del Sistema DRAGON3. He redactado este informe con precisión quirúrgica para que, cuando lo pegues en un hilo nuevo, mi "yo" del futuro (o cualquier otro ingeniero) entienda instantáneamente la topología, el código y los "trucos" que hemos implementado.

Cópialo desde la siguiente línea:

🐉 DRAGON3: ARQUITECTURA DEL SISTEMA DE BLINDAJE PERICIAL (V20)
Documento de Estado Técnico y Topología de Red

Este documento detalla el despliegue funcional de la estación de control DRAGON3, un sistema de certificación forense de imágenes en tiempo real. El sistema captura flujo de vídeo, inyecta metadatos inalterables a nivel binario y expone una interfaz de auditoría con capacidad de autorrecuperación total.

🌐 1. TOPOLOGÍA DE RED Y CAPTURA (La perforación IPv6)
El mayor desafío era acceder a la cámara detrás de un router doméstico (Digi) esquivando las limitaciones del CG-NAT de IPv4.

El Nodo de Captura (Cámara): Una aplicación móvil (IP Webcam) emitiendo en el puerto 8080.

El Truco IPv6: En lugar de lidiar con redirecciones IPv4, usamos conectividad IPv6 Nativa. Cada dispositivo en IPv6 tiene una IP pública única.

La IP Exacta: La cámara tiene la IP 2a0c:5a86:103:100:a873:b9ec:4d6c:1c1f. Es crucial entender que esta es la IP del dispositivo, no la del router.

El Firewall/DMZ: En el router Digi, se configuró el filtro/DMZ para permitir el tráfico de entrada específicamente hacia esa IPv6 en el puerto 8080. Esto permite que el servidor de Hostinger vaya "directo" a la lente de la cámara sin intermediarios.

⚙️ 2. EL BACKEND CERTIFICADOR (Hostinger VPS)
El "cerebro" del sistema es un script de Node.js (conector.js) alojado en un VPS de Hostinger, escuchando en el puerto local 3005 (con un Nginx haciendo proxy inverso desde monitor.bladecorporation.net).

Funciones Clave y "Trucos" Implementados:

Conexión Directa: El script ataca directamente a http://[2a0c:5a86:103:100:a873:b9ec:4d6c:1c1f]:8080/shot.jpg y /video.

Sellado Binario (ExifTool): No solo guarda la imagen; usa exiftool para inyectar en los metadatos del archivo binario un Timestamp Unix, el ID del Cliente y generar un Hash Criptográfico único por fotograma.

Persistencia Segura (JSON): Cada hash generado se guarda en una base de datos física (JSON local).

Truco de Protección de Disco: El backend incluye una rutina de "purga automática" que mantiene un máximo de 1000 sellos en el JSON y borra imágenes antiguas, evitando que el disco del VPS se sature tras semanas de uso.

Inmortalidad del Proceso (PM2): El script no se ejecuta en la terminal normal. Está demonizado mediante PM2 bajo el nombre DRAGON3-CONTROL (Proceso ID: 14).

Ventaja: Si la cámara pierde el Wi-Fi, el script lanza errores ETIMEDOUT o EHOSTUNREACH, pero PM2 impide que el servidor colapse. Cuando el Wi-Fi vuelve, el script reanuda el fetch automáticamente. Si Hostinger reinicia el VPS físico, el comando pm2 save que aplicamos asegura que DRAGON3 arranque solo.

🖥️ 3. EL FRONTEND AUDITOR (El "Perro de Presa")
La interfaz web es un panel HTML/JS diseñado para no requerir jamás que el usuario pulse F5.

El Problema del MJPEG: El vídeo llega al navegador como un flujo /video-stream (MJPEG). Si la red de la cámara se corta, este flujo TCP se rompe y la etiqueta <img> del HTML se queda congelada mostrando el último fotograma, incapaz de reconectar por sí sola cuando vuelve el internet.

El "Truco de Resurrección" (loopPericial):

El frontend tiene una función asíncrona loopPericial() que hace polling (fetch) al endpoint /validar-latido cada 15 segundos para pedir el último JSON del backend.

Si el fetch falla, el panel se tiñe de alertas rojas (ERROR_DE_DATOS).

La Magia: Si el Wi-Fi de la cámara vuelve, el backend retoma el sellado y el JSON vuelve a escupir hashes válidos. El loopPericial lee que hay un hash nuevo, pero revisa el estado del flujo de vídeo en el DOM. Si el estado era "desconectado" o "reintentando", el JS inyecta la instrucción cargarStreaming(), forzando al navegador a solicitar un nuevo src a la ruta del vídeo.

Resultado: El vídeo congelado da un salto y vuelve al directo automáticamente en menos de 20 segundos sin interacción humana.

🛡️ 4. RESUMEN DE LA CADENA DE CUSTODIA
Lente: Captura el frame.

Túnel: Viaja por IPv6 directa saltando el router.

Backend: Recibe frame -> Inyecta Metadata -> Calcula Hash -> Guarda en JSON.

Nginx: Sirve el resultado al mundo vía HTTPS.

Frontend: Lee el JSON cada 15s. Si hay vida, muestra el vídeo; si hay corte, espera en bucle hasta que vuelve el hash para resucitar el reproductor.

ESTADO ACTUAL: Operativo, Inmortalizado en PM2 y 100% Autónomo.