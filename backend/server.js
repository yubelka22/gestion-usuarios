const express = require('express');
const { Client } = require('ldapts');
const fetch = require('node-fetch');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'session_secreta_makerspace',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

// Servir archivos estaticos del frontend
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
const LOG_FILE = path.join('/app', 'auditoria.log');

const str = (val) => Array.isArray(val) ? (val[0] || '') : (val || '');

function registrarAuditoria(usuario, accion, detalle) {
  const fecha = new Date().toLocaleString('es-ES');
  const linea = `[${fecha}] Usuario: ${usuario} | Accion: ${accion} | Detalle: ${detalle}\n`;
  fs.appendFileSync(LOG_FILE, linea);
  console.log('AUDITORIA:', linea.trim());
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
    if (grupoViejo) {
      await fetch(`${LLDAP_URL}/api/groups/${grupoViejo}/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: uid })
      });
    }
    if (grupoNuevo) {
      const respGrupos = await fetch(`${LLDAP_URL}/api/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const grupos = await respGrupos.json();
      const grupo = grupos.find(g => g.displayName === grupoNuevo);
      if (grupo) {
        await fetch(`${LLDAP_URL}/api/groups/${grupo.id}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: uid })
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

app.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === ADMIN_USER && password === ADMIN_PASS) {
    req.session.autenticado = true;
    req.session.usuario = usuario;
    registrarAuditoria(usuario, 'LOGIN', 'Inicio de sesion correcto');
    return res.redirect('/');
  }
  registrarAuditoria(usuario || 'desconocido', 'LOGIN_FALLIDO', 'Intento de acceso fallido');
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  const usuario = req.session.usuario || 'desconocido';
  registrarAuditoria(usuario, 'LOGOUT', 'Cierre de sesion');
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'index.html'));
});

app.get('/auditoria', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'auditoria.html'));
});

app.get('/api/auditoria', verificarSesion, (req, res) => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const contenido = fs.readFileSync(LOG_FILE, 'utf8');
      const logs = contenido.trim().split('\n').reverse();
      return res.json(logs);
    }
    res.json([]);
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
        grupo: grupoUsuario ? str(grupoUsuario.cn) : null
      };
    });
    res.json(resultado);
  } catch (err) {
    console.error('Error LDAP:', err.message);
    res.status(500).json({ error: 'Error al conectar con el directorio' });
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
    registrarAuditoria('admin', 'CREAR_USUARIO', `Usuario creado: ${uid} (${nombre} ${apellido})`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error creando usuario:', err.message);
    registrarAuditoria('admin', 'ERROR', `Error al crear usuario ${uid}: ${err.message}`);
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
    registrarAuditoria('admin', 'EDITAR_USUARIO', `Usuario editado: ${uid} | Grupo: ${grupoViejo} -> ${grupo || 'sin grupo'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error editando usuario:', err.message);
    registrarAuditoria('admin', 'ERROR', `Error al editar usuario ${uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al editar el usuario' });
  }
});

app.delete('/api/usuarios/:uid', verificarClave, async (req, res) => {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    await client.del('uid=' + req.params.uid + ',' + BASE_DN);
    await client.unbind();
    registrarAuditoria('admin', 'BORRAR_USUARIO', `Usuario borrado: ${req.params.uid}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando usuario:', err.message);
    registrarAuditoria('admin', 'ERROR', `Error al borrar usuario ${req.params.uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al borrar el usuario' });
  }
});

app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));