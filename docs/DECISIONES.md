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
registro sí se volvió editable más adelante: ver D-42.)*

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

El orden dentro de cada iniciativa es el del **backlog** (`Orden_Iniciativa`), que es el que el
negocio definió para decir qué se trabaja primero; lo que no tenga orden va al final y no al
principio por valer cero.

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
| S-11 | Metas | ¿Hay metas objetivo para Lead Time, throughput y First Pass Yield? Sin meta, el indicador informa pero no semaforiza |
