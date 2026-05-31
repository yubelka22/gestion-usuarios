const express = require('express');
const session = require('express-session');
const path = require('path');
const { inicializarDB } = require('./config/database');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'session_secreta_makerspace',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

app.use(express.static(path.join('/app', 'frontend')));

const sesionRoutes = require('./routes/sesion');
const usuariosRoutes = require('./routes/usuarios');
const auditoriaRoutes = require('./routes/auditoria');
const estadosRoutes = require('./routes/estados');

app.use('/', sesionRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/auditoria', auditoriaRoutes);
app.use('/api/estados', estadosRoutes);

inicializarDB();
app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));