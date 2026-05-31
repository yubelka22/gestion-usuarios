const express = require('express');
const router = express.Router();
const { pool, registrarAuditoria } = require('../config/database');
const { verificarClave, verificarSesion } = require('../middleware/verificacion');

// Obtener todos los estados disponibles
router.get('/', verificarSesion, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estados_disponibles ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo estados' });
  }
});

// Crear un nuevo estado
router.post('/', verificarClave, async (req, res) => {
  const { codigo, etiqueta } = req.body;
  if (!codigo || !etiqueta) {
    return res.status(400).json({ error: 'El codigo y la etiqueta son obligatorios' });
  }
  if (!/^[a-z0-9_]+$/.test(codigo)) {
    return res.status(400).json({ error: 'El codigo solo puede contener letras minusculas numeros y guiones bajos' });
  }
  try {
    await pool.query(
      'INSERT INTO estados_disponibles (codigo, etiqueta) VALUES ($1, $2)',
      [codigo, etiqueta]
    );
    await registrarAuditoria('admin', 'CREAR_ESTADO', `Estado creado: ${codigo} (${etiqueta})`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error creando estado:', err.message);
    res.status(500).json({ error: 'Error al crear el estado' });
  }
});

// Borrar un estado
router.delete('/:id', verificarClave, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM estados_disponibles WHERE id = $1', [id]);
    await registrarAuditoria('admin', 'BORRAR_ESTADO', `Estado borrado: ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando estado:', err.message);
    res.status(500).json({ error: 'Error al borrar el estado' });
  }
});

module.exports = router;