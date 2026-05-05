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

// Funcion para registrar acciones en el log
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
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Login - Zaragoza Maker Space</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .login-card { background: white; border-radius: 12px; padding: 40px; width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .login-header { text-align: center; margin-bottom: 30px; }
        .login-header h1 { font-size: 20px; color: #2c3e50; margin-bottom: 5px; }
        .login-header p { font-size: 13px; color: #888; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-size: 12px; color: #666; font-weight: 600; margin-bottom: 5px; }
        .form-group input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
        .form-group input:focus { border-color: #4a90d9; }
        .btn-login { width: 100%; background: #4a90d9; color: white; padding: 12px; border: none; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 10px; }
        .btn-login:hover { background: #357abd; }
        .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 15px; display: ${req.query.error ? 'block' : 'none'}; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <div class="login-header">
          <h1>Zaragoza Maker Space</h1>
          <p>Panel de gestion de identidades y accesos</p>
        </div>
        <div class="error">Usuario o contrasena incorrectos</div>
        <form method="POST" action="/login">
          <div class="form-group">
            <label>Usuario</label>
            <input type="text" name="usuario" placeholder="admin" required />
          </div>
          <div class="form-group">
            <label>Contrasena</label>
            <input type="password" name="password" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn-login">Entrar</button>
        </form>
      </div>
    </body>
    </html>
  `);
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
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Zaragoza Maker Space - IAM</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #333; }
        header {
          background: linear-gradient(135deg, #2c3e50, #4a90d9);
          color: white;
          padding: 20px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .header-left h1 { font-size: 22px; font-weight: 600; }
        .header-left p { font-size: 13px; opacity: 0.8; }
        .header-right { display: flex; gap: 10px; align-items: center; }
        .btn-logout { background: rgba(255,255,255,0.2); color: white; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
        .btn-logout:hover { background: rgba(255,255,255,0.3); }
        .btn-auditoria { background: rgba(255,255,255,0.2); color: white; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
        .btn-auditoria:hover { background: rgba(255,255,255,0.3); }
        .contenido { max-width: 1100px; margin: 30px auto; padding: 0 20px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
        .stat-card { background: white; border-radius: 10px; padding: 15px 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.07); border-left: 4px solid #4a90d9; }
        .stat-card.socios { border-left-color: #27ae60; }
        .stat-card.junta { border-left-color: #2980b9; }
        .stat-card.voluntarios { border-left-color: #f39c12; }
        .stat-numero { font-size: 28px; font-weight: 700; color: #2c3e50; }
        .stat-label { font-size: 12px; color: #888; margin-top: 3px; }
        .panel { background: white; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.07); overflow: hidden; margin-bottom: 25px; }
        .panel-header { background: #2c3e50; color: white; padding: 15px 20px; font-size: 15px; font-weight: 600; }
        .panel-body { padding: 20px; }
        .controles { display: flex; gap: 10px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
        .buscador { padding: 9px 16px; border: 1px solid #ddd; border-radius: 20px; font-size: 14px; width: 260px; outline: none; }
        .buscador:focus { border-color: #4a90d9; }
        .filtros { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-filtro { padding: 7px 16px; border: 1px solid #ddd; border-radius: 20px; cursor: pointer; font-size: 13px; background: white; color: #555; transition: all 0.2s; }
        .btn-filtro:hover { background: #f0f2f5; }
        .btn-filtro.activo { background: #2c3e50; color: white; border-color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8f9fa; color: #555; padding: 12px 15px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #eee; }
        td { padding: 12px 15px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #f8f9fa; }
        .badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-socios { background: #d4edda; color: #155724; }
        .badge-junta { background: #cce5ff; color: #004085; }
        .badge-voluntarios { background: #fff3cd; color: #856404; }
        .badge-sin-grupo { background: #f0f0f0; color: #888; }
        .btn-editar { background: #f39c12; color: white; padding: 5px 12px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; margin-right: 5px; transition: background 0.2s; }
        .btn-editar:hover { background: #e67e22; }
        .btn-borrar { background: #e74c3c; color: white; padding: 5px 12px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; transition: background 0.2s; }
        .btn-borrar:hover { background: #c0392b; }
        .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 5px; }
        .form-group label { font-size: 12px; color: #666; font-weight: 600; }
        .form-group input { padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
        .form-group input:focus { border-color: #4a90d9; }
        .btn-crear { background: #27ae60; color: white; padding: 10px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; margin-top: 15px; transition: background 0.2s; }
        .btn-crear:hover { background: #219a52; }
        .mensaje { padding: 10px 15px; border-radius: 6px; margin-top: 10px; display: none; font-size: 13px; }
        .exito { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .sin-resultados { text-align: center; padding: 30px; color: #aaa; font-size: 14px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; }
        .modal-contenido { background: white; margin: 80px auto; padding: 30px; border-radius: 12px; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .modal-contenido h2 { margin-bottom: 20px; color: #2c3e50; }
        .modal-form-group { margin-bottom: 15px; }
        .modal-form-group label { display: block; font-size: 12px; color: #666; font-weight: 600; margin-bottom: 5px; }
        .modal-form-group input, .modal-form-group select { width: 100%; padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
        .modal-form-group input:focus, .modal-form-group select:focus { border-color: #4a90d9; }
        .modal-botones { display: flex; gap: 10px; margin-top: 20px; }
        .btn-guardar { background: #4a90d9; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; flex: 1; font-size: 14px; font-weight: 600; }
        .btn-cancelar { background: #f0f0f0; color: #555; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; flex: 1; font-size: 14px; }
      </style>
    </head>
    <body>
      <header>
        <div class="header-left">
          <h1>Zaragoza Maker Space</h1>
          <p>Panel de gestion de identidades y accesos</p>
        </div>
        <div class="header-right">
          <a href="/auditoria" class="btn-auditoria">Historial</a>
          <a href="/logout" class="btn-logout">Cerrar sesion</a>
        </div>
      </header>

      <div class="contenido">
        <div class="stats">
          <div class="stat-card">
            <div class="stat-numero" id="stat-total">-</div>
            <div class="stat-label">Total usuarios</div>
          </div>
          <div class="stat-card socios">
            <div class="stat-numero" id="stat-socios">-</div>
            <div class="stat-label">Socios</div>
          </div>
          <div class="stat-card junta">
            <div class="stat-numero" id="stat-junta">-</div>
            <div class="stat-label">Junta</div>
          </div>
          <div class="stat-card voluntarios">
            <div class="stat-numero" id="stat-voluntarios">-</div>
            <div class="stat-label">Voluntarios</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">Directorio de usuarios</div>
          <div class="panel-body">
            <div class="controles">
              <input type="text" class="buscador" id="buscador" placeholder="Buscar por nombre o email..." oninput="renderizarTabla()" />
              <div class="filtros">
                <button class="btn-filtro activo" onclick="filtrar('todos', this)">Todos</button>
                <button class="btn-filtro" onclick="filtrar('socios', this)">Socios</button>
                <button class="btn-filtro" onclick="filtrar('junta', this)">Junta</button>
                <button class="btn-filtro" onclick="filtrar('voluntarios', this)">Voluntarios</button>
                <button class="btn-filtro" onclick="filtrar('sin grupo', this)">Sin grupo</button>
              </div>
            </div>
            <table id="tabla" style="display:none">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Apellido</th>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="cuerpo"></tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">Crear nuevo usuario</div>
          <div class="panel-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Nombre de usuario</label>
                <input type="text" id="uid" placeholder="ej: maria" />
              </div>
              <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="nombre" placeholder="ej: Maria" />
              </div>
              <div class="form-group">
                <label>Apellido</label>
                <input type="text" id="apellido" placeholder="ej: Lopez" />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="email" placeholder="ej: maria@makerspace.local" />
              </div>
              <div class="form-group">
                <label>Contrasena</label>
                <input type="password" id="password" placeholder="minimo 6 caracteres" />
              </div>
            </div>
            <button class="btn-crear" onclick="crearUsuario()">Crear usuario</button>
            <div id="mensaje" class="mensaje"></div>
          </div>
        </div>
      </div>

      <div class="modal" id="modal">
        <div class="modal-contenido">
          <h2>Editar usuario</h2>
          <input type="hidden" id="edit-uid" />
          <div class="modal-form-group">
            <label>Nombre</label>
            <input type="text" id="edit-nombre" />
          </div>
          <div class="modal-form-group">
            <label>Apellido</label>
            <input type="text" id="edit-apellido" />
          </div>
          <div class="modal-form-group">
            <label>Email</label>
            <input type="email" id="edit-email" />
          </div>
          <div class="modal-form-group">
            <label>Grupo</label>
            <select id="edit-grupo">
              <option value="">Sin grupo</option>
              <option value="socios">Socios</option>
              <option value="junta">Junta</option>
              <option value="voluntarios">Voluntarios</option>
            </select>
          </div>
          <div class="modal-botones">
            <button class="btn-guardar" onclick="guardarEdicion()">Guardar</button>
            <button class="btn-cancelar" onclick="cerrarModal()">Cancelar</button>
          </div>
          <div id="mensaje-modal" class="mensaje"></div>
        </div>
      </div>

      <script>
        const API_KEY = 'clave_secreta_makerspace';
        let todosLosUsuarios = [];
        let filtroActual = 'todos';

        function getBadge(rol) {
          if (!rol) return '<span class="badge badge-sin-grupo">Sin grupo</span>';
          return '<span class="badge badge-' + rol.toLowerCase() + '">' + rol + '</span>';
        }

        function actualizarStats(data) {
          document.getElementById('stat-total').textContent = data.length;
          document.getElementById('stat-socios').textContent = data.filter(u => u.grupo === 'socios').length;
          document.getElementById('stat-junta').textContent = data.filter(u => u.grupo === 'junta').length;
          document.getElementById('stat-voluntarios').textContent = data.filter(u => u.grupo === 'voluntarios').length;
        }

        function filtrar(rol, btn) {
          filtroActual = rol;
          document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('activo'));
          btn.classList.add('activo');
          renderizarTabla();
        }

        function renderizarTabla() {
          const cuerpo = document.getElementById('cuerpo');
          const busqueda = document.getElementById('buscador').value.toLowerCase();
          cuerpo.innerHTML = '';

          let filtrados = filtroActual === 'todos'
            ? todosLosUsuarios
            : todosLosUsuarios.filter(u => (u.grupo || 'sin grupo').toLowerCase() === filtroActual);

          if (busqueda) {
            filtrados = filtrados.filter(u =>
              u.nombre.toLowerCase().includes(busqueda) ||
              u.apellido.toLowerCase().includes(busqueda) ||
              u.uid.toLowerCase().includes(busqueda) ||
              u.email.toLowerCase().includes(busqueda) ||
              u.nombreCompleto.toLowerCase().includes(busqueda)
            );
          }

          if (filtrados.length === 0) {
            cuerpo.innerHTML = '<tr><td colspan="6" class="sin-resultados">No se encontraron usuarios</td></tr>';
            return;
          }

          filtrados.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
              '<td>' + (u.nombre || '-') + '</td>' +
              '<td>' + (u.apellido || '-') + '</td>' +
              '<td><strong>' + u.uid + '</strong></td>' +
              '<td>' + (u.email || '-') + '</td>' +
              '<td>' + getBadge(u.grupo) + '</td>' +
              '<td>' +
                '<button class="btn-editar" data-index="' + index + '">Editar</button>' +
                '<button class="btn-borrar" data-uid="' + u.uid + '">Borrar</button>' +
              '</td>';
            cuerpo.appendChild(tr);
          });

          document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', function() {
              const u = filtrados[parseInt(this.dataset.index)];
              abrirModal(u);
            });
          });

          document.querySelectorAll('.btn-borrar').forEach(btn => {
            btn.addEventListener('click', function() {
              borrarUsuario(this.dataset.uid);
            });
          });
        }

        function abrirModal(u) {
          document.getElementById('edit-uid').value = u.uid;
          document.getElementById('edit-nombre').value = u.nombre || '';
          document.getElementById('edit-apellido').value = u.apellido || '';
          document.getElementById('edit-email').value = u.email || '';
          document.getElementById('edit-grupo').value = u.grupo || '';
          document.getElementById('mensaje-modal').style.display = 'none';
          document.getElementById('modal').style.display = 'block';
        }

        function cerrarModal() {
          document.getElementById('modal').style.display = 'none';
        }

        function guardarEdicion() {
          const uid = document.getElementById('edit-uid').value;
          const nombre = document.getElementById('edit-nombre').value;
          const apellido = document.getElementById('edit-apellido').value;
          const email = document.getElementById('edit-email').value;
          const grupo = document.getElementById('edit-grupo').value;
          const grupoViejo = todosLosUsuarios.find(u => u.uid === uid)?.grupo || '';
          const mensaje = document.getElementById('mensaje-modal');

          fetch('/api/usuarios/' + uid, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ nombre, apellido, email, grupo, grupoViejo })
          })
          .then(r => r.json())
          .then(data => {
            mensaje.style.display = 'block';
            if (data.ok) {
              mensaje.className = 'mensaje exito';
              mensaje.textContent = 'Usuario actualizado correctamente';
              setTimeout(() => { cerrarModal(); cargarUsuarios(); }, 1000);
            } else {
              mensaje.className = 'mensaje error';
              mensaje.textContent = 'Error: ' + data.error;
            }
          });
        }

        function cargarUsuarios() {
          fetch('/api/usuarios')
            .then(r => r.json())
            .then(data => {
              todosLosUsuarios = data;
              document.getElementById('tabla').style.display = 'table';
              actualizarStats(data);
              renderizarTabla();
            });
        }

        function crearUsuario() {
          const uid = document.getElementById('uid').value.trim();
          const nombre = document.getElementById('nombre').value.trim();
          const apellido = document.getElementById('apellido').value.trim();
          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;
          const mensaje = document.getElementById('mensaje');

          if (!uid || !nombre || !apellido || !email || !password) {
            mensaje.style.display = 'block';
            mensaje.className = 'mensaje error';
            mensaje.textContent = 'Todos los campos son obligatorios';
            return;
          }

          if (!/^[a-z0-9_]+$/.test(uid)) {
            mensaje.style.display = 'block';
            mensaje.className = 'mensaje error';
            mensaje.textContent = 'El nombre de usuario solo puede contener letras minusculas numeros y guiones bajos';
            return;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            mensaje.style.display = 'block';
            mensaje.className = 'mensaje error';
            mensaje.textContent = 'El email no tiene un formato valido';
            return;
          }

          if (password.length < 6) {
            mensaje.style.display = 'block';
            mensaje.className = 'mensaje error';
            mensaje.textContent = 'La contrasena debe tener al menos 6 caracteres';
            return;
          }

          fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ uid, nombre, apellido, email, password })
          })
          .then(r => r.json())
          .then(data => {
            mensaje.style.display = 'block';
            if (data.ok) {
              mensaje.className = 'mensaje exito';
              mensaje.textContent = 'Usuario creado correctamente';
              cargarUsuarios();
            } else {
              mensaje.className = 'mensaje error';
              mensaje.textContent = 'Error: ' + data.error;
            }
          });
        }

        function borrarUsuario(uid) {
          if (!confirm('Seguro que quieres borrar a ' + uid + '?')) return;
          fetch('/api/usuarios/' + uid, {
            method: 'DELETE',
            headers: { 'x-api-key': API_KEY }
          })
          .then(r => r.json())
          .then(data => {
            if (data.ok) cargarUsuarios();
          });
        }

        cargarUsuarios();
      </script>
    </body>
    </html>
  `);
});

app.get('/auditoria', verificarSesion, (req, res) => {
  let logs = [];
  try {
    if (fs.existsSync(LOG_FILE)) {
      const contenido = fs.readFileSync(LOG_FILE, 'utf8');
      logs = contenido.trim().split('\n').reverse();
    }
  } catch (err) {
    console.error('Error leyendo log:', err.message);
  }

  const filas = logs.map(l => `<tr><td style="padding:10px 15px;border-bottom:1px solid #f0f0f0;font-size:13px;font-family:monospace;">${l}</td></tr>`).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Historial - Zaragoza Maker Space</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #333; }
        header { background: linear-gradient(135deg, #2c3e50, #4a90d9); color: white; padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        .header-left h1 { font-size: 22px; font-weight: 600; }
        .header-left p { font-size: 13px; opacity: 0.8; }
        .btn-volver { background: rgba(255,255,255,0.2); color: white; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
        .btn-volver:hover { background: rgba(255,255,255,0.3); }
        .contenido { max-width: 1100px; margin: 30px auto; padding: 0 20px; }
        .panel { background: white; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.07); overflow: hidden; }
        .panel-header { background: #2c3e50; color: white; padding: 15px 20px; font-size: 15px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; }
        .vacio { text-align: center; padding: 30px; color: #aaa; font-size: 14px; }
      </style>
    </head>
    <body>
      <header>
        <div class="header-left">
          <h1>Zaragoza Maker Space</h1>
          <p>Historial de auditoria</p>
        </div>
        <a href="/" class="btn-volver">Volver al panel</a>
      </header>
      <div class="contenido">
        <div class="panel">
          <div class="panel-header">Registro de acciones</div>
          <table>
            ${filas || '<tr><td class="vacio">No hay registros todavia</td></tr>'}
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
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