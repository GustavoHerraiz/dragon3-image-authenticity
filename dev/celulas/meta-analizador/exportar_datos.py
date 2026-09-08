#!/usr/bin/env python3
"""
exportar_datos.py
=================
Script para exportar los datos de MongoDB a un CSV para el entrenamiento de la ML.

FUNCIÓN:
--------
- Conecta a MongoDB y extrae todas las ejecuciones con correccionHumana != null.
- Para cada ejecución, extrae:
  - ID y timestamp
  - Corrección humana (etiqueta)
  - Confianza y decisión de cada célula
  - Formato y tamaño del archivo
- Guarda los datos en un archivo CSV en la carpeta meta-analizador/datos/

USO:
-----
python3 exportar_datos.py

SALIDA:
-------
meta-analizador/datos/dataset_ml.csv

VERSIÓN: 1.0.0
FECHA: 2026-08-26
"""

import os
import sys
import csv
import argparse
from datetime import datetime
from pathlib import Path
import pymongo
import pandas as pd
from dotenv import load_dotenv
import time

# ============================================================
# CONFIGURACIÓN
# ============================================================

# Cargar variables de entorno desde la ruta correcta
ENV_PATH = Path(__file__).resolve().parent.parent.parent / 'prod' / 'Dragon3' / 'backend' / '.env'
load_dotenv(ENV_PATH)

# Obtener URI de MongoDB
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    raise RuntimeError('MONGO_URI no está configurado')

# Directorio de salida
OUTPUT_DIR = Path(__file__).parent / 'datos'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================
# FUNCIONES
# ============================================================

def conectar_mongo():
    """Conecta a MongoDB y devuelve la colección ejecuciones"""
    print("🔍 Conectando a MongoDB...")
    try:
        client = pymongo.MongoClient(MONGO_URI)
        db = client.get_database()
        collection = db.get_collection('ejecuciones')
        print("✅ Conectado a MongoDB")
        return collection
    except Exception as e:
        print(f"❌ Error conectando a MongoDB: {e}")
        sys.exit(1)

def extraer_datos(collection, limit=None):
    """Extrae los datos de MongoDB y los devuelve como lista de diccionarios"""
    print("📥 Extrayendo datos de MongoDB...")
    
    # Filtro: solo ejecuciones con correccionHumana definida (etiquetadas)
    filtro = {"correccionHumana": {"$ne": None}}
    
    # Proyección: campos que nos interesan
    proyeccion = {
        "correlationId": 1,
        "timestamp": 1,
        "formato": 1,
        "tamañoBytes": 1,
        "veredicto": 1,
        "correccionHumana": 1,
        "datosCelulas": 1,
        "tiempoTotalMs": 1
    }
    
    # Ejecutar consulta
    query = collection.find(filtro, proyeccion)
    if limit:
        query = query.limit(limit)
    
    # Ordenar por timestamp
    query = query.sort("timestamp", -1)
    
    # Convertir a lista
    ejecuciones = list(query)
    print(f"✅ Extraídas {len(ejecuciones)} ejecuciones etiquetadas")
    return ejecuciones

def procesar_ejecucion(ejecucion):
    """Procesa una ejecución y extrae las características para el CSV"""
    
    # Datos base
    fila = {
        'correlationId': ejecucion.get('correlationId'),
        'timestamp': ejecucion.get('timestamp'),
        'formato': ejecucion.get('formato'),
        'tamañoBytes': ejecucion.get('tamañoBytes', 0),
        'tiempoTotalMs': ejecucion.get('tiempoTotalMs', 0),
        'correccionHumana': 1 if ejecucion.get('correccionHumana') is True else 0,
        'veredicto_esIA': 1 if ejecucion.get('veredicto', {}).get('esIA') is True else 0,
        'veredicto_confianza': ejecucion.get('veredicto', {}).get('confianza', 0)
    }
    
    # Extraer datos de células
    datos_celulas = ejecucion.get('datosCelulas', {})
    for celula_id, datos in datos_celulas.items():
        # Limpiar el nombre de la célula para usarlo como columna
        nombre_columna = celula_id.replace('-', '_').replace(' ', '_')
        
        # Confianza de la célula
        fila[f'{nombre_columna}_confianza'] = datos.get('confianza', 0)
        
        # Decisión de la célula (esIA)
        fila[f'{nombre_columna}_esIA'] = 1 if datos.get('esIA') is True else 0
        
        # Peso de la célula
        fila[f'{nombre_columna}_peso'] = datos.get('peso', 1)
        
        # Tiempo de la célula
        fila[f'{nombre_columna}_tiempoMs'] = datos.get('tiempoMs', 0)
    
    return fila

