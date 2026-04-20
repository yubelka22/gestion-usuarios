const express = require('express');
const { Client } = require('ldapts');

const app = express();
app.use(express.json());

const LDAP_URL = 'ldap://lldap:3890';
const BIND_DN = 'uid=admin,ou=people,dc=makerspace,dc=local';
const BIND_PASS = 'admin123';
const BASE_DN = 'ou=people,dc=makerspace,dc=local';

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Usuarios - Zaragoza Maker Space</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
        h1, h2 { color: #333; }
        .contador { background: #4a90d9; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #4a90d9; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        tr:hover { background: #f5f5f5; }
        .formulario { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 40px; }
        .formulario input { padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; width: 200px; }
        .btn-crear { background: #4a90d9; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        .btn-borrar { background: #e74c3c; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-crear:hover { background: #357abd; }
        .btn-borrar:hover { background: #c0392b; }
        .mensaje { padding: 10px; border-radius: 4px; margin-top: 10px; display: none; }
        .exito { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>Usuarios Zaragoza Maker Space</h1>
      <p id="contador" class="contador">Cargando...</p>
      <table id="tabla" style="display:none">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Apellido</th>
            <th>Usuario</th>
            <th>Email</th>
            <th>Acción</th>
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

      <script>
        function cargarUsuarios() {
          fetch('/api/usuarios')
            .then(r => r.json())
            .then(data => {
              const contador = document.getElementById('contador');
              const tabla = document.getElementById('tabla');
              const cuerpo = document.getElementById('cuerpo');
              cuerpo.innerHTML = '';
              contador.textContent = 'Total de usuarios: ' + data.length;
              tabla.style.display = 'table';
              data.forEach(u => {
                cuerpo.innerHTML += '<tr>' +
                  '<td>' + (u.givenName||'-') + '</td>' +
                  '<td>' + (u.sn||'-') + '</td>' +
                  '<td>' + (u.uid||'-') + '</td>' +
                  '<td>' + (u.mail||'-') + '</td>' +
                  '<td><button class="btn-borrar" onclick="borrarUsuario(\\'' + u.uid + '\\')">Borrar</button></td>' +
                  '</tr>';
              });
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
    const { searchEntries } = await client.search(BASE_DN, {
      scope: 'sub',
      filter: '(objectClass=person)',
      attributes: ['cn', 'uid', 'mail', 'givenName', 'sn'],
    });
    await client.unbind();
    res.json(searchEntries);
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