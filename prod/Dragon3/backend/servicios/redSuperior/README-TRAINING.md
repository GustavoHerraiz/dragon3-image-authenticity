# 🐉 Dragon3 - Training con Docker (GitHub Consensus)

**Versión:** 1.0.0-FAANG-Docker
**Fecha:** 2025-04-15
**Autor:** Gustavo Herráiz (@GustavoHerraiz)

---

## 📋 ARQUITECTURA

```
┌────────────────────────────────────────────────────┐
│ DOCKER (Training - Ephemeral)                     │
│ • Build tools (python, gcc, make)                 │
│ • Brain.js + GPU.js completo                      │
│ • Entrena 10 Small NNs + Red Mayor                │
│ • Exporta JSON → /models (volume montado)         │
└────────────────────────────────────────────────────┘
                      ↓
         (modelos/*.json exportados)
                      ↓
┌────────────────────────────────────────────────────┐
│ SERVIDOR PRODUCCIÓN (Inference - Siempre)         │
│ • Brain.js CPU-only (sin build tools)             │
│ • Carga modelos pre-entrenados                    │
│ • P95 <10ms inference                             │
└────────────────────────────────────────────────────┘
```

---

## 🚀 USO RÁPIDO

### **1. ENTRENAR MODELOS (PRIMERA VEZ):**

```bash
cd /var/www/Dragon3/backend

# Hacer script ejecutable
chmod +x scripts/train-docker.sh

# Ejecutar entrenamiento
./scripts/train-docker.sh
```

**Duración:** ~5-10 minutos (build + training)

### **2. VERIFICAR MODELOS:**

```bash
ls -lh servicios/redSuperior/models/*.json
# Debe mostrar 12 archivos .json
```

### **3. ARRANCAR SERVIDOR PRODUCCIÓN:**

```bash
cd /var/www/Dragon3/backend
node server.js
```

**Servidor usará modelos pre-entrenados con Brain.js CPU-only.**

---

## 📦 INSTALACIÓN PREVIA

### **Instalar Docker (si no está instalado):**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y docker.io

# Iniciar servicio
sudo systemctl start docker
sudo systemctl enable docker

# Añadir usuario a grupo docker (evitar sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version
```

### **Instalar Brain.js CPU-only en host (producción):**

```bash
cd /var/www/Dragon3/backend

# Instalar SOLO brain.js (sin gpu.js, sin gl)
npm install brain.js --save --no-optional

# Verificar
node -e "console.log(require('brain.js') ? 'OK' : 'FAILED')"
```

---

## 🔧 COMANDOS DOCKER MANUALES

### **Build imagen:**

```bash
cd /var/www/Dragon3/backend
docker build -f Dockerfile.training -t dragon3-training .
```

### **Entrenar modelos:**

```bash
docker run --rm \
  -v $(pwd)/servicios/redSuperior/models:/app/servicios/redSuperior/models \
  dragon3-training
```

### **Modo interactivo (debugging):**

```bash
docker run --rm -it \
  -v $(pwd)/servicios/redSuperior/models:/app/servicios/redSuperior/models \
  dragon3-training /bin/bash

# Dentro del contenedor:
node servicios/redSuperior/trainModel.js
```

### **Ver logs de training:**

```bash
docker run --rm \
  -v $(pwd)/servicios/redSuperior/models:/app/servicios/redSuperior/models \
  dragon3-training | tee training.log
```

### **Limpiar imagen:**

```bash
docker rmi dragon3-training
```

---

## 📊 MODELOS GENERADOS

```
servicios/redSuperior/models/
├── training_summary.json          ← Resumen entrenamiento
├── exif_camera.json              ← Pesos Small NN 1
├── exif_editing.json             ← Pesos Small NN 2
├── texture.json                  ← Pesos Small NN 3
├── gan_artifacts.json            ← Pesos Small NN 4
├── diffusion_artifacts.json      ← Pesos Small NN 5
├── sharpness.json                ← Pesos Small NN 6
├── compression.json              ← Pesos Small NN 7
├── c2pa.json                     ← Pesos Small NN 8
├── resolution.json               ← Pesos Small NN 9
├── metadata.json                 ← Pesos Small NN 10
└── red_mayor.json                ← Pesos Red Mayor (ensemble)
```

---

## 🔄 RE-ENTRENAR CON DATOS REALES

### **1. Añadir samples reales a `trainingDataset.js`:**

```javascript
// trainingDataset.js
export function generateDataset() {
  // Cargar samples reales desde DB/archivos
  const realSamples = loadRealSamples();

  // Combinar con sintéticos
  return [...realSamples, ...generateSyntheticSamples()];
}
```

### **2. Re-ejecutar training:**

```bash
./scripts/train-docker.sh
```

### **3. Servidor producción recarga modelos automáticamente.**

---

## 🎯 MÉTRICAS ESPERADAS

### **DATASET SINTÉTICO (100 samples):**
- **Small NNs accuracy:** ~75-85%
- **Red Mayor accuracy:** ~70-80%
- **Training time:** ~2-5 min

### **DATASET REAL (1000+ samples):**
- **Small NNs accuracy:** ~85-95%
- **Red Mayor accuracy:** ~88-95%
- **Training time:** ~10-20 min

---

## 🐛 TROUBLESHOOTING

### **Error: "Docker daemon not running"**

```bash
sudo systemctl start docker
sudo systemctl status docker
```

### **Error: "Permission denied (Docker socket)"**

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### **Error: "Modelos no se exportaron"**

```bash
# Verificar permisos directorio
ls -ld servicios/redSuperior/models

# Debe ser escribible por usuario actual
chmod -R 755 servicios/redSuperior/models
```

### **Error: "Brain.js no funciona en producción"**

```bash
# Verificar que usas CPU-only
node -e "const brain = require('brain.js'); const net = new brain.NeuralNetwork({gpu: false}); console.log('OK')"
```

---

## 📈 VENTAJAS DE ESTA ARQUITECTURA

- ✅ **Build tools SOLO en Docker** (servidor producción limpio)
- ✅ **Servidor producción ligero** (sin compilación nativa)
- ✅ **Entrenamiento reproducible** (mismo entorno siempre)
- ✅ **Fácil escalar** (usar GPU en Docker si se necesita)
- ✅ **Seguimiento GitHub consensus** (brain.js/gpu.js best practices)

---

**Autor:** Gustavo Herráiz (@GustavoHerraiz) - Lead Architect Dragon3
**Licencia:** Propietaria - Dragon3 Project
