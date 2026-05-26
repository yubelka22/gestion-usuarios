const express = require('express');
const { Client } = require('ldapts');
const fetch = require('node-fetch');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'session_secreta_makerspace',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

app.use(express.static(path.join('/app', 'frontend')));

const LDAP_URL = 'ldap://lldap:3890';
const BASE_DN = `ou=people,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const GROUPS_DN = `ou=groups,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const BIND_DN = `uid=admin,ou=people,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const BIND_PASS = process.env.LDAP_BIND_PASSWORD || 'admin123';
const API_SECRET = process.env.API_SECRET || 'clave_secreta_makerspace';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const LLDAP_URL = 'http://lldap:17170';

const str = (val) => Array.isArray(val) ? (val[0] || '') : (val || '');

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

const verificarClave = (req, res, next) => {
  const clave = req.headers['x-api-key'];
  if (!clave || clave !== API_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
};

const verificarSesion = (req, res, next) => {
  if (!req.session.autenticado) {
    return res.redirect('/login');
  }
  next();
};

async function obtenerToken() {
  const resp = await fetch(`${LLDAP_URL}/auth/simple/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: BIND_PASS })
  });
  const data = await resp.json();
  return data.token;
}

async function cambiarGrupo(uid, grupoNuevo, grupoViejo) {
  try {
    const token = await obtenerToken();
    const queryGrupos = `{ groups { id displayName } }`;
    const respGrupos = await fetch(`${LLDAP_URL}/api/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: queryGrupos })
    });
    const dataGrupos = await respGrupos.json();
    const grupos = dataGrupos.data?.groups || [];

    if (grupoViejo) {
      const grupoViejoObj = grupos.find(g => g.displayName === grupoViejo);
      if (grupoViejoObj) {
        const mutationQuitar = `mutation { removeUserFromGroup(userId: "${uid}", groupId: ${grupoViejoObj.id}) { ok } }`;
        await fetch(`${LLDAP_URL}/api/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ query: mutationQuitar })
        });
      }
    }

    if (grupoNuevo) {
      const grupoNuevoObj = grupos.find(g => g.displayName === grupoNuevo);
      if (grupoNuevoObj) {
        const mutationAnadir = `mutation { addUserToGroup(userId: "${uid}", groupId: ${grupoNuevoObj.id}) { ok } }`;
        await fetch(`${LLDAP_URL}/api/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ query: mutationAnadir })
        });
      }
    }
  } catch (err) {
    console.error('Error cambiando grupo:', err.message);
  }
}

app.get('/login', (req, res) => {
  if (req.session.autenticado) return res.redirect('/');
  res.sendFile(path.join('/app', 'frontend', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === ADMIN_USER && password === ADMIN_PASS) {
    req.session.autenticado = true;
    req.session.usuario = usuario;
    await registrarAuditoria(usuario, 'LOGIN', 'Inicio de sesion correcto');
    return res.redirect('/');
  }
  await registrarAuditoria(usuario || 'desconocido', 'LOGIN_FALLIDO', 'Intento de acceso fallido');
  res.redirect('/login?error=1');
});

app.get('/logout', async (req, res) => {
  const usuario = req.session.usuario || 'desconocido';
  await registrarAuditoria(usuario, 'LOGOUT', 'Cierre de sesion');
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'index.html'));
});

app.get('/auditoria', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'auditoria.html'));
});

app.get('/api/auditoria', verificarSesion, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM auditoria ORDER BY fecha DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo el historial' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    const { searchEntries: usuarios } = await client.search(BASE_DN, {
      scope: 'sub',
      filter: '(objectClass=person)',
      attributes: ['cn', 'uid', 'mail', 'givenName', 'sn', 'displayName'],
    });
    const { searchEntries: grupos } = await client.search(GROUPS_DN, {
      scope: 'sub',
      filter: '(objectClass=groupOfUniqueNames)',
      attributes: ['cn', 'member'],
    });
    await client.unbind();

    const uids = usuarios.map(u => str(u.uid));
    let estadosMap = {};
    if (uids.length > 0) {
      const estadosResult = await pool.query(
        'SELECT uid, estado, acceso FROM estados_usuario WHERE uid = ANY($1)',
        [uids]
      );
      estadosResult.rows.forEach(r => {
        estadosMap[r.uid] = { estado: r.estado, acceso: r.acceso };
      });
    }

    const resultado = usuarios.map(u => {
      const uid = str(u.uid);
      const grupoUsuario = grupos.find(g =>
        g.member && (
          Array.isArray(g.member)
            ? g.member.some(m => m.includes('uid=' + uid))
            : g.member.includes('uid=' + uid)
        )
      );
      return {
        uid,
        nombre: str(u.givenName),
        apellido: str(u.sn),
        nombreCompleto: str(u.cn) || str(u.displayName),
        email: str(u.mail),
        grupo: grupoUsuario ? str(grupoUsuario.cn) : null,
        estado: estadosMap[uid]?.estado || 'socio_pagado',
        acceso: estadosMap[uid]?.acceso !== undefined ? estadosMap[uid].acceso : true
      };
    });
    res.json(resultado);
  } catch (err) {
    console.error('Error LDAP:', err.message);
    res.status(500).json({ error: 'Error al conectar con el directorio' });
  }
});

app.put('/api/usuarios/:uid/estado', verificarClave, async (req, res) => {
  const { estado } = req.body;
  const uid = req.params.uid;
  try {
    await pool.query(
      `INSERT INTO estados_usuario (uid, estado, actualizado)
       VALUES ($1, $2, NOW())
       ON CONFLICT (uid) DO UPDATE SET estado = $2, actualizado = NOW()`,
      [uid, estado]
    );
    await registrarAuditoria('admin', 'CAMBIAR_ESTADO', `Estado de ${uid} cambiado a: ${estado}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error cambiando estado:', err.message);
    res.status(500).json({ error: 'Error al cambiar el estado' });
  }
});

