# Comparativa: OpenLDAP vs LLDAP

## ¿Por qué necesitamos un servidor LDAP?

En este proyecto necesitamos un sistema centralizado para gestionar los usuarios del Zaragoza Maker Space. LDAP (Lightweight Directory Access Protocol) es el protocolo estándar para esto — permite guardar usuarios, contraseñas y roles en un directorio central al que pueden conectarse distintos servicios.

## OpenLDAP

OpenLDAP es la implementación de LDAP más antigua y extendida. Lo probé al principio del proyecto y estas fueron mis conclusiones:

**Lo bueno:**
- Es muy conocido y hay mucha documentación
- Es muy flexible y configurable
- Se usa en empresas grandes

**Lo malo:**
- La interfaz web (phpLDAPadmin) es muy antigua y difícil de usar
- La configuración es complicada, con muchos archivos y comandos
- Para tareas sencillas como crear un usuario hay que conocer bien la estructura LDAP
- Me costó mucho tiempo configurarlo correctamente

## LLDAP

LLDAP es una alternativa moderna y ligera a OpenLDAP. Lo descubrí tras hablar con mi tutor y decidimos cambiarlo.

**Lo bueno:**
- Interfaz web moderna, limpia y en español
- Muy fácil de configurar con Docker
- Crear y gestionar usuarios es intuitivo
- Pensado para proyectos self-hosted como este
- Consume muy pocos recursos

**Lo malo:**
- Es más nuevo y tiene menos documentación
- No soporta todas las funciones avanzadas de OpenLDAP
- Algunos atributos LDAP estándar no funcionan igual

## ¿Por qué elegí LLDAP?

Para este proyecto LLDAP es la mejor opción porque:

1. El Zaragoza Maker Space no necesita las funciones avanzadas de OpenLDAP
2. Es mucho más fácil de mantener para personas sin experiencia en LDAP
3. La interfaz web permite gestionar usuarios sin conocer comandos
4. Se integra perfectamente con Node.js a través del puerto 389

## Conclusión

OpenLDAP es más potente pero innecesariamente complejo para este caso de uso. LLDAP cubre todos los requisitos del proyecto con mucha menos complejidad, lo que facilita el mantenimiento futuro del sistema.