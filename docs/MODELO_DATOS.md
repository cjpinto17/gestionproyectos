# Diccionario de datos

17 tablas distribuidas en dos libros de Google Sheets. La fuente de verdad ejecutable es
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

### `Proyectos` *(las "iniciativas" del negocio)*
| Campo | Tipo | Notas |
| --- | --- | --- |
| `ID_Proyecto` | text | **PK** — formato `INI-001` |
| `Nombre_Proyecto` | text | |
| `Descripcion` | longtext | |
| `Prioridad` | enum → `Prioridad` | Crítica / Alta / Media / Baja |
| `Tipo_Iniciativa` | enum → `Tipos_Iniciativa` | |
| `BO_Correo` | email → `Usuarios` | Business Owner |
| `PO_Correo` | email → `Usuarios` | Product Owner |
| `LEN_ID` | enum → `Lineas_Estrategicas` | Columna de la matriz |
| `Vertical_ID` | enum → `Verticales` | Fila de la matriz |
| `Fecha_Estimada` | date | |
| `Fecha_Inicio` | date | |
| `Fecha_Fin_Estimada` | date | |
| `Estado_Proyecto` | enum → `Estados` | Mismo catálogo de 6 estados |
| `ID_Aplicacion` | enum → `Aplicaciones` | Aplicación principal |

Cargada con las 39 iniciativas reales del portafolio.

### `Lineas_Estrategicas`
`ID_LEN` (PK), `Nombre_LEN`, `Orden_LEN`.
Catálogo: **Transversal**, Ingreso estable, Agro, Desarrollo empresarial,
Mi negocio independiente.

### `Verticales`
`ID_Vertical` (PK), `Nombre_Vertical`, `Orden_Vertical`.
Catálogo: **Transversal**, Crédito, Ahorro e Inversión, Protección, Servicio de Recaudo.

### `Tipos_Iniciativa` *(tabla nueva)*
`ID_Tipo_Iniciativa` (PK), `Nombre_Tipo_Iniciativa`.
Catálogo: Negocio, Normativo, Habilitador Técnico, Experiencia de cliente,
Innovación con propósito.

### `Plataforma_Digital`
`ID_Plataforma` (PK), `Nombre_Plataforma`.
Catálogo real: Analizamos (`PL-01`), Aseguramos (`PL-02`), Banca Movil (`PL-03`),
Notificamos (`PL-04`), Talanquera (`PL-05`), Configuramos (`PL-06`), Shivam (`PL-07`),
Portal Empresarial (`PL-08`).

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
`Causal_Bloqueo`, `Observacion_Bloqueo` (texto libre opcional: qué está trabando la solicitud;
se borra al levantar el bloqueo), `Responsable_Actual`, `Version_Semantica`,
`Fecha_Ultimo_Cambio`.

**Estampas de tiempo:** `Fecha_Inicio_Analisis`, `Fecha_Fin_Analisis`, `Fecha_Inicio_Dev`,
`Fecha_Fin_Dev`, `Fecha_Inicio_QA`, `Fecha_Fin_QA`, `Fecha_Inicio_UAT`, `Fecha_Fin_UAT`,
`Fecha_Socializacion`, `Fecha_Despliegue`.

### `Auditoria_Transiciones` *(inmutable — solo append)*
`ID_Auditoria` (PK, `AUD-<timestamp>`), `ID_Solicitud`, `Fase_Origen`, `Fase_Destino`,
`Estado_Origen`, `Estado_Destino`, `Fecha_Hora_Cambio`, `Usuario_Responsable`,
`Horas_En_Fase`.

`Fase_Origen` y `Fase_Destino` guardan el **ID** de fase (`FAS-01`…`FAS-08`), no el
nombre: así un renombre del catálogo no rompe el histórico (ver decisión D-09).

### `Roadmap_Versiones`
`ID_Version` (PK, `VER-<timestamp>`), `ID_Aplicacion`, `Plataforma`, `Numero_Version`,
`Estado_Release` (*Planeada* / *En Produccion*), `Fecha_Planeada`, `Fecha_Despliegue_Real`.

---

## Indicadores derivados

Todos se calculan en `apps-script/Metricas.gs` a partir de las hojas. Ninguno usa
constantes quemadas; si falta el dato, el indicador devuelve `null`.

### Velocidad de entrega
| Indicador | Fórmula | Origen |
| --- | --- | --- |
| Lead Time / Time to Market | `Fecha_Despliegue − Fecha_Registro` (promedio, mediana y P85) | `Solicitudes` |
| Throughput mensual | Actividades desplegadas por mes | `Solicitudes.Fecha_Despliegue` |
| Cycle Time por fase | Promedio de `Horas_En_Fase / 24` por `Fase_Origen` | `Auditoria_Transiciones` |
| Tiempo neto de construcción | `Fecha_Fin_Dev − Fecha_Inicio_Dev` | `Solicitudes` |

### Calidad y reproceso
| Indicador | Fórmula | Origen |
| --- | --- | --- |
| Tasa de reproceso | Transiciones con `orden(destino) < orden(origen)` ÷ total de transiciones | `Auditoria_Transiciones` |
| First Pass Yield | Actividades en producción que nunca retrocedieron ÷ total en producción | `Auditoria` + `Solicitudes` |
| Devoluciones QA / UAT | Retrocesos cuyo `Fase_Origen` es `FAS-05` / `FAS-06` | `Auditoria_Transiciones` |

### Predictibilidad
| Indicador | Fórmula | Origen |
| --- | --- | --- |
| Cumplimiento de SLA por fase | % de transiciones con `Horas_En_Fase / 24 ≤ SLA_Dias` | `Auditoria` + `SLA_Fases` |
| Entregas en fecha | % de versiones con `Fecha_Despliegue_Real ≤ Fecha_Planeada` | `Roadmap_Versiones` |
| Desvío promedio | `Fecha_Despliegue_Real − Fecha_Planeada` en días | `Roadmap_Versiones` |
| Eficiencia de flujo | `(Lead Time − horas bloqueada) ÷ Lead Time` | `Auditoria` + `Solicitudes` |

### Carga de trabajo
| Indicador | Fórmula | Origen |
| --- | --- | --- |
| WIP | Actividades en fases 3 a 7, total y por responsable | `Solicitudes.Fase_Actual` |
| Tiempo esperado de entrega | `WIP ÷ throughput diario` (ley de Little) | derivado |
| Demanda vs. entrega | Registradas por mes contra desplegadas por mes | `Solicitudes` |
| Actividades estancadas | Días en la fase actual > `SLA_Dias` de esa fase | `Solicitudes` + `SLA_Fases` |
| Bloqueos activos | `Tiene_Bloqueo = SÍ` entre las actividades en vuelo, por causal | `Solicitudes` |