app.put('/api/usuarios/:uid/acceso', verificarClave, async (req, res) => {
  const { acceso } = req.body;
  const uid = req.params.uid;
  try {
    await pool.query(
      `INSERT INTO estados_usuario (uid, acceso, actualizado)
       VALUES ($1, $2, NOW())
       ON CONFLICT (uid) DO UPDATE SET acceso = $2, actualizado = NOW()`,
      [uid, acceso]
    );
    const accion = acceso ? 'CONCEDER_ACCESO' : 'RETIRAR_ACCESO';
    await registrarAuditoria('admin', accion, `Acceso de ${uid} ${acceso ? 'concedido' : 'retirado'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error cambiando acceso:', err.message);
    res.status(500).json({ error: 'Error al cambiar el acceso' });
  }
});

app.post('/api/usuarios', verificarClave, async (req, res) => {
  const { uid, nombre, apellido, email, password } = req.body;
  if (!uid || !nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!/^[a-z0-9_]+$/.test(uid)) {
    return res.status(400).json({ error: 'El nombre de usuario no es valido' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'El email no tiene un formato valido' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });
  }
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    await client.add('uid=' + uid + ',' + BASE_DN, {
      objectClass: ['inetOrgPerson'],
      uid,
      cn: nombre + ' ' + apellido,
      givenName: nombre,
      sn: apellido,
      mail: email,
      userPassword: password,
    });
    await client.unbind();
    await registrarAuditoria('admin', 'CREAR_USUARIO', `Usuario creado: ${uid} (${nombre} ${apellido})`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error creando usuario:', err.message);
    await registrarAuditoria('admin', 'ERROR', `Error al crear usuario ${uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

app.put('/api/usuarios/:uid', verificarClave, async (req, res) => {
  const { nombre, apellido, email, grupo, grupoViejo } = req.body;
  const uid = req.params.uid;
  if (!nombre || !apellido || !email) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    await client.del('uid=' + uid + ',' + BASE_DN);
    await client.add('uid=' + uid + ',' + BASE_DN, {
      objectClass: ['inetOrgPerson'],
      uid,
      cn: nombre + ' ' + apellido,
      givenName: nombre,
      sn: apellido,
      mail: email,
    });
    await client.unbind();
    await cambiarGrupo(uid, grupo, grupoViejo);
    await registrarAuditoria('admin', 'EDITAR_USUARIO', `Usuario editado: ${uid} | Grupo: ${grupoViejo} -> ${grupo || 'sin grupo'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error editando usuario:', err.message);
    await registrarAuditoria('admin', 'ERROR', `Error al editar usuario ${uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al editar el usuario' });
  }
});

app.delete('/api/usuarios/:uid', verificarClave, async (req, res) => {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    await client.del('uid=' + req.params.uid + ',' + BASE_DN);
    await client.unbind();
    await registrarAuditoria('admin', 'BORRAR_USUARIO', `Usuario borrado: ${req.params.uid}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando usuario:', err.message);
    await registrarAuditoria('admin', 'ERROR', `Error al borrar usuario ${req.params.uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al borrar el usuario' });
  }
});

inicializarDB();
app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));