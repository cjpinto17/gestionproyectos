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

### D-15 · Usuarios sin correo corporativo
`Usuarios` pasa a tener **`ID_Usuario`** (`USR-001`) como llave primaria y el correo queda
**opcional**. Motivo: el negocio necesita asignar personas —como Business Owner— antes de que
tengan cuenta corporativa. Un usuario sin correo existe, es asignable y aparece en los
reportes; simplemente no puede iniciar sesión hasta que se le registre el correo desde
Administración. `getContextoUsuario()` ignora las filas sin correo al resolver la sesión.

### D-16 · Business Owner y Product Owner son roles
Se agregó **`RO-09 Business Owner`** al catálogo de Roles. El formulario de creación de
usuarios asigna rol, y las iniciativas apuntan a usuarios por `ID_Usuario` mediante
`BO_Usuario` y `PO_Usuario`. Permisos del BO: registra demanda en la fase 1 y consulta todo;
no opera el embudo.

### D-17 · Plataforma digital = aplicación
Se **eliminó la tabla `Aplicaciones`**. La plataforma digital es la unidad única, con ocho
registros. Impacto: `Solicitudes.Plataforma_ID` y `Roadmap_Versiones.Plataforma_ID` apuntan
directo a `Plataforma_Digital`, y el roadmap agrupa versiones por plataforma.

### D-18 · Estados de iniciativa ≠ estados de solicitud
Son dos catálogos independientes, porque son dos ciclos de vida distintos: la iniciativa es
el contenedor de negocio y la solicitud recorre el embudo de 8 fases.

| Catálogo | Valores |
| --- | --- |
| `Estados_Iniciativa` | Por iniciar · En progreso · En pausa · Cancelada · Finalizada |
| `Estados` (solicitudes) | Por iniciar · En progreso · Aprobada · Bloqueada · Cancelada · Terminada |

Los cinco estados de iniciativa son una propuesta a partir de los dos que trae la data
(*Por iniciar*, *En progreso*): confirmar si faltan o sobran.

Toda solicitud es **hija de una iniciativa**: `Solicitudes.ID_Proyecto` es obligatorio.
Los tipos de solicitud quedan en cuatro: **Ajuste, Mejora, Nuevo, Tarea**.

### D-19 · SLA en días hábiles
`Festivos.gs` calcula el calendario laboral colombiano: fines de semana más los 18 festivos
de ley, derivados de la fecha de Pascua (algoritmo de Meeus) y del traslado al lunes de la
Ley Emiliani. No hay fechas escritas a mano, así que el calendario es correcto para cualquier
año. Verificado contra 2025 y 2026 (en 2026: 12 de enero, 23 de marzo, 2 y 3 de abril,
18 de mayo, 8 y 15 de junio…).

`diasHabilesEntre()` prorratea los extremos sobre la jornada, de modo que una fase que duró
medio día hábil no cuenta como un día completo. El SLA, el Cycle Time por fase y la
antigüedad de las actividades estancadas se miden así. El **Lead Time sigue en días
calendario**, porque es lo que percibe el negocio desde que pide hasta que recibe.

`Auditoria_Transiciones` gana la columna `Dias_Habiles_En_Fase`, que se calcula al registrar
cada transición. Si la compañía tiene días no laborables adicionales, se agregan en la hoja
`Festivos` y el cálculo los toma.

### D-21 · Orientación de la matriz de iniciativas
Estándar confirmado por el negocio: **las LEN son las filas** y **las verticales son las
columnas**. El botón de intercambio que existió durante la revisión se retiró. Las celdas se
siguen indexando como `Vertical_ID|LEN_ID`; la orientación es solo presentación.

### D-23 · Código de color de los estados de iniciativa
| Estado | Color | Uso |
| --- | --- | --- |
| Por iniciar | Gris | Aún no arranca |
| En progreso | Amarillo | En ejecución |
| Finalizada | Verde | Cerrada con éxito |
| En pausa | Rojo | Detenida, exige atención |
| Cancelada | Gris tachado | Definido por nosotros: el negocio no lo especificó |

El color se aplica en la etiqueta del estado y en la franja superior de la tarjeta, para que
el estado del portafolio se lea de un vistazo sin entrar a cada iniciativa. La tarjeta muestra
además **Business Owner**, **Product Owner** y **plataforma digital**; cuando el dato falta,
dice *sin asignar* en gris, en vez de ocultar el campo.

### D-20 · Transversal al final de la matriz
En los catálogos de LEN y verticales, *Transversal* queda con orden 5: se dibuja en la última
columna y la última fila de la matriz, que es donde el negocio espera encontrar lo que no
pertenece a una línea o vertical específica.

### D-22 · Rendimiento: dos niveles de memoria
Abrir un archivo de Sheets y leer un rango son las operaciones más lentas de Apps Script, y
una sola pantalla puede necesitar la misma hoja cinco o seis veces. Se agregaron:

| Nivel | Qué hace | Dónde |
| --- | --- | --- |
| Memoria de ejecución | Cada hoja y cada archivo se abren una vez por petición | `Cache.gs` |
| Caché compartida | El resultado sirve a las siguientes peticiones y a los demás usuarios | `Cache.gs`, `CONFIG.CACHE_SEGUNDOS` |
| Arranque | `getArranque()` entrega sesión, catálogos e indicadores en un solo viaje, en vez de tres encadenados | `Codigo.gs` |
| Navegador | Cada página recuerda lo que ya consultó; cambiar de pestaña no vuelve a pedir | `Scripts.html` |
| Payload | La bitácora viaja acotada a las 200 transiciones más recientes, con el total aparte | `Metricas.gs` |

**Toda escritura invalida la tabla afectada**, así que la caché nunca muestra datos viejos
tras un cambio hecho desde la aplicación. El único caso de desfase es editar el Google Sheets
a mano: para eso está el botón **Actualizar** de la barra superior, que fuerza la relectura.

`medirRendimiento()` en `Cache.gs` cronometra las cuatro consultas principales con y sin
caché, para comprobar el efecto sobre los datos reales. *(Ampliado en D-45.)*

### D-24 · La prioridad se lee tolerante al formato
El archivo fuente traía la prioridad como texto (*Crítica*, *Alta*, *Media*), mientras que el
catálogo `Prioridad` y los formularios de la aplicación usan códigos (`PRI-01`…`PRI-04`). Sin
tratamiento, editar una iniciativa desde Admin la habría dejado en código mientras el resto
seguía en texto, y el orden y los filtros se habrían roto en silencio.

`normalizarPrioridad_()` resuelve ambos formatos —código, nombre con o sin tilde, en cualquier
combinación de mayúsculas— y la matriz siempre trabaja con el código. La tarjeta muestra el
nombre legible. No hace falta migrar la hoja: convive el dato viejo con el nuevo.

Las iniciativas de la matriz se ordenan dentro de cada celda por **Crítica → Alta → Media →
Baja**, y alfabéticamente dentro del mismo nivel. Las que no tienen prioridad quedan al final.

### D-25 · La matriz es su propia área de desplazamiento
Los encabezados de vertical y las etiquetas de LEN quedan anclados al desplazar. Para que el
anclaje funcione, la matriz tuvo que convertirse en un contenedor con desplazamiento propio
(`.matriz-scroll`, alto máximo relativo a la pantalla): un elemento anclado se calcula contra
su contenedor con *scroll*, y el envoltorio anterior —que solo tenía desplazamiento
horizontal— anulaba el anclaje vertical sin dar ningún aviso.

### D-26 · El tablero filtra en el navegador
Los filtros de Gestión dejaron de consultar al servidor en cada cambio. Las actividades se
traen una vez y el filtrado ocurre en el navegador, lo que permite que la búsqueda predictiva
responda mientras se escribe. El orden de los filtros es LEN, vertical, iniciativa,
plataforma, responsable y búsqueda libre; cada lista se ordena alfabéticamente en español y
solo ofrece los valores que tienen iniciativas detrás. Si lo escrito no corresponde a ninguna
opción, el campo se marca en rojo en lugar de devolver un tablero vacío sin explicación.

### D-27 · Las escrituras se guían por los encabezados de la hoja
**Origen del problema:** al agregar `Orden_Iniciativa` en medio del esquema de `Solicitudes`,
las hojas ya creadas quedaron sin esa columna. La escritura usaba el orden del esquema, no el
de la hoja, así que a partir de esa posición cada valor caía una columna a la derecha: la
fase terminaba en la columna del estado, y Google Sheets la rechazaba por validación
(*"Los datos introducidos en la celda O4 infringen las reglas de validación"*). El mensaje
señalaba el síntoma, no la causa.

**Corrección:** `escribirFila_()` lee los encabezados reales de la hoja y escribe contra
ellos. Si el esquema declara una columna que la hoja no tiene, `asegurarColumnas_()` la
inserta **en su posición** —no al final—, de modo que Sheets desplaza datos, formatos y
validaciones junto con ella y las filas existentes quedan alineadas solas.

**Herramientas de mantenimiento** (`Mantenimiento.gs`):

| Función | Qué hace |
| --- | --- |
| `verificarEstructura()` | Revisa las 18 hojas contra el esquema e inserta lo que falte |
| `diagnosticarSolicitudes()` | Informa qué filas tienen valores fuera de su columna, sin tocar nada |
| `repararSolicitudesDesalineadas()` | Endereza solo las filas que, al corregirlas, quedan con fase y estado válidos; las demás las reporta para revisión manual |
| `renumerarSolicitudes()` | Lleva los ID ya existentes al formato `SOL-0015`. Sin argumento solo informa; con `true` aplica (ver D-43) |
| `calentarCache()` | Rehace las consultas principales para dejarlas en memoria (ver D-46) |
| `instalarCalentamiento()` | Programa lo anterior cada 10 minutos. Se ejecuta una sola vez |
| `desinstalarCalentamiento()` | Quita esa programación |
| `configurarUrlAplicacion(url)` | Fija la dirección que llevan los correos de bienvenida (ver D-49) |

La reparación nunca adivina: si el enderezado no produce una fila coherente, la deja intacta
y la marca. Es preferible una fila señalada que una fila "reparada" a ciegas.

### D-28 · Migración de solicitudes, solo para el Administrador
El formulario normal registra demanda nueva: siempre entra en la fase 1, con fecha de hoy y
sin historia. Migrar es lo contrario —fijar fase, estado, las estampas de cada etapa y la
fecha de registro original— y eso es justamente lo que **no** debe poder hacer cualquier
usuario, porque permite escribir historia hacia atrás y mover los indicadores.

Por eso vive en la página de Administración, exige rol `RO-08` y el backend lo vuelve a
validar: no basta con ocultar el botón.

Detalles de la implementación:

- **El código es opcional.** Si se deja vacío se genera uno; si se escribe, se respeta, para
  conservar el identificador que ya usaba la fuente original.
- **La fecha de registro es la original**, no la de la migración: de ella dependen el Lead
  Time y toda la antigüedad.
- **`Fecha_Ultimo_Cambio` toma la estampa más reciente informada**, no el momento de la carga.
  Si tomara la carga, todo el histórico aparecería como recién tocado y el indicador de
  actividades estancadas quedaría en cero el primer día.
- **Drive y las notificaciones son opcionales** y vienen apagadas: migrar cien solicitudes no
  debería crear cien carpetas ni disparar cien avisos.
- Queda una línea de auditoría marcada como `(migracion)`.

### D-29 · Las fechas del formulario se leen en horario local
Un `<input type="date">` entrega `aaaa-mm-dd`, que JavaScript interpreta como medianoche
**UTC**. En Colombia (UTC−5) eso son las 7 de la noche del día anterior: sin tratamiento,
cada fecha capturada se guardaría **corrida un día hacia atrás**. `aFechaDeFormulario_()`
la reconstruye en horario local, y se aplica tanto en la migración como en el CRUD de
administración.

### D-30 · El orden dentro de la iniciativa lo asigna el sistema
El formulario de alta ya no pide el orden: la solicitud nueva entra al final de la fila de su
iniciativa (`siguienteOrdenIniciativa_()`) y desde ahí el negocio la reordena si hace falta.
Pedirlo obligaba a quien registra a saber cuántas solicitudes existían antes, un dato que la
persona no tiene a la vista y que se equivoca con facilidad.

La migración y la carga masiva **sí** admiten un orden explícito —ahí el negocio lo está
trayendo de su fuente— y solo lo completan cuando viene vacío.

### D-31 · Documento de requerimiento propio
El alta acepta el enlace de un documento que ya exista en Drive. Cuando se informa, se crea
la carpeta de la solicitud pero **no se clona la plantilla**: de lo contrario quedaría un
documento vacío al lado del bueno, y nadie sabría cuál es el válido. Si el campo se deja
vacío, sigue clonándose la plantilla oficial como hasta ahora.

### D-32 · El tablero lo opera el Product Owner
Mover tarjetas y marcar bloqueos queda reservado a **Product Owner (`RO-02`)** y
**Administrador (`RO-08`)**. Para los demás roles, Gestión es una página de consulta: ven
todo el estado del embudo, abren el detalle de cualquier solicitud y usan los filtros, pero
no alteran el flujo. Es coherente con el documento funcional, que designa al PO como
aprobador único de los pasos clave.

**Registrar una solicitud nueva sigue abierto** a los roles que ya lo tenían: es la entrada
del proceso, no una alteración del embudo. Si el negocio quiere cerrarlo también, se ajusta
en una línea.

La restricción vive en el servidor (`puedeOperarTablero()` en `Rbac.gs`), no solo en la
interfaz: ocultar el arrastre es comodidad, la regla es la que corre en el backend.

### D-33 · El enlace del requerimiento no crea nada en Drive
Cuando la solicitud llega con el enlace de su documento, el sistema **no crea carpeta ni
clona plantilla**: solo guarda y muestra ese enlace. El equipo ya está trabajando en ese
documento; crear una carpeta vacía al lado solo agregaría ruido a la Unidad Compartida.

Sin enlace, se mantiene el comportamiento original: carpeta con la nomenclatura oficial y
copia de la plantilla dentro. Aplica igual en el alta normal y en la migración.

### D-34 · Qué dice cada notificación
- **Correo:** el asunto lleva el nombre de la solicitud y su código —*"Solicitud registrada:
  Onboarding banca móvil (SOL-…)"*—, para distinguir varios correos del mismo día sin abrirlos.
- **Google Chat:** la tarjeta muestra nombre de la solicitud, iniciativa a la que pertenece,
  fecha y hora de registro, y fase con estado. El encabezado lleva la iniciativa y la
  plataforma, que es el contexto que busca quien lee el espacio.

### D-35 · Editar una solicitud y mover su tarjeta son permisos distintos
Se agregaron los roles **`RO-10` PM Fábrica SW** y **`RO-11` Líder de proyecto FS**. Junto con
el Product Owner y el Administrador, pueden **editar** todos los datos de una solicitud desde
el lápiz de la tarjeta. Mover tarjetas en el tablero sigue siendo exclusivo del Product Owner
y el Administrador (D-32): la fábrica mantiene al día fechas, versión y responsables sin
gobernar el avance del embudo.

Si la edición cambia la fase o el estado, **queda en la bitácora** igual que un arrastre: la
trazabilidad no puede depender de por dónde se hizo el cambio. `ID_Solicitud` y
`Carpeta_Drive_URL` no son editables, porque son la identidad del registro. *(La fecha de
registro sí se volvió editable más adelante: ver D-42; y `Carpeta_Drive_URL` se retiró de la
solicitud en D-78.)*

### D-36 · La versión se elige, y el catálogo manda
El campo de versión es una lista con las versiones registradas en `Roadmap_Versiones`. La
opción se muestra como **plataforma · versión (estado)** —*"Banca Movil · v2.4.0 (Planeada)"*—
para saber cuál elegir, pero en la hoja de Solicitudes queda **solo el código**.

**Corrección posterior:** la primera versión de esta regla exigía el formato `vX.Y.Z` y
rechazaba versiones que el propio negocio había registrado con otra nomenclatura — el sistema
le decía al usuario que su parametrización estaba mal. Ahora no se valida la forma sino la
**existencia**: la versión debe estar en el roadmap, se escriba como se escriba. Si no está,
el mensaje indica dónde registrarla en lugar de exigir un formato.

`limpiarVersion_()` recorta la etiqueta al código por si alguna vez llega completa, por
ejemplo pegada desde otra pantalla.

### D-37 · El consecutivo continúa la serie de la hoja
El contador no se reinicia cada día: toma el mayor número existente en la hoja y sigue. Antes,
dos solicitudes registradas en días distintos podían llevar el mismo `001`, y al hablar de "la
solicitud 3" nadie sabía de cuál se trataba. *(El formato del ID cambió después: ver D-43.)*

### D-38 · Los estados de solicitud usan el mismo código de color
El tablero y la matriz se leen igual: gris lo que no arranca, amarillo lo que avanza, verde lo
aprobado y terminado, rojo lo bloqueado, gris tachado lo cancelado.

### D-39 · La aplicación puede ir embebida
`doGet()` declara `XFrameOptionsMode.ALLOWALL` y la página trae `<base target="_top">`, que
son las dos condiciones para que la aplicación funcione dentro de un marco de Google Sites:
la primera permite el embebido y la segunda hace que los enlaces a Drive y a los documentos se
abran en la pestaña completa, no dentro del marco.

La URL de la aplicación **solo cambia al crear una implementación nueva**. Actualizar la
existente —o dejar que lo haga el flujo de GitHub con `DEPLOYMENT_ID`— conserva la dirección.
Google Sites, entonces, no es un requisito técnico sino una decisión de presentación: da una
dirección corta con el nombre de la compañía y permite acompañar la herramienta con
instrucciones. El paso a paso está en `docs/IMPLEMENTACION.md`, parte 5.1.

### D-40 · La migración usa la misma regla de versión que el resto

El alta manual de solicitudes (Administración → *Migrar solicitud*) escribía la versión a
mano, mientras que crear y editar ya la elegían del roadmap. Eran dos reglas para el mismo
dato, y la migración —que es precisamente por donde entra el trabajo viejo— era la que podía
meter versiones inexistentes.

Ahora el formulario de migración ofrece la misma lista de D-36. Con una diferencia: al crear o
editar ya se sabe la plataforma, así que la lista se filtra; en la migración la plataforma se
elige en el mismo formulario, de modo que se ofrecen todas las versiones y **cada opción viene
rotulada con su plataforma**. Al guardar se aplica `limpiarVersion_()` —queda solo el código—
y se valida contra la plataforma elegida: si la versión pertenece a otra plataforma, el
sistema lo dice con nombre propio en lugar de aceptar el dato cruzado.

### D-41 · El bloqueo lleva causal y observación

La causal dice **de qué tipo** es el bloqueo; es un catálogo cerrado y sirve para agrupar y
medir. Lo que no dice es qué está pasando exactamente: con quién se está esperando, desde
cuándo, qué se pidió. Esa parte no se puede modelar como catálogo sin volverlo inútil.

Por eso se agrega `Observacion_Bloqueo` a Solicitudes, un texto libre y **opcional** que se
captura al marcar el bloqueo, se ve en el detalle de la tarjeta bajo la causal y viaja en la
tarjeta de Chat y en el correo de notificación. La causal sigue siendo obligatoria: la
observación complementa, no reemplaza.

Al levantar el bloqueo la observación se borra junto con la causal. Describe una situación que
ya terminó, y dejarla haría creer que la solicitud sigue trabada. La historia del bloqueo no
se pierde: queda en `Auditoria_Transiciones`, que es donde vive la trazabilidad.

### D-42 · La fecha de registro se puede corregir

`Fecha_Registro` nació como campo no editable, tratada como parte de la historia del registro.
En la práctica no siempre lo es: en la carga inicial y en las migraciones quedó **el día en que
el dato entró al sistema**, no el día en que el negocio recibió la solicitud. Y de esa fecha
cuelgan el Lead Time, el Time to Market y toda la antigüedad. Un dato equivocado que no se
puede corregir no protege la historia: la falsea.

Queda editable desde el lápiz de la tarjeta, para los mismos roles de D-35, con dos
salvaguardas:

- **No puede ser futura.** Daría Lead Time negativo y ensuciaría todos los indicadores.
- **Si el día no cambia, se conserva la estampa original con su hora.** El formulario entrega
  solo el día (`aaaa-mm-dd`); sin este cuidado, guardar cualquier otro campo iría borrando la
  hora de registro, que es la que sale en la notificación de Chat.

**Corrección de paso:** el formulario armaba el valor de los campos de fecha con
`toISOString()`, que convierte a UTC. Una solicitud registrada a las 7 de la noche en Colombia
(UTC-5) ya es el día siguiente en UTC, así que el formulario mostraba un día de más — y ahora
que la fecha es editable, ese día de más se habría guardado con solo abrir y guardar. El valor
se arma con la fecha local (`fechaInput()`), como el resto de la interfaz.

El cambio de la fecha no se registra en `Auditoria_Transiciones`: esa bitácora modela
movimientos de fase y estado, y una fila extra con la misma fase distorsionaría los tiempos por
fase que alimentan el SLA.

### D-43 · El ID de la solicitud es el prefijo y el consecutivo: `SOL-0015`

El código llevaba también la fecha —`SOL-20260923-015`— y eso lo hacía largo de leer, de
dictar por teléfono y de buscar en la hoja, sin aportar nada: la fecha de registro ya vive en
su propia columna, donde además ahora se puede corregir (D-42). La del ID quedaba congelada y
podía terminar contradiciendo a la real.

Queda `SOL-` más el consecutivo con cuatro dígitos. El consecutivo sigue siendo el de D-37: el
mayor número de la hoja, más uno, sin reiniciarse nunca. Pasados los 9.999 el número
simplemente crece y el ID se alarga; no se reinicia ni se recorta.

El sistema **lee los dos formatos**: `consecutivoDeId_()` saca el 15 tanto de `SOL-0015` como
del antiguo `SOL-20260923-015`, así que la serie continúa correctamente sobre los datos que ya
estaban cargados y nada se rompe si los dos conviven.

**Para unificar lo ya cargado** está `renumerarSolicitudes()` en `Mantenimiento.gs`. Cada
solicitud conserva su número (`SOL-20260915-013` → `SOL-0013`). Sin argumento solo informa lo
que haría; con `true` aplica. Y actualiza también `Auditoria_Transiciones` y el resultado de la
carga masiva: el ID es la llave con la que la bitácora referencia cada solicitud, y renombrar
solo la hoja de Solicitudes dejaría la historia apuntando al vacío y los tiempos por fase sin
con qué calcularse. No reescribe la historia: ajusta la referencia a una fila que sigue siendo
la misma.

Si encuentra **códigos repetidos no renumera nada** y los reporta. Con un código duplicado no
hay forma de saber a cuál de las dos filas pertenece cada movimiento de la bitácora, y
asignarlo a la equivocada en silencio sería peor que dejar los dos formatos conviviendo.

### D-44 · El portafolio se mira por dos ejes, no por uno

La matriz LEN × vertical responde *"¿en qué cruce del negocio estamos invirtiendo?"*. Es la
pregunta del comité de portafolio, y por eso sigue siendo la vista de entrada. Pero no es la
única: *"¿qué es lo más urgente?"* es otra conversación, y en la matriz las críticas quedan
repartidas entre dieciséis celdas.

Se agrega una segunda vista, elegible con un selector en el encabezado: una columna por
prioridad, de crítica a baja, con el conteo de lo que se está viendo. Ambas leen los mismos
datos y **comparten los mismos filtros** (`filtroIniciativas()` arma un solo predicado): lo que
se ve en una es exactamente lo mismo, reagrupado. La vista elegida se mantiene mientras dure la
sesión; al volver a entrar arranca en la matriz.

En la vista por prioridad cada tarjeta muestra **su LEN y su vertical**, que ahí dejan de
leerse en la posición. En la matriz no se muestran: la celda ya las dice, y repetirlas sería
ruido.

Dos diferencias deliberadas:

- **Aquí entran todas las iniciativas**, incluidas las que no tienen LEN o vertical. En la
  matriz no tienen celda y van a la caja *Sin clasificar* al pie; en esta vista una iniciativa
  crítica sin clasificar sigue siendo crítica y no puede quedar escondida abajo.
- **La columna *Sin prioridad* solo aparece si hay alguna.** No tiene sentido un hueco
  permanente por un dato que puede estar bien.

Dentro de cada columna el orden es alfabético: la prioridad ya es el agrupador, así que la
tarjeta se busca por nombre.

### D-45 · Cachear las hojas no bastaba: había que dejar de recalcular

D-22 evitó **releer** las hojas, pero no evitó **rehacer las cuentas**. Los indicadores del
Home, la matriz y los reportes no son una lectura: son un recorrido por todas las solicitudes y
toda la bitácora, con el cálculo de días hábiles de cada movimiento. Eso se repetía en cada
visita aunque nadie hubiera cambiado nada.

Ahora el resultado ya calculado también se guarda. El mecanismo es un **sello de versión**:
cada entrada se guarda bajo el sello vigente, y cualquier escritura genera uno nuevo. Con eso
todas las entradas anteriores quedan inalcanzables de golpe y expiran solas — no hay que salir
a borrarlas una por una, y por tanto no existe el riesgo de olvidar alguna y servir un dato
viejo. Solo entran ahí resultados iguales para todos: la caché es del script, no de la sesión,
así que nada que dependa de quién pregunta se guarda.

**Vencimientos por tipo de dato.** La parametrización (roles, fases, SLA, festivos) cambia unas
pocas veces al año y vive una hora; lo transaccional, quince minutos. En ambos casos el plazo
solo aplica a ediciones hechas **a mano en el Sheets**: cualquier cambio desde la aplicación
invalida de inmediato. Para lo primero sigue estando el botón **Actualizar**.

**Precarga en segundo plano.** Cada viaje al servidor de Apps Script cuesta cerca de un segundo
solo en ida y vuelta, y ese segundo se paga igual si nadie lo está esperando. Mientras la
persona mira el Home, la matriz y el tablero se van trayendo callados; al hacer clic en la
pestaña, ya están. Va en cadena y no en paralelo para no competir con lo que el usuario pida
entretanto, nunca pisa lo ya cargado, y si algo falla no dice nada: la página lo volverá a
pedir cuando se abra de verdad.

**Esqueleto de carga.** En vez de la palabra *Cargando*, se dibuja de inmediato la forma de lo
que viene: los recuadros de los indicadores, las celdas de la matriz, las columnas del tablero.
La espera es la misma; lo que cambia es que el ojo ya tiene dónde posarse y la página no da el
salto de quedarse en blanco y llenarse de golpe. Respeta `prefers-reduced-motion`.

**Lo que deliberadamente no se hizo:** cambiar Sheets por una base de datos. Con este volumen
el cuello de botella no es Sheets sino el arranque del motor de Apps Script y el ida y vuelta
de cada llamada, y ninguno de los dos desaparece al cambiar de base de datos. Sheets empezaría
a pesar hacia las decenas de miles de filas. A cambio se perdería que cualquiera abra la hoja y
revise o corrija a mano, que en este proyecto se ha usado varias veces.

### D-46 · La medición corrigió el diagnóstico: el costo es leer, no calcular

Se cronometraron las cuatro consultas principales sobre los datos reales:

| Consulta | En frío | Qué paga |
| --- | --- | --- |
| `getCatalogos` | 1.974 ms | Abrir el libro de parametrización y leerlo |
| `getMatrizIniciativas` | 3.355 ms | Abrir el libro transaccional + Solicitudes y bitácora |
| `getDatosKanban` | 105 ms | Nada nuevo: ya estaba leído |
| `getMetricasHome` | 307 ms | El cálculo puro de los 20 indicadores |
| **Total** | **5.741 ms** | En caliente: **256 ms** |

La hipótesis de D-45 era que recalcular pesaba. **Pesa un 5%.** El 95% es abrir los archivos de
Sheets y leerlos. La caché de resultados sirve igual (307 → 41 ms), pero era el premio chico.

