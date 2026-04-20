const express = require('express');
const { Client } = require('ldapts');

const app = express();

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Usuarios - Zaragoza Maker Space</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
        h1 { color: #333; }
        .contador { background: #4a90d9; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #4a90d9; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        tr:hover { background: #f5f5f5; }
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
          </tr>
        </thead>
        <tbody id="cuerpo"></tbody>
      </table>
      <script>
        fetch('/api/usuarios')
          .then(r => r.json())
          .then(data => {
            const contador = document.getElementById('contador');
            const tabla = document.getElementById('tabla');
            const cuerpo = document.getElementById('cuerpo');

            contador.textContent = 'Total de usuarios: ' + data.length;
            tabla.style.display = 'table';

            data.forEach(u => {
              cuerpo.innerHTML += '<tr>' +
                '<td>' + (u.givenName||'-') + '</td>' +
                '<td>' + (u.sn||'-') + '</td>' +
                '<td>' + (u.uid||'-') + '</td>' +
                '<td>' + (u.mail||'-') + '</td>' +
                '</tr>';
            });
          })
          .catch(() => {
            document.getElementById('contador').textContent = 'Error al conectar con el servidor.';
          });
      </script>
    </body>
    </html>
  `);
});

app.get('/api/usuarios', async (req, res) => {
  const client = new Client({ url: 'ldap://lldap:3890' });
  try {
    await client.bind('uid=admin,ou=people,dc=makerspace,dc=local', 'admin123');
    const { searchEntries } = await client.search('ou=people,dc=makerspace,dc=local', {
      scope: 'sub',
      filter: '(objectClass=person)',
      attributes: ['cn', 'uid', 'mail', 'givenName', 'sn'],
    });
    await client.unbind();
    res.json(searchEntries);
  } catch (err) {
    console.error('Error LDAP:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));