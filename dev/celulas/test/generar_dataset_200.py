import json
import random
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report
import joblib

# ============================================================
# 1. EXTRAER 200 DOCUMENTOS (100 humanas + 100 IA)
# ============================================================

BACKUP_DIR = Path('/opt/dragon3/dev/celulas/backup_datos')
ARCHIVOS = [
    BACKUP_DIR / 'descarga_1_combinado.json',
    BACKUP_DIR / 'descarga_2_combinado.json',
    BACKUP_DIR / 'descarga_3_combinado.json',
    BACKUP_DIR / 'descarga_4_combinado.json',
    BACKUP_DIR / 'descarga_5_combinado.json'
]

print('📄 Leyendo JSONs de backup...')

humanos = []
ias = []

for archivo in ARCHIVOS:
    with open(archivo, 'r') as f:
        data = json.load(f)
    for doc in data:
        comentario = doc.get('comentarioFeedback', '')
        if 'IA' in comentario:
            ias.append(doc)
        elif 'humano' in comentario:
            humanos.append(doc)

print(f'📊 Totales: Humanos={len(humanos)}, IA={len(ias)}')

# Seleccionar 100 de cada
random.seed(42)
humanos_100 = random.sample(humanos, 100)
ias_100 = random.sample(ias, 100)
muestra = humanos_100 + ias_100
random.shuffle(muestra)

print(f'✅ Muestra de {len(muestra)} imágenes seleccionada')

# ============================================================
# 2. EXTRAER FEATURES (misma lógica que la célula ML)
# ============================================================