La pregunta correcta no era *cuánto cuesta en frío* sino **cada cuánto se enfría**. Y ahí estaba
el problema real: hasta ahora, **cada escritura botaba la tabla de la caché**. Mover una tarjeta
escribe en `Solicitudes` y en la bitácora, así que la siguiente consulta volvía a leer las hojas
completas. La aplicación quedaba lenta justo después de que alguien trabajaba en ella — es
decir, cuando la están usando.

**Dos medidas:**

1. **Actualizar la fila en la caché en vez de botar la tabla.** Una escritura cambia una fila;
   se relee solo esa fila. Y se **relee de la hoja** en lugar de copiar lo que acabábamos de
   mandar: así la copia en memoria contiene exactamente lo que Sheets guardó, con sus
   conversiones de fecha y de número. La prueba compara, después de cada escritura, la caché
   parcheada contra una relectura limpia: deben ser idénticas, y lo son, incluido el caso del
   texto `"7"` que Sheets convierte en el número `7`. Los borrados, las reparaciones y la carga
   por rangos siguen botando la tabla entera, porque ahí sí cambia la numeración de las filas.
2. **Un proceso que mantiene la caché tibia** cada 10 minutos (`instalarCalentamiento()`). Solo
   lee, y corre a nombre del dueño del proyecto, así que no puede llamar a nada que dependa de
   quién pregunta. Consume unos 14 minutos diarios de los 90 que Google concede.

**Resultado medido** sobre los datos reales, después de aplicar las dos medidas:

| Escenario | Total | Qué significa |
| --- | --- | --- |
| En frío | 3.859 ms | Nadie entró en mucho rato **y** el calentamiento no corrió |
| En caliente | 285 ms | Alguien entró hace poco |
| **Después de una escritura** | **579 ms** | **Alguien acaba de mover una tarjeta** |

El tercer caso es el que se vivía todo el día y costaba lo mismo que el primero: unos cuatro
segundos. Ahora cuesta medio. Y con el calentamiento programado, el primer escenario deja de
tocarle a una persona.

**Cómo se comprueba.** `medirRendimiento()` tiene tres corridas, no dos: en frío, en caliente
y **después de una escritura** — que es el caso que de verdad vive el equipo y el que las otras
dos no alcanzan a ver, porque empiezan botando toda la caché. La tercera no escribe nada en las
hojas: reproduce el estado exacto en que queda una escritura (tablas intactas, cálculos
invalidados), que es justamente lo que el parcheo de la fila consigue. El informe indica además
si el calentamiento automático quedó instalado.

**Un error encontrado por la prueba:** el sello de versión de D-45 se armaba con la hora en
milisegundos. Dos sellos generados en el mismo milisegundo salían iguales, de modo que una
escritura podía **no** invalidar lo que se había calculado un instante antes, y se habría
seguido sirviendo el dato viejo. Ahora el sello lleva una cola al azar y se comprueba que sea
distinto del anterior.

### D-47 · El Home abre en los últimos tres meses

El Home abría en doce meses. Ahora abre en **tres**: suficiente para que las series mensuales
muestren tendencia y corto como para que lo que se ve sea la operación actual. Las ventanas de
uno, seis y doce meses siguen disponibles en el mismo desplegable. *(La página de Reportes abre
en el último mes, porque ahí se consulta el cierre de un mes concreto.)*

El valor vive en dos sitios que tienen que coincidir, y por eso ambos están anotados: el
`<option selected>` de la página lo lee el usuario, y `VENTANA_INICIAL` en `Scripts.html` es la
ventana que el arranque pide al servidor **en el mismo viaje** que la sesión y los catálogos. Si
los dos se separaran, el Home volvería a preguntar apenas abrir y se perdería justo el viaje
que ese arranque ahorra. Del lado del servidor, `CONFIG.VENTANA_HOME_MESES` decide cuál ventana
deja caliente el calentamiento automático (D-46): si apuntara a otra, el trabajo de calentar no
serviría para la pantalla que la gente abre.

Tres meses es además el mínimo con el que las dos gráficas mensuales del Home —throughput y
demanda contra entrega— dicen algo: con una sola columna no hay tendencia que leer. Los demás
indicadores (Lead Time, WIP, bloqueos, SLA) no dependen de la ventana y se leen igual en
cualquiera.

### D-48 · La gráfica de throughput no sigue el filtro del Home

El Home abre en tres meses (D-47), y con esa ventana la gráfica de throughput quedaba en tres
barras. Tres puntos no dibujan una tendencia: muestran ruido. La gráfica va ahora siempre a
**seis meses**, sin importar el filtro, y el subtítulo lo dice para que nadie crea que responde
al desplegable.

El **indicador numérico** de throughput sí sigue respetando el filtro, porque ahí la pregunta
es otra: no "cómo venimos" sino "a qué ritmo vamos en el periodo que estoy mirando".

### D-49 · Dar de alta a alguien no le avisa nada

Registrar a una persona en la hoja de Usuarios la habilita, pero no se entera. Se agrega un
botón **Bienvenida** en cada fila de esa tabla que le envía el correo de invitación: para qué
sirve la herramienta, cómo se ingresa, cuál es su rol y el enlace de acceso.

Tres decisiones dentro:

- **Quien lo envía recibe copia.** Así queda constancia de a quién se invitó y cuándo, sin
  depender de la memoria de nadie.
- **La dirección del enlace es configurable** (`configurarUrlAplicacion()`), y no siempre la
  de la aplicación: si está embebida en un sitio de Google, la que hay que repartir es la del
  sitio. Si no se configura, se usa la de la implementación activa. Sin ninguna de las dos, el
  botón avisa en lugar de enviar un correo con un enlace roto.
- **El texto no tiene género.** El correo va a personas cuyo género el sistema no conoce ni
  tiene por qué suponer a partir del nombre: dice *"Ya tiene acceso"* y *"Le damos la
  bienvenida"*, no *"habilitado"* ni *"Bienvenido"*.

El botón aparece deshabilitado cuando a la persona le falta el correo corporativo, que es
exactamente el caso que hoy tiene el portafolio (S-12).

Las tildes del correo van como entidades HTML. El resto de los archivos `.gs` es ASCII puro, y
así el mensaje se lee bien escrito sin que el código dependa de cómo viaje la codificación
hasta Apps Script.

### D-50 · Tercera vista del portafolio: el listado

La matriz responde *dónde estamos invirtiendo* (D-11) y las columnas por prioridad *qué es lo
más urgente* (D-44). Faltaba la pregunta más simple, que ninguna de las dos contesta bien:
**cuáles son todas**, en una lista que se recorra de arriba abajo y se busque con los ojos.

Se agrega la vista **Listado** al mismo selector: una fila por iniciativa, en orden alfabético,
con nombre, LEN, vertical, estado, plataforma y Business Owner. Comparte el predicado de
filtros con las otras dos (`filtroIniciativas()`), así que lo que se ve en una es lo mismo
reagrupado. Y como la vista por prioridad, incluye las iniciativas sin LEN o sin vertical: en
una lista no hay razón para esconderlas.

### D-51 · El roadmap dice qué salió en cada versión

La página mostraba cuántas actividades llevaba cada versión — *"7"* — pero no cuáles. La
pregunta que se hace después de cada despliegue es justamente la otra: *"¿qué entró en la
2.4?"*. Ahora cada versión con actividades se despliega al hacer clic y muestra el código, el
nombre, la fase y el estado de cada una. Las versiones sin actividades no se despliegan: no
tendría nada que mostrar.

El dato ya viajaba desde el servidor (`getRoadmapVersiones` ya armaba la lista para poder
contarla); solo se le agregó el estado de cada actividad y se puso a la vista. La apertura
funciona con teclado además de con el ratón.

*El filtro por plataforma de esa página ya existía desde el principio y funciona; no hubo que
agregarlo.*

### D-52 · La aplicación deja de correr a nombre de cada persona

Para que la fábrica de software entre sin cuenta corporativa había tres puertas que cambiar, y
la tercera era la que importaba: la aplicación corría **a nombre de cada usuario**, así que
todos necesitaban permiso sobre las hojas de cálculo. Dárselo a un proveedor externo habría
significado que pudiera abrir la hoja y editar lo que quisiera, saltándose los roles, el flujo
de fases y la bitácora. Todo el control vive en la aplicación, no en el archivo.

Ahora la aplicación corre **a nombre de su dueño** y las hojas quedan cerradas para todos. El
precio es que Google ya no identifica a quien viene de otro dominio, y esa identidad hay que
establecerla aquí.

**Cómo se establece.** Dos caminos, y la aplicación elige solo:

1. **Google**, para quien es del mismo dominio del dueño. Entra sin escribir nada.
2. **Correo más código de un solo uso**, para los demás. El código llega **al buzón registrado
   en la hoja**, así que escribir el correo de otro no sirve de nada.

La propuesta inicial era admitir a quien escribiera un correo que estuviera en la tabla. Eso no
es autenticación: con la aplicación abierta a internet, cualquiera que conociera un correo
—y los corporativos siguen un patrón predecible— habría entrado como esa persona, incluido el
Administrador. El código es lo que convierte "dice ser" en "es".

**Una sola puerta de entrada.** Antes cada operación era una función suelta que el navegador
podía invocar, y cada una preguntaba por su cuenta quién era el usuario. Ahora todas pasan por
`llamar()`, que resuelve la identidad **una vez** y la deja fija para la ejecución. Ninguna
operación puede olvidarse de comprobarla, porque ya no tiene cómo llegar sin pasar por ahí. La
lista de operaciones permitidas es explícita: despachar con `globalThis[metodo]` sin lista
dejaría al alcance de cualquiera las funciones de instalación y mantenimiento.

**El hueco que esto destapó.** Con la aplicación abierta a internet, *toda* función global del
proyecto quedaba invocable desde el navegador de un desconocido: `leerTabla('Solicitudes')`
devolvía la base entera, `registrarmeComoAdministrador()` regalaba el rol, `guardarConfiguracion()`
reescribía la configuración. Se cerró de dos formas: las funciones de datos y de configuración
pasaron a **privadas** —Apps Script no deja invocar desde el navegador ninguna que termine en
guion bajo, y esa protección no depende de que nosotros nos acordemos de ponerla—, y las de
instalación y mantenimiento llevan `exigirOperador_()`, que exige ser el dueño ejecutando desde
el editor, o un administrador identificado.

**Lo que se aceptó a sabiendas:**

- **Se publica con la cuenta personal corporativa del responsable del proyecto**, contra la
  recomendación de usar una cuenta de área. Si esa cuenta se desactiva, la aplicación deja de
  funcionar para todos y los documentos creados quedan a su nombre.
- **Ya no se filtra por dominio corporativo en el código**: admitir otros dominios era el
  objetivo, y quien decide es la hoja de Usuarios.
- La decisión se tomó el 24 de septiembre de 2026 sin revisión previa del área de seguridad de
  la información, que sí se sugirió.

### D-53 · La política del dominio bloqueó la mitad del plan

Al publicar, Google respondió:

> `ANYONE access has been disabled by your domain administrator.`

El Workspace de la compañía **prohíbe publicar aplicaciones accesibles a cuentas externas**.
No es una falla de configuración: es un control que TI puso a nivel de dominio, y que existe
precisamente para evitar el escenario que estábamos construyendo. La política de la propia
compañía respondió la pregunta que el área de seguridad no alcanzó a responder.

El código nuevo alcanzó a subir al proyecto (versión 14) pero la publicación no se actualizó,
así que la aplicación en uso siguió intacta y nadie lo noto.

**Lo que se publicó entonces** es la mitad que no depende de esa política: la arquitectura
nueva —aplicación a nombre de su dueño, identidad resuelta en un solo punto, funciones internas
cerradas— **con el acceso restringido al dominio**, como estaba antes.

Qué se gana igual:

- **Las hojas de cálculo dejan de ser necesarias para los usuarios.** Nadie tiene que tener
  permiso sobre los archivos para usar la aplicación, así que se pueden cerrar y con eso
  desaparece el camino para editar datos por fuera del flujo y de la bitácora. *Cerrarlas es
  una acción manual en Drive: el cambio de código la habilita, no la ejecuta.*
- **Las funciones internas dejan de estar al alcance del navegador**, que era un hueco real
  incluso con la aplicación restringida al dominio.

Qué queda pendiente: **la fábrica de software no puede entrar todavía**. El ingreso por correo
y código está construido y probado, pero duerme hasta que el acceso externo sea posible. Las
dos salidas son pedirle a TI que levante la restricción, o darle cuentas corporativas a la
fábrica — que es hacia donde apunta la política actual de la compañía.

### D-54 · Dos dominios, y el propio no se escribe a mano

La fábrica de software es **hexasolutions.co**, y ya tenía acceso a los documentos de la
compañía. Saber el dominio no levanta la restricción de TI —Apps Script solo ofrece *"mi
dominio"* o *"cualquier cuenta de Google"*, no existe una lista de dominios autorizados en la
plataforma—, pero sí permite poner una segunda cerradura en el código.

Ahora un correo, además de estar en la hoja de Usuarios y activo, tiene que ser de un dominio
admitido. Cubre el caso de un correo registrado por error —uno personal, por ejemplo— que hoy
habría entrado con todos sus permisos, y convierte el argumento para seguridad en algo
verificable: la aplicación rechaza por diseño cualquier correo que no sea de esos dominios.

**El dominio propio no se escribe en ninguna parte:** se deduce de la cuenta que publica la
aplicación. Escribirlo a mano habría sido una errata a un carácter de dejar a toda la compañía
por fuera, y además tendría que mantenerse si algún día cambia. Los aliados sí van listados,
en `CONFIG.DOMINIOS_ALIADOS`, y se les puede sumar uno por propiedad del script sin publicar
una versión nueva.

**Si no se puede leer el dominio propio, la comprobación deja pasar.** Es una decisión
deliberada: esta es la cerradura secundaria —la principal es la hoja de Usuarios— y dejar a
toda la compañía afuera por un dato que no se pudo leer sería peor que el riesgo que cubre.

### D-55 · Las versiones se administran desde el Roadmap, no desde Administración

El **Líder de proyecto de Fábrica (RO-11)** necesita crear y editar versiones. La salida fácil
habría sido darle acceso a la página de Administración, pero ahí viven todos los catálogos
maestros —usuarios, roles, fases, SLA—: para que pudiera tocar el roadmap habría podido tocar
también quién entra y con qué permisos.

Las versiones se gestionan entonces **desde el propio Roadmap**, que además es donde uno las
está mirando cuando quiere cambiarlas: un botón *Nueva versión* en el encabezado y un lápiz en
cada fila, visibles solo para los roles que las gestionan (`RO-08` y `RO-11`). El permiso es
suyo: `puedeGestionarVersiones()`, aparte del de administrador.

Dos cuidados en la implementación:

- **No se permiten dos versiones con el mismo número en la misma plataforma.** El roadmap las
  identifica por ese par, y duplicarlas haría ambigua la asignación de las solicitudes.
- **El lápiz no despliega el detalle.** La fila ya respondía al clic abriendo sus actividades
  (D-51); el manejador comprueba primero el lápiz y sale, para que un gesto no dispare los dos.
  Está verificado en el navegador: el lápiz edita sin abrir, la fila abre sin editar, y sin el
  permiso no aparece ninguno de los dos.

### D-56 · El cronograma que se puede hacer con los datos que hay

En el listado, cada iniciativa se despliega y muestra sus solicitudes: hasta dónde llegó cada
una en el embudo de ocho fases, su estado, quién la tiene, y **cuándo se espera que salga**.

Se evaluaron dos formas de responder *"cómo va cada tema"*:

| | Qué muestra | Qué necesita |
| --- | --- | --- |
| **Avance por fase** *(la elegida)* | Barra de 8 casillas hasta la fase actual, estado, responsable, versión con su fecha | Nada nuevo: todo existe |
| Línea de tiempo (Gantt) | Una barra por solicitud entre su inicio y su fin | Fechas de inicio y fin **planeadas** por solicitud, que no existen en el modelo |

La segunda se descartó por una razón de datos, no de gusto: el sistema guarda **cuándo cada
fase se cumplió de verdad**, no cuándo se planeó que ocurriera. Un Gantt sobre eso dibuja el
pasado, no el plan, y capturar fechas planeadas por solicitud es una disciplina diaria que hoy
no existe. Se le mostraron al negocio las dos maquetas con datos de ejemplo antes de decidir.

**La fecha esperada sale del roadmap.** Cada solicitud tiene una versión asignada, y esa
versión sí tiene fecha planeada (D-55). Así se responde *"¿cuándo sale esto?"* sin pedirle al
equipo que registre una fecha por solicitud: si la versión ya salió dice *"salió el 18/06"*, y
si no, *"planeada 30/10"*.

**Los días hábiles se calculan en el servidor.** El navegador no puede: dependen de los
festivos colombianos, que viven en `Festivos.gs`. El tablero recibe cada solicitud con sus días
en fase y el SLA de esa fase ya resueltos, y la pantalla solo compara.

**No hay consulta nueva al servidor.** Las solicitudes ya viajaban para el tablero de Gestión y
la precarga en segundo plano (D-45) suele haberlas traído antes de que alguien despliegue nada.
Si todavía no llegaron, se piden una vez y de ahí en adelante desplegar es instantáneo.

El orden dentro de cada iniciativa era el del **backlog** (`Orden_Iniciativa`). Ese campo se
retiró en D-66; hoy el orden es **prioridad, y a igual prioridad lo que se pidió antes**.

### D-57 · Los catálogos que se amplían desde Administración se leen de la hoja

Administración permite crear plataformas digitales, líneas estratégicas, verticales, causales de
bloqueo y tipos. Sin embargo, los formularios seguían mostrando la lista escrita en el código:
una plataforma nueva se guardaba en la hoja y no aparecía en ningún desplegable. Era el reporte
*"en la edición de proyectos desde admin no muestra la lista completa de plataformas digitales"*.

Ahora esos seis catálogos se leen de su hoja cada vez que se arma un formulario
(`catalogoVigente` en `Esquema.gs`), y la lista del código queda solo como **respaldo**: se usa
si la hoja todavía no se ha creado —una instalación nueva— o si leerla falla. Cuando la hoja
tiene una columna `Orden_`, ese es el orden en que se ven.

**Cuatro catálogos siguen viviendo en el código a propósito**, y no es un olvido:

| Catálogo | Por qué no se amplía desde la hoja |
| --- | --- |
| Roles | Cada rol tiene una matriz de permisos escrita en `Rbac.gs`; un rol nuevo en la hoja no tendría permisos y sería un usuario sin acceso a nada |
| Fases | El embudo tiene un orden y unos SLA por fase; una fase nueva rompería las métricas de lead time |
| Estados | El color y el comportamiento (bloqueada, finalizada) están atados al ID |
| Prioridad | El peso que ordena las columnas de la vista por prioridad está atado al ID |

Para tocar cualquiera de esos cuatro hay que cambiar el código, que es exactamente la barrera
que se quiere.

### D-58 · La tarjeta de la iniciativa se edita, pero solo dos roles

Hasta ahora una iniciativa mal escrita había que corregirla en Administración, tabla por tabla.
El lápiz de la tarjeta —y el de la fila del listado— abre el mismo formulario, con los valores
actuales cargados.

**El ID de la iniciativa no está en el formulario.** Es lo que la amarra con sus solicitudes: si
se pudiera cambiar, las solicitudes quedarían huérfanas. Todo lo demás sí se corrige, incluidas
las fechas y la plataforma.

**Lo pueden hacer el líder de la gerencia (RO-02) y el administrador (RO-08).** No la fábrica de
software ni los Business Owner: la iniciativa es la unidad de planeación del portafolio, y quien
la reordena o le cambia la prioridad está moviendo el plan, no ejecutando una tarea. El permiso
se comprueba **en el servidor** antes de abrir el formulario y otra vez antes de guardar; el
lápiz que no se ve en pantalla es cortesía, no la seguridad.

### D-59 · El listado se ordena por fecha y su encabezado se queda quieto

Dos cambios sobre la vista de Listado, de la misma conversación:

**El orden ya no es alfabético sino por fecha de inicio**, de la más antigua a la más reciente, y
a igualdad de inicio manda la fecha de fin planeado. Alfabético respondía *"¿dónde está esta
iniciativa?"*; por fecha responde *"¿qué está arrancando ahora y qué viene después?"*, que es la
pregunta que se le hace a un listado con fechas. **Lo que no tiene fecha queda al final**, no al
principio: una iniciativa sin fecha registrada no es una que empieza el 1 de enero del año cero.

**El encabezado se queda quieto al desplazarse.** La tabla ahora tiene su propio desplazamiento
vertical (`.listado-scroll`) en vez de empujar toda la página, y las celdas del encabezado van
pegadas arriba de esa caja. Con 39 iniciativas en pantalla, a mitad de lista ya no se sabía qué
columna era cuál.

### D-60 · Las tres fechas de la iniciativa, y una columna que se va sin llevarse el dato

`Fecha_Estimada` se retira de la iniciativa: duplicaba a `Fecha_Fin_Estimada` y nadie sabía cuál
de las dos llenar. En su lugar entra **`Fecha_Fin_Real`**, para registrar cuándo terminó de verdad.
Quedan tres fechas con un papel claro cada una: cuándo arranca, cuándo se espera que termine,
cuándo terminó.

**Retirar una columna del esquema no borra lo que la hoja ya tenía.** Esto no era así y era una
mina: `escribirFila_` escribe *todos* los encabezados reales de la hoja, y un campo que el
formulario ya no envía llegaba como vacío. La primera persona que guardara una iniciativa habría
borrado esa columna en silencio. Ahora una columna que existe en la hoja y que el esquema ya no
declara se relee y se vuelve a escribir tal cual. Cuesta una lectura extra por escritura, solo
mientras la columna siga físicamente en la hoja.

**El instalador tampoco reescribe encabezados sobre una hoja con datos.** `crearHojas_` los
escribía por posición, así que correr `setupInicial()` después de este cambio le habría puesto a
cada columna el nombre de la siguiente: las fechas de inicio rotuladas como fecha fin, y nadie se
daría cuenta hasta mucho después. Sobre una hoja que ya tiene filas ahora solo se **agregan** las
columnas que falten, en su posición. Se agrega además `actualizarEstructura()`, que hace eso para
todas las hojas y reporta qué agregó, para no tener que correr el instalador completo.

**Validación de las tres fechas:** no se exige que existan —hoy casi ninguna iniciativa las
tiene— pero sí que cuenten una historia posible. El fin estimado no puede ir antes del inicio, el
fin real tampoco, y el fin real no puede ser futuro: es el día en que la iniciativa terminó, no
una promesa. Terminar *después* de lo estimado sí se acepta: eso pasa, y es justamente lo que el
indicador debe poder mostrar.

### D-61 · Qué significa el % real y qué significa el % esperado

Dos columnas nuevas en el listado de iniciativas, y dos preguntas distintas.

**`% real` — cuánto se ha hecho.** Es el promedio del avance de las solicitudes de la iniciativa
por el embudo. El embudo tiene ocho fases, o sea siete pasos: recién registrada va en 0, en
Desarrollo va en 3/7 (43%), en Producción va en 100%. Una solicitud marcada *Terminada* cuenta
completa aunque su fase diga otra cosa.

Se consideró contar simplemente *terminadas ÷ total* y darle medio punto a las que están en
progreso. Se descartó porque ese medio punto es un número inventado: una solicitud en
Aceptación TI y una recién sacada del backlog valdrían lo mismo. El embudo ya sabe dónde está
cada una y no hay que suponerlo.

Dos reglas que cambian el número y conviene tener presentes:
- **Las canceladas salen del total.** Dejarlas dentro castigaría a la iniciativa por un trabajo
  que el propio negocio decidió no hacer.
- **Una iniciativa sin solicitudes no marca 0%, marca "sin solicitudes".** No es que no haya
  avanzado: es que todavía no hay con qué medirlo, y son cosas distintas.

**`% esperado` — cuánto debería llevarse hoy.** Días hábiles corridos desde la fecha de inicio,
sobre el total de días hábiles hasta la fecha fin estimada. En días hábiles y no calendario
porque es contra días hábiles que el equipo trabaja y que ya se miden los SLA del embudo: un plan
que atraviesa diciembre no avanza los festivos. Antes de la fecha de inicio da 0; pasado el plazo
da 100, porque si ya se venció lo esperado era que estuviera todo. Sin las dos fechas no se
calcula, y la columna lo dice en vez de inventar un número.

**El color compara los dos, no mira uno solo.** 30% puede ser excelente en marzo y pésimo en
noviembre. Verde si el real va igual o mejor que el esperado, ámbar hasta diez puntos por debajo,
rojo más abajo. Sin fechas planeadas no hay contra qué comparar y la barra queda neutra.

### D-62 · El seguimiento se escribe, no se edita

Gestión gana un bloque de **observaciones** por solicitud: quién escribió, cuándo y qué. De la
más reciente a la más antigua, porque lo que se necesita al abrir una solicitud es en qué quedó,
no cómo empezó.

**Escribe cualquiera con sesión.** No se restringió a quienes mueven tarjetas: el seguimiento es
justamente donde el negocio, la fábrica y quien opera el tablero se ponen de acuerdo, y
limitarlo dejaría por fuera al que más suele tener el dato.

**Nadie edita ni borra lo ya escrito**, y por eso la tabla es `inmutable`. Un seguimiento que se
puede reescribir después deja de servir para saber qué se dijo y cuándo, que es lo único para lo
que sirve un seguimiento.

**Es distinto de la Auditoría.** La auditoría la escribe el sistema y registra *qué* cambió; esto
lo escribe una persona y registra *por qué*, qué se acordó, a quién se está esperando. Son dos
tablas y dos secciones separadas en la pantalla a propósito.

**Una observación no invalida los indicadores.** Hasta ahora toda escritura marcaba como
obsoletos todos los resultados calculados —matriz, indicadores, reportes— y la siguiente persona
en entrar pagaba el recálculo. Para el seguimiento eso sería pagar el costo más alto por el
cambio más barato: se escribe a diario y no mueve un solo indicador. Las tablas que no alimentan
ningún cálculo están listadas en `TABLAS_SIN_INDICADORES`.

### D-63 · Los mismos comentarios, ahora también en la iniciativa

Lo que se hizo para las solicitudes (D-62) se extiende a las iniciativas: un globo junto al
nombre abre una ventana con los comentarios, de lo más reciente a lo más antiguo, y un cuadro
para escribir. Mismas reglas: escribe cualquiera con sesión, nadie edita ni borra.

**El globo lo ve todo el mundo; el lápiz, no.** Editar una iniciativa mueve el plan y está
limitado a dos roles (D-58). Comentar no es editar: el seguimiento sirve justamente porque lo
escribe quien tiene el dato, que muchas veces no es quien puede tocar la ficha.

**Dos tablas, una sola lógica.** `Observaciones_Solicitud` y `Observaciones_Proyecto` son hojas
separadas porque cada una apunta a una llave distinta y las hojas se leen y se validan por tabla;
mezclarlas obligaría a filtrar por tipo en cada lectura y a que una solicitud y una iniciativa
compartieran espacio de llaves sin necesidad. La lógica sí es una sola: `observacionesDe_` y
`registrarObservacion_` sirven a las dos, y el bloque de pantalla también.

**Corrección de orden.** Dos comentarios escritos en el mismo milisegundo quedaban al revés: con
fechas iguales el orden se mantenía como venía de la hoja, que es del más viejo al más nuevo.
Ahora la posición en la hoja desempata, y una fila posterior es un comentario posterior.

**El bloque pasó a llamarse "Comentarios".** Se llamaba "Seguimiento", y ese nombre quedó ocupado
por la vista de iniciativas (D-64). Dos cosas distintas con el mismo nombre en la misma
aplicación se prestan a confusión, y "comentarios" es además la palabra con que el negocio pidió
la función.

### D-64 · Iniciativas abre en Seguimiento

La página de iniciativas abría en la matriz LEN × vertical. Ahora abre en la vista de listado,
que además se llama **Seguimiento** en pantalla.

