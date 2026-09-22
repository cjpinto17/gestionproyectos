# Diccionario de datos

14 tablas distribuidas en dos libros de Google Sheets. La fuente de verdad ejecutable es
`apps-script/Esquema.gs`; este documento es su lectura funcional.

## Libro 1 — `Parametrizacion_Plataformas_Completo`

### `Usuarios`
| Campo | Tipo | Notas |
| --- | --- | --- |
| `Correo_ID` | email | **PK** — correo corporativo |
| `Nombre_Completo` | text | |
| `Cargo` | text | |
| `Area` | text | |
| `Rol_ID` | enum → `Roles` | Determina el alcance operativo |
| `Activo` | SÍ/NO | Campo añadido (ver D-06) |

### `Roles`
`ID_Rol` (PK), `Nombre_Rol`, `Permisos_Fase`, `Permisos_Edicion`.
Ocho roles: `RO-01` Solicitante, `RO-02` Product Owner, `RO-03` Analista Fábrica,
`RO-04` Desarrollador, `RO-05` Analista QA, `RO-06` Equipo UAT, `RO-07` Comité CAB,
`RO-08` Administrador.

### `Proyectos`
`ID_Proyecto` (PK), `Nombre_Proyecto`, `Descripcion`, `Fecha_Inicio`,
`Fecha_Fin_Estimada`, `Estado_Proyecto` (*Activo* / *Cerrado* / *Pausado*).

### `Plataforma_Digital`
`ID_Plataforma` (PK), `Nombre_Plataforma`.
Catálogo: Analizamos, Aseguramos, Banca Movil, Notificamos, Talanquera.

### `Aplicaciones`
`ID_Aplicacion` (PK), `Nombre_Aplicacion`, `Plataforma_ID` (FK → `Plataforma_Digital`).

### `Fases`
`ID_Fase` (PK), `Nombre_Fase`, `Orden_Fase` (1–8).

| ID | Fase | Orden |
| --- | --- | --- |
| `FAS-01` | Gestión de la demanda | 1 |
| `FAS-02` | Backlog | 2 |
| `FAS-03` | Análisis y diseño | 3 |
| `FAS-04` | Desarrollo | 4 |
| `FAS-05` | Pruebas QA | 5 |
| `FAS-06` | Pruebas UAT | 6 |
| `FAS-07` | Aceptación TI | 7 |
| `FAS-08` | Producción | 8 |

### `Estados`
`ID_Estado` (PK), `Nombre_Estado`. Seis estados (ver decisión D-01).

### `Tipos_Solicitud`
`ID_Tipo` (PK), `Nombre_Tipo`: Nueva funcionalidad, Mejora en una funcionalidad, Ajuste.

### `Prioridad`
`ID_Prioridad` (PK), `Nombre_Prioridad`: Crítica, Alta, Media, Baja.

### `Causales_Bloqueo`
`ID_Causal` (PK), `Nombre_Causal`: Falta de capacidad, Falta de aprobación, Dependencia.

### `SLA_Fases` *(tabla nueva)*
`ID_Fase` (PK, FK → `Fases`), `Nombre_Fase`, `SLA_Dias`.

---

## Libro 2 — `Gestion_Proyectos_Plataformas`

### `Solicitudes`
Entidad central. PK `ID_Solicitud` con formato `SOL-YYYYMMDD-XXX`.

**Identificación:** `ID_Solicitud`, `Fecha_Registro`, `Nombre_Solicitud`, `Objetivo`,
`Entregable`, `Proceso_Impactado`.

**Clasificación:** `ID_Proyecto`, `ID_Aplicacion`, `Solicitante_Correo`, `Tipo_Solicitud`,
`Prioridad`, `Plataforma`.

**Documentación:** `Doc_Requerimiento_URL`, `Carpeta_Drive_URL`, `Link_Taiga`.

**Control de flujo:** `Fase_Actual`, `Estado_Actual`, `Tiene_Bloqueo` (SÍ/NO),
`Causal_Bloqueo`, `Responsable_Actual`, `Version_Semantica`, `Fecha_Ultimo_Cambio`.

**Estampas de tiempo:** `Fecha_Inicio_Analisis`, `Fecha_Fin_Analisis`, `Fecha_Inicio_Dev`,
`Fecha_Fin_Dev`, `Fecha_Inicio_QA`, `Fecha_Fin_QA`, `Fecha_Inicio_UAT`, `Fecha_Fin_UAT`,
`Fecha_Socializacion`, `Fecha_Despliegue`.

### `Auditoria_Transiciones` *(inmutable — solo append)*
`ID_Auditoria` (PK, `AUD-<timestamp>`), `ID_Solicitud`, `Fase_Origen`, `Fase_Destino`,
`Estado_Origen`, `Estado_Destino`, `Fecha_Hora_Cambio`, `Usuario_Responsable`,
`Horas_En_Fase`.

### `Roadmap_Versiones`
`ID_Version` (PK, `VER-<timestamp>`), `ID_Aplicacion`, `Numero_Version`,
`Estado_Release` (*Planeada* / *En Produccion*), `Fecha_Planeada`, `Fecha_Despliegue_Real`.

---

## Métricas derivadas

- **Lead Time / Time to Market:** `Fecha_Despliegue − Fecha_Registro`.
- **Cycle Time por fase:** suma de `Horas_En_Fase` en `Auditoria_Transiciones`, agrupada por
  `Fase_Origen`.
- **Cumplimiento de SLA:** `Cycle Time` de cada fase contra `SLA_Fases.SLA_Dias`.
