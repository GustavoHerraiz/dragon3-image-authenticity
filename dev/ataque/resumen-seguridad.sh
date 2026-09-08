$Log = "informe-seguridad-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
Write-Host "Iniciando auditoría completa..." | Tee-Object -FilePath $Log
foreach ($Script in @("01-EscaneoPuertos","02-AtaqueSSH","03-AtaqueGrafana","04-AccesoPrometheus","05-AtaqueRedis","06-EscanearWeb")) {
    Write-Host "`n===== $Script =====" | Tee-Object -FilePath $Log -Append
    & ".\$Script.ps1" 2>&1 | Tee-Object -FilePath $Log -Append
}
Write-Host "`nResultados guardados en $Log"