const express = require('express');
const router = express.Router();
const { Client } = require('ldapts');
const fetch = require('node-fetch');
const { pool, registrarAuditoria } = require('../config/database');
const { verificarClave } = require('../middleware/verificacion');

const LDAP_URL = 'ldap://lldap:3890';
const BASE_DN = `ou=people,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const GROUPS_DN = `ou=groups,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const BIND_DN = `uid=admin,ou=people,${process.env.LLDAP_LDAP_BASE_DN || 'dc=makerspace,dc=local'}`;
const BIND_PASS = process.env.LDAP_BIND_PASSWORD || 'admin123';
const LLDAP_URL = 'http://lldap:17170';

const str = (val) => Array.isArray(val) ? (val[0] || '') : (val || '');

async function obtenerToken() {
  const resp = await fetch(`${LLDAP_URL}/auth/simple/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: BIND_PASS })
  });
  const data = await resp.json();
  return data.token;
}

async function cambiarGrupos(uid, gruposNuevos, gruposViejos) {
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

    // Quitar de grupos que ya no corresponden
    for (const grupoViejo of gruposViejos) {
      if (!gruposNuevos.includes(grupoViejo)) {
        const grupoObj = grupos.find(g => g.displayName === grupoViejo);
        if (grupoObj) {
          const mutation = `mutation { removeUserFromGroup(userId: "${uid}", groupId: ${grupoObj.id}) { ok } }`;
          await fetch(`${LLDAP_URL}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ query: mutation })
          });
        }
      }
    }

    // Añadir todos los grupos nuevos
    for (const grupoNuevo of gruposNuevos) {
      const grupoObj = grupos.find(g => g.displayName === grupoNuevo);
      if (grupoObj) {
        const mutation = `mutation { addUserToGroup(userId: "${uid}", groupId: ${grupoObj.id}) { ok } }`;
        await fetch(`${LLDAP_URL}/api/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ query: mutation })
        });
      }
    }
  } catch (err) {
    console.error('Error cambiando grupos:', err.message);
  }
}

router.get('/', async (req, res) => {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASS);
    const { searchEntries: usuarios } = await client.search(BASE_DN, {
      scope: 'sub',
      filter: '(objectClass=person)',
      attributes: ['cn', 'uid', 'mail', 'givenName', 'sn', 'displayName'],
    });
    const { searchEntries: gruposLDAP } = await client.search(GROUPS_DN, {
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
      const gruposUsuario = gruposLDAP
        .filter(g => {
          if (!g.member) return false;
          const members = Array.isArray(g.member) ? g.member : [g.member];
          return members.some(m => m.includes('uid=' + uid));
        })
        .map(g => str(g.cn))
        .filter(g => !g.startsWith('lldap'));

      return {
        uid,
        nombre: str(u.givenName),
        apellido: str(u.sn),
        nombreCompleto: str(u.cn) || str(u.displayName),
        email: str(u.mail),
        grupos: gruposUsuario,
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

router.post('/', verificarClave, async (req, res) => {
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

router.put('/:uid', verificarClave, async (req, res) => {
  const { nombre, apellido, email, grupos, gruposViejos } = req.body;
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
    await cambiarGrupos(uid, grupos || [], gruposViejos || []);
    await registrarAuditoria('admin', 'EDITAR_USUARIO', `Usuario editado: ${uid} | Grupos: ${(gruposViejos || []).join(', ')} -> ${(grupos || []).join(', ') || 'sin grupo'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error editando usuario:', err.message);
    await registrarAuditoria('admin', 'ERROR', `Error al editar usuario ${uid}: ${err.message}`);
    res.status(500).json({ error: 'Error al editar el usuario' });
  }
});

router.delete('/:uid', verificarClave, async (req, res) => {
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

router.put('/:uid/estado', verificarClave, async (req, res) => {
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

router.put('/:uid/acceso', verificarClave, async (req, res) => {
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

module.exports = router;