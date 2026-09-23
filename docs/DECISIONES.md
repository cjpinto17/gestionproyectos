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
