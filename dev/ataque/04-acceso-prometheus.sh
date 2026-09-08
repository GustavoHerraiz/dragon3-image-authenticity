$Servidor = "192.168.1.200:9090"
Write-Host "=== ACCESO A PROMETHEUS SIN AUTENTICACIÓN ==="
Write-Host "1. Verificando endpoint..."
curl -s -o $null -w "HTTP %{http_code}`n" http://$Servidor/api/v1/query?query=up
Write-Host "2. Memoria total del sistema:"
curl -s "http://$Servidor/api/v1/query?query=node_memory_MemTotal_bytes"
Write-Host "`n3. Peticiones HTTP de Dragon3:"
curl -s "http://$Servidor/api/v1/query?query=dragon_http_requests_total"