La matriz responde *dónde estamos invirtiendo* y las columnas por prioridad *qué es lo más
urgente*: son preguntas de planeación, que se hacen cada tanto. La vista de listado responde
*cómo va cada tema*, que es la pregunta de todos los días, y es la única que deja abrir una
iniciativa para ver sus solicitudes, su avance real y el esperado. Lo que se abre primero debería
ser lo que se consulta más, no lo que se construyó primero.

Las otras dos vistas no se van: quedan a un clic, en el mismo selector, que ahora arranca por
Seguimiento.

**Detalle que importa:** el esqueleto de carga ahora se pinta en el contenedor de la vista que se
está abriendo. Estaba fijo en el de la matriz, así que la vista por defecto habría arrancado en
blanco mientras llegaban los datos.

### D-65 · El nombre de la fase se queda quieto en el tablero

El tablero de Gestión tiene ocho columnas y algunas acumulan decenas de tarjetas. Al bajar, el
encabezado se iba con la página y a la quinta tarjeta ya no se sabía en qué fase se estaba
mirando.

El tablero se desplaza ahora **dentro de su propia caja** en vez de empujar la página, y el
encabezado de cada columna queda pegado arriba de esa caja. Es el mismo tratamiento que se le dio
a la tabla de Seguimiento (D-59), y por la misma razón.

Dos detalles de la implementación que no son cosméticos: el fondo del encabezado se **hereda** de
la columna, para que siga su color cuando la columna es destino de un arrastre o está vetada; y
se estira sobre el relleno de la columna, para que las tarjetas no se vean pasar por el costado
al desplazarse.

### D-66 · Dos campos que sobraban en la solicitud

**Se retira `Orden_Iniciativa`.** El campo nunca se pidió en el formulario: el sistema le ponía
el siguiente número libre al crear la solicitud, con la idea de que el negocio la reordenara
después. Nadie la reordenó nunca, así que el campo terminó siendo la fecha de creación disfrazada
de decisión, y encima aparecía como un número en la tarjeta y como un dato en el detalle, donde
invitaba a leerlo como una prioridad que no era.

Sin él, las solicitudes se ordenan por **prioridad, y a igual prioridad por lo que se pidió
antes**. Son los dos criterios que sí significan algo y que alguien sí mantiene. La regla es una
sola (`ordenDeAtencion`) y aplica igual en el tablero de Gestión y dentro de cada iniciativa en
Seguimiento; antes eran dos ordenamientos distintos escritos por separado.

**`Objetivo` y `Entregable` se unen en `Alcance`,** un solo campo largo con una línea que explica
para qué es: *qué se busca lograr y qué se espera recibir al final*. En la práctica los dos
campos se llenaban con lo mismo dicho de dos formas, o uno quedaba vacío.

La explicación vive en el **esquema**, no en la pantalla: se agregó la propiedad `ayuda` a las
columnas, y `construirCampos` la muestra bajo el control. Así un campo que necesita explicarse se
explica igual en todos los formularios que lo muestren —crear, editar, migrar, administrar— y no
solo en el que uno se acordó de tocar.

**El alcance ahora se ve en el detalle de la solicitud.** No estaba: ni Objetivo ni Entregable
aparecían al abrir una solicitud, así que se escribían y no los leía nadie. Va como bloque aparte
y no como fila de la lista de datos, porque es el único campo largo del detalle y en una fila los
saltos de línea se pierden.

**Nada de lo escrito se pierde, pero hay que moverlo.** Las columnas `Objetivo` y `Entregable`
siguen en la hoja con su contenido —el sistema ya no las toca ni las borra (D-60)— pero eso
significa que el texto quedaría invisible en la aplicación aunque siga guardado. Para eso está
`unificarAlcanceSolicitudes()`: pasa lo escrito a `Alcance`, uno debajo del otro y con su
etiqueta cuando los dos tenían contenido, sin etiqueta cuando solo uno lo tenía, y **sin pisar
ninguna fila que ya tenga alcance propio**. Corre primero en simulación y solo escribe si se la
llama con `true`.

### D-67 · La iniciativa se busca escribiendo, no bajando por una lista de 39

Al crear una solicitud, la iniciativa se elegía de un desplegable con las 39 del portafolio, en
el orden en que venían de la hoja. Ahora es un campo donde se escribe parte del nombre y la lista
se reduce sola, en **orden alfabético**.

Es el mismo mecanismo que ya usan los filtros del tablero (`llenarCombo` / `valorCombo`), no uno
nuevo: lista predictiva del navegador, sin librerías, y funciona igual en celular.

