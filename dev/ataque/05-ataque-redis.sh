$Servidor = "192.168.1.200"
$Puerto = "6379"
$RedisCli = "C:\Program Files\Redis\redis-cli.exe"
$PasswordReal = "REDIS_PASSWORD_FROM_ENV"

Write-Host "=== ATAQUE A REDIS ==="
Write-Host "1. Sin contraseña..."
$Result = & $RedisCli -h $Servidor -p $Puerto ping 2>$null
if ($Result -eq "PONG") {
    Write-Host "¡ALERTA CRÍTICA! Redis acepta conexiones sin autenticación." -ForegroundColor Red
} else {
    Write-Host "OK: Redis requiere autenticación."
}
Write-Host "`n2. Con contraseña real (simulación de filtración)..."
$Result = & $RedisCli -h $Servidor -p $Puerto -a $PasswordReal --no-auth-warning ping 2>$null
if ($Result -eq "PONG") {
    Write-Host "ALERTA: Acceso exitoso con la contraseña encontrada en archivos." -ForegroundColor Yellow
} else {
    Write-Host "Contraseña incorrecta (poco probable)."
}