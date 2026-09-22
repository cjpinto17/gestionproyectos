# Decisiones de diseño y supuestos abiertos

Registro de las decisiones tomadas sobre el documento de especificación funcional y de los
puntos que siguen esperando definición del negocio.

## Decisiones confirmadas

### D-01 · Estados unificados en 6
El §3 del documento habla de **6 estados operacionales**, pero la tabla `Estados` listaba
**7** (`EST-01` a `EST-07`), incluyendo *En proceso* y *En progreso* como duplicado
semántico. Se unificaron en seis:

| ID | Estado |
| --- | --- |
| `EST-01` | Por iniciar |
| `EST-02` | En progreso |
| `EST-03` | Aprobada |
| `EST-04` | Bloqueada |
| `EST-05` | Cancelada |
| `EST-06` | Terminada |

### D-02 · Retroceso de fase permitido
Una solicitud puede devolverse a una fase anterior (ej. *Pruebas QA* → *Desarrollo* por
hallazgos). La regla implementada en `validarTransicion()`:

- **Avanzar:** requiere permiso de edición sobre la fase **origen**, y solo una fase a la vez.
- **Retroceder:** requiere permiso de edición sobre la fase **destino**, sin límite de saltos.
- **Administrador (`RO-08`):** `override` total, puede saltar cualquier número de fases.
- Todo movimiento queda registrado en `Auditoria_Transiciones`, incluidos los retrocesos.

### D-03 · SLA parametrizable
El dashboard exige "% de cumplimiento de SLA por fase", pero el documento no define los días
objetivo. Se creó la tabla **`SLA_Fases`** (`ID_Fase`, `Nombre_Fase`, `SLA_Dias`), editable
desde la página Admin. Valores iniciales sugeridos, **pendientes de validación del negocio**:

| Fase | SLA sugerido (días hábiles) |
| --- | --- |
| Gestión de la demanda | 5 |
| Backlog | 10 |
| Análisis y diseño | 10 |
| Desarrollo | 15 |
| Pruebas QA | 5 |
| Pruebas UAT | 5 |
| Aceptación TI | 3 |
| Producción | 1 |

### D-04 · Zona horaria y formato
`America/Bogota`, formato `dd/MM/yyyy HH:mm`. Configurado en `appsscript.json`, en
`CONFIG.ZONA_HORARIA` y aplicado a los libros creados por el instalador.

### D-05 · Modelo de ejecución de la Web App
Despliegue como **"ejecutar como el usuario que accede"**, indispensable para que
`Session.getActiveUser().getEmail()` identifique al usuario real y el RBAC funcione. Implica
que cada usuario debe tener acceso de lectura a la Unidad Compartida y a los libros. La
alternativa ("ejecutar como yo") simplificaría los permisos de Drive pero rompería la
trazabilidad por usuario, por lo que se descartó.

### D-06 · Campos añadidos al modelo original
| Tabla | Campo | Motivo |
| --- | --- | --- |
| `Usuarios` | `Activo` | Desactivar usuarios sin borrar su histórico de auditoría |
| `Solicitudes` | `Fecha_Ultimo_Cambio` | Base del cálculo de `Horas_En_Fase`; sin él habría que recorrer toda la auditoría en cada transición |
| — | `SLA_Fases` (tabla nueva) | Ver D-03 |

### D-07 · Iniciativa vs. actividad
Se fija el vocabulario del sistema, alineado con el lenguaje del negocio:

- **Iniciativa** = fila de `Proyectos`. Es lo que se ve en la matriz de la página Iniciativas.
- **Actividad** = fila de `Solicitudes`. Es la tarjeta del Kanban de Gestión.

Una iniciativa agrupa N actividades a través de `Solicitudes.ID_Proyecto`.

### D-08 · Clasificación estratégica de las iniciativas
`Proyectos` incorpora `LEN_ID` y `Vertical_ID`, que son los dos ejes de la matriz:

| Eje | Catálogo | Valores |
| --- | --- | --- |
| Columnas | `Lineas_Estrategicas` | Ingreso estable · Agro · Desarrollo empresarial · Mi negocio independiente |
| Filas | `Verticales` | Crédito · Ahorro e inversión · Protección · Servicios de recaudo |

Las iniciativas sin clasificar no se pierden: caen en las claves `SIN_LEN` / `SIN_VERTICAL` y se muestran en una fila aparte de la matriz.

También se agregaron a `Proyectos` los campos `Responsable_Correo` y `ID_Aplicacion`, porque la tarjeta de la matriz los exige y antes solo existían a nivel de actividad. **Supuesto:** una iniciativa tiene *una* aplicación principal; si en la práctica una iniciativa toca varias aplicaciones, hay que decidir si el campo pasa a multivalor o si la tarjeta muestra las aplicaciones derivadas de sus actividades.

### D-09 · La auditoría guarda IDs de fase, no nombres
`Auditoria_Transiciones.Fase_Origen` y `Fase_Destino` almacenan `FAS-01`…`FAS-08`. Si guardaran el nombre, renombrar una fase en el catálogo rompería el histórico y todos los indicadores que agrupan por fase. La traducción a nombre legible es responsabilidad del frontend.

### D-10 · Indicadores: todo sale de las hojas, nada se estima
`Metricas.gs` calcula cada indicador exclusivamente desde `Solicitudes`, `Auditoria_Transiciones`, `SLA_Fases` y `Roadmap_Versiones`. Cuando no hay datos suficientes el indicador devuelve `null` y la interfaz muestra "sin datos", en lugar de un cero que parecería un resultado real.

