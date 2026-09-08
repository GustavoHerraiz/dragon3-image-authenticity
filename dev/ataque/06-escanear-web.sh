$Servidor = "192.168.1.200:3000"
Write-Host "=== ESCANEO DE APLICACIÓN WEB DRAGON3 ==="
Write-Host "1. Cabeceras HTTP:"
curl -I http://$Servidor 2>$null | Select-Object -First 15

$Rutas = @("/.env","/admin","/api")
foreach ($Ruta in $Rutas) {
    $Code = curl -s -o $null -w "%{http_code}" "http://$Servidor$Ruta"
    Write-Host "$Ruta : HTTP $Code"
    if ($Code -eq "200") {
        Write-Host "ALERTA: Ruta $Ruta accesible" -ForegroundColor Red
    }
}