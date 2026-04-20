# Gestión de Usuarios - Zaragoza Maker Space

Sistema de gestión de identidades y accesos para el Zaragoza Maker Space.

## ¿Qué hace este proyecto?

- Gestiona usuarios del makerspace usando LLDAP como directorio
- Muestra un panel web con todos los usuarios
- Permite crear y borrar usuarios desde la web
- Organiza usuarios por roles: socios, junta y voluntarios
- Incluye buscador y filtros por rol

## Tecnologías usadas

- **LLDAP** — servidor LDAP ligero con interfaz web moderna
- **Node.js** — backend que conecta con LDAP
- **Express** — servidor web
- **Docker** — para levantar todos los servicios

## Requisitos

- Docker Desktop instalado

## Cómo levantarlo

1. Clona el repositorio
2. Abre una terminal en la carpeta del proyecto
3. Ejecuta:

```bash
docker-compose up --build
```

4. Abre el navegador en **http://localhost:3000**

## Servicios disponibles

| Servicio | URL |
|---|---|
| Panel de usuarios | http://localhost:3000 |
| Administración LLDAP | http://localhost:17170 |

## Credenciales por defecto

- **Usuario admin LLDAP:** admin
- **Contraseña:** admin123