def exportar_a_csv(datos, archivo):
    """Exporta los datos a un archivo CSV"""
    if not datos:
        print("⚠️ No hay datos para exportar")
        return None
    
    # Crear DataFrame
    df = pd.DataFrame(datos)
    
    # Ordenar columnas
    columnas_base = ['correlationId', 'timestamp', 'formato', 'tamañoBytes', 'tiempoTotalMs', 'correccionHumana', 'veredicto_esIA', 'veredicto_confianza']
    columnas_celulas = [col for col in df.columns if col not in columnas_base]
    columnas_ordenadas = columnas_base + sorted(columnas_celulas)
    df = df[columnas_ordenadas]
    
    # Guardar CSV
    df.to_csv(archivo, index=False, encoding='utf-8')
    print(f"✅ Datos exportados a: {archivo}")
    print(f"📊 Total de filas: {len(df)}")
    print(f"📊 Total de columnas: {len(df.columns)}")
    
    return df

def mostrar_estadisticas(df):
    """Muestra estadísticas básicas del dataset"""
    print("\n" + "="*50)
    print("📊 ESTADÍSTICAS DEL DATASET")
    print("="*50)
    
    total = len(df)
    humanas = df['correccionHumana'].sum()
    ia = total - humanas
    
    print(f"Total de muestras: {total}")
    print(f"✅ Humanas: {humanas} ({humanas/total*100:.1f}%)")
    print(f"🤖 IA: {ia} ({ia/total*100:.1f}%)")
    print(f"📅 Fecha más reciente: {df['timestamp'].max() if 'timestamp' in df else 'N/A'}")
    print(f"📅 Fecha más antigua: {df['timestamp'].min() if 'timestamp' in df else 'N/A'}")
    
    # Columnas de células
    columnas_celulas = [col for col in df.columns if '_confianza' in col]
    print(f"\n🔬 Células encontradas: {len(columnas_celulas)}")
    for col in sorted(columnas_celulas):
        celula = col.replace('_confianza', '')
        print(f"   - {celula}")

def main():
    parser = argparse.ArgumentParser(description='Exportar datos de MongoDB para ML')
    parser.add_argument('--limit', type=int, help='Límite de ejecuciones a exportar (para pruebas)')
    parser.add_argument('--output', type=str, help='Nombre del archivo de salida', default='dataset_ml.csv')
    args = parser.parse_args()
    
    print("🚀 Iniciando exportación de datos para ML")
    print(f"📂 Salida: {OUTPUT_DIR / args.output}")
    print("="*50)
    
    # Conectar a MongoDB
    collection = conectar_mongo()
    
    # Extraer datos
    ejecuciones = extraer_datos(collection, args.limit)
    
    if not ejecuciones:
        print("❌ No se encontraron ejecuciones etiquetadas")
        sys.exit(1)
    
    # Procesar cada ejecución
    print("🔄 Procesando ejecuciones...")
    datos_csv = []
    for i, ejecucion in enumerate(ejecuciones):
        if i % 1000 == 0:
            print(f"   Procesando {i}/{len(ejecuciones)}...")
        fila = procesar_ejecucion(ejecucion)
        datos_csv.append(fila)
    
    # Exportar a CSV
    archivo_salida = OUTPUT_DIR / args.output
    df = exportar_a_csv(datos_csv, archivo_salida)
    
    if df is not None:
        mostrar_estadisticas(df)
    
    print("\n✅ Exportación completada")
    print(f"📁 Archivo: {archivo_salida}")

if __name__ == "__main__":
    main()
