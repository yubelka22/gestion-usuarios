# Gestión de Usuarios - Zaragoza Maker Space

Sistema IAM para el Zaragoza Maker Space, desarrollado como proyecto de prácticas.

## ¿Qué hace?

Permite gestionar los usuarios del makerspace desde un panel web. Se pueden crear, editar y borrar usuarios, asignarles grupos y consultar un historial de todas las acciones realizadas.

## Tecnologías

- LLDAP para el directorio de usuarios
- Node.js y Express para el backend
- Postgres para guardar el historial de auditoría
- Docker para levantar todo junto
- GraphQL para gestionar los grupos desde LLDAP

## Cómo levantarlo

Necesitas tener Docker Desktop instalado.

1. Clona el repositorio
2. Copia `.env.example` a `.env` y edita los valores
3. Ejecuta `docker-compose up --build`
4. Abre http://localhost:3000 en el navegador

## Accesos

- Panel de gestión: http://localhost:3000
- Interfaz LLDAP: http://localhost:17170
- Usuario por defecto: admin / admin123

## Seguridad

El panel requiere login para acceder. Las credenciales y secretos van en `.env` que no se sube a GitHub. La API está protegida con una clave secreta y LLDAP solo es accesible desde dentro de Docker.