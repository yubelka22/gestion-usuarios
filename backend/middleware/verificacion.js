const API_SECRET = process.env.API_SECRET || 'clave_secreta_makerspace';

const verificarClave = (req, res, next) => {
  const clave = req.headers['x-api-key'];
  if (!clave || clave !== API_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
};

const verificarSesion = (req, res, next) => {
  if (!req.session.autenticado) {
    return res.redirect('/login');
  }
  next();
};

module.exports = { verificarClave, verificarSesion };