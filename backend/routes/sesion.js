const express = require('express');
const router = express.Router();
const path = require('path');
const { registrarAuditoria } = require('../config/database');
const { verificarSesion } = require('../middleware/verificacion');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Pantalla principal
router.get('/', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'index.html'));
});

// Pantalla de login
router.get('/login', (req, res) => {
  if (req.session.autenticado) return res.redirect('/');
  res.sendFile(path.join('/app', 'frontend', 'login.html'));
});

// Procesar login
router.post('/login', async (req, res) => {
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

// Cerrar sesion
router.get('/logout', async (req, res) => {
  const usuario = req.session.usuario || 'desconocido';
  await registrarAuditoria(usuario, 'LOGOUT', 'Cierre de sesion');
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;