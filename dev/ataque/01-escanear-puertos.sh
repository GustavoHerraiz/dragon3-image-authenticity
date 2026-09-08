<#
.SYNOPSIS
    Escanea puertos y servicios en el servidor Dragon.
.DESCRIPTION
    Simula el reconocimiento inicial de un atacante dentro de la red WiFi.
    Comprueba qué puertos están abiertos en 192.168.1.200.
    Requiere Nmap instalado en C:\Program Files (x86)\Nmap.
#>
$Servidor = "192.168.1.200"
$Puertos = @(22,80,443,3000,3001,8080,9090,6379,9121)
Write-Host "=== ESCANEO DE PUERTOS EN $Servidor ==="
& "C:\Program Files (x86)\Nmap\nmap.exe" -sS -sV -p ($Puertos -join ',') $Servidor
Write-Host "`n=== DETECCIÓN DE SISTEMA OPERATIVO ==="
& "C:\Program Files (x86)\Nmap\nmap.exe" -O $Servidor --osscan-guess