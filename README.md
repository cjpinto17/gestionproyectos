# Sistema de Gestión de Proyectos, Iniciativas y Demandas Digitales

Plataforma custom de la **Gerencia de Desarrollo de Plataformas Digitales** para gobernar el
ciclo de vida completo de las solicitudes informáticas: 8 fases, RBAC por rol, trazabilidad
inmutable e indicadores de Time to Market, Lead Time y Cycle Time.

**Estado: funcional.** Modelo de datos, instalador, RBAC, indicadores, registro de
actividades con carpeta en Drive, tablero con arrastre, auditoría, notificaciones de Chat y
correo, y administración de catálogos.

---

## 1. Arquitectura

| Capa | Tecnología |
| --- | --- |
| Frontend | SPA HTML5 + CSS corporativo propio, servida por `HtmlService` (sin CDN externos) |
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
├── Metricas.gs        Motor de indicadores de la fábrica, calculados desde Sheets
├── Setup.gs           Instalador idempotente: crea libros, hojas y catálogos
├── DatosIniciales.gs  Data real: 8 plataformas y las 39 iniciativas del portafolio
├── Codigo.gs          API del backend: sesión, datos, escrituras, Drive y avisos
├── Festivos.gs        Calendario laboral colombiano y días hábiles
├── Index.html         Contenedor SPA: navbar, router y arranque de sesión
├── Estilos.html       Hoja de estilos corporativa (sin CDN externos)
├── Scripts.html       Lógica de la interfaz: render, arrastre y formularios
├── Home.html          Página 1 — Dashboard gerencial e indicadores
├── Iniciativas.html   Página 2 — Matriz Vertical × LEN (solo lectura)
├── Gestion.html       Página 3 — Tablero Kanban de 8 fases
├── Roadmap.html       Página 4 — Roadmap de versiones por plataforma
├── Reportes.html      Página 5 — Actividad mensual y auditoría
└── Admin.html         Página 6 — CRUD de parametrización
docs/
├── MODELO_DATOS.md    Diccionario de datos de las 15 tablas
└── DECISIONES.md      Decisiones de diseño y supuestos abiertos
```

> El documento funcional describía un único `Codigo.gs`. Se separó en `Config`, `Esquema`,
> `Rbac`, `Metricas` y `Setup` porque Apps Script carga todos los `.gs` en un mismo espacio global: la
> división es organizativa y no altera la arquitectura modular acordada.

## 3. Despliegue

> **¿Vas a implementarlo tú?** El paso a paso completo, sin tecnicismos y con la conexión
> automática entre GitHub y Google, está en **[docs/IMPLEMENTACION.md](docs/IMPLEMENTACION.md)**.
> Lo de abajo es el resumen técnico.

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

1. Ejecute **`setupInicial()`** una vez. Crea los dos libros, las 17 hojas con sus
   encabezados, siembra los catálogos y crea la plantilla de requerimiento. Es idempotente:
   puede volver a ejecutarse sin duplicar datos.
2. Ejecute **`validarInstalacion()`** para confirmar que cada hoja y encabezado coincide con
   el esquema.
3. Ejecute **`cargarDatosIniciales()`** para cargar la data real: las 8 plataformas, los
   Business Owner entregados y las 39 iniciativas del portafolio. Solo escribe en las hojas
   que estén vacías, así que es seguro volver a ejecutarla.
4. Registre la configuración que el instalador no puede deducir:

```javascript
guardarConfiguracion({
  CHAT_WEBHOOK_URL: 'https://chat.googleapis.com/v1/spaces/.../messages?key=...',
  DOMINIO_CORPORATIVO: 'micompania.com.co'
});
```

5. Complete desde la página **Admin** (o directamente en las hojas):
   el resto de `Usuarios` (con su `Rol_ID`) y el catálogo de `Aplicaciones`.
6. **Implementar > Nueva implementación > Aplicación web**, ejecutando como
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

## 5. Indicadores de la fábrica de software

`Metricas.gs` está **implementado** y calcula todo desde las hojas. `getMetricasHome(meses)`
devuelve cuatro bloques:

| Bloque | Indicadores |
| --- | --- |
| **Velocidad** | Lead Time (promedio, mediana, P85), throughput mensual, Cycle Time por fase contra SLA, tiempo neto de construcción |
| **Calidad** | First Pass Yield, tasa de reproceso, devoluciones de QA y de UAT |
| **Predictibilidad** | Cumplimiento de SLA por fase, entregas en la fecha comprometida, desvío promedio, eficiencia de flujo |
| **Carga** | WIP total y por responsable, backlog, tiempo esperado de entrega (ley de Little), demanda vs. entrega, actividades estancadas, bloqueos por causal |

Las fórmulas y su origen exacto están en [`docs/MODELO_DATOS.md`](docs/MODELO_DATOS.md).
`getReportes(meses)` entrega la actividad mensual por iniciativa y por fase;
`getRoadmapVersiones()` agrupa las versiones por plataforma; `getMatrizIniciativas()`
arma la matriz Vertical × LEN.

## 6. Estado de las funcionalidades

| Módulo | Estado |
| --- | --- |
| Instalador, catálogos y carga de la data real | Completo |
| RBAC por rol × fase, con validación en cliente y servidor | Completo |
| Registro de actividades + carpeta en Drive + documento clonado | Completo |
| Tablero Kanban con arrastre, bloqueos y detalle | Completo |
| Auditoría inmutable con horas calendario y días hábiles | Completo |
| Indicadores de la fábrica (4 bloques, 20 indicadores) | Completo |
| Matriz de iniciativas, roadmap de versiones y reportes mensuales | Completo |
| Notificaciones de Google Chat y correo HTML | Completo |
| CRUD de parametrización con integridad referencial | Completo |
| AppSheet sobre las mismas hojas | Pendiente: no es generable por código, requiere configuración manual |

## 7. Automatización del despliegue

`.github/workflows/desplegar-apps-script.yml` publica en Apps Script cada cambio que llegue a
la rama. Requiere tres secretos del repositorio: `CLASP_CREDENTIALS`, `SCRIPT_ID` y,
opcionalmente, `DEPLOYMENT_ID`. El procedimiento para obtenerlos está en
[docs/IMPLEMENTACION.md](docs/IMPLEMENTACION.md), parte 2.

El archivo `.clasp.json` del repositorio trae un `scriptId` de marcador: el flujo de GitHub lo
reescribe con el valor del secreto antes de publicar.