**El cambio corrige además un error silencioso.** Un `<select>` siempre trae la primera opción
seleccionada, así que quien no tocaba el campo creaba la solicitud colgada de la primera
iniciativa de la lista sin enterarse. El campo de texto arranca vacío, y al guardar se distinguen
dos casos: vacío ("elija la iniciativa") y texto que no corresponde a ninguna ("no hay ninguna
iniciativa con ese nombre"), con el campo marcado en rojo hasta que se corrige.

**Dos opciones con el mismo nombre ya no se tapan entre sí.** La lista resuelve el texto escrito a
un identificador, así que dos iniciativas homónimas harían que una fuera inalcanzable sin que nada
lo advirtiera. Ahora la segunda lleva su código entre paréntesis. Hoy no hay nombres repetidos en
las 39, pero el nombre es texto libre y nada impide que mañana los haya. Vale para todos los
combos, incluidos los filtros del tablero.

Los demás campos del formulario siguen siendo desplegables: son listas cortas (plataformas, tipos,
prioridades) donde ver todas las opciones de un vistazo es mejor que escribir.

### D-68 · Los permisos pasan a ser dato, y por fin hacen lo que dicen

**Lo que había, y por qué no se entendía.** El control de accesos vivía repartido en seis sitios
de `Rbac.gs`: una matriz por rol (qué fases opera, qué campos edita) y cinco listas planas. Al
auditarlo para este cambio resultó que **la matriz era decorativa**:

- La regla de fases solo se consultaba *después* de un portero que dejaba pasar únicamente a
  Product Owner y Administrador, y los dos tenían todas las fases. Los permisos de fase del
  Analista QA, el Desarrollador, UAT y el Comité CAB nunca se evaluaban.
- La regla de campos vivía en `actualizarSolicitud()`, una función que **nadie llamaba** y que no
  estaba expuesta al navegador. El único camino real de edición comprobaba solo "¿está tu rol en
  la lista?" y luego dejaba tocar todo.

Así que quien leía el código veía un modelo de permisos fino y detallado, y la aplicación se
comportaba según cinco listas escritas en otra parte. Esa función muerta se eliminó.

**Lo que hay ahora.** Una sola pregunta —`tienePermiso(rol, permiso)`— y dos hojas que se editan
desde Administración: `Permisos_Rol` (17 permisos, SI/NO por rol) y `Permisos_Fase` (la cuadrícula
rol × fase). Todo lo demás son atajos con nombre sobre esa pregunta.

**El día uno nada cambia.** Si las hojas no existen todavía, se usan valores de fábrica que
reproducen exactamente el comportamiento anterior, incluidas dos cosas que no estaban restringidas
en absoluto y se dejaron abiertas para no quitarle a nadie algo que ya usa: **crear solicitudes** y
**comentar**. Quien quiera cerrarlas, lo hace desde Administración.

**Las fases de fábrica vienen de la matriz original**, la que nunca se aplicó. Describían bien
quién trabaja en qué parte del embudo, así que se conservan: marcarle *Mover de fase* al Analista
QA lo deja operando su fase y ninguna otra, sin armar la cuadrícula desde cero.

**Reglas de movimiento entre fases**, ahora explícitas y todas configurables:
- Sin *Mover de fase*, el tablero es de consulta.
- Avanzar exige operar la fase **de origen**: se saca de donde uno es dueño.
- Devolver exige además *Devolver a fase anterior*, y se valida contra la fase **de destino**:
  devolver de QA a Desarrollo lo decide quien responde por Desarrollo.
- Saltar más de una fase exige *Saltar fases*.

**Dos seguros contra quedarse afuera.** Guardar se rechaza si ningún rol conserva la
administración, y también si quien guarda se la quita a su propio rol. Sin el segundo, un clic
distraído deja a todos fuera de Administración y ya no hay desde dónde volver atrás sin abrir la
hoja a mano en Drive. Para ceder la administración se cambia de rol al usuario en la tabla
`Usuarios`, no quitándose el permiso.

**El servidor decide; la pantalla acompaña.** Cada permiso se comprueba al guardar, no solo al
pintar: una llamada del navegador se puede escribir a mano y un botón escondido no detiene a
nadie. Las lecturas de cada página (`getMatrizIniciativas`, `getDatosKanban`, `getReportes`,
`getRoadmapVersiones`, `getMetricasHome`) también exigen el permiso de menú correspondiente, para
que esconder una pestaña no sea solo cosmético.

**La regla del navegador y la del servidor se prueban juntas.** El tablero valida el arrastre en
el navegador para responder al instante; si esa copia permitiera algo que el servidor rechaza, la
tarjeta se movería y volvería sola, que es peor que no dejarla mover. `pruebaPermisos.js` compara
las dos reglas en los 672 casos de rol × fase origen × fase destino.

**Qué NO quedó configurable, a propósito.** Los roles siguen definidos en código: su identificador
está amarrado a la lógica y un rol nuevo creado desde la hoja no tendría comportamiento. Tampoco
los campos editables por fase ni el alcance por plataforma: se propusieron y el negocio decidió
empezar por lo demás.

### D-69 · Los permisos son una página, no una ventana

La cuadrícula de permisos se hizo primero como modal y no daba: son 17 permisos más 8 fases por 11
roles, y en una ventana hay que desplazarse a lo alto **y** a lo ancho a la vez para encontrar una
casilla. Configurar permisos es comparar roles entre sí, y eso pide verlos todos de una mirada.

Ahora ocupa la página entera de Administración, que alterna entre dos vistas: catálogos y permisos.
No es una pestaña nueva del menú principal, porque no es una función aparte: es parte de
administrar, y compartir el permiso `Administrar` evita inventar uno nuevo para lo mismo.

Con el ancho completo, los nombres de rol van **horizontales** en vez de girados noventa grados.
Se parten en dos líneas cuando hace falta: con *"Líder de proyecto FS"* en una sola, la tabla se
pasaba dieciocho píxeles y aparecía justo el desplazamiento horizontal que se quería evitar.

**Atajo por fila.** Cada permiso tiene un *todos* al final que lo marca o desmarca para los once
roles de un golpe. Con 275 casillas es la diferencia entre configurar y resignarse, y como nada se
guarda hasta presionar **Guardar permisos**, equivocarse no cuesta nada.

Tres detalles que no son cosméticos:
- **Se avisa antes de salir con cambios sin guardar.** Es una pantalla donde uno marca veinte
  casillas y se distrae; perderlas por un clic en *Volver* sería una lástima evitable.
- **Entrar a Administración siempre abre en catálogos.** Si alguien se fue a otra pestaña dejando
  abierta la cuadrícula, al volver no se encuentra con una pantalla que no recuerda haber pedido.
- **El título de cada grupo se queda a la vista** al desplazar a lo ancho en una pantalla angosta.
  Vive en un `<span>` propio y no pegado a la celda, porque la celda abarca todas las columnas y
  fijarla a ella no sirve de nada.

### D-70 · El nombre de un rol es del negocio; su identificador, del sistema

**Error corregido.** La pantalla de permisos —y con ella el nombre de rol que aparece arriba a la
derecha, el desplegable al editar un usuario y el correo de bienvenida— leía la lista `ROLES`
escrita en el código, no la hoja `Roles`. Quien renombrara un rol desde Administración veía el
cambio en la hoja y en ninguna otra parte. Eran trece sitios.

Es exactamente el mismo error que se corrigió en D-57 para plataformas, líneas estratégicas y
verticales: se arregló allá y se volvió a cometer aquí, porque los roles no se habían agregado a la
capa de catálogos que lee de la hoja. Ahora sí están, con `getRoles_()`.

**Qué se lee de la hoja y qué no**, que es la distinción que importa:

| De la hoja `Roles` | Del código |
| --- | --- |
| El **nombre** del rol | Qué significa cada identificador para el sistema |
| **Qué roles existen**: uno agregado ahí aparece en permisos, uno retirado desaparece | — |
| El **orden** en que se listan | — |

Lo que un rol **puede hacer** no cambia por renombrarlo: sale de `Permisos_Rol`, indexada por
identificador. Renombrar *Analista Fábrica* a *Ingeniero de software* no le quita ni le da nada;
`RO-03` sigue siendo `RO-03`.

**Un rol creado desde la hoja arranca sin ningún permiso**, ni siquiera ver el Home. Es lo correcto:
el sistema no puede adivinar qué debe poder hacer un rol que no conocía, y concederle algo por
defecto sería peor que no concederle nada. Se le marcan sus permisos en la misma pantalla.

**Si la hoja `Roles` queda vacía se usa la lista del código**, no una lista vacía: igual que con los
demás catálogos, quedarse sin roles dejaría a todo el mundo sin acceso.

### D-71 · Aviso cuando alguien comenta, y el enlace que lo hace útil

Los comentarios se construyeron para coordinar (D-62, D-63) y no avisaban a nadie: quien escribía
quedaba esperando una respuesta que el otro solo veía si entraba por su cuenta. Ahora hay correo.

**A quién le llega**, que es la decisión de fondo y es distinta en cada caso:

| | Responsables del tema | Más… |
| --- | --- | --- |
| Solicitud | Solicitante y responsable | Quien ya haya comentado ahí |
| Iniciativa | Business Owner y Product Owner | Quien ya haya comentado ahí |

La segunda columna es la que hace que esto funcione como conversación. Sin ella: el Business Owner
pregunta algo en una solicitud, el responsable contesta, y el BO no se entera nunca porque no es ni
solicitante ni responsable de esa solicitud.

**Nunca al autor de su propio comentario.** Tampoco a un usuario inactivo, a uno sin correo
registrado, ni a quien perdió el permiso de ver esa sección: avisarle de algo que no puede abrir es
solo ruido.

**Lo que se descartó:** avisarle a todos los solicitantes de todas las solicitudes de una iniciativa
cuando alguien comenta la iniciativa. En INI-001 eso son veinte personas recibiendo algo que no les
concierne, y a la tercera vez lo filtran a la papelera — junto con los avisos de bloqueo que sí
importan.

**Por correo y no por Chat.** La tarjeta de Chat va al espacio completo; un comentario es una
conversación entre dos o tres. Si cada comentario publicara una tarjeta, en dos semanas alguien
silencia el espacio y pierde también las alertas que sí son de equipo.

**El asunto es estable** para un mismo tema (`Comentario en SOL-0042 · Pasarela de recaudo`), así
Gmail apila la conversación en un hilo en vez de llenar la bandeja con mensajes sueltos. Es la
defensa barata contra el ruido; si no alcanza, el siguiente paso sería acumular y mandar un resumen
cada media hora, que es bastante más maquinaria.

**El correo lleva el texto completo**, por decisión del negocio. Tener que entrar a la aplicación
para saber de qué se trata convierte el aviso en una molestia. Con una consecuencia que conviene
tener presente: el texto de los comentarios ahora sale hacia bandejas de entrada, incluidas las del
dominio aliado cuando alguien de la fábrica es responsable o participante.

**Responder el correo no publica nada**, y el correo lo dice. Hacer que una respuesta por Gmail se
convierta en comentario es posible pero es otro proyecto, y frágil.

### D-72 · Enlaces directos a una solicitud o a una iniciativa

Sin esto el aviso valía la mitad. `doGet` solo aceptaba `?page=gestion`, que abre el tablero
completo: el correo decía *"Sandra comentó en SOL-0042"* y dejaba a la persona buscando a mano
entre noventa tarjetas. A la segunda vez deja de hacer clic.

Ahora `?page=gestion&id=SOL-0042` abre el tablero **y** el detalle de esa solicitud, con su
seguimiento a la vista; `?page=iniciativas&id=INI-004` abre Seguimiento con esa iniciativa
desplegada y sus comentarios encima, que es de donde viene quien llegó por el correo.

Sirve para más que la notificación: ahora se puede pegar el enlace de una solicitud en un chat o en
un correo propio y quien lo abra cae exactamente ahí.

Tres cuidados en la implementación:
- **El identificador se limpia antes de tocar el HTML** (solo letras, números y guiones, 40
  caracteres) porque viene de la barra de direcciones y termina dentro de la página.
- **Se pasa a mayúsculas**: todos los códigos del sistema lo son, y un enlace escrito a mano en
  minúsculas abriría un detalle que "no existe", que parece un error y no lo es.
- **Si el rol no puede ver esa sección, el enlace simplemente no abre nada.** La página ya se
  redirige a la primera que sí puede; el enlace no es una puerta trasera.

### D-73 · Una instrucción que no se podía seguir, y una dirección que no servía

**Primer problema.** `configurarUrlAplicacion("https://…")` pedía la dirección entre paréntesis, y
el desplegable de funciones del editor de Apps Script **no permite pasar argumentos**: ejecutarla
desde ahí corría la función sin nada y fallaba. La guía lo resolvía pidiendo crear un archivo
temporal con una función envoltorio — cuatro pasos y algo de programación para guardar una
dirección.

**Segundo problema, que el primero destapó.** Se hizo que la función averiguara la dirección sola,
con `ScriptApp.getService().getUrl()`. Está mal: **esa llamada devuelve una dirección distinta según
dónde se ejecute.**

| | Qué es | Quién puede abrirla |
| --- | --- | --- |
| `…/dev` | La de pruebas. Corre el último código guardado | Solo quien tenga permiso de **editar el script** |
| `…/exec` | La publicada, la de la implementación fija | Quien diga la configuración de la implementación |

Desde el editor devuelve la `/dev`; corriendo dentro de la aplicación publicada devuelve la
`/exec`. Y la función de configuración se ejecuta justamente desde el editor — así que el "arreglo"
guardaba la dirección de pruebas, y los correos habrían salido con un enlace que casi nadie puede
abrir. Lo detectó el negocio al comparar las dos direcciones, antes de que llegara a un usuario.

**Cómo quedó, con tres defensas:**

1. **Una `/dev` no se guarda nunca.** Se rechaza explicando por qué, en vez de aceptarla y fallar
   después en el buzón de alguien. Una dirección que no termine en `/exec` tampoco.
2. **La aplicación aprende su propia dirección al ser usada.** `doGet` la anota la primera vez que
   alguien la abre, que es el único momento en que el proyecto se está ejecutando *dentro* de su
   implementación y puede conocerla. Se guarda en una clave aparte para no pisar nunca lo que
   alguien haya escrito a mano.
3. **Se puede escribir a mano desde Administración**, en un campo que valida lo mismo. Es el camino
   garantizado, y es una pantalla y no el editor.

Y si quedó una `/dev` guardada de antes, `getUrlAplicacion_()` la ignora y usa la aprendida, y el
diagnóstico lo dice en mayúsculas.

**Dos lecciones, que valen para lo que venga:**

- Una función pensada para que la ejecute una persona no técnica tiene que poder ejecutarse **desde
  el desplegable, sin argumentos**. Si necesita datos, o los averigua sola, o se piden desde una
  pantalla de la aplicación.
- **Automatizar un dato no es garantía de acertarlo.** Detectar la dirección sola parecía
  estrictamente mejor que pedirla, y era peor: sustituyó un paso molesto pero visible por un valor
  equivocado y silencioso. Cuando se automatiza un dato, hay que validar que el valor obtenido
  sirva para lo que se va a usar.

### D-74 · El detalle de la iniciativa, con la conversación al lado de los datos

La ventana que abría la lupa mostraba **solo los comentarios**. Para saber de qué iniciativa se
estaba hablando había que cerrarla y volver a la tabla — justo cuando se necesita el contexto para
entender lo que alguien escribió.

Ahora abre el **detalle completo**: estado, prioridad, tipo, LEN, vertical, plataforma, Business
Owner, Product Owner y las tres fechas; la descripción; el avance; la documentación en Drive; y
debajo, la trazabilidad de comentarios con el cuadro para escribir uno nuevo.

**El avance se calcula con las mismas reglas del listado** (D-61), no con otras. Dos números
distintos para lo mismo serían peor que ninguno: quien viera 47,6% en la tabla y otra cosa aquí
dejaría de creerle a los dos.

**Tres columnas, no una.** La primera versión ponía todo en columna y había que desplazarse
hasta el final para llegar a los comentarios, que son lo que más se consulta. Ahora la ventana es
ancha y se lee de izquierda a derecha como se pregunta: **quién es** la iniciativa (datos, avance,
documentación), **qué se está haciendo** (sus actividades con el estado de cada una) y **qué se ha
dicho** (los comentarios). Por debajo de 1040 px las tres se apilan en ese mismo orden.

El ancho es de la ventana del detalle y no de todas: un modal de 1160 px para un formulario de
cuatro campos deja las etiquetas a un metro de sus casillas. `abrirModal` recibe el ancho de quien
la abre, y lo quita al abrir cualquier otra.

**Las actividades van ordenadas como en el tablero** (D-66): primero lo más prioritario, y a igual
prioridad lo que se pidió antes. La misma regla, la misma función. Y de cada solicitud se manda al
navegador solo lo que el detalle muestra —código, nombre, fase, estado, responsable y si está
bloqueada—, no la fila entera: serían campos que nadie mira engordando cada consulta.

**Lo ve todo el mundo; editar sigue siendo de dos roles.** Ver no es editar. Quien puede editar
encuentra un botón que abre el formulario desde el mismo detalle, sin volver a la tabla.

**La lupa reemplaza al globo de comentarios** en tarjetas y filas. Dos botones para lo mismo —uno
que abría comentarios y otro que habría abierto el detalle— habrían sido una decisión de más en
cada uso. El detalle incluye los comentarios, así que el globo perdió su razón de ser.

El enlace directo de los correos (`?page=iniciativas&id=INI-004`) abre ahora este detalle: quien
llega desde el aviso de un comentario cae en la conversación **y** en el contexto que la explica.

### D-75 · La documentación de la iniciativa vive en un campo suyo

Campo nuevo `Drive_URL` en la iniciativa: la carpeta donde vive la documentación del proyecto.

Es de la **iniciativa** y no de cada solicitud. Las solicitudes ya tienen su propia carpeta, que el
sistema crea al registrarlas; esta es la del proyecto completo, la que alguien arma a mano con el
caso de negocio, los diseños y las actas. Son dos cosas distintas y por eso son dos campos.

Se llena editando la iniciativa y se lee desde el detalle, con un botón. Cuando está vacío, el
detalle lo dice —y a quien puede editar le recuerda dónde se agrega— en vez de callar.

### D-76 · El sistema deja de crear carpetas y documentos en Drive

Al registrar una solicitud, el sistema creaba una carpeta en Drive y clonaba dentro una plantilla
de requerimiento en blanco. Se retira: **creaba una carpeta por cada solicitud aunque nadie fuera a
usarla**, y un documento vacío que casi siempre terminaba al lado del que el equipo sí estaba
trabajando. Drive se llenaba de contenedores que nadie abría.

Se va todo lo que colgaba de eso: la creación de la carpeta al registrar, la misma creación en la
carga masiva, y la plantilla de requerimiento que el instalador creaba en Drive y que ya no se
clona en ninguna parte.

**Los campos de enlace siguen existiendo** porque los enlaces siguen siendo útiles; lo que cambia
es que los pega una persona en vez de inventarlos el sistema. *(El de la carpeta se retiró de la
solicitud poco después: ver D-78.)*

### D-77 · Los enlaces de la solicitud van en su tarjeta, no en el correo

El correo de creación llevaba dos botones: la carpeta en Drive y el documento. Se retiran.

**El correo se recibe una vez y después hay que buscarlo**; la tarjeta se tiene delante cada vez
que se abre el tablero. Un enlace que se necesita durante semanas no pertenece a un mensaje que
envejece en la bandeja el mismo día.

Ahora aparecen como dos íconos al pie de la tarjeta —📁 la carpeta, 📄 el documento— solo cuando
esa solicitud los tiene. Siguen también en el detalle, donde ya estaban.

**Un clic en el ícono no abre el detalle.** El tablero abre la solicitud al hacer clic en
cualquier parte de la tarjeta, así que los enlaces se marcan con `data-enlace` y el manejador los
deja pasar al navegador: sin eso, abrir la carpeta de Drive abriría además el detalle por detrás.

La tarjeta de Google Chat conserva sus botones. Se dejó así porque el negocio pidió el cambio
sobre el correo, y porque con los campos ya casi siempre vacíos esos botones rara vez aparecerán.

### D-78 · Un enlace por cosa: la carpeta es de la iniciativa, el requerimiento es de la solicitud

Al quitar la creación automática (D-76) quedaron dos campos de enlace en la solicitud —la carpeta
de Drive y el documento— y uno más en la iniciativa. El negocio precisó el modelo, y es más simple:

| | Enlace | Quién lo pone |
| --- | --- | --- |
| **Iniciativa** | La carpeta de Drive con la documentación del proyecto | Una persona, a mano |
| **Solicitud** | El documento del requerimiento | Una persona, a mano |

Así que `Carpeta_Drive_URL` **se retira de la solicitud**. No era un campo de más por casualidad:
venía de cuando el sistema creaba una carpeta por solicitud, y al dejar de crearlas quedó como un
sitio donde se podía pegar algo que ya vive un nivel más arriba. Dos lugares donde guardar la misma
carpeta es garantía de que un día no coincidan.

Se va de la solicitud, de su tarjeta —que ahora muestra un solo ícono, el del requerimiento—, de su
detalle, de la carga masiva y de la migración. La columna sigue en la hoja con lo que tuviera
(D-60): el sistema ya no la lee ni la escribe, pero tampoco borra lo que alguien guardó ahí.

**Y de paso se van los botones de la tarjeta de Google Chat**, que era lo único que seguía
publicando esos enlaces fuera de la aplicación. En D-77 se habían dejado porque el pedido era sobre
el correo; con el modelo ya claro no tiene sentido sostener la excepción.

### D-79 · Dos gobiernos sobre la misma tabla: la fábrica y las tareas

Las solicitudes no son todas de la misma naturaleza, y hasta ahora el sistema las trataba como si
lo fueran: las cuatro clases pasaban por el mismo embudo de ocho fases. Para *Nuevo*, *Mejora* y
*Ajuste* eso describe bien el trabajo. Para una **Tarea** no: una tarea se pide, se hace y se
cierra. Obligarla a recorrer *Análisis y diseño*, *Pruebas UAT* y *Aceptación TI* llenaba el tablero
de tarjetas que nadie iba a mover y ensuciaba todos los indicadores del embudo.

Se separan los dos gobiernos:

| | Tipos | Se mueve por | Tablero |
| --- | --- | --- | --- |
| **Fábrica** | Nuevo, Mejora, Ajuste (`TIP-01`…`TIP-03`) | Las 8 fases | Gestión › **Fábrica** |
| **Tarea** | Tarea (`TIP-04`) | El estado | Gestión › **Tareas** |

**Una sola tabla, no dos.** Una tarea sigue siendo una solicitud: cuelga de su iniciativa, cuenta
en su avance, recibe comentarios y aparece en el detalle de seguimiento. Partirla en otra hoja
habría duplicado toda esa maquinaria para ganar nada. Lo que cambia es cómo se gobierna, no dónde
vive. En el código eso es una sola pregunta, `esTipoTarea(tipo)` sobre `TIPOS_SIN_EMBUDO`
(`Esquema.gs`): si mañana otro tipo deja de pasar por el embudo, se agrega ahí y todo lo demás
—validación, tableros, métricas, avance— lo sigue solo.

**La fase deja de ser obligatoria, pero no queda suelta.** `Fase_Actual` pasó a opcional en el
esquema, y la regla se mudó a `validarSolicitud_`: una solicitud de fábrica *exige* fase, y una
tarea *exige* que esté vacía. Se rechazan los dos errores, no solo uno. Una tarea con fase sería
peor que una tarea sin ella: aparecería en el embudo y en los indicadores de fábrica como si fuera
un requerimiento.

**Las cuatro columnas del tablero de tareas** son `Por iniciar · En progreso · Bloqueada ·
Terminada`. *Aprobada* no está porque una tarea no pasa por aprobación, y *Cancelada* tampoco:
son un archivo, no un paso del trabajo, y una columna que solo crece no aporta. Para que el número
no desconcierte, el subtítulo dice cuántas quedaron fuera de columna cuando las hay.

**Bloquear es mover.** Arrastrar una tarea a *Bloqueada* pone `Tiene_Bloqueo` en SÍ, y sacarla de
ahí lo levanta. Antes el bloqueo era un campo aparte que había que acordarse de sincronizar con el
estado; ahora el gesto y el dato son lo mismo y no pueden contradecirse.

**El SLA por fase se reemplaza por una fecha compromiso.** Una tarea no tiene embudo contra el cual
medirse, así que sin `Fecha_Compromiso` no habría forma de que llegara tarde. Se muestra al pie de
la tarjeta, y en rojo si ya pasó —salvo que la tarea esté cerrada: una tarea terminada nunca llega
tarde, por tarde que se haya terminado—. El formulario de nueva solicitud muestra *Versión
estimada* o *Fecha compromiso* según el tipo, porque ninguno de los dos aplica a la otra clase.

**Cambiar el estado de una tarea es un permiso propio** (`Mover_Estado_Tarea`, grupo *Tareas* en
Administración › Permisos). No se reutilizó `Mover_Fase`: quien atiende las tareas del día a día no
es necesariamente quien mueve requerimientos por el embudo, y con el permiso separado eso se
configura. En la primera instalación lo reciben los mismos roles que ya operaban el tablero.

**Ningún indicador del embudo cuenta tareas.** `cargarDatos_` reparte la tabla en `solicitudesFabrica`
y `tareas`, y todo lo que mide fases —lead time, throughput, embudo, first pass yield— lee el
primero. Si no se hubiera hecho, agregar tareas habría torcido cada métrica histórica sin que nadie
lo notara. A cambio el Home gana su propio bloque: `calcularTareasAbiertas_` informa abiertas,
cerradas en la ventana, bloqueadas y vencidas.

**El avance de la iniciativa sí las cuenta, y debe contarlas**: una tarea es una actividad del plan
como cualquier otra. Como no tiene fases, su avance se lee del estado —terminada 100 %, en progreso
50 %, el resto 0 %— y se promedia con el de las de fábrica en un solo porcentaje. Un número por
iniciativa, no dos: quien mira la tarjeta quiere saber cómo va el proyecto, no cómo va cada
gobierno interno.

**Para las tareas que ya existen** hay `normalizarTareas` (`Mantenimiento.gs`): vacía la fase de las
`TIP-04` y la traduce a estado —`FAS-08` a *Terminada*, con bloqueo a *Bloqueada*, `FAS-03` a
`FAS-07` a *En progreso*—. Nunca toca una que ya esté *Terminada* o *Cancelada*, y por defecto
**solo simula**: hay que llamarla con `true` para que escriba.

### D-80 · La solicitud se registra donde de verdad está, y por quién de verdad la pidió

Dos datos que el formulario no preguntaba y el sistema decidía solo:

**El solicitante.** Se guardaba siempre a quien estaba registrando. Casi siempre es lo mismo, pero
no siempre: alguien de la gerencia registra lo que pidió un líder de otra área, y esa solicitud
quedaba a nombre de quien la tecleó. Ahora es un campo del formulario, marcado de entrada con quien
registra —que es la respuesta correcta la mayoría de las veces— y cambiable cuando no lo sea. El
servidor conserva la regla vieja como respaldo: si no llega solicitante, es quien registra.

**La fase de entrada.** Toda solicitud nacía en *Gestión de la demanda*. Una que llega ya analizada,
o que se registra cuando el trabajo va avanzado, obligaba a arrastrar la tarjeta cinco veces hasta
donde de verdad estaba. Ahora se elige al crearla, con *Gestión de la demanda* por omisión.

**Registrar en una fase cuesta lo mismo que llegar a ella arrastrando.** Es la misma regla, no una
segunda: `faseDeIngreso_` llama a `validarTransicion(rol, 'FAS-01', fase)`. Sin esto, cualquiera que
pudiera crear una solicitud podría colocarla donde quisiera, y los permisos de mover fase —y de
saltarlas, que acabábamos de hacer configurables— no servirían de nada: bastaría con crear la
tarjeta directamente en *Producción*. El combo del formulario se arma con la misma pregunta, así que
solo ofrece lo que el rol podría operar; si no queda más que una fase, el campo no se dibuja,
porque un combo de una sola opción no es una decisión. Y una tarea nunca lleva fase: no recorre el
embudo (D-79).

**El estado se deduce de la fase, no se pregunta.** Una solicitud registrada en *Desarrollo* no está
"por iniciar": ya arrancó, y por eso se registra ahí. *Gestión de la demanda* y *Backlog* son
antesala y nacen *Por iniciar*; de *Análisis y diseño* a *Aceptación TI*, *En progreso*;
*Producción*, *Terminada*. Dejar siempre `EST-01` habría puesto en el tablero tarjetas que se
contradicen a sí mismas, y habría hecho que el avance de la iniciativa contara como no empezado un
trabajo que sí lo está. La auditoría guarda ese estado real, no el `EST-01` fijo que guardaba antes.

**Y deja su estampa de tiempo.** Entrar en *Desarrollo* escribe `Fecha_Inicio_Dev`, igual que si se
hubiera llegado arrastrando. Sin eso, el tiempo neto de construcción habría dejado fuera del
indicador a esa solicitud sin decir por qué. Las fases por las que nunca pasó quedan en blanco, que
es la verdad.

### D-81 · Los filtros de Gestión, reducidos a los que se usan

La barra traía seis filtros y dos botones, y ocupaba dos filas enteras por encima del tablero.
Queda así, en este orden: **Iniciativa, Plataforma, Solicitante, Responsable, Buscar.**

**Se retiran línea estratégica y vertical.** Son atributos de la iniciativa, no de la solicitud:
filtraban de rebote, a través del proyecto al que pertenece cada tarjeta. Quien quiere ver una línea
completa la mira en Iniciativas, que es donde vive esa lectura; en el tablero operativo nadie
preguntaba por ellas.

**Entra solicitante**, que sí es un dato de la solicitud y hasta ahora no se podía filtrar aunque se
guardara desde el principio.

**Los dos botones comparten una casilla.** *Limpiar* y *+ Nueva Solicitud* ocupaban cada uno el
ancho de un filtro, con una etiqueta vacía encima para alinearse. Juntos en una sola casilla, y con
dos filtros menos, la barra completa cabe en una línea y el tablero gana una fila entera de alto.

### D-82 · Lo que se esconde tenía que esconderse de verdad

Al revisar el formulario en el navegador apareció que los campos que D-79 muestra según el tipo
—*Versión estimada* para fábrica, *Fecha compromiso* para tarea— **seguían viéndose los dos**. El
código estaba bien; la hoja de estilos, no.

El atributo `hidden` da `display:none`, pero es el navegador quien lo da, y **cualquier regla propia
que fije un `display` lo pisa**: una clase y un atributo pesan igual, y entre iguales gana la última.
`.campo` declara `display:flex`, así que `.campo[hidden]` se seguía pintando.

Ya había cinco parches de este mismo problema en la hoja —`.pagina[hidden]`, `.velo[hidden]`,
`.toast[hidden]`, `.prioridades[hidden]`, `.ingreso[hidden]`—, cada uno puesto el día que alguien
notó que algo no se escondía. Se reemplaza el goteo por una sola regla: `[hidden]{display:none
!important}`. Con `!important` gana siempre, sin depender del orden ni de en cuál de los dos bloques
`<style>` esté la otra regla.

**Por qué no se había visto:** el ensayo con el que se prueban las pantallas en el navegador traía
su propia copia de los estilos del formulario y solo cargaba el primero de los dos bloques `<style>`
del archivo real. Probaba una hoja de estilos que no existe. Los ocho armadores de ensayo ahora
concatenan todos los bloques, y la prueba comprueba que quitar la regla vuelve a mostrar los campos:
sin eso, verificaría que el atributo está puesto, no que sirve de algo.

### D-83 · La iniciativa también tiene solicitante

La solicitud sabía quién la pedía desde el principio (D-80 lo hizo elegible); la iniciativa no.
Quedaban el Business Owner y el Product Owner, que son quienes la **llevan**, y no había dónde
anotar quién la **pidió** —un área que encarga el trabajo a la gerencia que lo ejecuta—. Se agrega
`Solicitante_Usuario` a la tabla de iniciativas.

**No hizo falta tocar ninguna de las dos pantallas de edición.** El formulario del lápiz de cada
fila y el de Administración se arman los dos recorriendo las columnas del esquema, así que el campo
aparece en ambos por existir, con su texto de ayuda incluido. Es el mismo pago que viene dando el
esquema declarativo desde el principio, y la razón por la que agregar un dato al modelo sigue
costando una línea.

### D-84 · El seguimiento muestra lo que se mira, no todo lo que se sabe

El listado traía LEN y Vertical, que son los dos ejes de la otra vista del portafolio: quien abre
la matriz los lee en la posición de cada tarjeta, y quien abre el seguimiento no los estaba
preguntando. Ocupaban dos columnas para repetir una clasificación que no cambia casi nunca.

Quedan doce, en este orden: **Iniciativa · Estado · Solicitante · BO · PO · Inicio · Fin planeado ·
% real · % esperado · Prioridad · Tipo · Plataforma.**

**BO y PO van en iniciales.** Son unas pocas personas repartidas entre treinta y nueve iniciativas:
escritos completos gastaban dos columnas anchas para repetir los mismos nombres fila tras fila. En
iniciales se reconocen igual de rápido —quien trabaja ahí sabe quién es *CP*— y el nombre completo
sigue disponible en el título emergente, así que no se pierde nada. Se toman la primera y la última
palabra y no las dos primeras: *Sandra Milena Orejarena* da **SO**, que es lo que uno esperaría, y
no **SM**.

**El solicitante sí va con nombre completo**, porque es el dato nuevo y todavía no está en la
cabeza de nadie.

### D-85 · Los filtros del portafolio: los que preguntan algo

Quedan seis: **Iniciativa · Solicitante · Plataforma · Tipo de iniciativa · Estado · Buscar.**

**Sale el de prioridad**, que tenía vista propia: la pestaña *Por prioridad* ya agrupa por ese
criterio, y un filtro que reproduce una vista completa es una forma más lenta de llegar al mismo
sitio.

**Entra el de iniciativa**, con búsqueda predictiva sobre las treinta y nueve, y **el de
solicitante**, que es el filtro que el campo nuevo hace posible.

**Las dos listas largas se arman con lo que de verdad hay en el portafolio** y no con el catálogo
completo de usuarios: ofrecer como filtro a alguien que no es solicitante de ninguna iniciativa es
ofrecer un filtro que siempre devuelve vacío. Y se rehacen en cada carga, no una sola vez: si
alguien acaba de asignarse como solicitante tiene que aparecer sin recargar la página. Los tres
combos que salen de catálogos fijos sí se arman una vez, porque rehacerlos borraría la opción
elegida; rehacer una lista predictiva no toca lo que la persona haya escrito.

**El campo abierto pasó de buscar solo el nombre a buscar por todo lo que se ve en la fila**: el
código, el nombre, el solicitante, el BO, el PO y la plataforma. Con seis filtros al lado, el campo
libre sirve para lo que ninguno de ellos cubre —escribir un apellido y ver qué aparece—, y buscar
únicamente por nombre lo dejaba redundante con el filtro de iniciativa que acababa de entrar.

### D-86 · Desde la iniciativa se llaman actividades

Lo que en Gestión es una *solicitud* —algo que alguien pide y la fábrica atiende— desde la
iniciativa es otra cosa: un renglón de su plan, lo que hay que hacer para sacarla adelante. Y desde
que las tareas no recorren el embudo (D-79), dentro caben dos gobiernos distintos, así que llamarlas
a todas "solicitudes" confundía justo donde hay que entenderlas juntas.

El desplegable pasa a hablar de **actividades**: el resumen, el mensaje de cuando no hay ninguna, la
celda de *% real* y la nota de la vista. La palabra *solicitud* se queda donde sí describe lo que
pasa: en Gestión, en el formulario de registro y en los correos.

**Las iniciales del BO y del PO se revierten.** D-84 las había puesto para ahorrar ancho; el negocio
prefiere el nombre completo, y con LEN y Vertical ya fuera de la tabla el ancho alcanza.

### D-87 · La fila de la iniciativa se ve, y la de sus actividades también

Todo el listado era blanco: la fila de una iniciativa, la de sus actividades desplegadas y la
siguiente iniciativa se leían igual, y con dos o tres desplegadas había que ir contando filas para
saber dónde terminaba una y empezaba otra.

Ahora la fila de la iniciativa va en **azul claro** (`#E4EDFA`) y la de sus actividades en blanco.
El azul es más saturado que el fondo de la página (`#F3F6FB`) a propósito: si fuera parecido,
distinguirlos dependería de la pantalla de cada uno. Los dos niveles necesitaron clases separadas
—`ini-fila` e `ini-detalle`—, porque antes compartían `ini-abierta` y cualquier color habría teñido
también las actividades.

### D-88 · Lo que hacía falta saber de cada actividad

Cuatro datos que estaban en el sistema y no se veían en la lista:

- **El tipo**, debajo del código: nuevo, mejora, ajuste o tarea. Sin él, una tarea y un requerimiento
  se veían igual salvo por el número de casillas, que es un detalle que hay que saber interpretar.
- **La plataforma, al lado de la versión.** Una misma `v2.4.0` la tienen varias plataformas: el
  número solo no dice de cuál se habla. Aparece también cuando no hay versión, porque la actividad
  sí tiene plataforma aunque no tenga versión comprometida.
- **El rótulo "Responsable"** encima del nombre. Un nombre suelto en una columna no dice si es quien
  lo pidió, quien lo hace o quien lo aprueba.
- **Una tarea ya no antepone su fase al estado.** No tiene fase, así que quedaba un `·` suelto
  delante, como si faltara un dato.

**Y las tareas llevan tres casillas, no ocho** —por iniciar, en progreso, terminada—, que son los
tres momentos que de verdad tienen. Con ocho, seis no se llenarían nunca y toda tarea parecería
atrasada. Una tarea **bloqueada cuenta como en progreso** y se pinta en rojo: empezó y está trabada,
que es distinto de no haber empezado. Una cancelada no llena ninguna.

### D-89 · Un filtro menos, y la barra en una sola línea

Con seis filtros más el selector de vista, el campo de búsqueda se bajaba a una segunda línea y la
barra ocupaba el doble de alto que la tabla que encabeza.

**Sale el filtro de estado.** Quedan cinco —Iniciativa, Solicitante, Plataforma, Tipo de iniciativa
y Buscar— y todo cabe en un renglón.

**El estado entra al campo abierto.** Sigue siendo una columna de la tabla, y el campo libre ya
prometía buscar "por todo lo que se ve en la fila": dejarlo fuera lo habría convertido en el único
dato a la vista por el que no se puede buscar. Quien filtraba por *En riesgo* ahora lo escribe y
obtiene lo mismo, sin gastar un combo permanente para algo que se consulta de vez en cuando.

### D-90 · Las actividades, agrupadas por gobierno

El desplegable listaba las actividades seguidas, ordenadas por prioridad y fecha. Con los dos
gobiernos conviviendo (D-79) eso alternaba barras de ocho y de tres casillas fila tras fila, y
costaba ver de qué se estaba hablando en cada renglón.

Ahora van en dos grupos rotulados —**Gestión de fábrica** y **Tareas**—, cada uno con su conteo, y
dentro de cada grupo se conserva el mismo orden de atención de antes. Fábrica va primero porque es
donde está el trabajo que recorre el embudo; las tareas son el día a día que lo acompaña.

**El grupo se rotula aunque sea el único.** Una iniciativa que solo tiene tareas igual dice
"Tareas": la diferencia entre tres y ocho casillas es sutil y no tiene por qué adivinarse a partir
de la barra.

### D-91 · El issue de Taiga, a un clic desde la tarjeta

`Link_Taiga` existía en el modelo desde el principio y se guardaba desde la carga masiva, la
migración y el formulario de edición, pero no se veía en ninguna parte: para abrir el issue donde la
fábrica está construyendo una solicitud había que entrar a editarla y copiar la URL a mano.

Ahora la tarjeta del tablero lleva **🎫** junto al **📄** del requerimiento. Son dos sitios
distintos y conviene que se distingan: el documento dice *qué* se pidió, el issue dice *cómo va la
construcción*. El mismo par aparece en el detalle de la solicitud, allí con su nombre escrito,
porque hay sitio y no hay que adivinar a dónde lleva cada ícono.

**Cada ícono sale solo si esa solicitud tiene ese enlace**, la misma regla que ya tenía el
requerimiento: una tarjeta sin ninguno no deja huecos. La función pasó de devolver un enlace fijo a
recorrer una lista, así que sumar un tercero mañana es una línea.

**El ícono no abre el detalle.** El tablero abre la solicitud al hacer clic en cualquier parte de la
tarjeta, así que los enlaces siguen marcados con `data-enlace` y el manejador los deja pasar al
navegador; sin eso, abrir el issue abriría además el detalle por detrás.

**No se agrega al formulario de registro** a propósito: cuando alguien registra una solicitud el
issue todavía no existe —lo crea la fábrica después—, así que pedirlo ahí sería pedir un dato que
nadie puede tener. Se llena editando la solicitud, y el campo trae ahora un texto de ayuda que dice
que al guardarlo aparece el ícono.

### D-92 · Las fechas de fase: lo que faltaba, y lo que contaba mal

Al revisar si arrastrar una tarjeta registraba las fechas de cada etapa aparecieron tres cosas. La
primera era una falta; las otras dos eran datos que se veían bien y no lo estaban.

**Faltaban las dos primeras fases.** *Gestión de la demanda* y *Backlog* no tenían columna de inicio
ni de fin, así que el tiempo que una solicitud espera **antes** de que la fábrica la toque —que suele
ser el más largo— no se podía medir sin reconstruirlo a mano. Ahora las ocho fases anotan su inicio;
seis anotan su fin. *Aceptación TI* no lo necesita porque de ahí se sale a *Producción*, cuya fecha
de despliegue es su cierre, y *Producción* es el final del embudo.

**La fecha de inicio se reescribía en cada entrada.** Una solicitud devuelta a *Desarrollo* perdía el
día en que empezó a desarrollarse, y el indicador de tiempo neto de construcción la medía desde el
reproceso: mostraba un número menor que el real y nadie tenía cómo notarlo. **Ahora el inicio se
guarda una sola vez**, la primera que entra, que es lo que la palabra significa.

**Una fase se cerraba al abandonarla, aunque fuera hacia atrás.** Devolver de *Pruebas QA* a
*Desarrollo* escribía la fecha de fin de QA como si QA hubiera terminado; no terminó, se interrumpió.
**Ahora solo se cierra una fase cuando se sale de ella hacia adelante.** Al volver a salir de QA, esta
vez superándola, se escribe esa fecha: una fase termina cuando se supera, no cuando se abandona.

**Los saltos siguen dejando vacío lo que no ocurrió**, y así debe ser: una solicitud registrada
directamente en *Desarrollo* nunca estuvo en análisis, y rellenar esas fechas sería inventar historia.

### D-93 · Tiempos por fase, leídos de la bitácora y no de las fechas

Las estampas guardan **una** fecha por fase, así que de una solicitud que pasó dos veces por
*Desarrollo* solo describen la primera entrada y la última salida. Eso basta para la ficha de una
solicitud, pero no para medir el proceso: los reprocesos —justo lo que conviene mirar— quedan
invisibles.

`Auditoria_Transiciones` sí los ve: registra cada movimiento por separado, no sobrescribe nunca, y
cada fila trae ya calculados los días hábiles que la solicitud estuvo en la fase que abandona,
contados en el momento en que ocurrió. El reporte nuevo de la página de Reportes se lee de ahí.

Por fase informa: **pasos** (cuántas veces se salió de ella), **actividades** (cuántas distintas la
recorrieron), **mediana**, **promedio**, **máximo**, **devoluciones** y **en curso**.

**Se muestra la mediana además del promedio, y resaltada.** Basta una solicitud olvidada seis meses
en el backlog para que el promedio deje de describir a las demás; la mediana aguanta. **Más pasos que
actividades significa que hubo reprocesos**, que es la lectura que las fechas de la solicitud no
podían dar. **Las devoluciones se anotan en la fase que recibe el trabajo de vuelta**, que es la que
lo va a rehacer. **"En curso" no entra en los promedios**: ese tiempo todavía corre.

### D-94 · Reconstruir la historia en lugar de empezar de cero

Las dos fases nuevas y las fechas corregidas solo aplicarían de aquí en adelante, y el portafolio ya
tiene historia. Pero esa historia está completa en la bitácora, así que se puede recorrer otra vez
aplicando las reglas nuevas: `reconstruirEstampas` (`Mantenimiento.gs`) hace exactamente eso.

**Solo llena lo que está vacío.** Donde ya hay una fecha no la toca, aunque la reconstrucción diga
otra cosa: pudo haberla corregido una persona a mano, y una función de mantenimiento no es quién
para decidir entre las dos. Esas diferencias se reportan aparte, en la lista `difieren`, con lo que
dice la hoja y lo que dice la bitácora, para que alguien las mire. Ahí es donde aparecerán las
fechas de inicio que la regla vieja había reescrito.

Es **idempotente** —correrla dos veces no cambia nada la segunda— y por omisión **solo simula**.

### D-95 · Una instrucción que no se podía seguir, otra vez

«Ejecútela sin nada entre paréntesis y luego con `true`» describe bien lo que hace la función, pero
**no se puede hacer desde el editor de Apps Script**: uno elige la función en una lista y oprime
Ejecutar, y no hay dónde escribir un argumento. Las cuatro funciones de mantenimiento se explicaban
así, y quien las siguiera al pie de la letra solo podía simular; aplicar exigía escribir código.

Ya había pasado exactamente lo mismo en D-73, con `configurarUrlAplicacion`. Entonces se arregló
ese caso; el patrón se quedó.

Ahora cada función viene **de a dos**: la corta simula, y una gemela que termina en `Aplicar`
escribe. Las dos salen juntas en la lista del editor y no piden escribir nada. Es más código
—cuatro funciones de una línea— a cambio de que la instrucción se pueda seguir.

**Y `reconstruirEstampas` no imprimía su informe.** El editor no muestra lo que una función
devuelve, solo lo que se escribe en el registro; las otras tres ya lo hacían y a la nueva se me
olvidó. Quien la ejecutara habría visto «Ejecución completada» y nada más. La prueba ahora recoge
lo que va al registro, no solo lo que la función devuelve.

**La lección, por segunda vez:** una instrucción operativa hay que comprobarla contra la pantalla
donde se va a seguir, no contra la firma de la función.

### D-96 · El orden de atención se pone a mano, arrastrando

Las columnas del tablero se ordenaban solas: primero lo más prioritario, y a igual prioridad lo más
antiguo. Eso describe bien **qué es urgente**, pero no **en qué orden se va a atender**, que es una
decisión de quien maneja la columna y no una fórmula.

En **Gestión de la demanda**, **Backlog** y **Análisis y diseño** las tarjetas ahora se arrastran
arriba y abajo dentro de su propia columna, y ese orden queda guardado. Cada tarjeta muestra su
puesto, y una raya verde marca dónde va a caer antes de soltarla: sin ella, arrastrar para ordenar
es soltar y ver qué pasó.

**Solo esas tres.** De Desarrollo en adelante el trabajo ya está comprometido y repartido; un orden
ahí no significaría nada. Esas columnas siguen ordenándose solas.

**El orden manual manda sobre la prioridad.** La columna queda exactamente como la dejaron. Si la
prioridad reordenara por encima, arrastrar una tarjeta sobre una Crítica la devolvería a su sitio y
la aplicación parecería no obedecer. La prioridad sigue en la tarjeta para tenerla en cuenta al
ordenar.

**Lo que llega entra de último.** Llegar a una columna no es lo mismo que ser prioritaria. Si
entrara arriba, cada movimiento desordenaría lo que alguien ya acomodó y el orden dejaría de ser una
decisión para volverse un efecto secundario.

**Al servidor se le manda un vecino, no un número:** «ponga esta debajo de aquella». El servidor lee
la columna completa, inserta y renumera. Así el resultado es correcto aunque quien arrastró
estuviera viendo la columna **filtrada** —ve unas pocas tarjetas, pero la que le queda encima es la
que manda— y aunque otra persona haya reordenado la misma columna un segundo antes: se recalcula
sobre lo que hay, no sobre lo que el navegador creía que había. Si el vecino ya no está en esa
columna, se rechaza pidiendo actualizar en vez de adivinar.

**Lo que no tiene número cae al final**, no al principio: no se ha ordenado, y colarlo arriba sería
darle una prioridad que nadie decidió. Por eso no hizo falta migrar nada.

**Una tarjeta bloqueada sí se puede reordenar.** Cambiar de fase con un bloqueo encima está
prohibido —no se puede avanzar lo que está trabado—, pero reordenar no es avanzar: una solicitud
trabada sigue teniendo un lugar en la fila, y a veces justamente hay que moverla.

**Y una advertencia que ya nos pasó:** en D-66 retiramos `Orden_Iniciativa` porque era un número de
orden que el sistema asignaba solo y nadie mantenía — «ordenaba por antigüedad disfrazada de
decisión». Este campo es distinto **solo mientras alguien arrastre de verdad**. Un orden que nadie
toca vuelve a ser ruido con apariencia de criterio, y entonces conviene quitarlo, no dejarlo.

**Un detalle que apareció al probarlo en el navegador:** mientras se arrastraba una tarjeta dentro
de su propia columna, la columna se pintaba de rojo —«ya está en esa fase»— y no salía la raya. La
validación del arrastre solo contemplaba cambios de fase, así que decía que no se podía algo que sí
se puede. Se corrigió donde estaba el error, en la validación, y no tapándolo en el manejador.

### D-97 · Dos numeraciones que se veían iguales, y una recarga que sobraba

**El encabezado de columna se confundía con las tarjetas.** Tenía el mismo color claro que la
columna y llevaba el número de la fase en una pastilla azul oscura **idéntica** a la que D-96 acababa
de poner en cada tarjeta para su orden de atención: dos numeraciones que significan cosas distintas
—la fase del embudo y el puesto en la fila— y se veían igual.

Ahora el encabezado es una **barra azul oscura con texto blanco**: se distingue de un vistazo y
separa claramente el título de la columna de su contenido. El número de la fase va calado sobre esa
barra, en un círculo translúcido, que no se parece a la pastilla sólida de una tarjeta. El conteo
pasa al mismo tratamiento. Al ser opaco, el encabezado pegado sigue tapando las tarjetas al
desplazarse, que es lo que tiene que hacer.

**Y reordenar recargaba el tablero entero.** Al soltar una tarjeta en su columna, el éxito disparaba
`invalidarCacheCliente()` y `cargarGestion(true)`: se borraba la copia local, se pintaba el esqueleto
—pantalla en blanco— y se pedía todo el tablero otra vez, lo que obliga al servidor a releer todas
las hojas. Eso cuesta entre uno y tres segundos, como ya estaba medido en `Cache.gs`. Todo para
volver a dibujar exactamente lo que ya estaba en pantalla: el reordenamiento optimista del navegador
usa la misma regla de inserción que el servidor, así que el resultado era idéntico.

**En éxito ya no se recarga nada.** Lo único que cambió fue el número de orden de una columna, y el
navegador ya lo aplicó. El revertir en caso de error se conserva: si el servidor rechaza, la tarjeta
vuelve sola a su sitio.

**En el servidor, reordenar ya no bota la tabla.** `invalidarTabla_('Solicitudes')` obligaba a releer
todas las hojas en la siguiente consulta —el precio más alto por el cambio más barato—. Ahora
`refrescarOrdenEnCache_` parcha en memoria solo las filas que cambiaron. Y **no marca una versión
nueva de los datos**: el orden de una columna no entra en ningún indicador, matriz ni reporte, así
que rehacer todos los cálculos porque alguien subió una tarjeta un puesto sería tirar trabajo bueno.
Aquí sí se copia el valor que se acaba de escribir, al contrario de lo que advierte
`refrescarFilaEnCache_`: esa advertencia existe porque Sheets convierte fechas y decimales a su
manera, y un entero pequeño vuelve tal cual.

**De paso, refrescar ya no vacía un tablero que está pintado.** Cuando el tablero se recarga de
verdad —al cambiar de fase, por ejemplo— se deja a la vista mientras llegan los datos nuevos, en
lugar de borrarlo para mostrar el esqueleto. El esqueleto solo tiene sentido cuando no hay nada que
mostrar.

### D-98 · Aprobar deja de ser un estado y pasa a ser una compuerta

**"Aprobada" era un estado, y no podía serlo.** Una solicitud puede estar *en progreso* y *aprobada*
a la vez —son dos cosas distintas— y el campo de estado solo podía decir una. Por eso casi no se
usaba: ponerla en *Aprobada* costaba perder la información de que el trabajo iba en curso.

Ahora la aprobación es un dato propio, con su responsable y su fecha. `EST-03` **sale de las listas
donde alguien escoge**, pero **no del catálogo**: la bitácora guarda movimientos viejos hacia ese
estado y sin el nombre mostraría el código crudo. Es el mismo criterio de las columnas retiradas
(D-60): se deja de ofrecer, no se borra.

**Tres compuertas, no una.** *Gestión de la demanda*, *Backlog* y *Análisis y diseño* son las fases
donde todavía se decide **si** se hace y **cómo**; de *Desarrollo* en adelante lo que hay es
ejecución de algo ya aprobado, y otra compuerta ahí solo frenaría al equipo sin agregar criterio.
Cada una pide su propio visto bueno: **al cambiar de fase la aprobación vuelve a cero**, porque
aprobaba la salida de la fase anterior y esa ya se usó. Si no se borrara, aprobar una vez abriría
las tres.

**Devolver no pide aprobación.** Una solicitud se devuelve justamente porque algo no estaba bien;
exigir un visto bueno para reconocerlo sería pedir que alguien apruebe un retroceso. La compuerta
solo mira hacia adelante.

**Se aprueba desde la tarjeta, no desde el detalle.** Aprobar es una decisión de un segundo, y
obligar a abrir la solicitud para tomarla la volvía un trámite. El sello es un círculo vacío o un
visto verde, y el mismo clic lo quita.

**Quien no puede aprobar igual ve el sello**, sin poder oprimirlo: saber si algo está aprobado le
interesa a todo el equipo, no solo a quien lo otorga.

**El permiso es configurable.** De fábrica lo tienen Product Owner y Administrador, que es lo que se
pidió, pero vive en la misma cuadrícula de Administración que todos los demás: mañana se le puede
dar a otro rol sin tocar código.

**Una solicitud bloqueada sí se puede aprobar.** Avanzar con un bloqueo encima sigue prohibido, pero
aprobar no es avanzar: el visto bueno queda dado y la tarjeta avanzará cuando se levante el bloqueo.
Las tareas no se aprueban: no recorren el embudo (D-79).

**Lo que esta decisión no guarda:** el historial de quién aprobó cada compuerta. Los tres campos
describen la fase donde la solicitud está hoy, y al avanzar se limpian. Si más adelante hace falta
auditar las aprobaciones una por una, es una tabla aparte y no un cambio a esto.

**Para lo que ya existe** está `normalizarAprobadas` (`Mantenimiento.gs`): pasa a *En progreso* las
solicitudes que estén en *Aprobada* y las marca aprobadas, conservando las dos cosas que ese estado
significaba. No inventa quién aprobó ni cuándo —esos datos no existían—, así que quedan vacíos.

### D-99 · La espera de cada visita: medirla primero, y repartir la cache en dos

Se reportaron dos esperas: los indicadores del Home tardaban **cada vez** que se abría la página, y
Seguimiento tardaba **la primera vez** que se consultaba. Antes de tocar nada se midió con
`medirRendimiento`, y la medición desmintió la explicación que yo había dado de entrada —que cada
escritura botaba lo calculado y la siguiente persona pagaba el recálculo completo—. En frío las
cuatro consultas sumaban 8.682 ms; en caliente 1.210 ms; **después de una escritura 1.614 ms**. Esos
400 ms de diferencia no son la espera que se siente: la causa estaba en otra parte.

Lo que la medición sí mostró:

| Consulta | En frío | En caliente | Tras escribir |
| --- | --- | --- | --- |
| `getCatalogos` | 4.490 ms | **703 ms** | 580 ms |
| `getMatrizIniciativas` | 3.346 ms | 262 ms | 655 ms |
| `getDatosKanban` | 390 ms | 152 ms | 172 ms |
| `getMetricasHome` | 456 ms | 93 ms | 207 ms |

**`getCatalogos` era el problema del Home, no los indicadores.** Calcular los indicadores costaba
93 ms; los catálogos costaban 703 ms *en el mejor caso*, y son la primera consulta de cada visita:
hasta que no llegan no hay pantalla. Era la única de las cuatro consultas sin cache de resultado —se
rearmaba de nueve lecturas de hoja en cada visita de cada persona—. Ahora se guarda ya armada.

**Dos sellos de versión en lugar de uno.** La cache de resultados se invalida cambiando un sello, y
había un solo sello para todo: mover una tarjeta botaba también los catálogos, que no tienen nada que
ver con las solicitudes. Los catálogos pasan a tener su propio sello, que solo cambia cuando cambia
una de las nueve tablas de las que salen (`TABLAS_DE_CATALOGO` en `Cache.gs`). El trabajo del día a
día —crear solicitudes, moverlas, comentarlas— ya no los bota.

**El mensaje de arranque dejó de llevar columnas que nadie usa.** De las 39 iniciativas y de las
personas se enviaba la fila completa; la pantalla solo usa el identificador y el nombre, para
resolver nombres y llenar dos listas. Van dos columnas. Una prueba verifica que la pantalla no
empiece a usar una tercera sin que nos enteremos.

**Seguimiento pagaba la bitácora sin necesitarla.** `cargarDatos_` leía de golpe seis tablas, entre
ellas `Auditoria_Transiciones` —la más grande y la única que crece sin techo—, el roadmap y los SLA.
La matriz de iniciativas no usa ninguna de las tres: solo solicitudes, iniciativas y personas. Ahora
cada tabla se lee la primera vez que alguien la pide, y quien la pide la paga una sola vez. Quien
necesita la bitácora (los indicadores del embudo, los reportes) la sigue leyendo igual.

**Dos pestañas no piden dos veces lo mismo.** Mientras la persona mira el Home, la precarga va
trayendo el tablero y la matriz. Si hacía clic en Seguimiento con la matriz en camino, se disparaba
una segunda consulta idéntica: dos viajes al servidor y el doble de espera. Ahora el clic se engancha
a la consulta que ya iba (`unaSolaConsulta`). Y para que eso no sirva datos viejos, una escritura da
por vieja la generación: lo que venía en camino de antes del cambio se descarta en lugar de
instalarse.

**Lo que no se cambió y conviene saber:** el calentamiento programado cada diez minutos sigue siendo
lo que evita el caso en frío, y sigue cubriendo las cuatro consultas. Sin él, la primera persona de
la mañana pagaría los 8,7 segundos completos.

**Una prueba que se estaba probando a sí misma.** `pruebaCache.js` corría sobre una copia a mano de
`Cache.gs` guardada en el banco de pruebas. Esa copia ya no tenía el código desplegado, así que la
prueba pasaba sobre algo que no existe —el mismo error que dejó pasar el defecto de D-79—. La copia
se borró y la prueba ahora lee el archivo de verdad.

### D-100 · Un permiso que la pantalla ofrecía y la hoja no podía guardar

Al probar la aprobación, nadie podía aprobar: ni el Product Owner ni el Administrador, con el permiso
marcado en Administración. No era un problema de permisos, era un defecto de D-98.

**La causa.** La lista de permisos estaba escrita **dos veces**: en `CATALOGO_PERMISOS` (`Rbac.gs`),
que es la que Administración muestra, y en las columnas de la hoja `Permisos_Rol` (`Esquema.gs`), que
es donde se guardan. Al agregar la aprobación actualicé la primera y olvidé la segunda. El resultado
era silencioso en los tres puntos donde debería haber avisado:

- la pantalla mostraba la casilla, porque sale del catálogo;
- al guardar, la columna no existía, así que el valor se escribía en ninguna parte y la operación
  decía que todo salió bien;
- al preguntar «¿este rol puede aprobar?», la celda ausente se leía como un **no**.

**Las columnas ya no se escriben dos veces.** El esquema de `Permisos_Rol` deriva sus columnas de
`CATALOGO_PERMISOS`, y el de `Permisos_Fase` de `FASES`. Agregar un permiso en un solo lugar ahora
basta para que aparezca en la pantalla *y* tenga dónde guardarse; desfasarlas volvió a ser imposible.

**Y una columna que falta ya no significa «no».** Cuando la hoja no tiene la columna de un permiso
—porque se agregó al código después de crear la hoja— manda el valor de fábrica, no la negación. Una
celda vacía o en `NO` sí es una negación y se respeta. Así un permiso nuevo funciona desde el
despliegue, sin esperar a que alguien corra `actualizarEstructura`.

**Por qué mi verificación no lo encontró.** La prueba en el navegador de D-98 le entregaba a la
pantalla el permiso ya concedido, a mano, para poder ver el sello. Nunca ejercitó el camino que
estaba roto: de la hoja al permiso. La prueba nueva sí lo recorre, y se comprobó contra el código
anterior —ahí falla, señalando exactamente la columna que faltaba— antes de darla por buena. Es el
tercer defecto de la misma familia: una verificación que mira el lado que funciona (ver D-79 y D-99).

### D-101 · Estabilización: el tercer gobierno, y la calidad que se mide después de producción

Hasta aquí había dos mundos sobre la misma tabla: las solicitudes de fábrica, que recorren el embudo
de ocho fases, y las tareas, que se mueven por estado (D-79). La estabilización es un tercero, y no
es una variante de ninguno de los dos.

**Qué es, y por qué no cabía en lo que había.** Una tarea es *trabajo*. Una estabilización es *la
evidencia de que algo salió mal*: una versión que ya estaba en producción falló y hubo que atenderla.
Se parece a una tarea en que se mueve por estado, y en nada más. Si se contara como trabajo de
fábrica, el tiempo de atender incidentes quedaría mezclado para siempre con el lead time y el
throughput, y los dos indicadores dejarían de significar lo que dicen.

**Con dos mundos bastaba una pregunta de sí o no; con tres hay que decir cuál.** `esTipoTarea()`
servía mientras "no es tarea" quisiera decir "es de fábrica". Ahora cada tipo declara su gobierno
—`fabrica`, `tarea`, `estabilizacion`— y de ahí salen todas las preguntas. Lo que no se declare es de
fábrica, que es lo que era antes y lo que seguirá siendo cualquier tipo que alguien agregue sin leer
esto. La lista de "tipos sin embudo" ya no se escribe aparte: se deriva, por la lección de D-100.

**Tres columnas, y ningún estado nuevo.** Por iniciar, En progreso y Terminada. Se pidió que la del
medio se llamara *En proceso*, y es el estado que ya existe con el nombre *En progreso*: crear uno
casi idéntico al lado habría dejado dos que nadie distingue al leer un reporte. Se reusó el que hay.

**Abrir un incidente pide un solo dato; cerrarlo pide todo.** Al registrar solo se exige la **versión
afectada**, porque en el momento de abrir nadie conoce todavía la causa —y si registrar costara ocho
campos, nadie registraría, y el indicador de calidad terminaría midiendo solo los incidentes de quien
tuvo paciencia—. Para pasar a *Terminada* hacen falta la **versión de corrección** y la **causa
raíz**, y en prioridad **crítica y alta** también el **postmortem** y el **tiempo de
indisponibilidad**. La tarjeta lleva un candado que dice exactamente qué falta, antes de que alguien
intente arrastrarla; el servidor vuelve a validar lo mismo, porque la decisión es suya y no del
navegador.

**La indisponibilidad tiene un interruptor.** No toda crítica tumba el servicio: un cálculo mal hecho
puede ser crítico sin un minuto de caída. Obligar a inventar fechas ahí ensuciaría el indicador de
disponibilidad. Si se marca que sí hubo, los tres datos —inicio, fin y si fue total o parcial— son
obligatorios para cerrar; si se marca que no, no se piden.

**Y se mide en horas de reloj.** Es la única medida de la aplicación que no pasa por el calendario
laboral: una caída del sábado a medianoche no espera al lunes para contar.

**La causa raíz es lista, no texto libre.** En texto libre cada persona la escribe distinto y a los
seis meses no se puede sumar nada. Como lista sale el Pareto —*el 40% de nuestras estabilizaciones
son de configuración*—, que es el dato que mueve decisiones. Al lado vive un campo abierto para lo
que la lista no alcanza a decir. Se edita desde Administración como cualquier catálogo.

**Las versiones se escogen del Roadmap, no se escriben.** "3.4", "v3.4" y "3.4.0" escritas a mano son
tres versiones distintas, y entonces *estabilizaciones por versión* no se puede sumar.

**Calidad en producción: el bloque que faltaba.** El Home ya medía la calidad *dentro* de la fábrica
—First Pass Yield, reprocesos, devoluciones de QA y UAT—. Todos esos pueden verse bien y el negocio
seguir sufriendo, porque ninguno mira lo que pasa después del despliegue. El indicador que manda es
la **tasa de escape**: de las versiones desplegadas en el período, cuántas necesitaron después una
estabilización. Se puede entregar mucho y rápido y estar entregando mal, y es el único número que lo
delata. Lo acompañan el Pareto de causa raíz, las versiones que más costaron, la indisponibilidad por
mes, el tiempo de atención por prioridad y la **reincidencia** —misma causa, misma plataforma, antes
de 90 días—, que es la que dice si los postmortem se están aplicando o solo escribiendo.

**Lo que no entra en la fábrica, dicho una por una.** Lead time, throughput, WIP, cumplimiento de
SLA, First Pass Yield, eficiencia de flujo, tiempos por fase y la distribución por plataforma, tipo,
prioridad y fase: todos salen de la población de fábrica, que ahora excluye las estabilizaciones.
Tampoco cuentan en el **avance de la iniciativa**: si contaran, un incidente abierto bajaría el
porcentaje de la iniciativa —aporta 0 hasta cerrarse— y el plan se vería atrasado por algo que no es
parte del plan. Se cuentan y se muestran aparte, en su propio grupo del listado de actividades.

**Un catálogo nuevo en el código no llegaba a la hoja.** Las hojas de catálogo solo se siembran
cuando están vacías, así que el tipo *Estabilización* habría quedado declarado, invisible y sin forma
de escogerlo. `actualizarEstructura` ahora completa los catálogos: compara por identificador y solo
agrega. No renombra lo que ya está —si alguien tradujo un nombre desde Administración, su nombre
manda— y no borra nada. La contrapartida, que conviene saber: una fila de catálogo que alguien borró a
propósito vuelve a aparecer, porque desde el código no hay forma de distinguir "la borré" de "nunca
llegó". Cada fila agregada se reporta para que se vea.

**La lista de causas raíz no aparecía donde dije que aparecía.** Se declaró la hoja, se sembró con
sus diez causas y se dejó como catálogo ampliable —todo lo que hace falta para que la aplicación la
lea de la hoja—, pero la pantalla de Administración arma sus botones con una lista propia, escrita a
mano en el cliente, y ahí no quedó. El catálogo era configurable en teoría y fijo en la práctica. Es
la misma familia de D-100: una lista escrita dos veces de la que solo se actualizó una. La regla que
faltaba está ahora escrita donde se incumple —*todo catálogo que la aplicación lea de la hoja tiene
que estar en los botones de Administración*— y una prueba la vigila: se comprobó contra el código
anterior, donde falla señalando exactamente la tabla que faltaba.

**Lo que esta decisión no incluye:** un SLA de atención por prioridad para las estabilizaciones (hoy
se mide el tiempo, pero no hay objetivo contra el cual compararlo) ni el porcentaje de disponibilidad
por plataforma, que exige acordar antes la ventana de servicio: 24×7 o jornada hábil. Ninguna de las
dos se inventó sin esa definición.

### D-102 · El analista de Análisis y diseño, con lista propia

Cada solicitud que entra a *Análisis y diseño* queda con un analista asignado. Se pidió además que la
lista de analistas fuera configurable, y se escogió que fuera **una lista propia**, independiente de
Usuarios: así puede incluir a quien analiza aunque no sea usuario de la aplicación. Se administra en
**Administración → Analistas**.

**La lista nace vacía.** Inventar nombres en el código habría puesto en la hoja gente que no existe.
Las diez causas raíz de D-101 sí se pudieron proponer porque son conceptos; un analista es una
persona concreta, y esa lista solo la puede escribir quien conoce al equipo.

**Se exige al entrar a la fase, no al salir.** El analista es quien hace el trabajo de la fase, así
que preguntarlo al final sería preguntar quién hizo algo que ya está hecho. Al entrar, en cambio, es
la decisión que hay que tomar: a quién se le asigna.

**Pero no se rechaza el movimiento: se pregunta.** Frenar la tarjeta para que la persona abra la
solicitud, busque el campo, lo llene y vuelva a arrastrarla serían tres pasos para un dato que cabe en
una pregunta. Al soltar la tarjeta en *Análisis y diseño* sin analista, se abre una ventana con la
lista; al elegir, el analista **viaja en la misma llamada que el movimiento**. Asignarlo en una
llamada aparte y fallar al mover dejaría la solicitud con analista en una fase que todavía no es la
suya.

**Si no hay analistas registrados, no frena.** Sería una compuerta que nadie puede abrir: el embudo
entero quedaría detenido hasta que un administrador llenara una lista que quizá ni sabe que existe, y
quien mueve la tarjeta no suele ser quien administra. La regla aparece en los dos lados —servidor y
pantalla— porque las dos tienen que coincidir.

**El analista no se borra al cambiar de fase**, al revés que la aprobación. La aprobación vale para
una fase y por eso vuelve a cero (D-98); el analista es un hecho de la historia de la solicitud y
sigue sirviendo después. Lo que sí hace la tarjeta es **mostrarlo solo en la fase que lo pide**:
sacarlo en las ocho columnas sería repetir en siete tarjetas un dato que ya no decide nada. Quien
puede editar la solicitud lo cambia con un clic en la propia tarjeta, porque a quién se le asigna un
análisis cambia, y obligar a abrir la solicitud para corregirlo es el mismo trámite que la pregunta
al mover vino a evitar.

**Un defecto viejo que apareció al probar esto.** La ventana modal llamaba a su acción de guardado
*antes* de armar la cadena de promesas (`Promise.resolve(accionModal())`). Cuando la acción validaba
lanzando de una vez —*"Escriba el nombre de la solicitud"*, *"Elija la iniciativa"*— la excepción se
escapaba del manejador, la cadena nunca se armaba, y el botón se quedaba bloqueado en *"Guardando…"*
sin mostrar el motivo: había que cerrar la ventana y volver a empezar. Afectaba a **todos** los
formularios con validación propia, no solo al nuevo. Ahora la acción se llama dentro de la cadena, de
modo que lo que lance se convierte en un rechazo y se muestra como error. Hay prueba, comprobada
contra el código anterior.

### D-103 · El contador de cada versión, abierto por tipo

En el roadmap, cada versión mostraba cuántas actividades llevaba: un número. Una versión de siete
ajustes y una de siete cosas nuevas contaban igual y no significan lo mismo —una es mantenimiento y
la otra es producto—, y el número solo no permitía distinguirlas.

Ahora el contador se abre por tipo: *2 Ajuste · 1 Mejora · 2 Nuevo*. Y en el detalle, cada actividad
dice de qué tipo es.

**Con el nombre completo, no con la inicial.** "3 N" obliga a recordar qué es N, y el ancho que ahorra
no vale eso. Es el mismo criterio que se aplicó al Business Owner y al Product Owner en el listado de
iniciativas.

**En el orden del catálogo, no en el que vengan las cuentas.** Si cada fila ordenara sus pastillas
según cuál tiene más, la vista cambiaría de orden fila a fila y comparar dos versiones exigiría leer
cada etiqueta. Y si alguien renombra un tipo desde Administración, el contador lo dice con el nombre
nuevo: las cuentas salen del identificador, los rótulos del catálogo.

**Un tipo retirado del catálogo igual se muestra**, con su identificador crudo. Callarlo haría que las
pastillas no sumaran el total, y un contador que no cuadra con su propio desglose es peor que uno sin
desglose.

**"Asignadas" y "en producción" no son lo mismo.** La versión agrupa lo que tiene comprometido; lo que
de verdad salió es lo que llegó a la fase Producción. En una versión ya desplegada coinciden, pero en
una planeada no, y confundirlas haría leer como entregado algo que todavía se está construyendo. El
detalle lo dice en su cabecera: *"1 de 3 en producción"*.

**El ensayo del roadmap no tenía constructor.** `ensayoRoadmap.html` era una copia escrita a mano, de
las que envejecen y hacen que la prueba pase sobre un código que no está desplegado —el error de
D-79—. Ahora lo arma `armarRoadmap.py` desde los archivos reales, como los demás.

### D-104 · Indicadores del roadmap: en qué se va la capacidad

El roadmap medía **puntualidad y volumen**: si entregamos cuando dijimos y cuántas versiones hay. Con
el tipo de cada actividad (D-103) se puede responder algo que le importa más al negocio: **en qué se
está yendo la capacidad de la fábrica**.

**Mezcla de inversión.** Qué porcentaje de lo entregado es Nuevo, Mejora o Ajuste. Es la pregunta que
un comité de inversión hace y que antes no se podía responder con datos: *¿cuánto construimos y
cuánto sostenemos?* Si el ajuste domina, la fábrica no está construyendo. Se cuenta lo que **ya está
en producción**, con o sin versión asignada: la pregunta es qué entregamos, no qué planeamos.

**Sin color de semáforo en esa cifra.** Que una plataforma madura se sostenga con ajustes no es malo,
y pintar *Ajuste* en rojo sería opinar donde hay que informar. La proporción se ve en la barra por
plataforma, que sí lleva los colores; las cifras van neutras.

**La misma mezcla, plataforma por plataforma.** El promedio general esconde que una plataforma sea
casi todo ajuste y otra casi todo producto nuevo, que es justo lo que hay que ver para decidir dónde
invertir.

**Ritmo de entrega.** Días promedio entre versiones que llegan a producción, por plataforma. Traduce
a lenguaje de negocio *cada cuánto podemos poner valor en manos del usuario*. Con una sola versión
desplegada no se inventa un intervalo: se dice "una sola".

**Tamaño contra incidentes.** Cruza el tamaño de cada versión con las estabilizaciones que generó
(D-101) y responde algo accionable: *¿entregar más grande nos sale caro?* El corte entre "pequeñas" y
"grandes" es la **mediana**, no un número fijo: un umbral de "6 o más" que yo escogiera diría más de
mi suposición que de este portafolio. Y la conclusión se escribe en palabras debajo de las dos
cifras, porque dos números enfrentados no dicen qué hacer con ellos.

**Dos avisos de higiene, no dos indicadores.** No miden la gestión: miden si el roadmap refleja el
trabajo real. *Actividades que van a salir sin plan* —en Desarrollo o más adelante, sin versión
asignada— es riesgo concreto, y va marcado en rojo. *Versiones planeadas vacías* es plan sin armar. Si
no hay nada que avisar, se dice que el plan está sano, en lugar de dejar un panel en blanco.

**Lo que no se puede medir y por qué.** Quedaron fuera el *cumplimiento de alcance* (cuántas
actividades comprometidas en una versión terminaron saliendo en otra) y el *tiempo desde que se
compromete hasta que sale*. Los dos exigen saber **cuándo** se asignó la versión, y la bitácora
registra cambios de fase y de estado, no cambios de versión. Para tenerlos habría que empezar a
registrar ese cambio, y el indicador solo serviría meses después, cuando hubiera historia.

**Una colisión de nombres que la prueba en el navegador atajó.** Las clases de la mezcla se llamaron
primero `.mz-*`, que ya era el prefijo de la matriz de iniciativas: la fila heredó `display:flex` y la
barra quedó del tamaño de su contenido en lugar de ocupar el panel. Se renombraron a `.mez-*`. La
prueba ahora mide el ancho real de la barra contra el de su panel —el síntoma, no la forma del
código— y comprueba además que la matriz conserve las suyas.

### D-105 · Las versiones cuentan solo trabajo de fábrica, y una batería que mentía

**El cambio pedido.** El contenido de cada versión salía de *todas* las solicitudes que tuvieran ese
número de versión y esa plataforma. Ahora sale solo de las de fábrica. Una tarea no recorre el embudo
ni sale en una versión: el formulario de alta no le ofrece el campo, pero la edición genérica sí, y la
data antigua puede traerlo. Con ella dentro, inflaba el contenido de la versión, el contador por tipo
y el tamaño contra el que se comparan los incidentes. Las estabilizaciones quedan fuera por lo mismo,
y además llevan su versión en otro campo (D-101).

**Y algo más grave que apareció al probarlo.** La batería de pruebas se corría buscando la palabra
*FALLA* en la salida. Una prueba que **revienta** no imprime esa palabra, así que se contaba como
verde. Al corregir el runner para mirar el código de salida aparecieron **nueve pruebas muertas**, de
treinta y seis: todas rotas por mis propios cambios de D-101 a D-104 —el mapa de gobiernos reemplazó a
`esTipoTarea`, el esquema ganó catálogos nuevos, el roadmap ganó indicadores— y ninguna lo había
dicho.

Las nueve están reparadas, y con ellas salieron a la luz tres expectativas desactualizadas que
llevaban días sin comprobarse de verdad: el formulario ya no pregunta "¿es tarea?" sino de qué
gobierno es, y dos mensajes de error dejaron de nombrar solo a la tarea cuando apareció un tercer
gobierno que tampoco se ordena ni se aprueba.

**La lección, que es la misma de D-79 y D-101 con otra cara:** una verificación que solo sabe
reconocer el fracaso que esperaba no distingue entre "pasó" y "ni siquiera corrió". El runner quedó en
`correrTodo.sh`, mira el código de salida, y reporta aparte las que revientan de las que fallan.

### D-106 · Qué entra en una versión, y un campo obligatorio que no dejaba trabajar

Tres correcciones sobre D-101 y D-104, las tres sobre la misma pregunta: **qué cuenta como entregado
en una versión**.

**La tarea no entra, y ya no ocupa una casilla.** La mezcla de inversión recorría el catálogo entero
de tipos, así que *Tarea* aparecía siempre con 0 %: una casilla permanente midiendo algo que por
definición nunca entra, porque una tarea se hace y se cierra, no se despliega. La mezcla ahora recorre
solo los tipos que salen en una versión.

**La estabilización sí entra.** No recorre el embudo, pero su arreglo se despliega igual, y en una
versión concreta: la que dice su *Versión de corrección*. Dejarla fuera contaba mal dos cosas —el
contenido de cada versión y la mezcla de inversión— y escondía justo lo que la mezcla existe para
mostrar: que una parte de lo entregado no fue construir sino corregir. Las estabilizaciones se
relacionan con su versión por el **identificador** y no por el número, porque ese campo se escoge del
Roadmap y no se escribe a mano.

**"Llegó a producción" no es la misma pregunta para los dos.** Una de fábrica llega cuando alcanza la
fase *Producción*; una estabilización no tiene fases, y llega cuando se da por *Terminada* —que es
justo el momento en que su arreglo quedó desplegado, y por eso ahí se le sella la fecha—. Hay una sola
función que lo responde, y las dos lecturas la usan.

**Y el error que bloqueaba el registro de incidentes.** La *versión afectada* se exigía al **crear**.
Con el Roadmap sin versiones registradas no había ninguna que escoger, así que no se podía abrir
ninguna estabilización; y como la misma validación corre al guardar desde Administración y al editar,
tampoco se podía corregir una existente ni cambiarle el tipo a una solicitud. La aplicación pedía un
dato que ella misma no podía ofrecer.

Ahora se exige al **cerrar**, junto con la versión de corrección, la causa raíz y lo demás. Es la
misma regla que ya regía todo lo demás de la estabilización —*abrir pide poco, cerrar pide todo*— y la
que faltaba aplicar aquí. El formulario sigue pidiéndola, y cuando el Roadmap está vacío lo dice en
lugar de dejar un desplegable mudo.

Es el mismo error que ya había cometido con el analista (D-102) y que ahí sí evité: **una compuerta
que nadie puede abrir no protege un dato, detiene el trabajo**. La diferencia es que allí la lista
vacía era previsible y aquí no la volví a pensar.

### D-107 · Una regla de la hoja no puede bloquear a la aplicación

Al guardar una solicitud de fábrica, Google Sheets rechazaba la escritura: *«Los datos introducidos
en la celda S7 infringen las reglas de validación de datos definidas en esta celda. Introduce uno de
los valores siguientes: SI, NO»*. El dato era correcto; la regla, heredada.

**De dónde salió la regla.** Al insertar una columna, Google Sheets le copia el formato **y las reglas
de validación** de su vecina. Cada vez que el esquema ganó una columna —y ganó once entre D-96 y
D-102— la nueva nacía al lado de otra, y si la vecina era de SI/NO, heredaba su regla. Después la
aplicación intentaba escribir ahí un número, una fecha o un enlace, y la hoja lo rechazaba. Una
prueba lo reproduce: con el código anterior, la columna insertada nace con `["SI","NO"]` encima.

**Se corta en el origen:** toda columna que el sistema inserta se queda sin reglas al nacer.

**Y el criterio de fondo, que faltaba escribir.** Las reglas de la hoja existen para ayudar a quien
escribe directo en el Sheets; quien valida de verdad es `validarRegistro_()`. Por eso todas se ponen
ahora con *permitir inválido*: avisan, pero nunca detienen un guardado. **Una regla de hoja capaz de
detener la aplicación es una regla que algún día la va a detener** — y lo hará por un dato correcto,
que es la peor forma de fallar.

**Para lo que ya está roto** está `normalizarValidaciones` (`Mantenimiento.gs`), con su gemela
`normalizarValidacionesAplicar` (D-95): recorre las hojas y deja cada columna como el esquema dice —
lista SI/NO en las de sí o no, la lista fija en las que la tienen, y sin regla en todas las demás—.
A las columnas que apuntan a otra tabla no les pone lista: su contenido es un identificador que
cambia cuando alguien agrega un catálogo, y una lista congelada envejecería mal.

### D-108 · Las historias de usuario, dentro de Análisis y diseño

Análisis y diseño era una sola casilla: una solicitud podía llevar tres semanas ahí sin que se
supiera si las historias se estaban escribiendo, si ya estaban donde el Product Owner, o si el PO ya
las había revisado. **Son tres esperas distintas y se destraban de maneras distintas** —una necesita
analista, otra necesita que alguien revise, la tercera ya no necesita nada—, y verlas iguales
impedía barrer la columna buscando lo que lleva días parado.

La tarjeta lleva ahora un rótulo con en qué van: *En construcción*, *Enviadas al PO* o *Aprobadas*,
cada uno de su color.

**Solo donde aplica:** Nuevo, Mejora y Ajuste, y solo en Análisis y diseño. Una tarea no pasa por esa
fase y una estabilización no escribe historias.

**Arranca solo.** Al llegar la tarjeta a la fase —arrastrándola o registrándola directamente ahí— las
historias quedan *En construcción*, que es donde empieza el trabajo. Nadie tiene que acordarse de
iniciar el control. Si la solicitud vuelve a pasar por la fase se respeta lo que ya tenía.

**Es independiente del sello de aprobación**, por decisión explícita. El sello (D-98) dice que la
solicitud puede salir de la fase; esto dice en qué va el trabajo de adentro. Se consideró unirlos
—que marcar *Aprobadas* diera el visto bueno— y se prefirió dejarlos separados, con el costo conocido
de que la tarjeta pueda mostrar las historias aprobadas y el sello sin dar. El diálogo lo dice al
cambiarlo, para que esa diferencia no sorprenda.

**Quién lo cambia:** cualquiera que pueda editar la solicitud, no solo quien aprueba. Es un dato de
seguimiento, no una decisión: quien escribe las historias es quien sabe cuándo las envió. Quien no
puede editar lo ve igual, sin poder oprimirlo.

**Con tilde.** Los tres valores se leen tal cual en la tarjeta y en el formulario, así que se
escriben en español correcto. Los catálogos viejos del código siguen sin tildes —*Critica*,
*Analisis y diseno*, *En Produccion*— y conviene corregirlos en algún momento; esta decisión no los
toca para no mezclar un cambio de datos con uno de funcionalidad.

### D-109 · Una plataforma sin versiones en un panel de versiones

Se reportó que la *Mezcla por plataforma* mostraba una plataforma que no tiene ninguna versión en el
roadmap. El número era correcto; el panel, mal explicado.

**Por qué aparecía.** La mezcla agrupa por la plataforma de la **actividad**, no de la versión, y
cuenta todo lo que llegó a Producción —con o sin versión registrada—, porque la pregunta que responde
es *en qué se fue la capacidad* y dejar fuera lo entregado sin versión la respondería mal. Pero el
panel quedó en una página de versiones, entre otros tres que sí salen de versiones, y sin decirlo. Lo
que se leía como un dato inventado era en realidad una diferencia entre dos poblaciones que la
pantalla no declaraba.

**Lo que no se hizo:** restringir la mezcla a las actividades que tienen versión. Habría hecho
desaparecer el síntoma y, con él, lo entregado por fuera del roadmap: el indicador mostraría menos
entregas de las que hubo, que es peor que mostrar una fila que sorprende.

**Lo que se hizo.** El subtítulo del panel dice ahora qué cuenta. Y la plataforma que entrega sin
tener versiones queda marcada en su propia fila y sale en los *Avisos del plan*: el hallazgo que el
usuario encontró solo lo encuentra ahora la aplicación, que es donde pertenece. Que una plataforma
ponga cosas en producción sin registrar una sola versión es exactamente el tipo de hueco que esos
avisos existen para mostrar.

**Para interpretarlo:** la mezcla no tiene ventana de tiempo, cuenta toda la historia. Una plataforma
cuyas actividades entraron ya marcadas en Producción durante la carga inicial aparecerá ahí aunque la
fábrica no haya desplegado nada suyo desde entonces. Si eso estorba, el siguiente paso es darle
ventana a la mezcla, no quitarle filas.

### D-110 · Cuánto cuesta la fábrica y a dónde se fue la plata

La fábrica se paga por **capacidad mensual**, no por entregable: cada mes se factura lo mismo esté
ocupada o no. La pregunta del negocio es otra —*¿cuánto de eso se fue en cada iniciativa?*— y para
responderla hay que repartir una bolsa fija entre el trabajo que la ocupó.

**El reparto.** Cada etapa es una bolsa mensual. Lo que decide el reparto son los **días hábiles** que
cada solicitud pasó dentro de esa etapa, dentro de ese mes:

| Etapa | Fases que la consumen | Mensual declarado |
| --- | --- | --- |
| Análisis y diseño | Análisis y diseño | $51.297.629 |
| Desarrollo | Desarrollo | $105.914.086 + dedicadas |
| Pruebas QA y UAT | Pruebas QA + Pruebas UAT | $34.633.651 + dedicadas |

Los días salen de la **bitácora**, no del estado actual: si una solicitud fue devuelta de QA a
Desarrollo, vuelve a ocupar Desarrollo y vuelve a cargar. Una estancia que empieza y termina el mismo
día cuenta como un día: ocupó capacidad.

**Las bolsas dedicadas se restan, no se suman.** El desarrollador de fábrica dedicado a DevOps
($5.179.412) y las dos capacidades de calidad dedicadas a automatización ($9.115.764) ya están dentro
de las bolsas base: se descuentan de la bolsa general y se vuelven a sumar como bolsa exclusiva de
`INI-018` e `INI-019`. La capacidad extendida de SETI sí es plata nueva, y solo rige en su vigencia
(desarrollo, julio–diciembre 2026; QA, septiembre–noviembre 2026). La reconciliación contra la tabla
de capacidad por rol cuadró al peso, que es lo que permitió descubrir que eran internas y no
adicionales.

**Lo que no se reparte se dice.** Si en un mes nadie ocupó Análisis y diseño, esa plata **no** se
reparte entre las demás: aparece como *Sin atribuir*. Repartirla haría que las actividades que sí
trabajaron cargaran un costo que no causaron, y el indicador dejaría de servir para negociar
capacidad. Que haya mucho sin atribuir es justamente el hallazgo: se está pagando capacidad que no se
está usando.

**Qué entra.** Solo nuevo, mejora, ajuste y estabilización. La tarea no: no pasa por el embudo de la
fábrica y no consume sus etapas. La estabilización sí, y consume **desarrollo y pruebas** a la vez,
porque se corrige y se verifica en el mismo esfuerzo.

**El número comparable no es el total.** El total de un mes depende de cuántas actividades hubo; lo
que se compara entre meses es el **costo por día de capacidad**, que va al lado de cada etapa.

**Quién lo ve.** Es información de contrato: de fábrica solo el Product Owner y el Administrador, con
el permiso `Ver_Costos`, configurable como cualquier otro desde Administración → Permisos.

**Las tarifas se editan, no se programan.** Viven en la hoja `Costos_Fabrica` (Administración →
Costos de la fábrica), con etapa, concepto, valor mensual, vigencia y la iniciativa a la que están
dedicadas. Cuando vuelva a negociarse el contrato se cambia una fila, no el código. Una bolsa dedicada
a una iniciativa que no existe sale marcada en rojo arriba de la página: ese reparto no está llegando
a ningún lado y callarlo sería esconder plata.

### D-111 · Un despliegue que decía haber salido y no salió

El despliegue de D-110 terminó en verde y publicó la **versión anterior**. Google había rechazado la
subida entera:

> `A file with this name already exists in the current project: Costos`

Apps Script le quita la extensión a cada archivo, así que `Costos.gs` y `Costos.html` quedaban los dos
con el nombre `Costos`. El proyecto no admite dos archivos con el mismo nombre, y el rechazo es de
toda la subida, no de un archivo. `clasp` imprimió el error y **terminó con código 0**, de modo que el
paso siguiente publicó una versión nueva con el código viejo y el flujo se declaró exitoso.

**Tres cambios, porque un solo arreglo habría dejado la trampa armada.** El archivo del motor de
costos se llama ahora `Costeo.gs`. El flujo revisa antes de subir que no haya dos nombres iguales, y
revisa después que la respuesta de Google no traiga un error, sin confiar en el código de salida de
`clasp`. Y la batería local hace la misma comprobación de nombres, para enterarse antes de subir.

**La lección, que es la de D-105 otra vez:** una herramienta que reporta éxito no es evidencia de
éxito. Lo que vale es el efecto —aquí, que el pie de página muestre la fecha del despliegue—, y hay
que comprobarlo donde se produce.

### D-112 · Una hoja que nace vacía es una función que no sirve

`actualizarEstructura` creó la hoja `Costos_Fabrica` y la dejó **sin una sola fila**. La página de
Costos quedó publicada, visible y sin nada que calcular.

La siembra de las tarifas vivía dentro de `sembrarCatalogos_`, que solo corre en `setupInicial()` —el
arranque de cero—. Y `completarCatalogos_`, que sí corre en cada `actualizarEstructura`, únicamente
sabe completar catálogos de *id y nombre*: una tabla con siete columnas no cabe en ese molde. Entre
las dos, nadie sembraba.

**Lo que se hizo.** Las tarifas salieron a una constante propia, `TARIFAS_DE_FABRICA`, y
`actualizarEstructura` siembra ahora las tablas que traen valores de fábrica y están vacías. Solo si
están vacías: correrlo dos veces no duplica nada, y no pisa lo que alguien haya editado a mano.

**La regla que queda:** una tabla cuya ausencia de datos deja una función inservible tiene que
sembrarse desde `actualizarEstructura`, no solo desde `setupInicial`. `Analistas` es el caso
contrario y por eso no está ahí: nace vacía a propósito, porque nadie sino el área sabe quiénes son
(ver S-20).

**Y el síntoma importa tanto como la causa:** al no haber tarifas, la página se quedaba quieta. Ahora
dice qué falta —en la página, no en un aviso que se desvanece— tanto si falta la hoja como si falta
su contenido.

### D-113 · Que el costo se pueda auditar, no solo leer

Un costo que no se puede rastrear hasta la fecha que lo originó no sirve para negociar nada: la
primera pregunta que recibe es *"¿y esto de dónde sale?"*. El detalle responde ahora en tres niveles.

**En la pantalla.** Cada actividad muestra, etapa por etapa, los días hábiles que ocupó y lo que
cargó por ellos. Agrupadas por iniciativa —como rótulo de grupo, no como columna: repetida en cada
fila se comía el ancho que necesitan los días y los pesos, que son el dato—. Las filas suman el
subtotal de su iniciativa y los subtotales suman el total repartido.

**En un archivo.** El botón *Descargar auditoría* arma una hoja de cálculo en el Drive con cuatro
pestañas: **Estancias** (dónde estuvo cada solicitud, desde cuándo, hasta cuándo, y cuántos días
hábiles aportó a cada mes), **Reparto** (cada peso: de qué bolsa, de qué mes, contra cuántos días
propios sobre cuántos totales), **Resumen por actividad** y **Bolsas**. Sale del **mismo** cálculo
que alimenta la pantalla, no de uno paralelo: dos caminos para la misma cifra terminan dando cifras
distintas, y entonces no se sabe cuál creer.

**Dos correcciones que salieron de exponerlo.**

*El reparto se redondea a pesos enteros al repartir, no al final.* Antes cada total se redondeaba por
separado y la suma de las filas podía diferir del total en unos pesos. En una tabla que alguien va a
sumar con la calculadora, una diferencia de tres pesos le quita credibilidad al número entero. Ahora
se usa el método del residuo mayor: cada bolsa se reparte completa, sin sobras.

*El último día de cada mes valía cero.* `diasHabilesEntre` cuenta la jornada que se traslapa con el
intervalo, y el mes terminaba a la medianoche del último día, así que ese día aportaba nada: una
tarjeta presente todo septiembre contaba 21 días hábiles en vez de 22. Sobre un reparto proporcional
el efecto casi se cancela, pero los números no cuadraban contra un calendario, que es exactamente lo
que alguien hace al auditarlos.

**Por qué algo de septiembre aparece en octubre.** La última estancia de una tarjeta sigue **abierta**
hasta que alguien la mueva: si el trabajo se hizo en septiembre y la tarjeta no se movió, sigue
ocupando capacidad en octubre y sigue cargando. No es un error de cálculo —la tarjeta ocupa el cupo
mientras esté ahí—, pero tampoco puede quedar escondido: la pestaña *Estancias* marca esas filas con
**«SÍ, sigue abierta»**. Si aparecen muchas, lo que hay que corregir es la disciplina de mover las
tarjetas, no el costeo.

### D-114 · El costo se calcula con las fechas que el equipo escribe, no con la bitácora

El costeo salía de la bitácora de transiciones. Se cambió a las **columnas de fecha de cada
solicitud** —`Fecha_Inicio_Analisis`, `Fecha_Fin_Dev`, etc.— por una razón de fondo: la herramienta
empezó a usarse en septiembre y todavía se está cargando historia. La bitácora solo sabe de los
movimientos hechos *dentro* de la aplicación, así que a un trabajo de septiembre registrado en
octubre le asignaba octubre. Las columnas, en cambio, las diligencia el equipo con lo que de verdad
pasó.

**El precio del cambio es que ya no se puede adivinar.** Una fecha que nadie escribió no se inventa:
la etapa queda como **sin información**, no cuesta nada, y sale listada —con el nombre exacto de la
columna— en un panel arriba de la página y en una pestaña del archivo de auditoría. Repartir plata
sobre un supuesto sería peor que no repartirla.

| Caso | Qué hace |
| --- | --- |
| Inicio y fin registrados | Cuenta los días hábiles entre los dos |
| Inicio sin fin, y la solicitud **sigue** en esa fase | Cuenta hasta hoy; se marca *sin cerrar* |
| Inicio sin fin, y la solicitud **ya pasó** de esa fase | No cuenta; se reclama la fecha de fin |
| Fin sin inicio, o fin anterior al inicio | No cuenta; se reclama la corrección |
| Ninguna fecha, en una etapa por la que ya pasó | No cuenta; se reclama |
| Ninguna fecha, en una etapa por la que **no** ha pasado | No se reclama: no es un dato faltante |

**Una fecha sin hora cubre el día entero.** Quien escribe «fin: 30/09» quiere decir que estuvo ahí
todo el 30, no hasta la medianoche con que ese día empieza. Sin esta corrección se perdía un día
hábil por etapa y por solicitud, siempre hacia abajo. Una fecha *con* hora se respeta tal cual.

**Lo que se pierde.** La bitácora sabía de las devoluciones: si una solicitud volvía de QA a
Desarrollo, cobraba las dos estadías. Las columnas guardan **un solo rango por fase**, así que una
devolución queda dentro del mismo intervalo. Es una pérdida consciente: vale más una fecha que el
equipo confirma que una reconstrucción exacta de un registro incompleto.

**En la pantalla.** Un mes a la vez —el costo de la fábrica es una cuenta mensual y mezclar meses en
un total escondía que cada mes se paga completo—. El detalle se pliega por iniciativa, con el
subtotal en el mismo renglón del grupo para que se lea también cerrado, encabezado fijo al bajar, y
cada celda de etapa muestra el costo, los días y **las fechas de las que salen**.

### D-115 · El aviso que reclama un dato también sirve para llenarlo

El panel de información faltante decía qué solicitud y qué columna, y ahí paraba: había que anotar el
dato, irse a Gestión, buscar la solicitud, abrir el formulario completo y volver. Para una lista de
treinta pendientes eso no se hace.

Ahora cada actividad trae un botón que abre **solo las fechas de su etapa**, ya con lo que tenga
registrado, y al guardar recalcula el costo. Se piden las **dos** fechas del rango y no únicamente la
que falta: quien tiene el dato de una suele tener el de la otra, y abrir el formulario dos veces no
ahorra nada. Dejar el fin vacío es una respuesta válida —significa que sigue en curso— y el
formulario lo dice.

**La guarda importa más que la comodidad.** `registrarFechasEtapa` recibe nombres de columna desde el
navegador, así que sin una lista blanca sería un método público capaz de escribir *cualquier* campo de
*cualquier* solicitud: la fase, el estado, la iniciativa a la que se le carga el costo. La lista se
**deriva de `ETAPAS_COSTO`**, no se escribe aparte, para que no puedan separarse: una etapa nueva trae
sus columnas y nadie tiene que acordarse de nada. Exige el mismo permiso que editar la solicitud
completa, porque es editarla, y rechaza un rango invertido antes de guardarlo —entraría al costeo como
un dato válido y daría días en cero sin que nadie se entere—.

### D-116 · «No aplica» es una respuesta, y las tablas se totalizan

**No toda solicitud pasa por todas las fases.** Un ajuste pequeño puede no ir a UAT, y hasta ahora esa
fase quedaba reclamada como información faltante para siempre. Un pendiente que nunca se puede cerrar
acaba enseñando a ignorar la lista entera, que era justo lo contrario de lo que el aviso busca.

Cada rango tiene ahora su marca —`No_Aplica_Analisis`, `No_Aplica_Dev`, `No_Aplica_QA`,
`No_Aplica_UAT`—, que se pone desde el mismo formulario del aviso. Marcada: la fase no cuesta y deja
de pedirse. Es una respuesta, no un vacío.

**Marcar «no aplica» borra las fechas de esa fase.** Las dos cosas se contradicen, y dejar las fechas
guardadas invita a que alguien las encuentre después y crea que algo se perdió. Gana la marca.

**Se marca por rango y no por etapa** porque Pruebas son dos fases: una solicitud puede pasar por QA y
no por UAT, y obligarla a elegir entre las dos o ninguna habría hecho el dato inútil.

**Las tablas totalizan.** Costo por iniciativa, costo por etapa y las bolsas traen su fila de total;
sin ella cada quien suma la columna a mano para ver si cuadra con lo repartido de arriba. El costo por
día del total es la división de los totales, **no** el promedio de las tres etapas: promediar etapas
con volúmenes distintos da un número que no corresponde a ninguna plata real.

### D-117 · La misma regla heredada, por el otro camino

Al marcar una fase como «no aplica», la aplicación dejó de funcionar. La causa es la misma de la
celda S7 (D-107), por un camino que entonces no se tocó.

Hay **dos** sitios que agregan a una hoja las columnas que el esquema declara y ella no tiene:
`alinearEncabezados_` en `Setup.gs`, que corre cuando alguien ejecuta `actualizarEstructura`, y
`asegurarColumnas_` en `Codigo.gs`, que corre **sola, durante el uso normal**, la primera vez que se
escribe una fila. En D-107 se corrigió el primero y el segundo se quedó igual.

Google Sheets copia la validación de la columna vecina en la que se inserta. Las cuatro columnas
nuevas de «no aplica» quedan junto a columnas de fecha, así que nacieron con una **regla de fecha**, y
el primer `SI` que alguien escribiera la infringía.

**Lo que se hizo.** `asegurarColumnas_` limpia ahora la validación de la columna que inserta, igual
que su gemela. La prueba se verificó contra el código anterior: sin el arreglo, la columna hereda
`["fecha"]`; con él, nace limpia.

**La lección.** Un arreglo que vive en un solo camino no es un arreglo: es una mitad que espera a que
alguien pase por la otra. Cuando una corrección depende de una regla del entorno —aquí, que Sheets
hereda validaciones— hay que buscar **todos** los sitios donde esa regla aplica, no solo el que
produjo el síntoma.

**Para las hojas que ya quedaron mal** el arreglo no sirve: la columna ya existe con la regla
heredada. Se reparan ejecutando `normalizarValidaciones` y luego `normalizarValidacionesAplicar`
(`Mantenimiento.gs`), que alinean cada columna con el tipo que el esquema declara.

### D-118 · Una herramienta de reparación que no alcanza a correr no repara nada

`normalizarValidaciones` —la función que arregla justamente el problema de D-107 y D-117— se quedaba
cargando y nunca terminaba. Preguntaba la regla de **cada columna de cada hoja** por separado:
`getDataValidation()` sobre la columna entera, más de mil llamadas a Google, y se pasaba del límite de
seis minutos de Apps Script sin acabar.

Ahora lee las reglas de toda una hoja en **una sola llamada**, sobre una fila de muestra —basta,
porque una regla heredada cubre la columna entera, que es como Sheets las copia— y solo toca las
columnas que hay que cambiar. Y acepta el nombre de una hoja, con el atajo
`normalizarValidacionesDeSolicitudes()`, para destrabar la que está fallando sin esperar por las
veinticinco.

**Lo que esto enseña:** las herramientas de reparación se prueban en el tamaño real, no en el de la
prueba. Esta funcionaba perfecto con cinco columnas y moría con cuarenta y ocho por veinticinco hojas,
y el usuario se enteró primero —esperando cinco minutos frente a una pantalla cargando— mientras yo la
recomendaba como la solución.

### D-119 · Una marca habla de su fase, no de la etapa entera

Marcar **Pruebas UAT** como «no aplica» hacía que dejaran de pedirse, en silencio, las fechas de
**Pruebas QA**. Las dos son fases de la misma etapa, y la marca de una se estaba tomando como que la
etapa ya estaba contestada.

El error estaba en mezclar dos cosas distintas bajo una sola bandera: *«algún rango trae fechas»* y
*«algún rango fue marcado»*. La primera sí responde por la etapa —quien hizo QA y no pasa por UAT no
tiene nada pendiente—; la segunda habla de su rango y de ningún otro.

Ahora se cuentan aparte: la etapa se da por contestada solo si **algún rango trae fechas**, y cuando
no las hay se reclama rango por rango, saltando los que ya están marcados. Si todos lo están, no
queda nada que pedir.

**Por qué importa más de lo que parece.** El síntoma era un dato que faltaba y que nadie iba a
reclamar: la plata de esa fase quedaba sin atribuir y el aviso —que existe justamente para que eso no
pase— decía que no había nada pendiente. Un aviso que calla es peor que no tenerlo, porque se le cree.

**Lo que queda pendiente de decidir:** en la tabla de detalle, una etapa marcada «no aplica» se ve
igual que una sin fechas —un guión—. Distinguirlas ayudaría a leerla, pero exige que el servidor
mande también las marcas.

### D-120 · Lo que se corrige a mano en la hoja también tiene que verse

Marcar fases como «no aplica» y seguir viéndolas como pendientes tiene una causa que no está en el
costeo: **los sellos de caché solo se mueven cuando escribe la aplicación**. Quien corrige una fila
directamente en el Sheets —algo que pasa todo el tiempo, y más en estas semanas de carga— vuelve a
Costos, ve el resultado anterior y concluye, con toda razón, que el programa ignora su corrección.

El botón **Calcular** ahora relee de verdad: bota la caché de las hojas del costeo y recalcula sin
servir el resultado guardado. Navegar entre páginas sigue usando la caché, que es lo que la hace
rápida; releer es una acción explícita, con su botón.

**Y una señal para no volver a adivinar.** El aviso dice cuántas fases están marcadas como «no
aplica» en los datos que acaba de leer. Si alguien marca cinco y el aviso dice cero, el problema no
está en el cálculo: la marca no quedó en la hoja. Sin ese número, distinguir «el programa no me hace
caso» de «el dato no se guardó» exigía mirar el código, que es justo lo que quien usa la herramienta
no puede hacer.

**Lo que esto enseña, y van varias:** un sistema que lee de una hoja que la gente también edita a mano
no puede suponer que todos los cambios pasan por él. Y cuando algo no se ve, la pregunta útil para
quien lo reporta no es «¿funciona el cálculo?» sino «¿qué está leyendo el programa?» —y eso hay que
mostrarlo, no explicarlo.

### D-121 · El formulario pedía datos que nunca iban a llegar

Marcar una fase como «no aplica» y verla seguir en la lista de pendientes tenía una causa simple y
mía: **el formulario de «Llenar fechas» nunca guardó nada**.

El pendiente que viaja al navegador se armaba enumerando campos a mano:

```js
incompletas.push({ id: …, nombre: …, etapa: f.etapa, rango: f.rango, falta: f.falta, campo: f.campo });
```

Faltaban `campoIni`, `campoFin` y `campoNo` —los nombres de las columnas que hay que escribir—. El
formulario los recibía vacíos, construía casillas llamadas `campo_undefined`, y al guardar el servidor
rechazaba la escritura. Desde afuera: se marca, se guarda, y todo sigue igual.

**Por qué no lo detectó ninguna prueba.** La revisión en el navegador le entregaba a la pantalla un
pendiente *inventado*, con esos campos puestos a mano, en vez de uno salido del cálculo. La prueba
verificaba que el formulario dibujara bien lo que recibía, no que recibiera algo. Es la misma trampa de
la batería que mentía: un montaje que confirma lo que uno espera en vez de lo que el sistema produce.

**Lo que se hizo.** El pendiente se **copia completo** y se le agrega el contexto de la solicitud, en
vez de volver a listar sus campos: enumerar a mano lo que ya existe es una lista que envejece sola. Y
hay una prueba que exige que cada campo que el formulario usa viaje de verdad en el resultado del
cálculo.

**Además, para que esto deje de ser adivinanza.** Cada pendiente muestra ahora qué leyó el programa en
su columna de marca —`No_Aplica_Dev dice: vacío`—, y el aviso detecta dos estados de la hoja que
vuelven inútil cualquier marca: que la columna **no exista** (nadie corrió `actualizarEstructura`) o
que esté **repetida** (se lee la última, y lo escrito en la primera no se ve). `esSi_` entiende también
`VERDADERO`, que es lo que escribe una casilla de verificación de Sheets en español.

### D-122 · Dos caminos para la misma cifra entregaban dos formas distintas

Al oprimir **Calcular** la página se caía con *«Cannot read properties of null»*: el navegador recibió
**vacío** y se rompió al pintar.

La causa es una asimetría que yo mismo introduje. El camino con caché pasa por `JSON` para guardarse,
así que el navegador siempre recibió texto y números. El camino que **recalcula** —el que agregué para
que una corrección hecha a mano en la hoja se viera— devolvía el objeto **crudo**, con `Date` adentro.
Dos formas del mismo dato según por dónde vino el cálculo.

Ahora el resultado se deja en JSON puro antes de mandarlo, en los dos caminos. Y la lista de
pendientes viaja **acotada**: puede ser de miles de líneas si el equipo viene atrasado con las fechas,
nadie lee mil, y una respuesta enorme es la otra manera de que al navegador no le llegue nada. Se
mandan las primeras doscientas y se informa el total.

**La pantalla ya no se cae si la respuesta llega vacía:** lo dice y pide reintentar, en vez de mostrar
un error de javascript que a quien usa la herramienta no le significa nada.

**Lo que esto enseña, otra vez:** cuando una misma información puede llegar por dos caminos, lo que hay
que probar no es cada camino por separado sino que **entreguen lo mismo**. La prueba nueva compara las
dos formas; sin eso, el camino menos transitado se rompe en silencio hasta que alguien lo usa.

### D-123 · Las seis reglas del reparto, acordadas con el usuario

Las cifras no cuadraban, y no por un error de programación: el modelo que yo había construido no era
el que el contrato describe. El usuario lo revisó con un ejemplo y fijó las reglas. Quedan aquí porque
son la definición del cálculo, no un detalle de implementación.

| # | Regla | Estado |
| --- | --- | --- |
| 1 | Una bolsa con iniciativa asignada se reparte **solo** entre las solicitudes de esa iniciativa, y esas solicitudes **no suman de otras bolsas** | **cambiado** |
| 2 | Una bolsa sin iniciativa se reparte entre todas las demás solicitudes trabajadas en esa etapa | **cambiado** |
| 3 | Sin fecha de inicio y sin fecha de fin: no se tiene en cuenta, su costo es 0 | ya era así |
| 4 | Con inicio y con fin: los días hábiles del mes que corresponda | ya era así |
| 5 | Con inicio y **sin** fin: el límite es el último día del mes | **cambiado** |
| 6 | La suma de todas las iniciativas en una fase nunca supera la bolsa de esa fase | ya era así |

**Lo que cambió en la regla 1 y 2.** Antes, una iniciativa con capacidad dedicada pagaba **dos veces**:
su bolsa propia *más* una tajada de la bolsa general. En el ejemplo del usuario, DevOps salía en
$83.257.864 cuando sus bolsas suman $19.709.412. Ahora una solicitud cubierta por una bolsa propia
queda **fuera** del reparto de la general.

**La exclusión es por ETAPA, no por iniciativa entera.** DevOps tiene desarrollo dedicado, pero sus
pruebas las hace el equipo general de calidad: de esa bolsa sí toma. Excluirla por completo habría
regalado el trabajo de QA.

**Lo que cambió en la regla 5.** Una fase sin fecha de fin ahora cuenta **siempre** hasta el último día
del mes, esté la solicitud todavía en la fase o haya pasado de largo sin que nadie cerrara la fecha. La
capacidad se ocupó igual, y lo que siga ocupando en meses siguientes se cobra contra la bolsa de esos
meses. La fecha de fin se sigue reclamando cuando falta —que cueste no quiere decir que el dato esté
completo—.

**Una consecuencia que conviene tener presente:** si en un mes todas las solicitudes de una etapa
pertenecen a iniciativas con bolsa propia, la bolsa general de esa etapa no tiene a quién cargarse y
sale entera como *sin atribuir*. Es correcto —esa capacidad se pagó y no la ocupó nadie de los que
costeamos— y es justamente el hallazgo que la página existe para mostrar.

### D-124 · Una iniciativa con capacidad dedicada se paga sola

Precisión del usuario sobre D-123: la exclusión de la bolsa general es **total**, no por etapa. Una
iniciativa con capacidad dedicada **no toca la bolsa general en ninguna etapa**. Su costo del mes es,
exactamente, la suma de sus bolsas.

Yo había implementado la exclusión solo en la etapa donde la bolsa está declarada, razonando que
DevOps tiene desarrollo dedicado pero sus pruebas las hace el equipo general. El usuario corrigió:
la capacidad dedicada se contrató para cubrir esa iniciativa completa.

**La consecuencia, aceptada explícitamente:** los días que esa iniciativa ocupe en una etapa donde no
tiene bolsa propia **no cuestan nada**, y la bolsa general de esa etapa se reparte entre las demás.

**Y un ajuste que se desprende:** los días de capacidad de una etapa ahora cuentan solo los de las
solicitudes que de verdad cobraron ahí. Meter días que no pagaron en el denominador bajaría el costo
por día de una capacidad que esos días no consumieron.

**Lo que ya estaba bien y quedó con prueba:** una estadía que viene de otro mes aporta únicamente los
días del mes consultado —una fase que arrancó el 15 de agosto y terminó el 10 de septiembre suma ocho
días hábiles en septiembre, no los de agosto—, y lo mismo una estadía abierta que empezó antes.

**En la pantalla:** el detalle carga con las iniciativas **plegadas**. Se ven los subtotales, que es la
lectura de arriba, y quien quiera el detalle de una la despliega. Con todo abierto había que recorrer
cientos de filas para llegar al siguiente grupo.

### D-125 · Un «SI» que nadie escribió

El usuario reportó una tarjeta que arrancó desarrollo en septiembre, sigue en curso, sin fecha de fin,
y no aparecía en el costo. La causa no estaba en el costeo.

El formulario de edición dibujaba los campos SÍ/NO poniendo `SI` primero y marcando la opción que
coincidiera con el valor guardado. Con la celda **vacía** no coincidía ninguna, así que el navegador
mostraba la primera —**SI**—, y quien abriera una solicitud y la guardara, por el motivo que fuera,
dejaba el campo en SI **sin haberlo tocado**.

Mientras los campos SÍ/NO eran `Tiene_Bloqueo`, `Aprobada` y `Hubo_Indisponibilidad` —que casi siempre
traen un valor— el defecto pasó desapercibido. Las cuatro columnas de «no aplica» nacen vacías en todas
las filas: desde D-116, **editar cualquier solicitud marcaba sus cuatro fases como que no aplican**, y
esa solicitud salía del costeo en silencio.

**El arreglo.** `NO` va primero y se marca explícitamente cuando el valor no es un sí. Probado contra
el código anterior: los siete campos SÍ/NO del formulario arrancaban en `SI` con la celda vacía, y
ahora arrancan en `NO`. Entre ellos **`Aprobada`**, que es el peor de la lista.

**El destrozo no se puede deshacer con criterio.** Una marca puesta a propósito y una puesta por el
error dicen las dos `SI`; no hay cómo distinguirlas. Por eso `limpiarNoAplica` las borra **todas** —con
simulación primero, como las demás funciones de mantenimiento— y el equipo vuelve a marcar las pocas
que de verdad no aplican. Adivinar cuál era cuál sería peor que empezar de nuevo.

**Y para que se vea.** La página de Costos lista ahora **cuáles** fases están marcadas, no solo cuántas.
Una marca puesta sin querer saca una solicitud del cálculo sin decir nada; sin poder verla, no hay cómo
encontrarla.

**Lo que esto enseña:** un campo nuevo no hereda solo el tipo, hereda también los defectos de cómo se
dibuja ese tipo. Agregué cuatro columnas `boolSN` sin revisar qué hacía el formulario con un `boolSN`
vacío, y convertí un defecto latente de años en pérdida silenciosa de datos.

### D-126 · Una bolsa cobra solo el tiempo que estuvo vigente

Pedido del usuario: *«Requiero que tengas en cuenta en los costos de fábrica, las vigencias, y solo
aplicar al mes que se va a calcular en costos lo que le corresponde a cada mes. Porque puede que no
sea completo.»*

Hasta ahora la vigencia era un interruptor: si la bolsa tocaba el mes aunque fuera un día, cobraba el
mes entero; si no lo tocaba, no cobraba nada. Una capacidad que entra el 16 de septiembre facturaba
septiembre completo. Con las tarifas de fábrica actuales eso no es teórico: la capacidad extendida
SETI de pruebas va del 1 de septiembre al 30 de noviembre, y la de desarrollo del 1 de julio al 31 de
diciembre.

**La regla nueva:** la bolsa cobra la fracción del mes que su vigencia alcanza. En septiembre de 2026
—22 días hábiles— una bolsa vigente desde el 16 alcanza 11 y cobra la mitad.

**Por qué días hábiles y no días calendario:** lo que se compra es gente disponible en días de
trabajo, y es la misma unidad con la que ya se reparte el costo entre las solicitudes. Prorratear por
días calendario mezclaría dos unidades en el mismo cálculo. Si el contrato se factura por días
calendario, es un cambio de una línea y hay que decirlo.

**Lo que no cambió, a propósito:** una bolsa sin vigencia o con vigencia que cubre el mes completo
sigue cobrando su valor mensual íntegro, y el reparto sigue entregando exactamente lo facturado (la
suma de las filas no se pasa de la bolsa, regla del usuario en D-123).

**Un límite conocido:** la exclusión de la bolsa general (D-124) sigue siendo mensual, no prorrateada.
Una iniciativa cuya bolsa dedicada arranca el 16 queda fuera de la bolsa general todo el mes, aunque
la primera quincena no tuviera capacidad propia. Partir el mes en tramos de vigencia para repartir
cada tramo aparte es un cambio mayor; hoy el efecto es que esa iniciativa sale barata ese mes, y la
pantalla lo deja ver.

**En la pantalla y en la auditoría:** la tabla de bolsas marca en color la bolsa parcial y dice
*«vigente 11 de 22 días hábiles · mensual $14.530.000»*, porque una cifra menor sin explicación parece
un error de cálculo. El Excel de auditoría agrega a la hoja *Bolsas* las columnas **vigencia desde**,
**vigencia hasta**, **días hábiles vigentes** y **días hábiles del período**; y en la hoja *Reparto*
se separa el **valor mensual de la bolsa** del **valor cobrado en el mes (según vigencia)**, que antes
compartían una sola columna con el rótulo equivocado.

**Lo que esto enseña:** el rótulo de una columna es parte del cálculo. La columna del Excel seguía
diciendo «valor mensual de la bolsa» mientras el número de abajo ya era el prorrateado; en una tabla
que alguien audita con calculadora, eso no es cosmética.

### D-127 · El informe de gestión, y lo que el informe no puede afirmar

Pedido del usuario: un informe de gestión de septiembre de 2026 para **presidencia**, dinámico, en una
página nueva llamada *Informe*, con indicadores del área, entregables de valor, mezcla de inversión e
indicadores de costo.

**Lo primero que encontré al revisar:** casi todo ya estaba calculado en `Metricas.gs` y `Costeo.gs`.
Esta página no es un motor nuevo, es un **armado con el mes como eje** más cuatro huecos de datos que,
sin cerrarlos, habrían puesto cifras incompletas delante de un comité sin que nadie lo supiera.

**Las cuatro decisiones del usuario:**

| Pregunta | Respuesta |
| --- | --- |
| ¿Qué es «ciclo de fábrica»? | El inventario por fase del embudo |
| ¿Cuánto costo se puede mostrar? | **Solo porcentajes y costos unitarios** |
| ¿La versión es texto libre? | **No: ya se elige de una lista.** Yo estaba equivocado |
| ¿Los SLA son oficiales? | **Provisionales**, y hay que rotularlos así |

**Donde yo me equivoqué:** afirmé que `Version_Semantica` era texto libre y que «3.4», «v3.4» y
«3.4.0» escritas a mano romperían el amarre con el Roadmap. El usuario me corrigió: el formulario la
ofrece de una lista y `validarVersionRoadmap_` rechaza una que no exista. Al verificarlo encontré que
quedaba **una** puerta abierta: la **carga masiva** escribía el número sin normalizar ni validar. Se
cerró. Y la página conserva una bolsa de *«entregado sin versión reconocida»*, porque una solicitud que
desaparece de su release sin dar error es el peor defecto posible en el entregable estrella del informe.

**Las reglas propias de esta página:**

1. **Las duraciones salen de las columnas de fecha, no de la bitácora** (D-114). La bitácora solo ve lo
   que pasó dentro de la herramienta; el equipo está diligenciando las columnas hacia atrás.
2. **Los bloqueos sí salen de la bitácora**, porque son lo único que no tiene columnas: el bloqueo es un
   estado. Lo que la bitácora no guarda es el **motivo** —al desbloquear, el sistema borra la causal— así
   que de los bloqueos ya resueltos se sabe cuándo y cuánto, no por qué. El informe lo dice.
3. **Los costos viajan como porcentajes y costos unitarios.** El valor de las bolsas **no sale del
   servidor**: no es que la pantalla lo esconda, es que el payload no lo trae. Hay una prueba que
   revisa el JSON completo y falla si aparece. Se le advirtió al usuario que un costo unitario
   multiplicado por el número de actividades aproxima el total: quien quiera cerrar esa puerta tiene que
   renunciar al unitario, y el unitario es el número más útil del bloque.
4. **Toda cifra va con su cobertura.** El panel de calidad va **arriba de las cifras, no al final**: un
   comité que descubre el límite de un dato después de haber decidido sobre él no puede deshacer la
   decisión, y la próxima vez no cree ninguna cifra de la página.

**Dos defectos que encontraron las pruebas, no el usuario:**

- **El Cycle Time contaba un día menos que el costeo** para la misma estadía. Las columnas de fecha
  llegan a medianoche, y medir «1 al 10 de septiembre» de medianoche a medianoche da 7 días hábiles en
  vez de 8. El costeo ya lo corregía con `finDelDia_`; el informe no. Eran **dos cifras distintas para
  la misma estadía en la misma presentación**. Verificado contra el código sin la corrección: 7 contra 8.
- **La página mezclaba «17,1» y «8.6»** en la misma tarjeta. Dos separadores decimales se leen como dos
  unidades distintas. Verificado igual.

**Lo que la página declara que NO puede medir**, en lugar de mostrar un cero:

- **Aceptación TI y Producción** no tienen columnas de inicio y fin en la solicitud, así que su duración
  no se mide con esta fuente. Es un hueco de modelo, no un cero.
- El **inventario por fase es una foto de hoy**, no del cierre del mes: reconstruirlo día por día
  exigiría una bitácora que cubra todo el período.
- La **plataforma de la iniciativa** está vacía en todas (S-15), así que se deduce de las plataformas de
  sus solicitudes y la tabla declara de dónde salió cada agrupación: declarada, deducida, varias o
  ninguna. Una iniciativa que toca varias plataformas se cuenta en todas, y la página explica por qué la
  suma de las filas supera el número de iniciativas.
- Lo que está **en producción sin fecha de despliegue** no se puede atribuir a ningún mes: no cuenta como
  entrega de ninguno, y se informa aparte.

**En la pantalla:** selector de mes —por defecto el mes cerrado anterior, porque abrir en el mes en curso
muestra medio mes y parece una caída—, **modo presentación** a pantalla completa con un bloque por
diapositiva y avance con flechas, estilos de impresión para sacar PDF, y **soporte descargable** en hoja
de cálculo con diez pestañas, que es lo que se anexa al acta: una cifra que nadie puede abrir no se puede
defender.

**Permiso:** `Ver_Informe`, de fábrica para quien ya ve costos (Product Owner y Administrador). Se abre a
quien haga falta desde Administración. El informe no muestra el valor del contrato, pero sigue siendo
material de comité, así que el valor por omisión es el estrecho.

**Lo que esto enseña:** antes de construir, verificar. Dos de los cuatro «huecos» que iba a reportar como
graves no existían o existían a medias, y uno de los que no estaba en mi lista —el Cycle Time contra el
costeo— era el verdaderamente serio. Reportar un riesgo sin confirmarlo le hace perder tiempo al usuario
y le resta credibilidad a los riesgos que sí son ciertos.

### D-128 · Tarjetas de iniciativa: el portafolio de un vistazo

Pedido del usuario: una sección en el Informe con **solo tarjetas de iniciativa**, cada una con nombre,
estado, prioridad, % real, % esperado, si tiene bloqueo en alguna de sus solicitudes, tipo, plataforma,
fecha de inicio y fecha fin planeada, **organizadas por fechas**.

**Lo que ya existía y se reusó, no se reimplementó:** `avanceRealIniciativa_` y
`avanceEsperadoIniciativa_` de `Metricas.gs`, y `normalizarPrioridad_`, que reconoce una prioridad venga
como código (`PRI-01`) o como nombre (`Critica`) —la carga original del portafolio llegó con el nombre.
Escribir otro cálculo de avance habría dado una página con dos avances distintos de la misma iniciativa.

**Por lo mismo, la deducción de plataforma se extrajo a `informePlataformaDeIniciativas_`.** La tabla por
plataforma y las tarjetas son el mismo universo de iniciativas; con la deducción escrita dos veces, dos
secciones de **la misma página** podrían decir plataformas distintas de la misma iniciativa. Hay una
prueba que recorre las dos y compara el origen asignado a cada una.

**El orden:** por **fecha fin planeada** ascendente —lo que vence antes, primero—, a igualdad por fecha
de inicio y luego por nombre. Las que no tienen fechas van **al final**, no al principio: a una
iniciativa sin plan no le falta urgencia, le falta el plan, y va con su propia etiqueta.

**El bloqueo es heredado.** Una iniciativa no tiene campo de bloqueo: lo tienen sus solicitudes. Basta
**una** solicitud bloqueada para marcarla, porque para el comité la pregunta es si hay algo detenido
ahí; y la tarjeta dice **cuántas y cuáles** (en el título emergente) para que la pregunta siguiente
tenga respuesta. Las estabilizaciones se cuentan aparte y no bajan el avance: un incidente no es alcance
planeado (D-101).

**Tres huecos que la tarjeta distingue en vez de confundir:**

| Lo que falta | Lo que dice | Lo que hay que hacer |
| --- | --- | --- |
| Las fechas del plan | «sin plan» | Poner fecha de inicio y fecha fin estimada |
| Las solicitudes | «sin solicitudes» | Crear las solicitudes de la iniciativa |
| Nada: va adelante o atrás | La desviación, con signo y color | Leerla |

**El defecto que encontró la prueba:** la etiqueta decía **«sin plan» en los dos primeros casos**. Una
iniciativa con sus dos fechas y ninguna solicitud aparecía como si le faltara el plan, y eso manda a
corregir lo que no está mal. Son dos huecos distintos que exigen dos acciones distintas. Verificado
contra el código sin la corrección.

**Y uno menor, de la misma tanda:** los filtros de la sección repintaban leyendo `DATOS.informe`. Si
alguien limpiaba la caché del cliente, el filtro dejaba de responder sin decir nada. Ahora la pantalla
guarda su propia referencia a lo último que pintó (`INFORME_ULTIMO`).

**El color lo manda la desviación**, porque es la única lectura que le dice a un comité si hay que hacer
algo: verde si va igual o adelante, ámbar hasta 15 puntos por debajo, rojo más abajo. **Sin desviación no
hay color**: pintar de verde una iniciativa que nadie puede evaluar sería tranquilizar sin motivo.

**Los filtros son del navegador**, no del servidor: el informe ya trae todas las iniciativas, y volver a
pedirlas por cada filtro haría esperar para esconder tarjetas que ya están en la página. Hay una prueba
que verifica que filtrar no llama al servidor.

**La plataforma deducida se distingue de la declarada** con un asterisco y cursiva, y el título emergente
dice de dónde salió. En el soporte descargable hay una pestaña *Portafolio* con la misma información y en
el mismo orden, más una columna que dice si la plataforma era declarada o deducida.

### D-129 · El Portafolio como pestaña propia

Pedido del usuario: llevar las tarjetas de iniciativa a una **pestaña nueva del menú, después de
Home**; agregar a la tarjeta el estado de sus solicitudes (por iniciar, en progreso, terminada), un
**icono de alerta** si la iniciativa está en pausa, dejar la barra de **% real** con color según el
avance y la de **% esperado en verde**, conservar los filtros **solo en esta vista**, permitir ordenar
**por prioridad y por fecha**, y añadir las mejoras que considerara relevantes.

**Un archivo nuevo, `PortafolioIniciativas.gs`**, y el constructor de tarjetas se mudó allí. Lo
consumen dos páginas —el Portafolio y el Informe— y con el cálculo escrito dos veces la misma
iniciativa podría mostrar avances distintos en dos pantallas de la misma aplicación. Hay una prueba
que verifica que `tarjetasDeIniciativas_` existe **una sola vez** y que `InformeGestion.gs` la llama
en vez de tener su propia copia. (No puede llamarse `Portafolio.gs`: colisionaría con
`Portafolio.html`, que es lo que rompió un despliegue en silencio en D-111.)

**Un riesgo que se evitó al cambiar de alcance.** La petición original era una vista dentro de
Iniciativas, y eso habría exigido añadir un campo al payload de `getMatrizIniciativas`, que está en
caché bajo un nombre fijo. Un despliegue no mueve los sellos, así que después de publicar se habría
podido servir un payload viejo **sin el campo nuevo** y el navegador habría reventado — la misma
familia de D-120 y D-122. Una página nueva con su propia clave de caché no tiene ese problema.

**El desglose por estado cuenta TODOS los estados presentes, no los tres que se pidieron.** Mostrar
tres de cinco deja un total que no cuadra, y quien suma con la calculadora concluye que la tarjeta
está mal. Se listan solo los estados que tienen alguna solicitud —una tarjeta con cinco ceros no
informa nada— en el orden del catálogo, y hay una prueba que verifica que la suma del desglose es
igual al total de solicitudes de la tarjeta.

**Las barras:** la de **% esperado** va siempre en verde porque es la **referencia**, no un resultado;
la de **% real** toma su color de la comparación contra ella. Dos barras del mismo color obligan a leer
los números para saber cuál es cuál; con la referencia fija, la comparación se ve sin leer. **Sin plan
la barra real no se pinta de verde**, porque verde se leería como «va bien» y lo cierto es que no hay
con qué saberlo.

**La pausa se señala, no se castiga.** Una iniciativa en pausa no es un error: el negocio puede
pausarla a propósito. Pero una pausa que nadie recuerda es un compromiso que sigue contando en el
portafolio y no avanza, así que lleva ⚠ antes del nombre —antes, para verlo al recorrer la rejilla sin
leer cada tarjeta— con el significado en el título y en `aria-label`, porque un símbolo solo no se lee
en un lector de pantalla.

**Los filtros salieron del Informe.** Esa página se proyecta en un comité, y una vista filtrada
proyectada es una vista que alguien va a leer como el total. El Informe muestra todas y dice dónde se
filtra; el Portafolio, que es la vista de trabajo, se queda con los filtros y gana cuatro más
(prioridad, tipo, búsqueda por nombre, y «en pausa») más un botón de limpiar.

**El orden** se puede cambiar por fecha fin planeada, fecha de inicio, prioridad, atraso contra el plan
y nombre, con un botón para invertirlo. Dos reglas:

- **Cada criterio trae su orden natural puesto**, para no obligar a oprimir «invertir» cada vez que se
  cambia de criterio.
- **Lo que no tiene el dato por el cual se ordena va al final en cualquier dirección.** Una iniciativa
  sin fecha no es la más urgente y una sin plan no es la más atrasada: «lo que falta» no es un extremo
  de la escala, y al invertir el orden no debe subir al primer lugar.

**El defecto que encontró la prueba —y la prueba que lo dejó pasar primero.** «Más atrasadas primero»
ordenaba al revés: ponía arriba la de **+8,2 %** en lugar de la de **−85,7 %**. Lo que hace esto digno
de anotar no es el error de signo, es que **mi primera aserción lo dejó pasar**: decía «el primero
empieza por menos, o no dice "sin"», y un `+8,2 %` cumple la segunda condición. Una aserción laxa es
peor que ninguna, porque da por verificado lo que no se miró. La nueva lee los números y comprueba que
la serie sea monótona.

**Permiso `Ver_Portafolio`**, de fábrica para quien ve el menú —igual que Iniciativas— porque muestra
la misma información del portafolio y **ni un solo dato de costo**. Hay una prueba de pantalla que
falla si en la página aparece cualquier valor en pesos.

### D-130 · Editar una solicitud: solo lo que aplica, y en dos columnas

Pedido del usuario: mejorar la experiencia de editar una solicitud en Gestión, mostrando **solo los
datos que aplican a cada tipo**, y ampliando el modal con **los campos sueltos a la izquierda y a la
derecha una tabla que, según la fase, diga qué datos editar**.

**Lo que había:** el formulario ofrecía **las 52 columnas** de la tabla, las mismas para los tres
gobiernos, en una sola columna. A una **tarea** se le pedían las fechas de QA, la causa raíz de un
incidente, la fase y la versión; a una de **fábrica**, la indisponibilidad del servicio. Medio
formulario era ruido, y el ruido enseña a no leer el formulario.

**Ahora** son 38 columnas para una de fábrica, 34 para una estabilización y **17 para una tarea**. El
reparto es declarativo (`FORMULARIO_SOLICITUD` y `CAMPOS_SOLO_DE` en `Esquema.gs`) y lo resuelve el
servidor: la pantalla no tiene su propia lista de campos, porque con dos listas, agregar una columna al
esquema obliga a acordarse de dos sitios y el que se olvide deja un campo que no se puede diligenciar
sin que nada avise.

**La propiedad peligrosa de este cambio, y la prueba que la cubre.** Si guardar una tarea borrara los
campos que su formulario ya no muestra, abrir una tarea y guardarla **vaciaría sus fechas de fase** —y
con ellas su costo—. No pasa, porque `actualizarSolicitudCompleta` parte de una copia del registro
actual y solo sobreescribe las claves recibidas; pero eso era un detalle de implementación del que
ahora dependen 35 columnas, así que tiene prueba propia: se guarda una tarea y se verifica que sus
fechas de desarrollo, su versión y su fase siguen ahí.

**Lo que encontré de paso: se podía aprobar sin permiso de aprobar.** `Aprobada`, `Aprobada_Por` y
`Fecha_Aprobacion` eran editables desde este formulario, que exige `Editar_Solicitud`. Quien tuviera
ese permiso y **no** `Aprobar_Solicitud` podía aprobar escribiendo el campo, saltándose además la
validación de que la fase pida aprobación. Verificado contra el código anterior: con solo el permiso de
editar, `Aprobada` quedó en `SI` y `Aprobada_Por` en lo que se mandó. Y es el mismo campo que causó
D-125, donde un «SI» que nadie escribió sacó solicitudes del costeo en silencio. Ahora son campos del
sistema; el modal dice dónde se aprueba y cómo está. `Orden_Columna` también salió: se acomoda
arrastrando, y su propia ayuda ya lo decía.

**Una estabilización sí necesita las fechas de desarrollo y pruebas.** No recorre fases, así que la
tentación era dejarle solo su diagnóstico; pero consume `ETA-DEV` y `ETA-QA`
(`ETAPAS_DE_ESTABILIZACION`) y el costeo lee justo esas columnas. Sin ellas en el formulario, nadie
podría diligenciar lo que el costo necesita y el costo saldría mal. Está en `CAMPOS_SOLO_DE` como
`['fabrica', 'estabilizacion']`, con el motivo escrito al lado.

**Ningún campo se pierde en el camino.** Un nombre mal escrito en el reparto no revienta: el campo
simplemente no se dibuja, y nadie se entera. Así que `formularioDeSolicitud` devuelve `sinAcomodar`
—lo que aplica y no quedó en ningún grupo ni paso—, el modal lo muestra en un bloque «Otros datos», y
hay tres pruebas: que el formulario ofrezca **todo** lo aplicable, que no ofrezca nada que no aplique,
y que el reparto no nombre columnas que ya no existen en el esquema.

**La columna derecha** lleva un paso por fase, con el nombre tomado de `FASES` —no repetido en el
layout, para que no quede viejo cuando alguien renombre el catálogo— y una marca de en qué va su
información: **completo**, **a medias**, **sin fechas** o **no aplica**. La fase en la que está la
solicitud llega abierta y marcada «está aquí»; las demás, plegadas.

**El defecto que encontró la prueba:** un gobierno **sin embudo** no tiene «dónde estás», así que
ningún paso coincidía con la fase actual y la columna derecha de una tarea llegaba **toda plegada**:
quien la abría veía un panel en blanco y concluía que no había nada que diligenciar. Ahora, cuando los
pasos no son fases sino secciones de lo mismo, llegan todos abiertos.

**Dos aserciones laxas, el mismo día.** Una prueba daba por bueno que una tarea no mencionara la
aprobación buscando el texto «tarjeta del tablero» en todo el modal —y ese texto también está en la
ayuda del campo *Issue en Taiga*, así que falló sin que nada estuviera mal—. Otra esperaba «Gestión de
la demanda» con tilde, cuando el catálogo `FASES` la escribe sin tilde. Las dos se arreglaron
**atándolas a lo real**: la primera revisa un elemento con su propia clase, la segunda lee los nombres
del catálogo. Una aserción que compara contra un literal que yo escribí prueba mi memoria, no el
sistema.

**Y una prueba ajena que este cambio rompió con razón:** `pruebaTaiga.js` verificaba que el campo del
issue llegara al formulario **comparando el texto del código** (`...columnas.filter`) y la lista literal
de campos no editables. Las dos cosas cambiaron. Su intención seguía siendo válida, así que se reescribió
para que **corra el armado** y compruebe que `Link_Taiga` sale en los tres gobiernos. Una prueba atada a
cómo está escrito el código se cae cuando el código mejora.

**Nota de datos, no de código:** los nombres de las fases en el catálogo están sin tildes («Gestion de
la demanda», «Analisis y diseno», «Produccion»). El modal los muestra tal como están, igual que el
resto de la aplicación. Se corrigen editando la hoja `Fases` desde Administración; no hace falta tocar
código.

### D-131 · Los avisos dicen qué cambió, no cómo quedó

Pedido del usuario: que los avisos de Chat y correo indiquen, **según el tipo**, cuál fue el cambio y
sobre cuál solicitud. Antes de construir pidió ver el diseño, y escogió: a Chat **todo pero agrupado**,
correo también al PO, al analista y al BO, avisar **solo las ediciones de campos relevantes**, y **los
dos resúmenes** (diario a Chat, semanal por correo).

**Lo que había, verificado rindiendo los mensajes del código anterior:**

| | Antes |
| --- | --- |
| Eventos | **3** para los tres gobiernos: `creacion`, `cambio_fase`, `bloqueo` |
| Una tarea terminada | Tarjeta titulada «Cambio de fase», campo «Fase / Estado» con el valor `" · Terminada"` — el separador huérfano de la fase vacía |
| El correo de esa tarea | «La solicitud avanzo de fase.» |
| Enlaces | **0**. Para saber de qué se trataba había que entrar y buscar la tarjeta |
| Levantar un bloqueo | **Nada**: la rama era `bloqueada ? notificar_(...) : []` |
| Aprobar | **Nada** |
| Editar | **Nada** |
| Una causal creada desde Administración | Salía como **`CB-99`** |
| La respuesta del webhook | **No se miraba**: un webhook revocado devolvía 404 y la aplicación seguía como si hubiera publicado |

Ahora son **14 eventos**, cada uno con su texto, su urgencia y sus destinatarios.

**El cambio de fondo:** el aviso ya no describe el **estado** de la solicitud, describe el **cambio**.
Por eso `notificar_` recibe un tercer argumento, `cambio`: de dónde a dónde, quién lo hizo, cuánto duró
la fase que abandona y contra qué SLA. Sin ese dato lo único que se puede decir es «algo pasó», que es
lo que decía antes. Un mismo objeto describe el cambio y lo usan las tres salidas —tarjeta, correo y
línea del resumen— para que las tres digan lo mismo; antes el título de la tarjeta y el asunto del
correo salían de dos mapas distintos y podían desincronizarse sin que nada avisara.

**Las dos vías de salida.** A Chat sale al instante solo lo que alguien tiene que atender ahora
(bloqueo, desbloqueo, devolución de fase, llegada a producción, indisponibilidad, incidente crítico o
alto); el resto se encola y un disparador la vacía cada hora en **una sola tarjeta agrupada por tipo de
cambio**. Si no hay nada pendiente **no publica nada**: un espacio con «0 cambios» cada hora es
exactamente el ruido que este diseño existe para evitar. El correo sí sale siempre al instante, porque
va dirigido a los implicados y no a un espacio común.

**La cola es una HOJA, no memoria.** Si el disparador falla o no corre, los avisos siguen ahí y entran
en la pasada siguiente; en `CacheService` se habrían perdido en silencio, y un aviso perdido es peor que
uno tarde. Además se puede mirar: «esto es lo que está por salir». Se marcan **después** de publicar,
nunca antes.

**El defecto que encontró una falla de mi propio arnés.** La prueba del marcado falló porque no había
simulado `getHoja_` —y al mirar por qué, el `catch (e) { return; }` de `marcarAvisosPublicados_` estaba
tragándose el fallo. La consecuencia real: si el marcado fallara después de publicar, **el mismo resumen
saldría cada hora para siempre**. Ahora propaga, y `publicarResumenAgrupado` devuelve que publicó pero
no pudo marcar. Una falla del arnés que destapó un defecto del código, no al revés.

**Lo que se guarda en la cola es la línea YA ARMADA**, no los datos crudos. Si se armara al publicar, el
resumen describiría el estado de hoy y no el cambio de entonces, y dos movimientos de la misma hora se
leerían como uno.

**La causal se lee antes de borrarla.** Al liberar un bloqueo el sistema limpia `Causal_Bloqueo`, así que
el aviso de desbloqueo no podría decir de qué se liberó. `marcarBloqueo` la guarda antes de escribir y la
pasa en el cambio. Es el mismo hueco que D-127 encontró en el informe, resuelto aquí donde sí se puede.

**Los catálogos se leen de la hoja.** `nombreDeCausal_` y `nombreDeCausaRaiz_` usan
`getCausalesBloqueo_()` y `getCausasRaiz_()`, no las constantes del código: una causal agregada desde
Administración salía como su código. Mismo defecto que D-101.

**Las fechas, comparadas como fechas.** Las de la hoja llegan como `Date` y las del formulario como
texto; comparándolas crudas, **toda** edición parecía mover la fecha de compromiso. `sonElMismoValor_`
las normaliza antes de comparar.

**Lo que a propósito NO avisa:** las doce columnas de fecha por fase. El equipo las está diligenciando
hacia atrás y un aviso por celda es la forma más rápida de que se dejen de leer los avisos. Tampoco
avisa retirar una aprobación: es la corrección de quien acaba de darla, no una noticia. Ni una edición
que no tocó ningún campo relevante, que de otro modo mandaría «0 datos actualizados».

**El Business Owner entra solo en lo que le afecta** —devoluciones, bloqueos, producción, incidentes
graves— y en el resumen semanal. Ponerlo en cada avance serían decenas de correos al mes y acabaría
filtrándolos, que es lo mismo que no avisarle. El analista entra cuando el movimiento **toca** su fase,
de origen o de destino: se entera de que su análisis arrancó y de que salió, no de los seis movimientos
siguientes.

**`diagnosticoNotificaciones()`** dice a cuánta gente real llega hoy cada evento y por qué no llega al
resto. Existe porque creer que se está avisando cuando no, es peor que no avisar: el correo corporativo
sigue pendiente (S-12) y el PO está sin asignar en las 39 iniciativas (S-17), así que varias filas de la
tabla de destinatarios hoy no le llegan a nadie.

**Dos pruebas ajenas que este cambio rompió con razón:** `pruebaSinDrive.js` y `verCorreoCreacion.js`
evaluaban `cuerpoCorreo_`, que se mudó y se renombró. Su intención —que el correo no lleve enlaces a
Drive (D-76, D-77)— sigue valiendo, así que se reapuntaron al nuevo constructor y se les añadió lo que
antes no podían revisar: que el **único** enlace del correo sea el de la aplicación, y que sin dirección
aprendida el correo lo explique en vez de dejar un botón roto. `verCorreoCreacion.js` ahora rinde los
siete correos nuevos y comprueba que ningún asunto sea genérico.

**Operación:** `actualizarEstructura` crea la hoja `Avisos_Pendientes`, e `instalarResumenes()` programa
los tres disparadores —agrupado cada hora, cierre del día 17:45, semanal lunes 7:40, en zona de Bogotá—.
Las horas no son en punto a propósito: los disparadores que caen a la hora exacta compiten con los de
todo el mundo y se atrasan. `limpiarAvisosPublicados()` borra lo publicado de más de treinta días: la
hoja es una cola, no una bitácora.

### D-132 · La factura de cada fábrica de software

Pedido del usuario: poder indicar a qué fábrica corresponde cada costo —hoy son dos, **Hexa** y
**Seti**— y, desde los cálculos detallados, imprimir el detalle separado por fábrica para facturar y
pagar.

**Lo que ya existía:** el motor reparte cada bolsa entre las solicitudes que la ocuparon y guarda, bolsa
por bolsa, cuánto cobró el mes y cuánto de eso se atribuyó. La aritmética de la factura ya estaba; lo
que faltaba era decir **a quién se le paga cada bolsa**. Antes la hoja de costos tenía siete columnas y
ninguna era la fábrica: con dos proveedores en la misma hoja, todo salía en un solo total.

**Lo nuevo:** catálogo `Fabricas` (ampliable, sembrado con Hexa y Seti, con NIT y contrato opcionales),
una columna `ID_Fabrica` en cada bolsa, y `getFacturacion(mes)` que arma un documento por fábrica.

**La decisión del usuario, y su consecuencia.** Se le preguntó qué monto debe llevar la factura:
la **capacidad contratada** o **solo lo atribuido** a solicitudes. Escogió lo atribuido, advertido de
que si falta una fecha esa capacidad no entra en la factura. Queda registrado así porque es su decisión
sobre su dinero, no un detalle de implementación. En el ensayo con datos de prueba se ve el efecto:
Hexa facturaría **$140.547.737 de $191.845.366 contratados** porque faltan las fechas de análisis.

**Lo único que añadí sin que lo pidiera:** una **línea de conciliación** —capacidad contratada,
atribuido, y la diferencia— **fuera del total y marcada como «no hace parte del valor a facturar»**.
Quien autoriza el pago tiene que poder ver que está pagando menos que el contrato, y la fábrica lo va a
notar. Está en el anexo, que es la sección que el usuario sí aceptó, y se quita en un cambio si no la
quiere. El usuario había declinado la opción «muéstrame las dos cifras y yo decido», así que la decisión
sigue siendo la suya: el **total** es lo atribuido; esto es un renglón de control, no parte de la cuenta.

**Una bolsa sin fábrica NO se suma a ninguna factura.** Va a su propia hoja, al final, marcada, con el
monto que nadie va a cobrar y dónde se asigna. Colarla en la factura equivocada es un pago mal hecho, y
repartirla «a partes iguales» sería inventarse una deuda. Las siete bolsas actuales van a aparecer ahí
hasta que se les asigne la fábrica, que es exactamente lo que hay que ver.

**No corrí a adivinar de quién es cada bolsa.** Los nombres `CF-DEV-SETI` y `CF-QA-SETI` lo sugieren,
pero asignar una bolsa de 51 millones a la fábrica equivocada por deducir de un nombre es un pago mal
hecho. Se asigna desde Administración, que es además lo que el usuario pidió.

**La suma del anexo tiene que dar el monto.** El anexo sale del reparto que ya calculó el motor —una
fila por bolsa y por solicitud—, así que no se recalcula nada y la suma cuadra por construcción. Aun
así se comprueba (`cuadra`) y, si no cuadrara, el documento lo dice en rojo y pide no usarlo: nadie
debería enterarse de un descuadre frente al proveedor.

**Al imprimir, cada fábrica arranca en página nueva** y no se imprime nada de lo que quedó detrás: son
dos documentos que van a dos proveedores distintos, y la factura de una no puede terminar en la hoja de
la otra. El encabezado de las tablas se repite en cada página, porque una tabla partida obliga a buscar
el encabezado en la hoja anterior. La última hoja no lleva salto, que dejaría una página en blanco.

**Sin IVA**, por decisión del usuario: los valores están guardados sin impuesto y la fábrica emite su
factura con él. El documento lo dice.

**Una corrección que le debía al usuario.** Al proponerle esto le dije que «en septiembre el 21,8 % de
la capacidad quedó sin atribuir». Ese número salió de `generarInforme.js`, un archivo de prueba mío, no
de su hoja. No tengo acceso a sus cifras reales. La consecuencia de facturar solo lo atribuido sigue
siendo real, pero no puedo dimensionarla, y presentarle un porcentaje inventado como si fuera su dato
es peor que no dar ninguno.

**Tres revisiones mías que fallaron leyendo el texto del CSS.** Comprobaban el salto de página y el
ocultado del tablero comparando cadenas de `cssText`, y el navegador normaliza las propiedades
(`page-break-after` termina como `break-after`), así que fallaban sin que nada estuviera mal. Se
reescribieron **emulando el medio de impresión** y mirando los estilos calculados: se comprueba el
efecto, no la redacción. Es la tercera vez en esta semana que una aserción atada a un literal me
engaña; medir el comportamiento es la única forma que no se cae.

### D-133 · El anexo de la factura se lee como los cálculos detallados

Cinco ajustes al documento de facturación, pedidos después de verlo impreso. Todos apuntan a lo
mismo: que quien firma la cuenta la pueda cotejar sin traducir nada.

**La columna de etapa sale de conceptos.** En esa tabla cada renglón es una bolsa de capacidad, y la
etapa no cambia la decisión de pagar. Quedan bolsa, concepto, vigencia en el mes y valor.

**El anexo se llama «actividades detalladas del mes».** El título anterior —«de dónde sale cada
peso»— explicaba la intención; el nuevo dice qué hay en la tabla.

**La iniciativa pasó de columna a renglón.** Como columna repetía el mismo nombre en cada fila y
gastaba ancho en papel. Ahora es un renglón de encabezado antes de sus solicitudes, con su subtotal en
la misma línea: en un documento impreso no se puede desplegar nada, así que todo tiene que leerse de
corrido.

**Las columnas del anexo son las de la tabla de cálculos detallados**: solicitud, tipo, el valor
desglosado por etapa con sus días, el total de cada fila y, abajo, el total de cada columna más el
total de todo. Dos tablas que hablan de la misma plata ya no se leen distinto. Las columnas son
**solo las etapas donde esa fábrica cobró**: una bolsa contratada que nadie ocupó no genera una
columna en ceros, su plata se ve en la conciliación contra el contrato.

**El botón pregunta primero de qué fábrica.** No se facturan todas el mismo día. El escogedor muestra
el monto de cada una antes de abrir el documento, para decidir viendo la cifra y no de memoria, y
separa las bolsas sin fábrica asignada, que no entran en ninguna factura. Con una sola fábrica y sin
bolsas huérfanas no pregunta nada.

**Un error que la reestructura corrigió sin que nadie lo hubiera pedido.** El anexo anterior salía del
reparto, que trae una fila por bolsa **y** por solicitud. Si una fábrica tiene dos bolsas en la misma
etapa —capacidad base y un refuerzo, algo normal— la misma solicitud salía dos veces y los días se
repetían en cada fila: una solicitud que ocupó 11 días hábiles mostraba 22 para quien sumara la
columna. La plata siempre estuvo bien; los días no. Ahora hay una fila por solicitud, el dinero se
suma y los días se fijan **una vez por etapa**. Queda una revisión con ese caso exacto.

**Una aserción mía que decía una cosa y comprobaba otra.** Se llamaba «las columnas son solo las
etapas donde ESTA fábrica cobró» y comparába contra una lista escrita a mano que incluía una etapa
donde no había cobrado nada. El motor estaba bien y la revisión fallaba. Se reescribió como la regla:
las columnas tienen que ser exactamente las etapas con plata en las filas, calculadas desde las
propias filas. Es la cuarta vez esta semana que un literal en una revisión me engaña.

**Los días se escriben igual en toda la tabla.** El renglón de la iniciativa y el de totales decían
«28 d» mientras los de solicitud decían «12 días». En la misma columna, dos formas de escribir la
unidad hacen dudar de si son la misma. Hay una revisión que exige una sola unidad en el anexo.

### D-134 · La iniciativa inactiva no se ofrece ni se lista

La iniciativa gana una columna **Activo** (SÍ/NO), editable desde su propia ficha y desde
Administración. En NO, la iniciativa deja de ofrecerse donde se escoge una y deja de listarse en el
portafolio. **No borra nada**: sus solicitudes, sus costos y lo entregado en cada mes siguen igual.

**El vacío cuenta como activa**, igual que en `Usuarios`: solo el NO explícito desactiva. Es lo que
permite agregar la columna sin que las 39 iniciativas desaparezcan de todas las pantallas mientras
alguien la llena, y lo que protege de una fila escrita a mano en la hoja.

**La columna se llena sola al agregarse.** Un SÍ/NO vacío se muestra como NO (D-125), así que la
columna recién creada habría dejado todas las iniciativas en NO a los ojos del formulario y la
primera edición las habría desactivado sin que nadie lo pidiera. Ahora una columna puede declarar su
`predeterminado` en el esquema, y `actualizarEstructura` lo escribe en las filas que ya existen, sin
pisar lo que alguien hubiera puesto a mano. El mismo dato marca SÍ al **crear** una iniciativa nueva.

**La trampa que esto habría abierto, y cómo se cierra.** Un desplegable que se arma sin la opción que
el registro trae deja marcada la primera de la lista, y guardar sin tocar nada **mueve el registro a
otra iniciativa en silencio**. Pasaba con cualquier solicitud o bolsa de costos que ya colgara de una
iniciativa desactivada. La regla es: se ofrecen las activas **más la que el registro ya tiene**,
rotulada «(inactiva)». Queda comprobado corriendo el motor con y sin esa regla: sin ella, una
solicitud de la iniciativa cerrada se guardaba contra la primera de la lista.

**La regla vive en el servidor, no en la pantalla.** `crearSolicitud` y la carga masiva rechazan una
iniciativa inactiva con su propio mensaje: la pantalla pudo quedar abierta desde antes de que alguien
la desactivara, y la carga masiva no pasa por ningún desplegable.

**Una excepción declarada: migrar historia.** El formulario de migración SÍ ofrece las inactivas.
Carga solicitudes de años anteriores, que pertenecen justamente a las iniciativas ya cerradas.

**Se pueden ver cuando se piden.** El Portafolio y el listado de Iniciativas traen una casilla «ver
inactivas», y las que aparecen van marcadas. No es un adorno: la ficha de una iniciativa se abre
desde su tarjeta o su fila, así que escondidas sin remedio una iniciativa desactivada por error no
tendría desde dónde volver a activarse, salvo para un administrador.

**Dónde SÍ cambian los números y dónde no.** El Home, el Portafolio y el volumen de iniciativas del
informe cuentan el portafolio **activo**: dos pantallas abiertas al tiempo no pueden decir dos
números distintos de iniciativas. Lo que se mide sobre el **trabajo** del mes —versiones entregadas,
embudo, bloqueos, cycle time y costos— no se toca: esas cifras salen de las solicitudes, que siguen
existiendo aunque su iniciativa se haya cerrado. El informe dice cuántas dejó fuera, para que un total
que baja tenga explicación a la vista.

**Un defecto viejo que apareció de paso.** `kpisPortafolio` era el identificador de la caja de
indicadores en el Home **y** en el Portafolio. Todas las páginas viven en el mismo documento, así que
no eran dos elementos: `getElementById` devolvía siempre el primero —el del Home, que se incluye
antes— y por eso la caja del Portafolio se quedaba vacía y abrir esa página reescribía los
indicadores del Home. Vino desde D-129. La del Portafolio se llama ahora `kpisPf`, y el verificador
estático revisa que ningún identificador se repita entre páginas; comprobado contra el código
anterior, donde lo caza.

### D-135 · La plataforma, al lado de cada actividad costeada

La tabla de **cálculos detallados** de Costos y el **anexo** del soporte de facturación llevan ahora una
columna de **plataforma digital**, entre la actividad y su tipo. Son las dos tablas que hablan de la
misma plata, y se cotejan una contra otra: lo que lleva una tiene que llevarlo la otra. La descarga de
auditoría, que es la misma tabla en Excel, también la lleva.

**La plataforma sale de la SOLICITUD, no de su iniciativa.** Una iniciativa puede tocar varias
plataformas —el portafolio ya lo muestra así, con la plataforma deducida en cursiva— y lo que se está
costeando es el trabajo de cada solicitud. Por eso va en la fila de la actividad y no en el renglón del
grupo. Queda una revisión con dos solicitudes de la **misma** iniciativa en plataformas distintas: si
el dato saliera de la iniciativa, las dos dirían lo mismo.

**La que no tiene plataforma lo dice.** Sale rotulada «sin plataforma» y no en blanco: una celda vacía
en una tabla de plata se lee como un error de la tabla, no como un campo sin diligenciar.

**Dos revisiones que ya no dependen de un número escrito a mano.** La que contaba las columnas de la
tabla las contaba contra un 6 fijo; ahora las cuenta contra la regla —las fijas, una por etapa y el
total— derivada de los propios datos. Y se agregó una que suma el `colspan` de cada fila y exige que
todas ocupen lo mismo que el encabezado: un `colspan` que no cuadra desalinea la tabla entera y en
papel se lee como una columna corrida, que es justo lo que esta columna nueva podía provocar.

**Una pecera que no probaba nada.** El ensayo de la pantalla de Costos no tenía plataformas, así que la
columna salía entera en «sin plataforma» y la revisión pasaba igual. Ahora reparte tres plataformas
entre las actividades y deja una de cada doce sin plataforma, y la revisión exige ver al menos dos
distintas **y** el rótulo de la que no tiene.

**La misma unidad en toda la tabla.** Igual que en el anexo (D-133), el renglón de la iniciativa y el
de totales decían «103,4 d» mientras los de actividad decían «19,5 días». En la misma columna, dos
formas de escribir la unidad hacen dudar de si son la misma. Hay una revisión que exige una sola.

### D-136 · Cuánto costó cada plataforma digital, mes a mes

Una tabla nueva en Costos: una fila por plataforma, una columna por mes del período, el total de cada
una y su porcentaje. Responde dos preguntas de una sola lectura —en qué plataforma se está gastando, y
cómo se mueve de un mes a otro— que ninguna de las tablas que ya había contestaba: la de iniciativa
cruza por iniciativa, la de mes solo da el total. La descarga de auditoría lleva la misma tabla.

**Se acumula dentro del reparto, no se recalcula después.** Cada peso entra una sola vez y por el mismo
camino que el resto de la página, así que la tabla no puede decir un total distinto del que ya está
arriba. También tenía que ser ahí porque la bitácora del reparto solo viaja cuando se pide la
exportación: calcularla desde la lista de actividades habría dejado la tabla sin meses.

**Los meses salen del período, no de lo que costó.** Toda fila trae una celda por cada mes, aunque esa
plataforma no haya costado nada ese mes, y entonces va **en raya**. Un mes que desaparece de una fila
se lee como un mes sin datos, no como un mes sin trabajo en esa plataforma; y una celda vacía en una
tabla de plata se lee como un error de la tabla.

**«Sin plataforma» va al final.** No es una plataforma: es lo que falta por diligenciar, y ordenarla
por monto la habría puesto entre las demás como si lo fuera.

**Con un solo mes no se repite la columna.** El total sería idéntico a la única columna de mes, y dos
columnas iguales lado a lado hacen dudar de si dicen lo mismo.

**El porcentaje es sobre lo CONTRATADO**, igual que en la tabla por iniciativa: sobre lo repartido
sumaría siempre 100 y la capacidad que nadie ocupó desaparecería de la lectura. La revisión que lo
comprueba necesitó una bolsa que nadie ocupara: con todo atribuido las dos bases dan el mismo número y
no distinguiría una de otra. Mi primera versión fallaba justamente por eso —era la aserción la que
estaba mal, no el cálculo—.

**Tres aserciones que pasaban en vacío.** Las que suman filas y columnas usaban `every()`, que es cierto
sobre cero filas: contra el código anterior, con la tabla sin pintar, pasaban sin mirar nada. Ahora
exigen que haya filas, y la revisión reporta la falla en vez de reventar a mitad del archivo. Con eso,
las diez revisiones nuevas fallan contra el código anterior.

**La pecera del ensayo tenía sus propias cuentas.** Los totales por mes estaban escritos a mano y no
correspondían a las actividades. Ahora la matriz de plataforma por mes se arma desde las actividades y
los totales por mes se recalculan desde ella: un ensayo cuyas filas no suman lo que dice su total no
sirve para revisar una tabla cuyo punto es justamente que cuadre.

## Supuestos abiertos

| # | Tema | Pendiente |
| --- | --- | --- |
| S-01 | Catálogos de negocio | Falta la lista de `Aplicaciones` por plataforma y el resto de `Usuarios` con su rol. Plataformas e iniciativas ya están cargadas |
| S-12 | Correos corporativos | Ya no bloquean el modelo (ver D-15), pero sin ellos nadie puede iniciar sesión en la aplicación |
| S-16 | Estados de iniciativa | Confirmar los cinco propuestos en D-18 |
| S-17 | PO de cada iniciativa | La columna llegó vacía en las 39 |
| S-13 | Iniciativa `INI-011` | *Gestión comercial (Matrix Fase 5)* llegó solo con nombre: sin prioridad, tipo, LEN, vertical ni estado |
| S-14 | Fechas del portafolio | Confirmado: no existen todavía. Se capturan editando el archivo fuente o desde Administración |
| S-15 | Plataforma por iniciativa | El campo `Plataforma_ID` existe en la iniciativa y está vacío: falta asignarlo |
| S-02 | Google Chat | URL del webhook del espacio destino |
| S-03 | Dominio | Dominio corporativo para restringir el SSO |
| S-04 | Correo | ¿`MailApp` simple o Gmail API con alias/remitente específico? |
| S-05 | Marca | Nombre visible de la compañía y logo para el header |
| S-06 | AppSheet | La UI low-code no es generable por código; se entregará guía de configuración |
| S-07 | Comités | ¿Se registra el resultado de los comités de Presidencia y CAB como campos propios o basta con el estado *Aprobada* + la auditoría? |
| S-08 | Versionamiento | ¿`Roadmap_Versiones` se alimenta automáticamente al asignar `Version_Semantica`, o se administra aparte? |
| S-09 | SLA | ¿Días calendario o días hábiles? (ver D-10) |
| S-10 | Aplicación de la iniciativa | ¿Una aplicación principal por iniciativa, o varias? (ver D-08) |
| S-21 | Historial de versión | Para medir cumplimiento de alcance y tiempo comprometido→entregado hay que registrar en la bitácora los cambios de versión de una solicitud (ver D-104) |
| S-20 | Lista de analistas | La hoja `Analistas` se crea vacía: hay que registrar quiénes analizan desde Administración → Analistas (ver D-102) |
| S-18 | Ventana de servicio | Para el % de disponibilidad por plataforma: ¿24×7 o jornada hábil? Sin eso el indicador no se puede calcular (ver D-101) |
| S-19 | SLA de estabilización | ¿Cuántas horas objetivo para atender una crítica y una alta? Hoy se mide el tiempo, sin meta contra la cual compararlo |
| S-11 | Metas | ¿Hay metas objetivo para Lead Time, throughput y First Pass Yield? Sin meta, el indicador informa pero no semaforiza |
