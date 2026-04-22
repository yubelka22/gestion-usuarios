const express = require('express');
const { Client } = require('ldapts');

const app = express();
app.use(express.json());

const LDAP_URL = 'ldap://lldap:3890';
const BIND_DN = 'uid=admin,ou=people,dc=makerspace,dc=local';
const BIND_PASS = 'admin123';
const BASE_DN = 'ou=people,dc=makerspace,dc=local';
const GROUPS_DN = 'ou=groups,dc=makerspace,dc=local';

const str = (val) => Array.isArray(val) ? (val[0] || '') : (val || '');

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Usuarios - Zaragoza Maker Space</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 40px auto; padding: 0 20px; }
        h1, h2 { color: #333; }
        .contador { background: #4a90d9; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; margin-bottom: 20px; }
        .controles { display: flex; gap: 10px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
        .buscador { padding: 8px 14px; border: 1px solid #ddd; border-radius: 20px; font-size: 14px; width: 250px; }
        .filtros { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-filtro { padding: 8px 16px; border: none; border-radius: 20px; cursor: pointer; font-size: 13px; background: #e0e0e0; color: #333; }
        .btn-filtro.activo { background: #4a90d9; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #4a90d9; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        tr:hover { background: #f5f5f5; }
        .formulario { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 40px; }
        .formulario input, .formulario select { padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; width: 200px; }
        .btn-crear { background: #4a90d9; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        .btn-borrar { background: #e74c3c; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-editar { background: #f39c12; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px; }
        .badge { padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: bold; }
        .badge-socios { background: #d4edda; color: #155724; }
        .badge-junta { background: #cce5ff; color: #004085; }
        .badge-voluntarios { background: #fff3cd; color: #856404; }
        .badge-sin-grupo { background: #f0f0f0; color: #888; }
        .mensaje { padding: 10px; border-radius: 4px; margin-top: 10px; display: none; }
        .exito { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .sin-resultados { text-align: center; padding: 20px; color: #888; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; }
        .modal-contenido { background: white; margin: 100px auto; padding: 30px; border-radius: 8px; max-width: 400px; }
        .modal-contenido h2 { margin-top: 0; }
        .modal-contenido input, .modal-contenido select { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .modal-botones { display: flex; gap: 10px; margin-top: 15px; }
        .btn-guardar { background: #4a90d9; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; flex: 1; }
        .btn-cancelar { background: #aaa; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; flex: 1; }
      </style>
    </head>
    <body>
      <h1>Usuarios Zaragoza Maker Space</h1>
      <p id="contador" class="contador">Cargando...</p>

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

      <div class="formulario">
        <h2>Crear nuevo usuario</h2>
        <input type="text" id="uid" placeholder="Nombre de usuario" />
        <input type="text" id="nombre" placeholder="Nombre" />
        <input type="text" id="apellido" placeholder="Apellido" />
        <input type="email" id="email" placeholder="Email" />
        <input type="password" id="password" placeholder="Contraseña" />
        <br>
        <button class="btn-crear" onclick="crearUsuario()">Crear usuario</button>
        <div id="mensaje" class="mensaje"></div>
      </div>

      <div class="modal" id="modal">
        <div class="modal-contenido">
          <h2>Editar usuario</h2>
          <input type="hidden" id="edit-uid" />
          <input type="text" id="edit-nombre" placeholder="Nombre" />
          <input type="text" id="edit-apellido" placeholder="Apellido" />
          <input type="email" id="edit-email" placeholder="Email" />
          <div class="modal-botones">
            <button class="btn-guardar" onclick="guardarEdicion()">Guardar</button>
            <button class="btn-cancelar" onclick="cerrarModal()">Cancelar</button>
          </div>
          <div id="mensaje-modal" class="mensaje"></div>
        </div>
      </div>

      <script>
        let todosLosUsuarios = [];
        let filtroActual = 'todos';

        function getBadge(rol) {
          if (!rol) return '<span class="badge badge-sin-grupo">sin grupo</span>';
          return '<span class="badge badge-' + rol.toLowerCase() + '">' + rol + '</span>';
        }

        function filtrar(rol, btn) {
          filtroActual = rol;
          document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('activo'));
          btn.classList.add('activo');
          renderizarTabla();
        }

        function renderizarTabla() {
          const cuerpo = document.getElementById('cuerpo');
          const contador = document.getElementById('contador');
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

          contador.textContent = 'Mostrando: ' + filtrados.length + ' de ' + todosLosUsuarios.length + ' usuarios';

          if (filtrados.length === 0) {
            cuerpo.innerHTML = '<tr><td colspan="6" class="sin-resultados">No se encontraron usuarios</td></tr>';
            return;
          }

          filtrados.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
              '<td>' + (u.nombre || '-') + '</td>' +
              '<td>' + (u.apellido || '-') + '</td>' +
              '<td>' + u.uid + '</td>' +
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
          const mensaje = document.getElementById('mensaje-modal');

          fetch('/api/usuarios/' + uid, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, apellido, email })
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
              renderizarTabla();
            });
        }

        function crearUsuario() {
          const uid = document.getElementById('uid').value;
          const nombre = document.getElementById('nombre').value;
          const apellido = document.getElementById('apellido').value;
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          const mensaje = document.getElementById('mensaje');

          fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
          if (!confirm('¿Seguro que quieres borrar a ' + uid + '?')) return;
          fetch('/api/usuarios/' + uid, { method: 'DELETE' })
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { uid, nombre, apellido, email, password } = req.body;
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:uid', async (req, res) => {
  const { nombre, apellido, email } = req.body;
  const uid = req.params.uid;
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/usuarios/:uid', async (req, res) => {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    await client.del('uid=' + req.params.uid + ',' + BASE_DN);
    await client.unbind();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));