def extraer_features(doc):
    celdas = doc.get('datosCelulas', {})
    row = {}
    
    # 1-4 detectar-artefactos-ia
    a = celdas.get('detectar-artefactos-ia', {})
    row['varianzaLocalPromedio_art'] = a.get('varianzaLocalPromedio', 0)
    row['autocorrelacion_art'] = a.get('autocorrelacion', 0)
    row['correlacion_art'] = a.get('correlacion', 0)
    row['diversidad_art'] = a.get('diversidad', 0)
    
    # 5-16 detectar-sombreado
    s = celdas.get('detectar-sombreado', {})
    row['variacionBrillo'] = s.get('variacionBrillo', 0)
    row['contraste'] = s.get('contraste', 0)
    row['gradienteLuz'] = s.get('gradienteLuz', 0)
    bc = s.get('brilloCuadrantes', {})
    row['brilloSI'] = bc.get('superiorIzquierda', 0)
    row['brilloSD'] = bc.get('superiorDerecha', 0)
    row['brilloII'] = bc.get('inferiorIzquierda', 0)
    row['brilloID'] = bc.get('inferiorDerecha', 0)
    row['luzArriba'] = 1 if s.get('luzArriba', False) else 0
    row['iluminacionUniforme'] = 1 if s.get('iluminacionUniforme', False) else 0
    row['gradienteAnormal'] = 1 if s.get('gradienteAnormal', False) else 0
    row['sombrasInconsistentes'] = 1 if s.get('sombrasInconsistentes', False) else 0
    row['contrasteAnormal'] = 1 if s.get('contrasteAnormal', False) else 0
    
    # 17-21 detectar-textura-ruido
    t = celdas.get('detectar-textura-ruido', {})
    row['varianzaLocalPromedio_text'] = t.get('varianzaLocalPromedio', 0)
    row['entropia'] = t.get('entropia', 0)
    row['gradientePromedio'] = t.get('gradientePromedio', 0)
    row['varianzaRuido'] = t.get('varianzaRuido', 0)
    row['autocorrelacionNormalizada'] = t.get('autocorrelacionNormalizada', 0)
    
    # 22-29 detectar-colores
    c = celdas.get('detectar-colores', {})
    row['saturacionAprox'] = c.get('saturacionAprox', 0)
    row['dominancia'] = c.get('dominancia', 0)
    row['variacionCromatica'] = c.get('variacionCromatica', 0)
    row['relacionRB'] = c.get('relacionRB', 0)
    row['porcentajePielIrreal'] = c.get('porcentajePielIrreal', 0)
    temp = c.get('temperatura', 'neutra')
    row['temp_neutra'] = 1 if temp == 'neutra' else 0
    row['temp_calida'] = 1 if temp == 'calida' else 0
    row['temp_fria'] = 1 if temp == 'fria' else 0
    
    # 30 detectar-patrones-forenses
    p = celdas.get('detectar-patrones-forenses', {})
    row['autocorrelacion_forense'] = p.get('autocorrelacion', 0)
    
    # 31-34 extraer-metadatos-exif
    e = celdas.get('extraer-metadatos-exif', {})
    row['hasExif'] = 1 if e.get('hasExif', False) else 0
    row['hasICC'] = 1 if e.get('hasICC', False) else 0
    row['hasDate'] = 1 if e.get('hasDate', False) else 0
    row['hasXMP'] = 1 if e.get('hasXMP', False) else 0
    
    # 35-39 derivados
    vln = row['varianzaLocalPromedio_text']
    vr = row['varianzaRuido']
    ent = row['entropia']
    acn = row['autocorrelacionNormalizada']
    gp = row['gradientePromedio']
    rb = row['relacionRB']
    si = row['brilloSI']
    sd = row['brilloSD']
    ii = row['brilloII']
    id_ = row['brilloID']
    
    row['relacionRuidoTextura'] = vr / (vln + 0.001) if vln > 0 else 0
    row['regularidad'] = acn / (ent + 0.001) if ent > 0 else 0
    row['bordesRuido'] = gp / (vr + 0.001) if vr > 0 else 0
    row['desequilibrioCromatico'] = rb - 1.0
    row['uniformidadBrillo'] = max(si, sd, ii, id_) - min(si, sd, ii, id_)
    
    # Devolver array en orden exacto
    order = [
        'varianzaLocalPromedio_art', 'autocorrelacion_art', 'correlacion_art', 'diversidad_art',
        'variacionBrillo', 'contraste', 'gradienteLuz', 'brilloSI', 'brilloSD', 'brilloII', 'brilloID',
        'luzArriba', 'iluminacionUniforme', 'gradienteAnormal', 'sombrasInconsistentes', 'contrasteAnormal',
        'varianzaLocalPromedio_text', 'entropia', 'gradientePromedio', 'varianzaRuido', 'autocorrelacionNormalizada',
        'saturacionAprox', 'dominancia', 'variacionCromatica', 'relacionRB', 'porcentajePielIrreal',
        'temp_neutra', 'temp_calida', 'temp_fria',
        'autocorrelacion_forense',
        'hasExif', 'hasICC', 'hasDate', 'hasXMP',
        'relacionRuidoTextura', 'regularidad', 'bordesRuido', 'desequilibrioCromatico', 'uniformidadBrillo'
    ]
    return [row[k] for k in order]

print('🔍 Extrayendo features de 200 imágenes...')
X = []
y = []
for doc in muestra:
    features = extraer_features(doc)
    X.append(features)
    target = 1 if 'IA' in doc.get('comentarioFeedback', '') else 0
    y.append(target)

X = np.array(X)
y = np.array(y)

print(f'📊 Dataset: {len(X)} muestras, {X.shape[1]} features')
print(f'   Humanas: {sum(y==0)}, IA: {sum(y==1)}')

# ============================================================
# 3. ENTRENAR MODELO
# ============================================================

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('rf', RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42))
])

pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)

print('\n📊 RESULTADOS:')
print(f'   Train: {len(X_train)}, Test: {len(X_test)}')
print(f'   Accuracy en test: {accuracy_score(y_test, y_pred):.2%}')
print(classification_report(y_test, y_pred, target_names=['Humano', 'IA']))

# Guardar modelo
joblib.dump(pipeline, '/opt/dragon3/dev/celulas/modelos/modelo_200.pkl')
print('\n✅ Modelo guardado en /opt/dragon3/dev/celulas/modelos/modelo_200.pkl')
