import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { telemetry } from './telemetry.js';

const MODULE = 'Database';
const { Database } = sqlite3;

export class DragonDB {
  constructor(dbPath = null) {
    if (!dbPath) {
      // ✅ RUTA FIJA PARA TODOS LOS ENTORNOS
      const baseDir = path.join(os.homedir(), '.dragon3');
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      dbPath = path.join(baseDir, 'dragon3.db');
    }
    this.dbPath = dbPath;
    this.db = null;
    this._openPromise = this._open();
  }

  async _open() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      this.db = await open({
        filename: this.dbPath,
        driver: Database,
      });
      await this.db.exec('PRAGMA journal_mode = WAL');
      await this._initSchema();
      telemetry.info(MODULE, `Base de datos abierta/creada en ${this.dbPath}`);
    } catch (err) {
      telemetry.error(MODULE, `Error al abrir DB: ${err.message}`, { path: this.dbPath });
      throw err;
    }
  }

  async _ensureOpen() {
    if (this._openPromise) await this._openPromise;
  }

  async _initSchema() {
    const createTable = `
      CREATE TABLE IF NOT EXISTS proyectos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_numerico INTEGER UNIQUE NOT NULL,
        hash_suffix TEXT UNIQUE NOT NULL,
        cliente TEXT NOT NULL,
        obra TEXT NOT NULL,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        proyecto_nombre TEXT,
        coleccion TEXT,
        derechos TEXT,
        email_contacto TEXT,
        compartir_blade INTEGER DEFAULT 0,
        descripcion TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_hash ON proyectos(hash_suffix);
      CREATE INDEX IF NOT EXISTS idx_id_numerico ON proyectos(id_numerico);

      CREATE TABLE IF NOT EXISTS sellos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_numerico INTEGER UNIQUE NOT NULL,
        hash_suffix TEXT UNIQUE NOT NULL,
        proyecto_id INTEGER NOT NULL,
        cliente TEXT NOT NULL,
        obra TEXT NOT NULL,
        coleccion TEXT,
        derechos TEXT,
        email_contacto TEXT,
        compartir_blade INTEGER DEFAULT 0,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sellos_proyecto ON sellos(proyecto_id);
      CREATE INDEX IF NOT EXISTS idx_sellos_hash ON sellos(hash_suffix);

      CREATE TABLE IF NOT EXISTS licencia (
        rowid INTEGER PRIMARY KEY CHECK (rowid = 1),
        activa INTEGER DEFAULT 0,
        tipo TEXT DEFAULT 'gratuita',
        email TEXT,
        clave TEXT,
        fecha_activacion DATETIME,
        prefijo_usuario TEXT,
        contador_global INTEGER DEFAULT 0,
        sellos_usados INTEGER DEFAULT 0,
        fecha_expiracion DATETIME,
        servidor_verificado INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS configuracion (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        prefijo_usuario TEXT,
        email_usuario TEXT,
        nombre_autor TEXT,
        web_autor TEXT,
        telefono_autor TEXT,
        logo_path TEXT,
        direccion_autor TEXT,
        descripcion_autor TEXT,
        redes_sociales TEXT,
        ruta_proyectos TEXT,
        coleccion_por_defecto TEXT,
        derechos_por_defecto TEXT,
        sincronizar_blade_por_defecto INTEGER DEFAULT 0,
        mover_original TEXT DEFAULT 'mover',
        activar_watcher INTEGER DEFAULT 1,
        modo_automatico INTEGER DEFAULT 1,
        proyecto_por_defecto INTEGER,
        subcarpeta_por_defecto TEXT,
        cliente_por_defecto TEXT,
        obra_por_defecto TEXT,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hot_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ruta TEXT UNIQUE NOT NULL,
        proyecto_id INTEGER,
        subcarpeta TEXT,
        cliente TEXT,
        obra TEXT,
        activo INTEGER DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hot_folders_ruta ON hot_folders(ruta);
    `;
    try {
      await this.db.exec(createTable);

      // ==========================================================
      // MIGRACIONES
      // ==========================================================
      const licenciaInfo = await this.db.all("PRAGMA table_info(licencia)");
      const licenciaCols = licenciaInfo.map(col => col.name);
      if (!licenciaCols.includes('sellos_usados')) {
        await this.db.exec("ALTER TABLE licencia ADD COLUMN sellos_usados INTEGER DEFAULT 0");
        telemetry.info(MODULE, "Migración: columna 'sellos_usados' añadida a licencia");
      }
      if (!licenciaCols.includes('fecha_expiracion')) {
        await this.db.exec("ALTER TABLE licencia ADD COLUMN fecha_expiracion DATETIME");
        telemetry.info(MODULE, "Migración: columna 'fecha_expiracion' añadida a licencia");
      }
      if (!licenciaCols.includes('servidor_verificado')) {
        await this.db.exec("ALTER TABLE licencia ADD COLUMN servidor_verificado INTEGER DEFAULT 0");
        telemetry.info(MODULE, "Migración: columna 'servidor_verificado' añadida a licencia");
      }

      const configInfo = await this.db.all("PRAGMA table_info(configuracion)");
      const configCols = configInfo.map(col => col.name);
      const nuevasColumnas = [
        'telefono_autor', 'logo_path', 'direccion_autor', 'descripcion_autor',
        'redes_sociales', 'ruta_proyectos', 'coleccion_por_defecto',
        'mover_original', 'activar_watcher',
        'modo_automatico', 'proyecto_por_defecto', 'subcarpeta_por_defecto',
        'cliente_por_defecto', 'obra_por_defecto'
      ];
      for (const col of nuevasColumnas) {
        if (!configCols.includes(col)) {
          const tipo = col === 'proyecto_por_defecto' ? 'INTEGER' : 'TEXT';
          await this.db.exec(`ALTER TABLE configuracion ADD COLUMN ${col} ${tipo}`);
          telemetry.info(MODULE, `Migración: columna '${col}' añadida a configuracion`);
        }
      }

      const proyInfo = await this.db.all("PRAGMA table_info(proyectos)");
      const proyCols = proyInfo.map(col => col.name);
      if (!proyCols.includes('descripcion')) {
        await this.db.exec("ALTER TABLE proyectos ADD COLUMN descripcion TEXT");
        telemetry.info(MODULE, "Migración: columna 'descripcion' añadida a proyectos");
      }

      // ==========================================================
      // INSERT OR IGNORE
      // ==========================================================
      await this.db.run(
        `INSERT OR IGNORE INTO licencia (rowid, activa, tipo, contador_global, sellos_usados, servidor_verificado) 
         VALUES (1, 0, 'gratuita', 0, 0, 0)`
      );
      await this.db.run(
        `INSERT OR IGNORE INTO configuracion (id, prefijo_usuario, email_usuario, nombre_autor, web_autor, telefono_autor, logo_path, direccion_autor, descripcion_autor, redes_sociales, ruta_proyectos, coleccion_por_defecto, mover_original, activar_watcher, modo_automatico, proyecto_por_defecto, subcarpeta_por_defecto, cliente_por_defecto, obra_por_defecto) 
         VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'mover', 1, 1, NULL, NULL, NULL, NULL)`
      );

      // ==========================================================
      // GENERAR PREFIJO ÚNICO SI NO EXISTE
      // ==========================================================
      const config = await this.db.get('SELECT prefijo_usuario FROM configuracion WHERE id = 1');
      if (!config || !config.prefijo_usuario) {
        const prefijo = this._generarPrefijoUnico();
        await this.db.run('UPDATE configuracion SET prefijo_usuario = ? WHERE id = 1', prefijo);
        await this.db.run('UPDATE licencia SET prefijo_usuario = ? WHERE rowid = 1', prefijo);
        telemetry.info(MODULE, `Prefijo único generado: ${prefijo}`);
      }

      telemetry.debug(MODULE, 'Esquema verificado/creado con todas las migraciones');
    } catch (err) {
      telemetry.error(MODULE, `Error creando esquema: ${err.message}`);
      throw err;
    }
  }

  _generarPrefijoUnico() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let prefijo = '';
    for (let i = 0; i < 3; i++) {
      prefijo += chars[Math.floor(Math.random() * chars.length)];
    }
    prefijo += Math.floor(Math.random() * 10);
    return prefijo;
  }

  // --- MÉTODOS GENÉRICOS ---
  async get(sql, params = []) {
    await this._ensureOpen();
    return this.db.get(sql, params);
  }

  async run(sql, params = []) {
    await this._ensureOpen();
    return this.db.run(sql, params);
  }

  async all(sql, params = []) {
    await this._ensureOpen();
    return this.db.all(sql, params);
  }

  // --- PROYECTOS ---
  async crearProyecto(id_numerico, cliente, obra, proyecto_nombre = null, coleccion = null, derechos = 'Todos los derechos reservados', email_contacto = '', compartir_blade = 0, skipDuplicateCheck = false, descripcion = null) {
    await this._ensureOpen();
    const hash = id_numerico.toString(16).toUpperCase().padStart(7, '0');
    const nombreProyecto = (proyecto_nombre || '').trim();
    if (!nombreProyecto) {
      throw new Error('El nombre del proyecto es obligatorio');
    }

    try {
      if (!skipDuplicateCheck) {
        const existente = await this.db.get(
          'SELECT id FROM proyectos WHERE proyecto_nombre = ? COLLATE NOCASE',
          nombreProyecto
        );
        if (existente) {
          telemetry.warn(MODULE, `Intento de crear proyecto duplicado: "${nombreProyecto}" (ID existente: ${existente.id})`);
          throw new Error(`Ya existe un proyecto con el nombre "${nombreProyecto}". Por favor, elige otro nombre.`);
        }
      }

      const result = await this.db.run(
        `INSERT INTO proyectos 
         (id_numerico, hash_suffix, cliente, obra, proyecto_nombre, coleccion, derechos, email_contacto, compartir_blade, descripcion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id_numerico, hash, cliente, obra, nombreProyecto, coleccion, derechos, email_contacto, compartir_blade, descripcion
      );
      const id = result.lastID;
      telemetry.info(MODULE, `Proyecto creado: ${hash} (ID: ${id}) - Nombre: ${nombreProyecto}`, {
        id_numerico, cliente, obra, changes: result.changes
      });
      return {
        id,
        id_numerico,
        hash,
        cliente,
        obra,
        proyecto_nombre: nombreProyecto,
        coleccion,
        derechos,
        email_contacto,
        compartir_blade,
        descripcion
      };
    } catch (err) {
      telemetry.error(MODULE, `Error insertando proyecto: ${err.message}`, {
        id_numerico,
        hash,
        proyecto_nombre: nombreProyecto
      });
      throw err;
    }
  }

  async buscarPorHash(hash) {
    await this._ensureOpen();
    try {
        let row = await this.db.get('SELECT * FROM proyectos WHERE hash_suffix = ?', hash);
        if (row) {
            telemetry.debug(MODULE, `Hash encontrado en proyectos: ${hash}`, { cliente: row.cliente });
            return row;
        }
        
        row = await this.db.get('SELECT * FROM sellos WHERE hash_suffix = ?', hash);
        if (row) {
            telemetry.debug(MODULE, `Hash encontrado en sellos: ${hash}`, { cliente: row.cliente });
            return row;
        }
        
        telemetry.debug(MODULE, `Hash NO encontrado: ${hash}`);
        return null;
    } catch (err) {
        telemetry.error(MODULE, `Error buscando hash: ${err.message}`, { hash });
        throw err;
    }
  }

  async buscarPorId(id) {
    await this._ensureOpen();
    try {
      const row = await this.db.get('SELECT * FROM proyectos WHERE id = ?', id);
      return row || null;
    } catch (err) {
      telemetry.error(MODULE, `Error buscando por ID: ${err.message}`, { id });
      throw err;
    }
  }

  async obtenerTodos() {
    await this._ensureOpen();
    try {
      const rows = await this.db.all('SELECT * FROM proyectos ORDER BY id DESC');
      telemetry.debug(MODULE, `Recuperados ${rows.length} proyectos`);
      return rows;
    } catch (err) {
      telemetry.error(MODULE, `Error listando proyectos: ${err.message}`);
      throw err;
    }
  }

  async obtenerSiguienteId() {
    await this._ensureOpen();
    try {
      const row = await this.db.get('SELECT contador_global FROM licencia WHERE rowid = 1');
      let next = (row?.contador_global || 0) + 1;
      await this.db.run('UPDATE licencia SET contador_global = ? WHERE rowid = 1', next);
      telemetry.debug(MODULE, `Siguiente ID numérico: ${next}`);
      return next;
    } catch (err) {
      telemetry.error(MODULE, `Error obteniendo siguiente ID: ${err.message}`);
      throw err;
    }
  }

  async eliminarProyecto(id) {
    await this._ensureOpen();
    try {
      const result = await this.db.run('DELETE FROM proyectos WHERE id = ?', id);
      if (result.changes === 0) {
        throw new Error('Proyecto no encontrado');
      }
      telemetry.info(MODULE, `Proyecto eliminado: ID ${id}`);
      return { ok: true };
    } catch (err) {
      telemetry.error(MODULE, `Error eliminando proyecto: ${err.message}`);
      throw err;
    }
  }

  // --- SELLOS ---
  async registrarSello(id_numerico, hash_suffix, proyecto_id, cliente, obra, coleccion = null, derechos = 'Todos los derechos reservados', email_contacto = '', compartir_blade = 0) {
    await this._ensureOpen();
    try {
      const proyecto = await this.buscarPorId(proyecto_id);
      if (!proyecto) {
        throw new Error(`Proyecto con ID ${proyecto_id} no encontrado`);
      }

      const result = await this.db.run(
        `INSERT INTO sellos 
         (id_numerico, hash_suffix, proyecto_id, cliente, obra, coleccion, derechos, email_contacto, compartir_blade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id_numerico, hash_suffix, proyecto_id, cliente, obra, coleccion, derechos, email_contacto, compartir_blade
      );
      telemetry.info(MODULE, `Sello registrado: ${hash_suffix} (ID: ${result.lastID}) para proyecto ${proyecto_id}`);
      return { id: result.lastID, id_numerico, hash: hash_suffix };
    } catch (err) {
      telemetry.error(MODULE, `Error registrando sello: ${err.message}`, { id_numerico, hash_suffix, proyecto_id });
      throw err;
    }
  }

  async obtenerSellosPorProyecto(proyectoId) {
    await this._ensureOpen();
    try {
      const rows = await this.db.all(
        'SELECT * FROM sellos WHERE proyecto_id = ? ORDER BY id_numerico',
        proyectoId
      );
      telemetry.debug(MODULE, `Recuperados ${rows.length} sellos para proyecto ${proyectoId}`);
      return rows;
    } catch (err) {
      telemetry.error(MODULE, `Error obteniendo sellos: ${err.message}`, { proyectoId });
      throw err;
    }
  }

  async contarSellosPorProyecto(proyectoId) {
    await this._ensureOpen();
    try {
      const row = await this.db.get(
        'SELECT COUNT(*) as total FROM sellos WHERE proyecto_id = ?',
        proyectoId
      );
      return row?.total || 0;
    } catch (err) {
      telemetry.error(MODULE, `Error contando sellos: ${err.message}`, { proyectoId });
      throw err;
    }
  }

  async actualizarSello(hash_suffix, datos) {
    await this._ensureOpen();
    try {
        const existe = await this.db.get('SELECT id FROM sellos WHERE hash_suffix = ?', hash_suffix);
        if (!existe) {
            throw new Error(`Sello con hash ${hash_suffix} no encontrado`);
        }

        const camposPermitidos = [
            'cliente', 'obra', 'coleccion', 'derechos', 
            'email_contacto', 'compartir_blade'
        ];
        
        const sets = [];
        const values = [];
        
        for (const [key, val] of Object.entries(datos)) {
            if (camposPermitidos.includes(key) && val !== undefined && val !== null) {
                sets.push(`${key} = ?`);
                values.push(val);
            }
        }
        
        if (sets.length === 0) {
            throw new Error('No se proporcionaron campos válidos para actualizar');
        }
        
        values.push(hash_suffix);
        
        const sql = `UPDATE sellos SET ${sets.join(', ')} WHERE hash_suffix = ?`;
        const result = await this.db.run(sql, values);
        
        telemetry.info(MODULE, `✅ Sello ${hash_suffix} actualizado en DB`, { 
            campos: sets.join(', '),
            changes: result.changes 
        });
        
        return await this.db.get('SELECT * FROM sellos WHERE hash_suffix = ?', hash_suffix);
    } catch (err) {
        telemetry.error(MODULE, `❌ Error actualizando sello: ${err.message}`, { hash_suffix });
        throw err;
    }
  }

  // --- CONFIGURACIÓN ---
  async obtenerConfiguracion() {
    await this._ensureOpen();
    try {
      const row = await this.db.get('SELECT * FROM configuracion WHERE id = 1');
      return row || { 
        prefijo_usuario: null, 
        email_usuario: null, 
        nombre_autor: null, 
        web_autor: null,
        telefono_autor: null,
        logo_path: null,
        direccion_autor: null,
        descripcion_autor: null,
        redes_sociales: null,
        ruta_proyectos: null,
        coleccion_por_defecto: null,
        derechos_por_defecto: null, 
        sincronizar_blade_por_defecto: 0,
        mover_original: 'mover',
        activar_watcher: 1,
        modo_automatico: 1,
        proyecto_por_defecto: null,
        subcarpeta_por_defecto: null,
        cliente_por_defecto: null,
        obra_por_defecto: null
      };
    } catch (err) {
      telemetry.error(MODULE, `Error obteniendo configuración: ${err.message}`);
      throw err;
    }
  }

  async obtenerPrefijo() {
    const config = await this.obtenerConfiguracion();
    return config?.prefijo_usuario || null;
  }

  async establecerPrefijo(prefijo) {
    await this._ensureOpen();
    try {
      await this.db.run('UPDATE configuracion SET prefijo_usuario = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = 1', prefijo);
      telemetry.info(MODULE, `Prefijo de usuario establecido: ${prefijo}`);
    } catch (err) {
      telemetry.error(MODULE, `Error estableciendo prefijo: ${err.message}`);
      throw err;
    }
  }

  async actualizarConfiguracion(campos) {
    await this._ensureOpen();
    const sets = [];
    const values = [];
    const camposPermitidos = [
      'prefijo_usuario', 'email_usuario', 'nombre_autor', 'web_autor',
      'telefono_autor', 'logo_path', 'direccion_autor', 'descripcion_autor',
      'redes_sociales', 'ruta_proyectos', 'coleccion_por_defecto',
      'derechos_por_defecto', 'sincronizar_blade_por_defecto',
      'mover_original', 'activar_watcher',
      'modo_automatico', 'proyecto_por_defecto', 'subcarpeta_por_defecto',
      'cliente_por_defecto', 'obra_por_defecto'
    ];
    for (const [key, val] of Object.entries(campos)) {
      if (camposPermitidos.includes(key) && val !== undefined && val !== null) {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return;
    values.push(new Date().toISOString());
    const sql = `UPDATE configuracion SET ${sets.join(', ')}, fecha_actualizacion = ? WHERE id = 1`;
    try {
      await this.db.run(sql, values);
      telemetry.info(MODULE, `Configuración actualizada: ${Object.keys(campos).join(', ')}`);
    } catch (err) {
      telemetry.error(MODULE, `Error actualizando configuración: ${err.message}`);
      throw err;
    }
  }

  // --- LICENCIA ---
  async obtenerLicencia() {
    await this._ensureOpen();
    try {
      const row = await this.db.get('SELECT * FROM licencia WHERE rowid = 1');
      return row || null;
    } catch (err) {
      telemetry.error(MODULE, `Error obteniendo licencia: ${err.message}`);
      throw err;
    }
  }

  async actualizarLicencia(campos) {
    await this._ensureOpen();
    const sets = [];
    const values = [];
    const camposPermitidos = [
      'activa', 'tipo', 'email', 'clave', 'fecha_activacion',
      'prefijo_usuario', 'contador_global', 'sellos_usados',
      'fecha_expiracion', 'servidor_verificado'
    ];
    for (const [key, val] of Object.entries(campos)) {
      if (camposPermitidos.includes(key) && val !== undefined && val !== null) {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return;
    const sql = `UPDATE licencia SET ${sets.join(', ')} WHERE rowid = 1`;
    try {
      await this.db.run(sql, values);
      telemetry.info(MODULE, `Licencia actualizada: ${Object.keys(campos).join(', ')}`);
    } catch (err) {
      telemetry.error(MODULE, `Error actualizando licencia: ${err.message}`);
      throw err;
    }
  }

  // --- HOT FOLDERS ---
  async agregarHotFolder(ruta, proyecto_id = null, subcarpeta = null, cliente = null, obra = null, activo = 1) {
    await this._ensureOpen();
    try {
      const result = await this.db.run(
        `INSERT INTO hot_folders (ruta, proyecto_id, subcarpeta, cliente, obra, activo)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(ruta) DO UPDATE SET
           proyecto_id = excluded.proyecto_id,
           subcarpeta = excluded.subcarpeta,
           cliente = excluded.cliente,
           obra = excluded.obra,
           activo = excluded.activo`,
        ruta, proyecto_id, subcarpeta, cliente, obra, activo
      );
      telemetry.info(MODULE, `Hot folder agregado/actualizado: ${ruta}`);
      return { id: result.lastID || null, ruta, proyecto_id, subcarpeta, cliente, obra, activo };
    } catch (err) {
      telemetry.error(MODULE, `Error agregando hot folder: ${err.message}`, { ruta });
      throw err;
    }
  }

  async obtenerHotFolders() {
    await this._ensureOpen();
    try {
      return await this.db.all('SELECT * FROM hot_folders ORDER BY id DESC');
    } catch (err) {
      telemetry.error(MODULE, `Error obteniendo hot folders: ${err.message}`);
      throw err;
    }
  }

  async eliminarHotFolder(id) {
    await this._ensureOpen();
    try {
      await this.db.run('DELETE FROM hot_folders WHERE id = ?', id);
      telemetry.info(MODULE, `Hot folder eliminado: ID ${id}`);
      return { ok: true };
    } catch (err) {
      telemetry.error(MODULE, `Error eliminando hot folder: ${err.message}`, { id });
      throw err;
    }
  }

  // --- CIERRE ---
  async cerrar() {
    await this._ensureOpen();
    if (this.db) {
      try {
        await this.db.close();
        telemetry.info(MODULE, 'Conexión DB cerrada correctamente');
      } catch (err) {
        telemetry.error(MODULE, `Error al cerrar DB: ${err.message}`);
        throw err;
      }
    }
  }
}