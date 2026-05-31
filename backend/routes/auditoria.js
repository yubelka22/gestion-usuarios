const express = require('express');
const router = express.Router();
const path = require('path');
const { pool } = require('../config/database');
const { verificarSesion } = require('../middleware/verificacion');

router.get('/', verificarSesion, (req, res) => {
  res.sendFile(path.join('/app', 'frontend', 'auditoria.html'));
});

router.get('/api', verificarSesion, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM auditoria ORDER BY fecha DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo el historial' });
  }
});

module.exports = router;