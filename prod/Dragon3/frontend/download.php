<?php
// ================================================================
// download.php - Control de descargas con telemetría
// ================================================================

// Configuración
$LOG_FILE = '/opt/dragon3/prod/Dragon3/frontend/logs/downloads.log';
$DOWNLOAD_DIR = '/opt/dragon3/prod/Dragon3/frontend/downloads/';

// Mapeo de parámetros a archivos
$FILES = [
    'win'       => 'dragon3-desktop-win-x64.exe',
    'linux'     => 'dragon3-desktop-linux-x64.AppImage',
    'mac-intel' => 'dragon3-desktop-mac-x64.dmg',
    'mac-arm'   => 'dragon3-desktop-mac-arm64.dmg'
];

// Obtener parámetros
$os = isset($_GET['os']) ? $_GET['os'] : '';
$version = isset($_GET['version']) ? $_GET['version'] : 'desconocida';

// Validar SO
if (!isset($FILES[$os])) {
    http_response_code(404);
    die('Sistema operativo no válido.');
}

$file = $FILES[$os];
$filepath = $DOWNLOAD_DIR . $file;

// Verificar que el archivo existe
if (!file_exists($filepath)) {
    http_response_code(404);
    die('El archivo de descarga no está disponible.');
}

// ================================================================
// TELEMETRÍA
// ================================================================
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
// Si X-Forwarded-For tiene varias IPs, tomar la primera (la del cliente real)
if (strpos($ip, ',') !== false) {
    $ip = explode(',', $ip)[0];
}
$ip = trim($ip);
$user_agent = $_SERVER['HTTP_USER_AGENT'] ?? 'desconocido';
$referer = $_SERVER['HTTP_REFERER'] ?? 'directo';
$timestamp = date('Y-m-d H:i:s');
$log_line = sprintf(
    "[%s] IP: %s | SO: %s | Versión: %s | UA: %s | Referer: %s\n",
    $timestamp,
    $ip,
    $os,
    $version,
    $user_agent,
    $referer
);

// Guardar log
file_put_contents($LOG_FILE, $log_line, FILE_APPEND | LOCK_EX);

// ================================================================
// ENVIAR ARCHIVO
// ================================================================
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . basename($filepath) . '"');
header('Content-Length: ' . filesize($filepath));
readfile($filepath);
exit;
