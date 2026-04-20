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
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #4a90d9; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <h1>Usuarios Zaragoza Maker Space</h1>
      <p id="estado">Cargando usuarios...</p>
      <table id="tabla" style="display:none">
        <thead>
          <tr><th>Nombre</th><th>Usuario</th><th>Email</th></tr>
        </thead>
        <tbody id="cuerpo"></tbody>
      </table>
      <script>
        fetch('/api/usuarios')
          .then(r => r.json())
          .then(data => {
            const estado = document.getElementById('estado');
            const tabla = document.getElementById('tabla');
            const cuerpo = document.getElementById('cuerpo');
            if (!data.length) {
              estado.textContent = 'No hay usuarios todavía.';
              return;
            }
            estado.style.display = 'none';
            tabla.style.display = 'table';
            data.forEach(u => {
              cuerpo.innerHTML += '<tr><td>' + (u.cn||'-') + '</td><td>' + (u.uid||'-') + '</td><td>' + (u.mail||'-') + '</td></tr>';
            });
          })
          .catch(() => {
            document.getElementById('estado').textContent = 'Error al conectar con el servidor.';
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
      attributes: ['cn', 'uid', 'mail'],
    });
    await client.unbind();
    res.json(searchEntries);
  } catch (err) {
    console.error('Error LDAP:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));