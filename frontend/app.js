const API_KEY = 'clave_secreta_makerspace';
let todosLosUsuarios = [];
let filtroActual = 'todos';

const estadoEtiquetas = {
  socio_pagado: 'Socio (pagado)',
  socio_impago: 'Socio (impago)',
  estudiante: 'Estudiante',
  voluntario: 'Voluntario',
  honorifico: 'Honorifico',
  fines_semana: 'Fines de semana',
  junior: 'Junior'
};

const estadoColores = {
  socio_pagado: 'badge-socios',
  socio_impago: 'badge-impago',
  estudiante: 'badge-estudiante',
  voluntario: 'badge-voluntarios',
  honorifico: 'badge-honorifico',
  fines_semana: 'badge-fines',
  junior: 'badge-junior'
};

function getBadge(rol) {
  if (!rol) return '<span class="badge badge-sin-grupo">Sin grupo</span>';
  return '<span class="badge badge-' + rol.toLowerCase() + '">' + rol + '</span>';
}

function getEstadoBadge(estado) {
  const etiqueta = estadoEtiquetas[estado] || estado;
  const color = estadoColores[estado] || 'badge-sin-grupo';
  return '<span class="badge ' + color + '">' + etiqueta + '</span>';
}

function getAccesoBadge(acceso) {
  if (acceso) return '<span class="badge badge-socios">Activo</span>';
  return '<span class="badge badge-impago">Sin acceso</span>';
}

function actualizarStats(data) {
  document.getElementById('stat-total').textContent = data.length;
  document.getElementById('stat-socios').textContent = data.filter(u => u.grupos && u.grupos.includes('socios')).length;
  document.getElementById('stat-junta').textContent = data.filter(u => u.grupos && u.grupos.includes('junta')).length;
  document.getElementById('stat-voluntarios').textContent = data.filter(u => u.grupos && u.grupos.includes('voluntarios')).length;

  const impagos = data.filter(u => u.estado === 'socio_impago');
  const aviso = document.getElementById('aviso-impagos');
  if (impagos.length > 0) {
    aviso.style.display = 'block';
    aviso.innerHTML = '<strong>Aviso:</strong> Hay ' + impagos.length + ' usuario(s) con impago pendiente: ' +
      impagos.map(u => '<strong>' + u.nombre + ' ' + u.apellido + '</strong>').join(', ') + '. Revisa la tabla.';
  } else {
    aviso.style.display = 'none';
  }
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
    : todosLosUsuarios.filter(u => filtroActual === 'sin grupo'
        ? (!u.grupos || u.grupos.length === 0)
        : (u.grupos && u.grupos.includes(filtroActual)));

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
    cuerpo.innerHTML = '<tr><td colspan="8" class="sin-resultados">No se encontraron usuarios</td></tr>';
    return;
  }

  filtrados.forEach((u, index) => {
    const tr = document.createElement('tr');
    const btnAcceso = u.acceso
      ? '<button class="btn-retirar-acceso" data-uid="' + u.uid + '">Retirar acceso</button>'
      : '<button class="btn-conceder-acceso" data-uid="' + u.uid + '">Conceder acceso</button>';
    tr.innerHTML =
      '<td>' + (u.nombre || '-') + '</td>' +
      '<td>' + (u.apellido || '-') + '</td>' +
      '<td><strong>' + u.uid + '</strong></td>' +
      '<td>' + (u.email || '-') + '</td>' +
      '<td>' + (u.grupos && u.grupos.length > 0 ? u.grupos.map(g => getBadge(g)).join(' ') : getBadge(null)) + '</td>' +
      '<td>' + getEstadoBadge(u.estado) + '</td>' +
      '<td>' + getAccesoBadge(u.acceso) + '</td>' +
      '<td>' +
        '<button class="btn-editar" data-index="' + index + '">Editar</button>' +
        '<button class="btn-borrar" data-uid="' + u.uid + '">Borrar</button>' +
        btnAcceso +
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

  document.querySelectorAll('.btn-conceder-acceso').forEach(btn => {
    btn.addEventListener('click', function() {
      cambiarAcceso(this.dataset.uid, true);
    });
  });

  document.querySelectorAll('.btn-retirar-acceso').forEach(btn => {
    btn.addEventListener('click', function() {
      cambiarAcceso(this.dataset.uid, false);
    });
  });
}

function cambiarAcceso(uid, acceso) {
  const accion = acceso ? 'conceder acceso' : 'retirar acceso';
  if (!confirm('Seguro que quieres ' + accion + ' a ' + uid + '?')) return;
  fetch('/api/usuarios/' + uid + '/acceso', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ acceso })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) cargarUsuarios();
  });
}

function abrirModal(u) {
  document.getElementById('edit-uid').value = u.uid;
  document.getElementById('edit-nombre').value = u.nombre || '';
  document.getElementById('edit-apellido').value = u.apellido || '';
  document.getElementById('edit-email').value = u.email || '';
  document.getElementById('edit-estado').value = u.estado || 'socio_pagado';

  document.querySelectorAll('input[name="grupo"]').forEach(cb => {
    cb.checked = false;
  });

  if (u.grupos && u.grupos.length > 0) {
    u.grupos.forEach(g => {
      const cb = document.querySelector(`input[name="grupo"][value="${g}"]`);
      if (cb) cb.checked = true;
    });
  }

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
  const estado = document.getElementById('edit-estado').value;
  const mensaje = document.getElementById('mensaje-modal');

  const gruposSeleccionados = [];
  document.querySelectorAll('input[name="grupo"]:checked').forEach(cb => {
    gruposSeleccionados.push(cb.value);
  });

  const usuarioActual = todosLosUsuarios.find(u => u.uid === uid);
  const gruposViejos = usuarioActual?.grupos || [];

  fetch('/api/usuarios/' + uid, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ nombre, apellido, email, grupos: gruposSeleccionados, gruposViejos })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      return fetch('/api/usuarios/' + uid + '/estado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ estado })
      });
    } else {
      throw new Error(data.error);
    }
  })
  .then(r => r.json())
  .then(data => {
    mensaje.style.display = 'block';
    if (data.ok) {
      mensaje.className = 'mensaje exito';
      mensaje.textContent = 'Usuario actualizado correctamente';
      setTimeout(() => { cerrarModal(); cargarUsuarios(); }, 1000);
    } else {
      throw new Error(data.error);
    }
  })
  .catch(err => {
    mensaje.style.display = 'block';
    mensaje.className = 'mensaje error';
    mensaje.textContent = 'Error: ' + err.message;
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