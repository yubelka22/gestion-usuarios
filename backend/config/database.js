const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  user: process.env.POSTGRES_USER || 'makerspace',
  password: process.env.POSTGRES_PASSWORD || 'makerspace123',
  database: process.env.POSTGRES_DB || 'iam_db',
  port: 5432,
});

async function inicializarDB() {
  let intentos = 0;
  const maxIntentos = 10;
  while (intentos < maxIntentos) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria (
          id SERIAL PRIMARY KEY,
          fecha TIMESTAMP DEFAULT NOW(),
          usuario VARCHAR(100),
          accion VARCHAR(100),
          detalle TEXT
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS estados_usuario (
          id SERIAL PRIMARY KEY,
          uid VARCHAR(100) UNIQUE NOT NULL,
          estado VARCHAR(100) DEFAULT 'socio_pagado',
          acceso BOOLEAN DEFAULT true,
          actualizado TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS estados_disponibles (
          id SERIAL PRIMARY KEY,
          codigo VARCHAR(100) UNIQUE NOT NULL,
          etiqueta VARCHAR(100) NOT NULL
        )
      `);
      await pool.query(`
        INSERT INTO estados_disponibles (codigo, etiqueta) VALUES
          ('socio_pagado', 'Socio (pagado)'),
          ('socio_impago', 'Socio (impago)'),
          ('estudiante', 'Estudiante'),
          ('voluntario', 'Voluntario'),
          ('honorifico', 'Honorifico'),
          ('fines_semana', 'Acceso fines de semana'),
          ('junior', 'Junior')
        ON CONFLICT (codigo) DO NOTHING
      `);
      console.log('Base de datos inicializada correctamente');
      return;
    } catch (err) {
      intentos++;
      console.log(`Esperando a Postgres... intento ${intentos}/${maxIntentos}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.error('No se pudo conectar a la base de datos');
}

async function registrarAuditoria(usuario, accion, detalle) {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario, accion, detalle) VALUES ($1, $2, $3)',
      [usuario, accion, detalle]
    );
    console.log(`AUDITORIA: ${usuario} | ${accion} | ${detalle}`);
  } catch (err) {
    console.error('Error registrando auditoria:', err.message);
  }
}

module.exports = { pool, inicializarDB, registrarAuditoria };