# Sistema de Gestión de Proyectos, Iniciativas y Demandas Digitales

Plataforma custom de la **Gerencia de Desarrollo de Plataformas Digitales** para gobernar el
ciclo de vida completo de las solicitudes informáticas: 8 fases, RBAC por rol, trazabilidad
inmutable e indicadores de Time to Market, Lead Time y Cycle Time.

**Estado actual: esqueleto (fase 1).** El modelo de datos, el instalador, el motor de permisos
y el armazón de la SPA están completos y desplegables. La lógica de escritura, Drive, Chat,
correo y métricas está declarada con su contrato y marcada `TODO(fase-2)`.

---

## 1. Arquitectura

| Capa | Tecnología |
| --- | --- |
| Frontend | SPA HTML5 + Tailwind CSS servida por `HtmlService` |
| Backend | Google Apps Script (V8), `doGet` / `doPost` |
| Persistencia | 2 libros de Google Sheets (maestros + transaccional) |
| Archivos | Google Drive — Unidad Compartida `1ib9cr7o47ecPQ3KSpcAn_mBjiY9LzqaY` |
| Notificaciones | Google Chat (webhook) + Gmail (`MailApp`) |

## 2. Estructura del repositorio

```
apps-script/
├── appsscript.json    Manifiesto (zona horaria, scopes OAuth, acceso web)
├── Config.gs          Configuración central y accesores de PropertiesService
├── Esquema.gs         Modelo de datos declarativo: tablas, columnas y catálogos
├── Rbac.gs            Matriz de permisos rol × fase y validación de transiciones
├── Setup.gs           Instalador idempotente: crea libros, hojas y catálogos
├── Codigo.gs          API del backend: sesión, acceso a datos y endpoints
├── Index.html         Contenedor SPA: navbar, router y arranque de sesión
├── Home.html          Página 1 — Dashboard gerencial
├── Iniciativas.html   Página 2 — Iniciativas de negocio
├── Gestion.html       Página 3 — Tablero Kanban de 8 fases
├── Reportes.html      Página 4 — Trazabilidad y métricas
└── Admin.html         Página 5 — CRUD de parametrización
docs/
├── MODELO_DATOS.md    Diccionario de datos de las 15 tablas
└── DECISIONES.md      Decisiones de diseño y supuestos abiertos
```

> El documento funcional describía un único `Codigo.gs`. Se separó en `Config`, `Esquema`,
> `Rbac` y `Setup` porque Apps Script carga todos los `.gs` en un mismo espacio global: la
> división es organizativa y no altera la arquitectura modular acordada.

## 3. Despliegue

### 3.1 Requisitos

- Cuenta de Google Workspace corporativa con acceso a la Unidad Compartida.
- Node.js y [clasp](https://github.com/google/clasp): `npm install -g @google/clasp`.

### 3.2 Pasos

```bash
clasp login
clasp create --type webapp --title "Plataformas Digitales" --rootDir apps-script
# Copie el scriptId generado en .clasp.json
clasp push
clasp open
```

En el editor de Apps Script:

1. Ejecute **`setupInicial()`** una vez. Crea los dos libros, las 14 hojas con sus
   encabezados, siembra los catálogos y crea la plantilla de requerimiento. Es idempotente:
   puede volver a ejecutarse sin duplicar datos.
2. Ejecute **`validarInstalacion()`** para confirmar que cada hoja y encabezado coincide con
   el esquema.
3. Registre la configuración que el instalador no puede deducir:

```javascript
guardarConfiguracion({
  CHAT_WEBHOOK_URL: 'https://chat.googleapis.com/v1/spaces/.../messages?key=...',
  DOMINIO_CORPORATIVO: 'micompania.com.co'
});
```

4. Cargue los datos de negocio desde la página **Admin** (o directamente en las hojas):
   `Usuarios` (con su `Rol_ID`), `Proyectos` y `Aplicaciones`.
5. **Implementar > Nueva implementación > Aplicación web**, ejecutando como
   *usuario que accede* y con acceso restringido al dominio.

> Si ya existen los libros de Sheets, no ejecute el instalador en blanco: registre primero
> sus IDs con `guardarConfiguracion({ ID_LIBRO_PARAMETRIZACION: '...', ID_LIBRO_TRANSACCIONAL: '...' })`
> y luego ejecute `setupInicial()`, que los reutilizará y solo agregará lo que falte.

## 4. Configuración

| Clave (Script Property) | Obligatoria | Origen |
| --- | --- | --- |
| `ID_LIBRO_PARAMETRIZACION` | Sí | La crea `setupInicial()` |
| `ID_LIBRO_TRANSACCIONAL` | Sí | La crea `setupInicial()` |
| `ID_PLANTILLA_REQUERIMIENTO` | Sí | La crea `setupInicial()` |
| `CHAT_WEBHOOK_URL` | No | Manual — espacio de Google Chat |
| `DOMINIO_CORPORATIVO` | No | Manual — restringe el SSO |

`diagnosticoConfiguracion()` devuelve en cualquier momento qué está configurado y qué falta.

## 5. Alcance pendiente (fase 2)

- `crearSolicitud`, `actualizarSolicitud`, `cambiarFaseSolicitud`, `marcarBloqueo`.
- `registrarTransicionAudit` con cálculo de `Horas_En_Fase`.
- `crearContenedorDrive_`: carpeta con nomenclatura oficial + clonación de la plantilla.
- `notificarChat_` (tarjetas `cardsV2`) y `notificarCorreo_` (HTML corporativo).
- `getMetricasHome` y `getReportes`: Lead Time, Cycle Time y cumplimiento de SLA.
- CRUD de escritura en la página Admin.
- Kanban: render de columnas y tarjetas, drag & drop y modal de detalle.
- Guía de configuración de AppSheet sobre las mismas hojas (no es generable por código).