Dos definiciones que conviene validar con la Gerencia:

- **SLA en días calendario.** `SLA_Fases.SLA_Dias` se compara contra `Horas_En_Fase / 24`, que son días corridos. Si el negocio mide en días hábiles, hay que descontar fines de semana y festivos colombianos (implica una tabla de festivos).
- **Tiempo bloqueado.** La eficiencia de flujo descuenta las horas en bloqueo, que se deducen de las transiciones cuyo `Estado_Destino` es *Bloqueada*. Esto exige que activar y levantar un bloqueo **también** escriba en la bitácora, no solo los cambios de fase.

### D-11 · Carga de la data real del portafolio
`DatosIniciales.gs` trae las 8 plataformas, los Business Owner entregados y las 39
iniciativas. `cargarDatosIniciales()` solo escribe en hojas vacías, nunca sobrescribe lo que
ya exista. Cuatro ajustes aplicados sobre la fuente, todos reversibles desde Administración:

| # | Situación en la fuente | Qué hice |
| --- | --- | --- |
| 1 | `PL-07` aparecía dos veces: *Shivam* y *Portal Empresarial* | Asigné `PL-08` a Portal Empresarial |
| 2 | Los IDs venían como `001`, `002`… | Los prefijé como `INI-001`. Google Sheets convierte el texto `001` en el número `1` y se perdería el formato de la llave primaria |
| 3 | El estado llegaba como texto (*En progreso*, *Por iniciar*) | Se mapea al catálogo de Estados: `EST-02` y `EST-01` |
| 4 | Los Business Owner vienen por nombre, sin correo | Quedan creados como `Usuarios` con correo `nombre.apellido@pendiente`, para corregir cuando se confirme el dominio |

### D-12 · Campos nuevos en las iniciativas
La estructura real trae cuatro campos que el modelo no tenía: **`Prioridad`**,
**`Tipo_Iniciativa`**, **`BO_Correo`** y **`PO_Correo`**. El `Responsable_Correo` único se
reemplazó por la pareja BO/PO, que es como el negocio gobierna el portafolio. Se agregó el
catálogo `Tipos_Iniciativa` con los cinco valores en uso: Negocio, Normativo, Habilitador
Técnico, Experiencia de cliente e Innovación con propósito.

### D-13 · *Transversal* como valor de LEN y de vertical
33 de las 39 iniciativas son `LEN = Transversal` y 18 son `Vertical = Transversal`, así que
ambos catálogos incorporan `LEN-00` y `VER-00` con ese nombre. Consecuencia sobre el diseño
de la matriz: la celda *Transversal × Transversal* concentra 16 iniciativas y la de
*Crédito × Transversal* otras 13, mientras que dos columnas completas (*Ingreso estable* y
*Desarrollo empresarial*) quedan vacías. Por eso las celdas ahora tienen alto máximo con
desplazamiento, un contador visible y las iniciativas se ordenan con las críticas primero.

### D-14 · Sin dependencias fuera de Google
Se retiró el CDN de Tailwind (`cdn.tailwindcss.com`). El CSS corporativo vive en
`Estilos.html` y se sirve desde el mismo Apps Script. La única fuente externa que queda es
Google Fonts, que es infraestructura de Google; si se requiere cero tráfico externo, basta
con borrar el `<link>` y el navegador usa la pila de respaldo declarada en los tokens.

## Supuestos abiertos

| # | Tema | Pendiente |
| --- | --- | --- |
| S-01 | Catálogos de negocio | Falta la lista de `Aplicaciones` por plataforma y el resto de `Usuarios` con su rol. Plataformas e iniciativas ya están cargadas |
| S-12 | Correos de los BO/PO | Claudia Gómez, Mauricio Osorio y los PO pendientes: se necesitan los correos corporativos para que el RBAC funcione |
| S-13 | Iniciativa `INI-011` | *Gestión comercial (Matrix Fase 5)* llegó solo con nombre: sin prioridad, tipo, LEN, vertical ni estado |
| S-14 | Fechas del portafolio | Solo `INI-029` e `INI-031` traen fecha (14/09/2026, cargada como fecha de inicio). ¿Las demás no tienen, o están en otra fuente? |
| S-15 | Plataforma por iniciativa | Las iniciativas no traen plataforma ni aplicación asociada; hoy esa relación solo existe a nivel de actividad |
| S-02 | Google Chat | URL del webhook del espacio destino |
| S-03 | Dominio | Dominio corporativo para restringir el SSO |
| S-04 | Correo | ¿`MailApp` simple o Gmail API con alias/remitente específico? |
| S-05 | Marca | Nombre visible de la compañía y logo para el header |
| S-06 | AppSheet | La UI low-code no es generable por código; se entregará guía de configuración |
| S-07 | Comités | ¿Se registra el resultado de los comités de Presidencia y CAB como campos propios o basta con el estado *Aprobada* + la auditoría? |
| S-08 | Versionamiento | ¿`Roadmap_Versiones` se alimenta automáticamente al asignar `Version_Semantica`, o se administra aparte? |
| S-09 | SLA | ¿Días calendario o días hábiles? (ver D-10) |
| S-10 | Aplicación de la iniciativa | ¿Una aplicación principal por iniciativa, o varias? (ver D-08) |
| S-11 | Metas | ¿Hay metas objetivo para Lead Time, throughput y First Pass Yield? Sin meta, el indicador informa pero no semaforiza |
