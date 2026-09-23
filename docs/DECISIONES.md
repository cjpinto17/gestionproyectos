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
| Caché compartida | El resultado sirve a las siguientes peticiones y a los demás usuarios, 300 s | `Cache.gs`, `CONFIG.CACHE_SEGUNDOS` |
| Arranque | `getArranque()` entrega sesión, catálogos e indicadores en un solo viaje, en vez de tres encadenados | `Codigo.gs` |
| Navegador | Cada página recuerda lo que ya consultó; cambiar de pestaña no vuelve a pedir | `Scripts.html` |
| Payload | La bitácora viaja acotada a las 200 transiciones más recientes, con el total aparte | `Metricas.gs` |

**Toda escritura invalida la tabla afectada**, así que la caché nunca muestra datos viejos
tras un cambio hecho desde la aplicación. El único caso de desfase es editar el Google Sheets
a mano: para eso está el botón **Actualizar** de la barra superior, que fuerza la relectura.

`medirRendimiento()` en `Cache.gs` cronometra las cuatro consultas principales con y sin
caché, para comprobar el efecto sobre los datos reales.

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
trazabilidad no puede depender de por dónde se hizo el cambio. `ID_Solicitud`,
`Fecha_Registro` y `Carpeta_Drive_URL` no son editables, porque son la identidad y la historia
del registro.

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
`SOL-AAAAMMDD-###` ya no reinicia el contador cada día: toma el mayor número existente en la
hoja y sigue. Antes, dos solicitudes registradas en días distintos podían llevar el mismo
`001`, y al hablar de "la solicitud 3" nadie sabía de cuál se trataba.

### D-38 · Los estados de solicitud usan el mismo código de color
El tablero y la matriz se leen igual: gris lo que no arranca, amarillo lo que avanza, verde lo
aprobado y terminado, rojo lo bloqueado, gris tachado lo cancelado.

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
