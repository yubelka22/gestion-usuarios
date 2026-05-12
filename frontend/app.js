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