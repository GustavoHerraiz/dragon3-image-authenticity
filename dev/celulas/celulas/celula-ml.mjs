import { spawn } from 'child_process';
import { readFileSync } from 'fs';

export default async function celulaML(payload) {
    const start = Date.now();
    if (!payload || !payload.buffer) {
        return {
            exito: false,
            error: 'No se recibió buffer',
            resultado: { esIA: null, confianza: 0 },
            telemetria: { tiempoTotal: Date.now() - start }
        };
    }

    return new Promise((resolve) => {
        const python = spawn(
            '/opt/dragon3/dev/celulas/laboratorio/venv_ml/bin/python',
            ['/opt/dragon3/dev/celulas/celulas/predictor_xgboost.py']
        );

        let out = '', err = '';
        python.stdin.write(payload.buffer);
        python.stdin.end();

        python.stdout.on('data', d => out += d.toString());
        python.stderr.on('data', d => err += d.toString());

        const timer = setTimeout(() => {
            python.kill();
            resolve({
                exito: false,
                error: 'Timeout',
                resultado: { esIA: null, confianza: 0 },
                telemetria: { tiempoTotal: Date.now() - start }
            });
        }, 15000);

        python.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0 || err) {
                return resolve({
                    exito: false,
                    error: err || `Código ${code}`,
                    resultado: { esIA: null, confianza: 0 },
                    telemetria: { tiempoTotal: Date.now() - start }
                });
            }
            try {
                const data = JSON.parse(out.trim());
                if (!data.exito) {
                    return resolve({
                        exito: false,
                        error: data.error || 'Error en Python',
                        resultado: { esIA: null, confianza: 0 },
                        telemetria: { tiempoTotal: Date.now() - start }
                    });
                }
                resolve({
                    exito: true,
                    resultado: {
                        esIA: data.esIA,
                        confianza: data.confianza,
                        peso: 0.5,
                        explicacion: data.esIA ? 'Patrones compatibles con IA' : 'Patrones compatibles con humano',
                        evidencias: [
                            `Confianza: ${(data.confianza * 100).toFixed(1)}%`,
                            `Extracción: ${data.tiempoExtraccionMs}ms`,
                            `Predicción: ${data.tiempoPrediccionMs}ms`
                        ]
                    },
                    telemetria: {
                        tiempoTotal: Date.now() - start,
                        tiempoExtraccion: data.tiempoExtraccionMs,
                        tiempoCargaModelo: data.tiempoCargaModeloMs,
                        tiempoPrediccion: data.tiempoPrediccionMs
                    }
                });
            } catch (e) {
                resolve({
                    exito: false,
                    error: 'JSON inválido: ' + e.message,
                    resultado: { esIA: null, confianza: 0 },
                    telemetria: { tiempoTotal: Date.now() - start }
                });
            }
        });

        python.on('error', (e) => {
            clearTimeout(timer);
            resolve({
                exito: false,
                error: 'Error al ejecutar Python: ' + e.message,
                resultado: { esIA: null, confianza: 0 },
                telemetria: { tiempoTotal: Date.now() - start }
            });
        });
    });
};
