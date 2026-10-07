/**
 * Esquema.gs
 * Definicion declarativa del modelo de datos. Es la unica fuente de verdad
 * sobre hojas, columnas, tipos y llaves: Setup.gs la usa para crear los libros,
 * el CRUD de Administracion genera sus formularios desde aqui y las
 * validaciones tipan los valores antes de escribir en Sheets.
 *
 * Tipos soportados: 'text' | 'longtext' | 'number' | 'decimal' | 'date' |
 *                   'datetime' | 'enum' | 'boolSN' | 'url' | 'email'
 */

/* ================================================================== */
/* Catalogos operativos                                                */
/* ================================================================== */

/** Las 8 fases del embudo de atencion de solicitudes. */
var FASES = [
  { id: 'FAS-01', nombre: 'Gestion de la demanda', orden: 1 },
  { id: 'FAS-02', nombre: 'Backlog', orden: 2 },
  { id: 'FAS-03', nombre: 'Analisis y diseno', orden: 3 },
  { id: 'FAS-04', nombre: 'Desarrollo', orden: 4 },
  { id: 'FAS-05', nombre: 'Pruebas QA', orden: 5 },
  { id: 'FAS-06', nombre: 'Pruebas UAT', orden: 6 },
  { id: 'FAS-07', nombre: 'Aceptacion TI', orden: 7 },
  { id: 'FAS-08', nombre: 'Produccion', orden: 8 }
];

/**
 * Estados de las SOLICITUDES (actividades). Son distintos de los estados de
 * la iniciativa: una solicitud vive dentro del embudo de 8 fases.
 */
var ESTADOS = [
  { id: 'EST-01', nombre: 'Por iniciar' },
  { id: 'EST-02', nombre: 'En progreso' },
  { id: 'EST-03', nombre: 'Aprobada' },
  { id: 'EST-04', nombre: 'Bloqueada' },
  { id: 'EST-05', nombre: 'Cancelada' },
  { id: 'EST-06', nombre: 'Terminada' }
];

/**
 * Estados de las INICIATIVAS. Una iniciativa es el contenedor de negocio y su
 * ciclo de vida no depende del embudo: puede estar en curso con solicitudes en
 * cualquier fase, o cerrada aunque no haya tenido ninguna.
 */
var ESTADOS_INICIATIVA = [
  { id: 'EIN-01', nombre: 'Por iniciar' },
  { id: 'EIN-02', nombre: 'En progreso' },
  { id: 'EIN-03', nombre: 'En pausa' },
  { id: 'EIN-04', nombre: 'Cancelada' },
  { id: 'EIN-05', nombre: 'Finalizada' }
];

/**
 * Catalogo de plataformas digitales. En este modelo plataforma y aplicacion
 * son el mismo concepto: no existe una tabla Aplicaciones aparte.
 */
var PLATAFORMAS = [
  { id: 'PL-01', nombre: 'Analizamos' },
  { id: 'PL-02', nombre: 'Aseguramos' },
  { id: 'PL-03', nombre: 'Banca Movil' },
  { id: 'PL-04', nombre: 'Notificamos' },
  { id: 'PL-05', nombre: 'Talanquera' },
  { id: 'PL-06', nombre: 'Configuramos' },
  { id: 'PL-07', nombre: 'Shivam' },
  { id: 'PL-08', nombre: 'Portal Empresarial' }
];

/** Tipos de solicitud (actividad). */
var TIPOS_SOLICITUD = [
  { id: 'TIP-01', nombre: 'Ajuste' },
  { id: 'TIP-02', nombre: 'Mejora' },
  { id: 'TIP-03', nombre: 'Nuevo' },
  { id: 'TIP-04', nombre: 'Tarea' },
  { id: 'TIP-05', nombre: 'Estabilizacion' }
];

/**
 * COMO SE GOBIERNA CADA TIPO DE SOLICITUD
 * ---------------------------------------
 * Hasta ahora habia dos mundos: las de fabrica, que recorren el embudo de ocho
 * fases, y las tareas, que se mueven por estado (D-79). La estabilizacion es un
 * tercero: tampoco recorre el embudo, pero no es una tarea —es la evidencia de
 * que una version que ya salio a produccion fallo— y ni sus tarjetas ni sus
 * numeros se pueden mezclar con los de la fabrica (D-101).
 *
 * Con dos mundos bastaba una pregunta de si o no. Con tres hace falta decir CUAL,
 * asi que cada tipo declara su gobierno y de ahi salen todas las preguntas. Lo
 * que no aparezca aqui es de fabrica: es lo que era antes y lo que seguira
 * siendo cualquier tipo nuevo que alguien agregue sin leer esto.
 */
var GOBIERNO_FABRICA = 'fabrica';
var GOBIERNO_TAREA = 'tarea';
var GOBIERNO_ESTABILIZACION = 'estabilizacion';

var GOBIERNO_POR_TIPO = {
  'TIP-04': GOBIERNO_TAREA,
  'TIP-05': GOBIERNO_ESTABILIZACION
};

/**
 * @param {string} tipoSolicitud
 * @return {string} 'fabrica', 'tarea' o 'estabilizacion'.
 */
function gobiernoDeTipo(tipoSolicitud) {
  return GOBIERNO_POR_TIPO[String(tipoSolicitud || '')] || GOBIERNO_FABRICA;
}

/**
 * @param {string} tipoSolicitud
 * @return {boolean} True si recorre el embudo de ocho fases.
 */
function recorreEmbudo(tipoSolicitud) {
  return gobiernoDeTipo(tipoSolicitud) === GOBIERNO_FABRICA;
}

/**
 * @param {string} tipoSolicitud
 * @return {boolean} True si se gobierna por estado en el tablero de tareas.
 */
function esTipoTarea(tipoSolicitud) {
  return gobiernoDeTipo(tipoSolicitud) === GOBIERNO_TAREA;
}

/**
 * @param {string} tipoSolicitud
 * @return {boolean} True si es una estabilizacion de produccion.
 */
function esTipoEstabilizacion(tipoSolicitud) {
  return gobiernoDeTipo(tipoSolicitud) === GOBIERNO_ESTABILIZACION;
}

/**
 * @param {string} tipoSolicitud
 * @return {boolean} True si ese tipo llega a produccion dentro de una version.
 *
 * Todo menos la tarea: una tarea se hace y se cierra, no se despliega, y por eso
 * no ocupa lugar en el roadmap ni en la mezcla de inversion. La estabilizacion
 * SI: no recorre el embudo, pero su arreglo sale en una version —la que dice su
 * "Version de correccion"— y es parte de lo que la fabrica entrego (D-106).
 */
function saleEnVersion(tipoSolicitud) {
  return !esTipoTarea(tipoSolicitud);
}

/**
 * Los tipos que dejan la fase vacia. Se DERIVA del mapa de gobiernos y no se
 * escribe aparte: dos listas de lo mismo se desfasan, y cuando se desfasan el
 * sistema dice una cosa en la pantalla y otra en la hoja (D-100).
 */
var TIPOS_SIN_EMBUDO = Object.keys(GOBIERNO_POR_TIPO);

var ESTADOS_TABLERO_TAREA = ['EST-01', 'EST-02', 'EST-04', 'EST-06'];

/**
 * Columnas del tablero de estabilizacion: por iniciar, en progreso, terminada.
 *
 * Son tres y no cuatro: una estabilizacion no se "bloquea" en el sentido del
 * embudo —se atiende hasta que se resuelve— y "En progreso" es el estado que ya
 * existe, no uno nuevo. Crear un "En proceso" al lado de "En progreso" habria
 * dejado dos estados que nadie distingue al leer un reporte (D-101).
 */
var ESTADOS_TABLERO_ESTABILIZACION = ['EST-01', 'EST-02', 'EST-06'];

/** El estado en el que una estabilizacion se considera cerrada. */
var ESTADO_ESTABILIZACION_CERRADA = 'EST-06';

/**
 * Las prioridades que exigen postmortem e indisponibilidad para poder cerrar.
 * Critica y Alta: son las que el negocio siente y las que hay que explicar.
 */
var PRIORIDADES_CON_POSTMORTEM = ['PRI-01', 'PRI-02'];

/**
 * @param {string} prioridadId
 * @return {boolean} True si esa prioridad exige postmortem al cerrar.
 */
function exigePostmortem(prioridadId) {
  return PRIORIDADES_CON_POSTMORTEM.indexOf(String(prioridadId || '')) !== -1;
}

/** Que tanto del servicio se cayo. */
var TIPOS_INDISPONIBILIDAD = ['Total', 'Parcial'];

/* ================================================================== */
/* Costos de la fabrica (D-110)                                        */
/* ================================================================== */

/**
 * Las tres etapas que cuestan, y las fases que ocupan cada una.
 *
 * La fabrica no se cobra por actividad: se paga una capacidad fija al mes y esa
 * capacidad la ocupan las solicitudes mientras estan en sus fases. Gestion de la
 * demanda, Backlog, Aceptacion TI y Produccion no consumen fabrica: son gestion
 * y despliegue, no construccion.
 */
/*
 * Cada rango es [columna de inicio, columna de fin, nombre, columna "no aplica"].
 *
 * El "no aplica" existe porque no toda solicitud pasa por todas las fases —un
 * ajuste pequeno puede no ir a UAT— y sin una forma de decirlo, esas etapas
 * quedaban reclamadas como informacion faltante para siempre. Un pendiente que
 * nunca se puede cerrar acaba enseñando a ignorar la lista entera (D-116).
 */
var ETAPAS_COSTO = [
  { id: 'ETA-ANA', nombre: 'Análisis y diseño', fases: ['FAS-03'],
    rangos: [['Fecha_Inicio_Analisis', 'Fecha_Fin_Analisis', 'Análisis y diseño',
              'No_Aplica_Analisis']] },
  { id: 'ETA-DEV', nombre: 'Desarrollo', fases: ['FAS-04'],
    rangos: [['Fecha_Inicio_Dev', 'Fecha_Fin_Dev', 'Desarrollo', 'No_Aplica_Dev']] },
  { id: 'ETA-QA', nombre: 'Pruebas QA y UAT', fases: ['FAS-05', 'FAS-06'],
    rangos: [['Fecha_Inicio_QA', 'Fecha_Fin_QA', 'Pruebas QA', 'No_Aplica_QA'],
             ['Fecha_Inicio_UAT', 'Fecha_Fin_UAT', 'Pruebas UAT', 'No_Aplica_UAT']] }
];

/**
 * Que etapas ocupa una estabilizacion mientras esta En progreso.
 *
 * Las DOS a la vez, no mitad y mitad: un incidente jala al equipo de desarrollo
 * y al de pruebas al mismo tiempo. La consecuencia es que una estabilizacion
 * pesa mas por dia que una actividad que solo esta en una etapa, y eso es
 * exactamente lo que hay que ver.
 */
var ETAPAS_DE_ESTABILIZACION = ['ETA-DEV', 'ETA-QA'];

/** @return {?Object} La etapa que ocupa una fase, o null si no consume. */
function etapaDeFase(faseId) {
  for (var i = 0; i < ETAPAS_COSTO.length; i++) {
    if (ETAPAS_COSTO[i].fases.indexOf(String(faseId || '')) !== -1) return ETAPAS_COSTO[i];
  }
  return null;
}

/** @return {boolean} True si ese tipo entra en el costeo (D-110). */
function entraEnCosteo(tipoSolicitud) {
  return saleEnVersion(tipoSolicitud);
}

/**
 * Los tres momentos de las historias de usuario dentro de Analisis y diseno.
 *
 * Es el detalle de una fase que hasta ahora era una sola casilla: una solicitud
 * podia llevar tres semanas "en analisis" sin que se supiera si las historias se
 * estaban escribiendo, si ya estaban donde el PO, o si el PO ya las habia
 * revisado. Son tres esperas distintas y se destraban de maneras distintas.
 *
 * Van con tilde porque es lo que la gente lee en la tarjeta y en el formulario.
 *
 * NO reemplazan al sello de aprobacion de la fase (D-98): se decidio que fueran
 * independientes. El sello dice que la solicitud puede salir de la fase; esto
 * dice en que va el trabajo de adentro (D-108).
 */
var ESTADOS_HISTORIAS = ['En construcción', 'Enviadas al PO', 'Aprobadas'];

/** En el que entran al llegar a la fase: es donde empieza el trabajo. */
var ESTADO_HISTORIAS_INICIAL = 'En construcción';

/** La fase en la que se escriben las historias. */
var FASE_HISTORIAS = 'FAS-03';

/**
 * @param {string} faseId
 * @param {string} tipoSolicitud
 * @return {boolean} True si ahi se lleva el control de las historias.
 *
 * Solo las de fabrica —Nuevo, Mejora y Ajuste— y solo en Analisis y diseno: una
 * tarea no pasa por ahi y una estabilizacion no escribe historias.
 */
function llevaHistorias(faseId, tipoSolicitud) {
  return recorreEmbudo(tipoSolicitud) && String(faseId || '') === FASE_HISTORIAS;
}

/**
 * La fase que no se puede empezar sin saber quien la analiza (D-102).
 *
 * Se exige al ENTRAR y no al salir: el analista es quien hace el trabajo de la
 * fase, asi que preguntarlo al final seria preguntar quien hizo algo que ya
 * esta hecho. Al entrar, es la decision de a quien se le asigna.
 */
var FASES_CON_ANALISTA = ['FAS-03'];

/**
 * @param {string} faseId
 * @return {boolean} True si entrar a esa fase exige analista asignado.
 */
function faseExigeAnalista(faseId) {
  return FASES_CON_ANALISTA.indexOf(String(faseId || '')) !== -1;
}

/**
 * Las columnas del tablero de fabrica cuyo orden se pone a mano, arrastrando.
 *
 * Son las tres donde todavia se decide QUE se atiende primero. De Desarrollo en
 * adelante el trabajo ya esta comprometido y repartido, y un orden ahi no
 * significaria nada: esas columnas siguen ordenandose solas por prioridad y
 * antiguedad (D-96).
 */
var FASES_ORDENABLES = ['FAS-01', 'FAS-02', 'FAS-03'];

/** @return {boolean} Si esa columna del tablero se ordena a mano. */
function faseSeOrdena(faseId) {
  return FASES_ORDENABLES.indexOf(String(faseId || '')) !== -1;
}

/**
 * Las fases que exigen aprobacion antes de dejar salir una solicitud.
 *
 * Son las tres donde todavia se decide SI se hace y COMO: la demanda que entra,
 * lo que se prioriza y lo que se diseña. De Desarrollo en adelante lo que hay es
 * ejecucion de algo ya aprobado, y poner otra compuerta ahi solo frenaria al
 * equipo sin agregar criterio (D-98).
 */
var FASES_CON_APROBACION = ['FAS-01', 'FAS-02', 'FAS-03'];

/** @return {boolean} Si para salir de esa fase hace falta una aprobacion. */
function faseExigeAprobacion(faseId) {
  return FASES_CON_APROBACION.indexOf(String(faseId || '')) !== -1;
}

/**
 * Estados que ya no se ofrecen, pero que siguen existiendo.
 *
 * "Aprobada" dejo de ser un estado: la aprobacion es ahora un dato aparte, con
 * su propio responsable y su propia fecha, porque una solicitud puede estar en
 * progreso Y aprobada a la vez —son dos cosas distintas y el estado solo podia
 * decir una—. Se retira de las listas donde alguien escoge, pero NO del
 * catalogo: la bitacora guarda movimientos viejos hacia EST-03 y sin el nombre
 * mostraria el codigo crudo (D-98).
 */
var ESTADOS_RETIRADOS = ['EST-03'];

/** @return {!Array<!Object>} Los estados que todavia se pueden escoger. */
function getEstadosVigentes_() {
  return ESTADOS.filter(function (e) {
    return ESTADOS_RETIRADOS.indexOf(e.id) === -1;
  });
}

/** Tipo de iniciativa: naturaleza de la inversion. */
var TIPOS_INICIATIVA = [
  { id: 'TIN-01', nombre: 'Negocio' },
  { id: 'TIN-02', nombre: 'Normativo' },
  { id: 'TIN-03', nombre: 'Habilitador Tecnico' },
  { id: 'TIN-04', nombre: 'Experiencia de cliente' },
  { id: 'TIN-05', nombre: 'Innovacion con proposito' }
];

/**
 * Las fabricas de software a las que se les paga (D-132).
 *
 * Cada bolsa de capacidad pertenece a una, y de ahi sale la factura de cada una.
 * Es un catalogo ampliable: hoy son dos, y contratar una tercera no debe exigir
 * un cambio de codigo (es la leccion de D-101, donde las causas raiz quedaron
 * amarradas a la constante y nadie podia agregarlas).
 */
var FABRICAS = [
  { id: 'FAB-01', nombre: 'Hexa' },
  { id: 'FAB-02', nombre: 'Seti' }
];

var PRIORIDADES = [
  { id: 'PRI-01', nombre: 'Critica' },
  { id: 'PRI-02', nombre: 'Alta' },
  { id: 'PRI-03', nombre: 'Media' },
  { id: 'PRI-04', nombre: 'Baja' }
];

/**
 * Causa raiz de una estabilizacion.
 *
 * Es lista y no texto libre a proposito: en texto libre cada persona la escribe
 * distinto y a los seis meses no se puede sumar nada. Como lista sale el Pareto
 * —"el 40% de nuestras estabilizaciones son de configuracion"—, que es el dato
 * que mueve decisiones. Al lado vive un campo abierto para el detalle del caso,
 * que es donde va lo que esta lista no puede capturar (D-101).
 *
 * Se edita desde Administracion como cualquier otro catalogo.
 */
var CAUSAS_RAIZ = [
  { id: 'CR-01', nombre: 'Codigo o logica' },
  { id: 'CR-02', nombre: 'Datos' },
  { id: 'CR-03', nombre: 'Configuracion' },
  { id: 'CR-04', nombre: 'Infraestructura' },
  { id: 'CR-05', nombre: 'Integracion con terceros' },
  { id: 'CR-06', nombre: 'Capacidad o rendimiento' },
  { id: 'CR-07', nombre: 'Error de operacion' },
  { id: 'CR-08', nombre: 'Falta de pruebas' },
  { id: 'CR-09', nombre: 'Cambio no controlado' },
  { id: 'CR-10', nombre: 'Proveedor externo' }
];

/**
 * Analistas que pueden quedar asignados a una solicitud en Analisis y diseno.
 *
 * Es una lista propia y no la de Usuarios: se pidio asi para poder incluir a
 * quien analiza sin que tenga que ser usuario de la aplicacion. Nace VACIA a
 * proposito —inventar nombres aqui seria poner en la hoja gente que no existe—
 * y se llena desde Administracion → Analistas (D-102).
 */
var ANALISTAS = [];

var CAUSALES_BLOQUEO = [
  { id: 'CAU-01', nombre: 'Falta de capacidad' },
  { id: 'CAU-02', nombre: 'Falta de aprobacion' },
  { id: 'CAU-03', nombre: 'Dependencia' },
  { id: 'CAU-04', nombre: 'Falta informacion de integraciones por parte de TI' }
];

/**
 * Roles del sistema. Business Owner y Product Owner son roles asignables a
 * cualquier usuario: las iniciativas apuntan a usuarios con esos roles.
 */
var ROLES = [
  { id: 'RO-01', nombre: 'Solicitante' },
  { id: 'RO-02', nombre: 'Product Owner' },
  { id: 'RO-03', nombre: 'Analista Fabrica' },
  { id: 'RO-04', nombre: 'Desarrollador' },
  { id: 'RO-05', nombre: 'Analista QA' },
  { id: 'RO-06', nombre: 'Equipo UAT' },
  { id: 'RO-07', nombre: 'Comite CAB' },
  { id: 'RO-08', nombre: 'Administrador' },
  { id: 'RO-09', nombre: 'Business Owner' },
  { id: 'RO-10', nombre: 'PM Fabrica SW' },
  { id: 'RO-11', nombre: 'Lider de proyecto FS' }
];

/**
 * Lineas Estrategicas de Negocio: eje horizontal de la matriz de iniciativas.
 * "Transversal" va de ultima porque no es una linea de negocio, sino la
 * ausencia de una: se muestra en la ultima columna.
 */
var LINEAS_ESTRATEGICAS = [
  { id: 'LEN-01', nombre: 'Ingreso estable', orden: 1 },
  { id: 'LEN-02', nombre: 'Agro', orden: 2 },
  { id: 'LEN-03', nombre: 'Desarrollo empresarial', orden: 3 },
  { id: 'LEN-04', nombre: 'Mi negocio independiente', orden: 4 },
  { id: 'LEN-00', nombre: 'Transversal', orden: 5 }
];

/** Verticales de producto: eje vertical de la matriz. Transversal va al final. */
var VERTICALES = [
  { id: 'VER-01', nombre: 'Credito', orden: 1 },
  { id: 'VER-02', nombre: 'Ahorro e Inversion', orden: 2 },
  { id: 'VER-03', nombre: 'Proteccion', orden: 3 },
  { id: 'VER-04', nombre: 'Servicio de Recaudo', orden: 4 },
  { id: 'VER-00', nombre: 'Transversal', orden: 5 }
];

/* ================================================================== */
/* Notificaciones: que se avisa, a quien y con que urgencia (D-131)    */
/* ================================================================== */

/**
 * Los eventos que generan aviso, uno por uno.
 *
 * Antes habia TRES eventos —creacion, cambio_fase, bloqueo— para los tres
 * gobiernos juntos, asi que una tarea terminada llegaba titulada "Cambio de
 * fase" con la fase vacia, y levantar un bloqueo no avisaba nada. Cada evento
 * tiene ahora su propio texto, su propia urgencia y sus propios destinatarios.
 *
 * `urgencia` decide si sale al instante o espera el resumen de la hora:
 *   'siempre'    - alguien tiene que hacer algo ahora
 *   'nunca'      - se acumula y sale en el resumen agrupado
 *   'siCritica'  - al instante solo si la prioridad es critica o alta
 *
 * `a` son los papeles que reciben el correo. El Business Owner entra solo en lo
 * que le afecta —devoluciones, bloqueos, produccion, incidentes graves— y en el
 * resumen semanal: ponerlo en cada avance serian decenas de correos al mes y
 * acabaria filtrandolos, que es lo mismo que no avisarle.
 *
 * `analistaEnFases` agrega al analista cuando el movimiento TOCA una de esas
 * fases, de origen o de destino: se entera de que su analisis arranco y de que
 * salio, no de los seis movimientos siguientes.
 *
 * `grupo` es el encabezado bajo el cual se lista en el resumen agrupado.
 */
var EVENTOS_NOTIFICACION = {
  creacion: {
    titulo: 'Nueva solicitud', grupo: 'Solicitudes nuevas',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  avance: {
    titulo: 'Avance de fase', grupo: 'Avanzaron de fase',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po'],
    analistaEnFases: ['FAS-03']
  },
  devolucion: {
    titulo: 'Devuelta a una fase anterior', grupo: 'Devueltas',
    urgencia: 'siempre', a: ['solicitante', 'responsable', 'po', 'bo'],
    analistaEnFases: ['FAS-03']
  },
  aprobacion: {
    titulo: 'Aprobada en su fase', grupo: 'Aprobadas en su fase',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  bloqueo: {
    titulo: 'Bloqueada', grupo: 'Se bloquearon',
    urgencia: 'siempre', a: ['solicitante', 'responsable', 'po', 'bo']
  },
  desbloqueo: {
    titulo: 'Bloqueo levantado', grupo: 'Se liberaron',
    urgencia: 'siempre', a: ['solicitante', 'responsable', 'po', 'bo']
  },
  produccion: {
    titulo: 'Llegó a producción', grupo: 'Llegaron a producción',
    urgencia: 'siempre', a: ['solicitante', 'responsable', 'po', 'bo']
  },
  edicion: {
    titulo: 'Datos actualizados', grupo: 'Ediciones',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  estado_tarea: {
    titulo: 'Tarea', grupo: 'Tareas',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  compromiso: {
    titulo: 'Cambió el compromiso', grupo: 'Compromisos movidos',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  incidente: {
    titulo: 'Incidente registrado', grupo: 'Incidentes nuevos',
    urgencia: 'siCritica', a: ['solicitante', 'responsable', 'po', 'bo']
  },
  estado_incidente: {
    titulo: 'Incidente', grupo: 'Incidentes',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po']
  },
  cierre_incidente: {
    titulo: 'Incidente cerrado', grupo: 'Incidentes cerrados',
    urgencia: 'nunca', a: ['solicitante', 'responsable', 'po', 'bo']
  },
  indisponibilidad: {
    titulo: 'Indisponibilidad registrada', grupo: 'Indisponibilidad',
    urgencia: 'siempre', a: ['solicitante', 'responsable', 'po', 'bo']
  }
};

/** Prioridades que hacen urgente un incidente. */
var PRIORIDADES_URGENTES = ['PRI-01', 'PRI-02'];

/**
 * Campos cuyo cambio al editar merece aviso, con el nombre que se usa al
 * contarlo.
 *
 * Deliberadamente NO estan las fechas por fase: el equipo las esta diligenciando
 * hacia atras y avisar cada celda seria un aviso por cada dato que se llena, que
 * es la forma mas rapida de que se dejen de leer los avisos. Lo que esta aqui es
 * lo que cambia el trabajo de alguien.
 */
var CAMPOS_AVISAN_EDICION = [
  { campo: 'Alcance', nombre: 'Alcance' },
  { campo: 'Prioridad', nombre: 'Prioridad', catalogo: 'Prioridad' },
  { campo: 'Responsable_ID', nombre: 'Responsable', catalogo: 'Usuarios' },
  { campo: 'ID_Proyecto', nombre: 'Iniciativa', catalogo: 'Proyectos' },
  { campo: 'Version_Semantica', nombre: 'Versión estimada' },
  { campo: 'Fecha_Compromiso', nombre: 'Fecha de compromiso' },
  { campo: 'Plataforma_ID', nombre: 'Plataforma', catalogo: 'Plataforma_Digital' },
  { campo: 'Analista_ID', nombre: 'Analista', catalogo: 'Analistas' }
];

/* ================================================================== */
/* El formulario de edicion de una solicitud (D-130)                   */
/* ================================================================== */

/**
 * Campos que administra el sistema y que NO se ofrecen para editar a mano.
 *
 * Los tres de aprobacion estaban editables y eso abria una puerta: quien tiene
 * "Editar solicitud" pero NO "Aprobar solicitud" podia aprobar escribiendo el
 * campo, saltandose tambien la validacion de que la fase pida aprobacion. Y
 * ademas fue el campo que causo D-125, donde un SI que nadie escribio saco
 * solicitudes del costeo en silencio. La aprobacion se hace desde la tarjeta del
 * tablero, que es donde se verifica el permiso.
 *
 * Orden_Columna se acomoda arrastrando las tarjetas; su propia ayuda ya decia que
 * no hacia falta escribirlo.
 */
var CAMPOS_DEL_SISTEMA = ['ID_Solicitud', 'Fecha_Ultimo_Cambio', 'Orden_Columna',
                          'Aprobada', 'Aprobada_Por', 'Fecha_Aprobacion'];

/**
 * Campos que existen solo para algunos gobiernos.
 *
 * Lo que no aparece aqui aplica a los tres. El formulario mostraba las 52
 * columnas a todo el mundo, asi que a una tarea se le pedian fechas de QA y a una
 * solicitud de fabrica, la causa raiz de un incidente: medio formulario era ruido
 * y el ruido ensena a no leer el formulario.
 *
 * Desarrollo y pruebas son de fabrica Y de estabilizacion: una estabilizacion no
 * recorre fases, pero en cuanto arranca consume las etapas de desarrollo y
 * pruebas (ETAPAS_DE_ESTABILIZACION), y el costeo lee justo esas columnas. Si el
 * formulario no las ofreciera, nadie podria diligenciar lo que el costo necesita.
 */
var CAMPOS_SOLO_DE = {
  Fase_Actual: ['fabrica'],
  Version_Semantica: ['fabrica'],
  Estado_Historias: ['fabrica'],
  Analista_ID: ['fabrica'],
  Fecha_Socializacion: ['fabrica'],
  Fecha_Despliegue: ['fabrica'],
  Fecha_Inicio_Demanda: ['fabrica'],
  Fecha_Fin_Demanda: ['fabrica'],
  Fecha_Inicio_Backlog: ['fabrica'],
  Fecha_Fin_Backlog: ['fabrica'],
  Fecha_Inicio_Analisis: ['fabrica'],
  Fecha_Fin_Analisis: ['fabrica'],
  No_Aplica_Analisis: ['fabrica'],
  Fecha_Inicio_Dev: ['fabrica', 'estabilizacion'],
  Fecha_Fin_Dev: ['fabrica', 'estabilizacion'],
  No_Aplica_Dev: ['fabrica', 'estabilizacion'],
  Fecha_Inicio_QA: ['fabrica', 'estabilizacion'],
  Fecha_Fin_QA: ['fabrica', 'estabilizacion'],
  No_Aplica_QA: ['fabrica', 'estabilizacion'],
  Fecha_Inicio_UAT: ['fabrica', 'estabilizacion'],
  Fecha_Fin_UAT: ['fabrica', 'estabilizacion'],
  No_Aplica_UAT: ['fabrica', 'estabilizacion'],
  Fecha_Compromiso: ['tarea'],
  Version_Afectada: ['estabilizacion'],
  Version_Correccion: ['estabilizacion'],
  Causa_Raiz: ['estabilizacion'],
  Detalle_Causa_Raiz: ['estabilizacion'],
  Link_Postmortem: ['estabilizacion'],
  Hubo_Indisponibilidad: ['estabilizacion'],
  Inicio_Indisponibilidad: ['estabilizacion'],
  Fin_Indisponibilidad: ['estabilizacion'],
  Tipo_Indisponibilidad: ['estabilizacion']
};

/**
 * Como se reparte el formulario: a la izquierda los campos que no dependen de
 * la fase, a la derecha un paso por fase con lo que se diligencia en ella.
 *
 * La columna izquierda se lee de arriba abajo una sola vez —son los datos de la
 * solicitud— y la derecha se recorre segun donde este: la fase actual llega
 * abierta y las demas plegadas, con una marca de si su informacion esta
 * completa, incompleta o marcada como que no aplica.
 */
var FORMULARIO_SOLICITUD = {
  sueltos: [
    { grupo: 'Lo que se pidió',
      campos: ['Nombre_Solicitud', 'Alcance', 'Proceso_Impactado', 'Doc_Requerimiento_URL'] },
    { grupo: 'Clasificación',
      campos: ['ID_Proyecto', 'Plataforma_ID', 'Tipo_Solicitud', 'Prioridad'] },
    { grupo: 'Responsables',
      campos: ['Solicitante_ID', 'Responsable_ID'] },
    { grupo: 'Situación',
      campos: ['Fase_Actual', 'Estado_Actual', 'Tiene_Bloqueo', 'Causal_Bloqueo',
               'Observacion_Bloqueo'] },
    { grupo: 'Trazabilidad',
      campos: ['Fecha_Registro', 'Link_Taiga'] }
  ],
  pasos: {
    /* Las ocho fases del embudo. Los nombres salen de FASES al armar el
       formulario: repetirlos aqui seria tener dos nombres para la misma fase y
       que uno quede viejo cuando alguien renombre el catalogo. */
    fabrica: [
      { fase: 'FAS-01', campos: ['Fecha_Inicio_Demanda', 'Fecha_Fin_Demanda'] },
      { fase: 'FAS-02', campos: ['Fecha_Inicio_Backlog', 'Fecha_Fin_Backlog'] },
      { fase: 'FAS-03', campos: ['Fecha_Inicio_Analisis', 'Fecha_Fin_Analisis',
                                 'No_Aplica_Analisis', 'Analista_ID', 'Estado_Historias'] },
      { fase: 'FAS-04', campos: ['Fecha_Inicio_Dev', 'Fecha_Fin_Dev', 'No_Aplica_Dev',
                                 'Version_Semantica'] },
      { fase: 'FAS-05', campos: ['Fecha_Inicio_QA', 'Fecha_Fin_QA', 'No_Aplica_QA'] },
      { fase: 'FAS-06', campos: ['Fecha_Inicio_UAT', 'Fecha_Fin_UAT', 'No_Aplica_UAT'] },
      { fase: 'FAS-07', campos: ['Fecha_Socializacion'] },
      { fase: 'FAS-08', campos: ['Fecha_Despliegue'] }
    ],
    /* Una tarea no tiene embudo: su unico paso es el compromiso contra el cual
       se mide, porque no tiene SLA de fase (D-79). */
    tarea: [
      { titulo: 'Compromiso', campos: ['Fecha_Compromiso'],
        ayuda: 'Una tarea no recorre fases: se mide contra el día para el que se comprometió.' }
    ],
    /* Una estabilizacion tampoco recorre fases, pero consume desarrollo y
       pruebas, y para cerrarla hacen falta la causa raiz y la version de
       correccion (D-101). */
    estabilizacion: [
      { titulo: 'Desarrollo del arreglo',
        campos: ['Fecha_Inicio_Dev', 'Fecha_Fin_Dev', 'No_Aplica_Dev'],
        ayuda: 'Con estas fechas se cuantifica lo que el incidente ocupó de la fábrica.' },
      { titulo: 'Pruebas',
        campos: ['Fecha_Inicio_QA', 'Fecha_Fin_QA', 'No_Aplica_QA',
                 'Fecha_Inicio_UAT', 'Fecha_Fin_UAT', 'No_Aplica_UAT'] },
      { titulo: 'Diagnóstico',
        campos: ['Causa_Raiz', 'Detalle_Causa_Raiz', 'Link_Postmortem'],
        ayuda: 'La causa raíz hace falta para poder cerrar la estabilización; el postmortem, ' +
               'si es crítica o alta.' },
      { titulo: 'Versiones',
        campos: ['Version_Afectada', 'Version_Correccion'],
        ayuda: 'En qué versión apareció el problema y con cuál se despliega el arreglo.' },
      { titulo: 'Indisponibilidad',
        campos: ['Hubo_Indisponibilidad', 'Inicio_Indisponibilidad', 'Fin_Indisponibilidad',
                 'Tipo_Indisponibilidad'],
        ayuda: 'No toda crítica tumba el servicio. Si lo tumbó, registre inicio, fin y tipo: ' +
               'de ahí sale el indicador de disponibilidad.' }
    ]
  }
};

/**
 * Los campos de la solicitud que aplican a un gobierno, en el orden del esquema.
 *
 * @param {string} gobierno 'fabrica' | 'tarea' | 'estabilizacion'
 * @return {!Array<!Object>} Las columnas aplicables.
 */
function camposAplicables(gobierno) {
  var g = String(gobierno || GOBIERNO_FABRICA);
  return getDefinicionTabla('Solicitudes').def.columnas.filter(function (c) {
    if (CAMPOS_DEL_SISTEMA.indexOf(c.campo) !== -1) return false;
    var solo = CAMPOS_SOLO_DE[c.campo];
    return !solo || solo.indexOf(g) !== -1;
  });
}

/**
 * El formulario armado para un gobierno: los grupos de la izquierda y los pasos
 * de la derecha, ya filtrados y con los nombres de fase resueltos.
 *
 * Devuelve tambien `campos`, la lista de columnas que el formulario ofrece. Es la
 * que el navegador usa para leer lo que la persona escribio: si se calculara
 * aparte, un campo que esta en la pantalla y no en esa lista se dibujaria y no se
 * guardaria, sin dar ningun error.
 *
 * @param {string} gobierno
 * @return {!Object}
 */
function formularioDeSolicitud(gobierno) {
  var g = String(gobierno || GOBIERNO_FABRICA);
  var aplicables = camposAplicables(g);
  var porCampo = {};
  aplicables.forEach(function (c) { porCampo[c.campo] = c; });
  var nombreFase = {};
  FASES.forEach(function (f) { nombreFase[f.id] = f.nombre; });

  var usados = {};
  var tomar = function (lista) {
    return (lista || []).filter(function (n) { return !!porCampo[n]; })
        .map(function (n) { usados[n] = true; return porCampo[n]; });
  };

  var sueltos = FORMULARIO_SOLICITUD.sueltos.map(function (gr) {
    return { grupo: gr.grupo, columnas: tomar(gr.campos) };
  }).filter(function (gr) { return gr.columnas.length; });

  var pasos = (FORMULARIO_SOLICITUD.pasos[g] || []).map(function (p, i) {
    return { fase: p.fase || '', orden: i + 1,
             titulo: p.fase ? (nombreFase[p.fase] || p.fase) : p.titulo,
             ayuda: p.ayuda || '', columnas: tomar(p.campos) };
  }).filter(function (p) { return p.columnas.length; });

  /* Lo que aplica y no quedo en ningun grupo ni en ningun paso. No se descarta
     en silencio: se entrega aparte para que la pantalla lo muestre y se vea que
     falta acomodarlo. Un campo que desaparece del formulario deja de poderse
     diligenciar y nadie se entera. */
  var sueltosExtra = aplicables.filter(function (c) { return !usados[c.campo]; });

  var columnas = [];
  sueltos.forEach(function (gr) { columnas = columnas.concat(gr.columnas); });
  pasos.forEach(function (p) { columnas = columnas.concat(p.columnas); });
  columnas = columnas.concat(sueltosExtra);

  return { gobierno: g, sueltos: sueltos, pasos: pasos,
           sinAcomodar: sueltosExtra, columnas: columnas };
}

/* ================================================================== */
/* Libro 1: Parametrizacion (maestros)                                 */
/* ================================================================== */

var ESQUEMA_PARAMETRIZACION = {
  Usuarios: {
    etiqueta: 'Usuarios',
    pk: 'ID_Usuario',
    columnas: [
      { campo: 'ID_Usuario', etiqueta: 'ID Usuario', tipo: 'text', requerido: true },
      { campo: 'Nombre_Completo', etiqueta: 'Nombre completo', tipo: 'text', requerido: true },
      // El correo habilita el inicio de sesion por SSO. Puede quedar vacio:
      // el usuario existe en el sistema y es asignable, pero aun no entra.
      { campo: 'Correo_ID', etiqueta: 'Correo corporativo', tipo: 'email' },
      { campo: 'Cargo', etiqueta: 'Cargo', tipo: 'text' },
      { campo: 'Area', etiqueta: 'Area', tipo: 'text' },
      { campo: 'Rol_ID', etiqueta: 'Rol', tipo: 'enum', fk: 'Roles', requerido: true },
      { campo: 'Activo', etiqueta: 'Activo', tipo: 'boolSN', requerido: true }
    ]
  },
  Roles: {
    etiqueta: 'Roles',
    pk: 'ID_Rol',
    columnas: [
      { campo: 'ID_Rol', etiqueta: 'ID Rol', tipo: 'text', requerido: true },
      { campo: 'Nombre_Rol', etiqueta: 'Nombre del rol', tipo: 'text', requerido: true },
      { campo: 'Permisos_Fase', etiqueta: 'Fases habilitadas', tipo: 'text' },
      { campo: 'Permisos_Edicion', etiqueta: 'Nivel de autorizacion', tipo: 'text' }
    ]
  },
  /**
   * Que puede hacer cada rol. Una fila por rol, una columna por permiso.
   *
   * Hasta D-68 esto vivia repartido en cinco listas dentro de Rbac.gs, y buena
   * parte de lo que decia no se aplicaba en ninguna parte. Ahora es dato: se
   * edita desde Administracion sin tocar el codigo, y es la unica fuente de la
   * que sale la respuesta a "este rol, puede?".
   *
   * Si la hoja no existe todavia, Rbac.gs usa los valores de fabrica, que
   * reproducen exactamente el comportamiento anterior.
   */
  Permisos_Rol: {
    etiqueta: 'Permisos por rol',
    pk: 'Rol_ID',

    /**
     * Las columnas NO se escriben aqui: se derivan de CATALOGO_PERMISOS
     * (Rbac.gs), que es la misma lista que Administracion muestra.
     *
     * Estaban escritas dos veces, y eso costo un defecto: al agregar la
     * aprobacion (D-98) se actualizo el catalogo y no esta lista, asi que la
     * pantalla ofrecia la casilla, la hoja no tenia columna donde guardarla y
     * ningun rol podia aprobar —ni siquiera el Administrador— aunque la casilla
     * se viera marcada. Derivarlas hace imposible volver a desfasarlas (D-100).
     *
     * Es un getter y no un valor porque los dos archivos viven en el mismo
     * ambito global pero se cargan por separado: asi la lista se lee cuando
     * alguien la pide, no mientras los archivos se estan cargando.
     */
    get columnas() {
      return [{ campo: 'Rol_ID', etiqueta: 'Rol', tipo: 'enum', fk: 'Roles', requerido: true }]
          .concat(CATALOGO_PERMISOS.map(function (p) {
            return { campo: p.campo, etiqueta: p.grupo + ': ' + p.nombre, tipo: 'boolSN' };
          }));
    }
  },

  /**
   * En que fases del embudo puede mover tarjetas cada rol.
   *
   * Es la cuadricula rol x fase. Solo cuenta para los roles que ademas tengan
   * Mover_Fase: sin esa llave maestra, marcar fases aqui no habilita nada.
   */
  Permisos_Fase: {
    etiqueta: 'Fases por rol',
    pk: 'Rol_ID',

    /** Igual que arriba: las ocho fases salen de FASES y no de una copia. */
    get columnas() {
      return [{ campo: 'Rol_ID', etiqueta: 'Rol', tipo: 'enum', fk: 'Roles', requerido: true }]
          .concat(FASES.map(function (f) {
            return { campo: f.id.replace('-', '_'), etiqueta: f.nombre, tipo: 'boolSN' };
          }));
    }
  },

  Proyectos: {
    etiqueta: 'Iniciativas',
    pk: 'ID_Proyecto',
    columnas: [
      { campo: 'ID_Proyecto', etiqueta: 'ID Iniciativa', tipo: 'text', requerido: true },
      { campo: 'Nombre_Proyecto', etiqueta: 'Nombre de la iniciativa', tipo: 'text', requerido: true },
      { campo: 'Descripcion', etiqueta: 'Descripcion', tipo: 'longtext' },
      { campo: 'Prioridad', etiqueta: 'Prioridad', tipo: 'enum', fk: 'Prioridad' },
      { campo: 'Tipo_Iniciativa', etiqueta: 'Tipo de iniciativa', tipo: 'enum', fk: 'Tipos_Iniciativa' },
      // Quien pide la iniciativa. No es el BO ni el PO: puede ser un area que
      // encarga el trabajo a la gerencia que lo lleva.
      { campo: 'Solicitante_Usuario', etiqueta: 'Solicitante', tipo: 'enum', fk: 'Usuarios',
        ayuda: 'Quién pide la iniciativa. Puede ser distinto del Business Owner y del Product Owner.' },
      { campo: 'BO_Usuario', etiqueta: 'Business Owner', tipo: 'enum', fk: 'Usuarios' },
      { campo: 'PO_Usuario', etiqueta: 'Product Owner', tipo: 'enum', fk: 'Usuarios' },
      { campo: 'LEN_ID', etiqueta: 'Linea estrategica de negocio', tipo: 'enum', fk: 'Lineas_Estrategicas' },
      { campo: 'Vertical_ID', etiqueta: 'Vertical', tipo: 'enum', fk: 'Verticales' },
      { campo: 'Plataforma_ID', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital' },
      // Las tres fechas de la iniciativa. "Fecha_Estimada" se retiro: duplicaba
      // a Fecha_Fin_Estimada y nadie sabia cual de las dos llenar.
      { campo: 'Fecha_Inicio', etiqueta: 'Fecha de inicio', tipo: 'date' },
      { campo: 'Fecha_Fin_Estimada', etiqueta: 'Fecha fin estimada', tipo: 'date' },
      { campo: 'Fecha_Fin_Real', etiqueta: 'Fecha fin real', tipo: 'date' },
      { campo: 'Estado_Iniciativa', etiqueta: 'Estado', tipo: 'enum', fk: 'Estados_Iniciativa' },
      // La carpeta donde vive la documentacion de la iniciativa. Es de la
      // iniciativa y no de cada solicitud: las solicitudes ya tienen la suya,
      // creada por el sistema, y esta es la del proyecto completo.
      { campo: 'Drive_URL', etiqueta: 'Carpeta de documentacion en Drive', tipo: 'url',
        ayuda: 'Enlace a la carpeta de Drive donde vive la documentación de esta iniciativa.' }
    ]
  },
  Plataforma_Digital: {
    etiqueta: 'Plataformas Digitales',
    pk: 'ID_Plataforma',
    columnas: [
      { campo: 'ID_Plataforma', etiqueta: 'ID Plataforma', tipo: 'text', requerido: true },
      { campo: 'Nombre_Plataforma', etiqueta: 'Plataforma digital', tipo: 'text', requerido: true }
    ]
  },
  Fases: {
    etiqueta: 'Fases',
    pk: 'ID_Fase',
    columnas: [
      { campo: 'ID_Fase', etiqueta: 'ID Fase', tipo: 'text', requerido: true },
      { campo: 'Nombre_Fase', etiqueta: 'Nombre de la fase', tipo: 'text', requerido: true },
      { campo: 'Orden_Fase', etiqueta: 'Orden', tipo: 'number', requerido: true }
    ]
  },
  Estados: {
    etiqueta: 'Estados de Solicitud',
    pk: 'ID_Estado',
    columnas: [
      { campo: 'ID_Estado', etiqueta: 'ID Estado', tipo: 'text', requerido: true },
      { campo: 'Nombre_Estado', etiqueta: 'Estado de la solicitud', tipo: 'text', requerido: true }
    ]
  },
  Estados_Iniciativa: {
    etiqueta: 'Estados de Iniciativa',
    pk: 'ID_Estado_Iniciativa',
    columnas: [
      { campo: 'ID_Estado_Iniciativa', etiqueta: 'ID Estado', tipo: 'text', requerido: true },
      { campo: 'Nombre_Estado_Iniciativa', etiqueta: 'Estado de la iniciativa', tipo: 'text', requerido: true }
    ]
  },
  Tipos_Solicitud: {
    etiqueta: 'Tipos de Solicitud',
    pk: 'ID_Tipo',
    columnas: [
      { campo: 'ID_Tipo', etiqueta: 'ID Tipo', tipo: 'text', requerido: true },
      { campo: 'Nombre_Tipo', etiqueta: 'Tipo de solicitud', tipo: 'text', requerido: true }
    ]
  },
  Tipos_Iniciativa: {
    etiqueta: 'Tipos de Iniciativa',
    pk: 'ID_Tipo_Iniciativa',
    columnas: [
      { campo: 'ID_Tipo_Iniciativa', etiqueta: 'ID Tipo', tipo: 'text', requerido: true },
      { campo: 'Nombre_Tipo_Iniciativa', etiqueta: 'Tipo de iniciativa', tipo: 'text', requerido: true }
    ]
  },
  Prioridad: {
    etiqueta: 'Prioridad',
    pk: 'ID_Prioridad',
    columnas: [
      { campo: 'ID_Prioridad', etiqueta: 'ID Prioridad', tipo: 'text', requerido: true },
      { campo: 'Nombre_Prioridad', etiqueta: 'Nombre', tipo: 'text', requerido: true }
    ]
  },
  Causales_Bloqueo: {
    etiqueta: 'Causales de Bloqueo',
    pk: 'ID_Causal',
    columnas: [
      { campo: 'ID_Causal', etiqueta: 'ID Causal', tipo: 'text', requerido: true },
      { campo: 'Nombre_Causal', etiqueta: 'Nombre de la causal', tipo: 'text', requerido: true }
    ]
  },
  /**
   * Las bolsas de costo de la fabrica (D-110).
   *
   * Una fila por bolsa: cuanto cuesta al mes, entre que meses rige, y —si es
   * capacidad dedicada— a que iniciativa se carga. Con la iniciativa vacia la
   * bolsa se reparte entre todo lo que ocupo esa etapa.
   *
   * Vive como dato y no en el codigo porque un contrato cambia: el mes que
   * cambie la tarifa se edita aqui, sin desplegar nada.
   */
  Fabricas: {
    etiqueta: 'Fábricas de software',
    pk: 'ID_Fabrica',
    columnas: [
      { campo: 'ID_Fabrica', etiqueta: 'ID Fábrica', tipo: 'text', requerido: true },
      { campo: 'Nombre_Fabrica', etiqueta: 'Fábrica', tipo: 'text', requerido: true },
      // Opcionales: solo salen en el documento impreso si estan llenos. Una
      // factura los pide, pero exigirlos aqui bloquearia el uso por un dato
      // administrativo que puede llegar despues.
      { campo: 'NIT', etiqueta: 'NIT', tipo: 'text',
        ayuda: 'Opcional. Si está, aparece en el documento de facturación.' },
      { campo: 'Contrato', etiqueta: 'Contrato u orden de compra', tipo: 'text',
        ayuda: 'Opcional. Si está, aparece en el documento de facturación.' }
    ]
  },
  Costos_Fabrica: {
    etiqueta: 'Costos de la fábrica',
    pk: 'ID_Costo',
    columnas: [
      { campo: 'ID_Costo', etiqueta: 'ID', tipo: 'text', requerido: true },
      { campo: 'Etapa', etiqueta: 'Etapa', tipo: 'enum', requerido: true,
        opciones: ETAPAS_COSTO.map(function (e) { return e.id; }),
        ayuda: 'ETA-ANA análisis y diseño · ETA-DEV desarrollo · ETA-QA pruebas QA y UAT.' },
      { campo: 'Concepto', etiqueta: 'Concepto', tipo: 'text', requerido: true },
      { campo: 'Valor_Mensual', etiqueta: 'Valor mensual', tipo: 'number', requerido: true,
        ayuda: 'Sin IVA. Es lo que se paga cada mes completo, haya muchas actividades o pocas.' },
      { campo: 'Vigencia_Desde', etiqueta: 'Vigente desde', tipo: 'date', requerido: true },
      { campo: 'Vigencia_Hasta', etiqueta: 'Vigente hasta', tipo: 'date', requerido: true },
      { campo: 'ID_Proyecto', etiqueta: 'Iniciativa dedicada', tipo: 'enum', fk: 'Proyectos',
        ayuda: 'Solo para capacidad dedicada a una iniciativa. Vacío = se reparte entre todas.' },
      /* A quien se le paga esta bolsa. Sin esto no se puede armar la factura de
         cada fabrica, y una bolsa sin fabrica NUNCA se suma a ninguna: se
         muestra aparte, porque colarla en la factura equivocada es un pago mal
         hecho (D-132). */
      { campo: 'ID_Fabrica', etiqueta: 'Fábrica que la factura', tipo: 'enum', fk: 'Fabricas',
        ayuda: 'A qué fábrica de software se le paga esta bolsa. Hace falta para poder facturar.' }
    ]
  },
  Analistas: {
    etiqueta: 'Analistas',
    pk: 'ID_Analista',
    columnas: [
      { campo: 'ID_Analista', etiqueta: 'ID Analista', tipo: 'text', requerido: true },
      { campo: 'Nombre_Analista', etiqueta: 'Nombre del analista', tipo: 'text', requerido: true }
    ]
  },
  Causas_Raiz: {
    etiqueta: 'Causas raiz de estabilizacion',
    pk: 'ID_Causa',
    columnas: [
      { campo: 'ID_Causa', etiqueta: 'ID Causa', tipo: 'text', requerido: true },
      { campo: 'Nombre_Causa', etiqueta: 'Nombre de la causa', tipo: 'text', requerido: true }
    ]
  },
  Lineas_Estrategicas: {
    etiqueta: 'Lineas Estrategicas de Negocio',
    pk: 'ID_LEN',
    columnas: [
      { campo: 'ID_LEN', etiqueta: 'ID LEN', tipo: 'text', requerido: true },
      { campo: 'Nombre_LEN', etiqueta: 'Linea estrategica', tipo: 'text', requerido: true },
      { campo: 'Orden_LEN', etiqueta: 'Orden en la matriz', tipo: 'number' }
    ]
  },
  Verticales: {
    etiqueta: 'Verticales',
    pk: 'ID_Vertical',
    columnas: [
      { campo: 'ID_Vertical', etiqueta: 'ID Vertical', tipo: 'text', requerido: true },
      { campo: 'Nombre_Vertical', etiqueta: 'Vertical', tipo: 'text', requerido: true },
      { campo: 'Orden_Vertical', etiqueta: 'Orden en la matriz', tipo: 'number' }
    ]
  },
  SLA_Fases: {
    etiqueta: 'SLA por Fase',
    pk: 'ID_Fase',
    columnas: [
      { campo: 'ID_Fase', etiqueta: 'Fase', tipo: 'enum', fk: 'Fases', requerido: true },
      { campo: 'Nombre_Fase', etiqueta: 'Nombre de la fase', tipo: 'text' },
      { campo: 'SLA_Dias', etiqueta: 'SLA objetivo (dias habiles)', tipo: 'number', requerido: true }
    ]
  },
  Festivos: {
    etiqueta: 'Dias no laborables adicionales',
    pk: 'Fecha',
    columnas: [
      { campo: 'Fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true },
      { campo: 'Descripcion', etiqueta: 'Motivo', tipo: 'text' }
    ]
  }
};

/* ================================================================== */
/* Libro 2: Transaccional                                              */
/* ================================================================== */

var ESQUEMA_TRANSACCIONAL = {
  Solicitudes: {
    etiqueta: 'Solicitudes',
    pk: 'ID_Solicitud',
    columnas: [
      { campo: 'ID_Solicitud', etiqueta: 'ID Solicitud', tipo: 'text', requerido: true },
      { campo: 'Fecha_Registro', etiqueta: 'Fecha de registro', tipo: 'datetime', requerido: true },
      { campo: 'Nombre_Solicitud', etiqueta: 'Nombre de la solicitud', tipo: 'text', requerido: true },
      // "Objetivo" y "Entregable" eran dos campos separados y se unieron en
      // este (D-66): en la practica se llenaban con lo mismo dicho de dos
      // formas, o uno de los dos quedaba vacio.
      { campo: 'Alcance', etiqueta: 'Alcance', tipo: 'longtext',
        ayuda: 'Qué se busca lograr y qué se espera recibir al final: el objetivo de negocio y el entregable concreto.' },
      // Toda solicitud es hija de una iniciativa.
      { campo: 'ID_Proyecto', etiqueta: 'Iniciativa', tipo: 'enum', fk: 'Proyectos', requerido: true },
      { campo: 'Plataforma_ID', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital', requerido: true },
      { campo: 'Solicitante_ID', etiqueta: 'Solicitante', tipo: 'enum', fk: 'Usuarios', requerido: true },
      { campo: 'Tipo_Solicitud', etiqueta: 'Tipo de solicitud', tipo: 'enum', fk: 'Tipos_Solicitud', requerido: true },
      { campo: 'Prioridad', etiqueta: 'Prioridad', tipo: 'enum', fk: 'Prioridad', requerido: true },
      // Aqui vivia Orden_Iniciativa, retirado en D-66: se llenaba solo y nadie
      // lo reordenaba, asi que ordenaba por antiguedad disfrazada de decision.
      { campo: 'Proceso_Impactado', etiqueta: 'Proceso impactado', tipo: 'text' },
      // Para las tareas, que no tienen SLA por fase contra el cual medirse.
      { campo: 'Fecha_Compromiso', etiqueta: 'Fecha compromiso', tipo: 'date',
        ayuda: 'Para qué día se comprometió. Aplica a las tareas: las de fábrica se miden ' +
               'contra el SLA de su fase.' },
      { campo: 'Doc_Requerimiento_URL', etiqueta: 'Documento de requerimiento', tipo: 'url',
        ayuda: 'Enlace al documento del requerimiento. Se pega a mano.' },
      // Aqui vivia Carpeta_Drive_URL, retirado en D-78. La carpeta es de la
      // INICIATIVA (Drive_URL) y no de cada solicitud: la solicitud solo tiene
      // el enlace de su requerimiento.
      // La fase la exige validarSolicitud_ solo para los tipos de fabrica: una
      // tarea no tiene embudo y la deja vacia (D-79).
      { campo: 'Fase_Actual', etiqueta: 'Fase actual', tipo: 'enum', fk: 'Fases' },
      { campo: 'Estado_Actual', etiqueta: 'Estado actual', tipo: 'enum', fk: 'Estados', requerido: true },
      { campo: 'Tiene_Bloqueo', etiqueta: 'Tiene bloqueo', tipo: 'boolSN', requerido: true },
      { campo: 'Causal_Bloqueo', etiqueta: 'Causal de bloqueo', tipo: 'enum', fk: 'Causales_Bloqueo' },
      // La causal dice de que tipo es el bloqueo; la observacion dice que pasa
      // exactamente y que se esta esperando. Sin ella el tablero muestra la
      // etiqueta pero no el contexto que necesita quien tiene que destrabarlo.
      { campo: 'Observacion_Bloqueo', etiqueta: 'Observacion del bloqueo', tipo: 'longtext' },
      { campo: 'Link_Taiga', etiqueta: 'Issue en Taiga', tipo: 'url',
        ayuda: 'Enlace al issue donde la fábrica construye esta solicitud. Al guardarlo aparece el ícono 🎫 en su tarjeta del tablero.' },
      // Orden de atencion dentro de su columna del tablero, puesto a mano
      // arrastrando (D-96). Solo lo usan las tres primeras fases.
      { campo: 'Orden_Columna', etiqueta: 'Orden en la columna', tipo: 'number',
        ayuda: 'Orden de atención dentro de su columna del tablero. Se acomoda arrastrando las tarjetas en Gestión de fábrica; no hace falta escribirlo aquí.' },
      // La aprobacion de la fase en la que esta HOY. Se borra al cambiar de
      // fase, porque cada compuerta se aprueba por separado (D-98).
      { campo: 'Aprobada', etiqueta: 'Aprobada en su fase', tipo: 'boolSN',
        ayuda: 'Si ya tiene el visto bueno para salir de la fase en la que está. Se aprueba desde la tarjeta del tablero y se borra sola al pasar a la fase siguiente.' },
      { campo: 'Aprobada_Por', etiqueta: 'Aprobada por', tipo: 'enum', fk: 'Usuarios' },
      { campo: 'Fecha_Aprobacion', etiqueta: 'Fecha de aprobacion', tipo: 'datetime' },
      { campo: 'Version_Semantica', etiqueta: 'Version estimada', tipo: 'text' },

      /* --- Solo para las estabilizaciones (D-101) --- */
      // Se escogen del Roadmap y no se escriben a mano: "3.4", "v3.4" y "3.4.0"
      // escritas a mano son tres versiones distintas, y entonces el indicador de
      // estabilizaciones por version no se puede sumar.
      { campo: 'Version_Afectada', etiqueta: 'Version afectada', tipo: 'enum', fk: 'Roadmap_Versiones',
        ayuda: 'En que version ya desplegada apareció el problema. Se escoge del Roadmap de versiones.' },
      { campo: 'Version_Correccion', etiqueta: 'Version de correccion', tipo: 'enum', fk: 'Roadmap_Versiones',
        ayuda: 'Con qué versión se despliega el arreglo. Hace falta para poder cerrar la estabilización.' },
      { campo: 'Causa_Raiz', etiqueta: 'Causa raiz', tipo: 'enum', fk: 'Causas_Raiz',
        ayuda: 'Qué lo originó. Hace falta para poder cerrar la estabilización.' },
      { campo: 'Detalle_Causa_Raiz', etiqueta: 'Detalle de la causa raiz', tipo: 'longtext',
        ayuda: 'Lo que la lista de causas no alcanza a decir: qué pasó exactamente en este caso.' },
      { campo: 'Link_Postmortem', etiqueta: 'Postmortem', tipo: 'url',
        ayuda: 'Enlace al análisis posterior. Obligatorio para cerrar una estabilización crítica o alta.' },
      // El interruptor existe porque no toda critica tumba el servicio: un
      // calculo mal hecho puede ser critico sin un minuto de caida, y obligar a
      // inventar fechas ahi ensuciaria el indicador de disponibilidad.
      { campo: 'Hubo_Indisponibilidad', etiqueta: 'Hubo indisponibilidad', tipo: 'boolSN',
        ayuda: 'Si el servicio estuvo caído. Si dice que sí, hay que registrar inicio, fin y tipo.' },
      // En horas de reloj, no en dias habiles como el resto de la aplicacion: un
      // incidente del sabado no espera al lunes.
      { campo: 'Inicio_Indisponibilidad', etiqueta: 'Inicio de la indisponibilidad', tipo: 'datetime' },
      { campo: 'Fin_Indisponibilidad', etiqueta: 'Fin de la indisponibilidad', tipo: 'datetime' },
      { campo: 'Tipo_Indisponibilidad', etiqueta: 'Tipo de indisponibilidad', tipo: 'enum',
        opciones: TIPOS_INDISPONIBILIDAD },

      { campo: 'Responsable_ID', etiqueta: 'Responsable actual', tipo: 'enum', fk: 'Usuarios' },
      // Quien analiza. Se pide al entrar a Analisis y diseno y no se borra
      // despues: queda como registro de quien hizo el analisis (D-102).
      { campo: 'Estado_Historias', etiqueta: 'Historias de usuario', tipo: 'enum',
        opciones: ESTADOS_HISTORIAS,
        ayuda: 'En qué va la escritura de las historias dentro de Análisis y diseño. Se cambia desde la tarjeta del tablero.' },
      { campo: 'Analista_ID', etiqueta: 'Analista asignado', tipo: 'enum', fk: 'Analistas',
        ayuda: 'Quién hace el análisis y diseño. Se pide al mover la tarjeta a esa fase, y la lista se administra en Administración → Analistas.' },
      // Las ocho fases dejan su estampa. Gestion de la demanda y Backlog no la
      // tenian, asi que el tiempo que una solicitud esperaba antes de arrancar
      // no se podia medir sin reconstruirlo desde la bitacora (D-92).
      { campo: 'Fecha_Inicio_Demanda', etiqueta: 'Inicio gestion de la demanda', tipo: 'datetime' },
      { campo: 'Fecha_Fin_Demanda', etiqueta: 'Fin gestion de la demanda', tipo: 'datetime' },
      { campo: 'Fecha_Inicio_Backlog', etiqueta: 'Inicio backlog', tipo: 'datetime' },
      { campo: 'Fecha_Fin_Backlog', etiqueta: 'Fin backlog', tipo: 'datetime' },
      { campo: 'Fecha_Inicio_Analisis', etiqueta: 'Inicio analisis', tipo: 'datetime' },
      { campo: 'Fecha_Fin_Analisis', etiqueta: 'Fin analisis', tipo: 'datetime' },
      { campo: 'Fecha_Inicio_Dev', etiqueta: 'Inicio desarrollo', tipo: 'datetime' },
      { campo: 'Fecha_Fin_Dev', etiqueta: 'Fin desarrollo', tipo: 'datetime' },
      { campo: 'Fecha_Inicio_QA', etiqueta: 'Inicio QA', tipo: 'datetime' },
      { campo: 'Fecha_Fin_QA', etiqueta: 'Fin QA', tipo: 'datetime' },
      { campo: 'Fecha_Inicio_UAT', etiqueta: 'Inicio UAT', tipo: 'datetime' },
      { campo: 'Fecha_Fin_UAT', etiqueta: 'Fin UAT', tipo: 'datetime' },
      // No toda solicitud pasa por todas las fases. Marcar la que no aplica la
      // saca del costeo y deja de reclamarse como informacion faltante (D-116).
      { campo: 'No_Aplica_Analisis', etiqueta: 'Análisis no aplica', tipo: 'boolSN',
        ayuda: 'Marque SI si esta solicitud no pasa por análisis y diseño.' },
      { campo: 'No_Aplica_Dev', etiqueta: 'Desarrollo no aplica', tipo: 'boolSN',
        ayuda: 'Marque SI si esta solicitud no pasa por desarrollo.' },
      { campo: 'No_Aplica_QA', etiqueta: 'Pruebas QA no aplican', tipo: 'boolSN',
        ayuda: 'Marque SI si esta solicitud no pasa por pruebas QA.' },
      { campo: 'No_Aplica_UAT', etiqueta: 'Pruebas UAT no aplican', tipo: 'boolSN',
        ayuda: 'Marque SI si esta solicitud no pasa por pruebas UAT.' },
      { campo: 'Fecha_Socializacion', etiqueta: 'Socializacion planeada', tipo: 'datetime' },
      { campo: 'Fecha_Despliegue', etiqueta: 'Despliegue a produccion', tipo: 'datetime' },
      { campo: 'Fecha_Ultimo_Cambio', etiqueta: 'Ultimo cambio de fase', tipo: 'datetime' }
    ]
  },
  /**
   * Seguimiento de cada solicitud, escrito por la gente.
   *
   * Es distinta de la Auditoria: la auditoria la escribe el sistema y registra
   * QUE cambio; esta la escribe una persona y registra POR QUE, que acordaron,
   * a quien estan esperando. Por eso es inmutable: un seguimiento que se puede
   * editar despues deja de servir como seguimiento.
   */
  Observaciones_Solicitud: {
    etiqueta: 'Observaciones de seguimiento',
    pk: 'ID_Observacion',
    inmutable: true,
    columnas: [
      { campo: 'ID_Observacion', etiqueta: 'ID Observacion', tipo: 'text', requerido: true },
      { campo: 'ID_Solicitud', etiqueta: 'Solicitud', tipo: 'text', requerido: true },
      { campo: 'Fecha_Hora', etiqueta: 'Fecha y hora', tipo: 'datetime', requerido: true },
      { campo: 'Usuario_ID', etiqueta: 'Usuario', tipo: 'text', requerido: true },
      { campo: 'Correo_Usuario', etiqueta: 'Correo del usuario', tipo: 'text' },
      { campo: 'Observacion', etiqueta: 'Observacion', tipo: 'longtext', requerido: true }
    ]
  },

  /**
   * Lo mismo que Observaciones_Solicitud, pero a nivel de iniciativa.
   *
   * Son dos tablas y no una con un campo "tipo" porque cada una apunta a una
   * llave distinta y las hojas se leen y se validan por tabla: mezclarlas
   * obligaria a filtrar por tipo en cada lectura y a que una solicitud y una
   * iniciativa compartieran espacio de llaves sin necesidad. La logica si es
   * una sola (ver observacionesDe_ y registrarObservacion_).
   */
  Observaciones_Proyecto: {
    etiqueta: 'Comentarios de iniciativas',
    pk: 'ID_Observacion',
    inmutable: true,
    columnas: [
      { campo: 'ID_Observacion', etiqueta: 'ID Observacion', tipo: 'text', requerido: true },
      { campo: 'ID_Proyecto', etiqueta: 'Iniciativa', tipo: 'text', requerido: true },
      { campo: 'Fecha_Hora', etiqueta: 'Fecha y hora', tipo: 'datetime', requerido: true },
      { campo: 'Usuario_ID', etiqueta: 'Usuario', tipo: 'text', requerido: true },
      { campo: 'Correo_Usuario', etiqueta: 'Correo del usuario', tipo: 'text' },
      { campo: 'Observacion', etiqueta: 'Observacion', tipo: 'longtext', requerido: true }
    ]
  },

  Auditoria_Transiciones: {
    etiqueta: 'Auditoria de Transiciones',
    pk: 'ID_Auditoria',
    inmutable: true,
    columnas: [
      { campo: 'ID_Auditoria', etiqueta: 'ID Auditoria', tipo: 'text', requerido: true },
      { campo: 'ID_Solicitud', etiqueta: 'Solicitud', tipo: 'text', requerido: true },
      { campo: 'Fase_Origen', etiqueta: 'Fase origen', tipo: 'text' },
      { campo: 'Fase_Destino', etiqueta: 'Fase destino', tipo: 'text' },
      { campo: 'Estado_Origen', etiqueta: 'Estado origen', tipo: 'text' },
      { campo: 'Estado_Destino', etiqueta: 'Estado destino', tipo: 'text' },
      { campo: 'Fecha_Hora_Cambio', etiqueta: 'Fecha/hora del cambio', tipo: 'datetime', requerido: true },
      { campo: 'Usuario_Responsable', etiqueta: 'Usuario responsable', tipo: 'text', requerido: true },
      { campo: 'Horas_En_Fase', etiqueta: 'Horas calendario en fase origen', tipo: 'decimal' },
      { campo: 'Dias_Habiles_En_Fase', etiqueta: 'Dias habiles en fase origen', tipo: 'decimal' }
    ]
  },
  Carga_Solicitudes: {
    etiqueta: 'Carga masiva de solicitudes',
    pk: 'Fila',
    columnas: [
      { campo: 'ID_Proyecto', etiqueta: 'Iniciativa', tipo: 'enum', fk: 'Proyectos', requerido: true },
      { campo: 'Nombre_Solicitud', etiqueta: 'Nombre de la solicitud', tipo: 'text', requerido: true },
      { campo: 'Alcance', etiqueta: 'Alcance', tipo: 'longtext',
        ayuda: 'Qué se busca lograr y qué se espera recibir al final: el objetivo de negocio y el entregable concreto.' },
      { campo: 'Plataforma_ID', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital' },
      { campo: 'Tipo_Solicitud', etiqueta: 'Tipo', tipo: 'enum', fk: 'Tipos_Solicitud' },
      { campo: 'Prioridad', etiqueta: 'Prioridad', tipo: 'enum', fk: 'Prioridad' },
      { campo: 'Fase_Actual', etiqueta: 'Fase', tipo: 'enum', fk: 'Fases' },
      { campo: 'Estado_Actual', etiqueta: 'Estado', tipo: 'enum', fk: 'Estados' },
      { campo: 'Tiene_Bloqueo', etiqueta: 'Tiene bloqueo', tipo: 'boolSN' },
      { campo: 'Causal_Bloqueo', etiqueta: 'Causal del bloqueo', tipo: 'enum', fk: 'Causales_Bloqueo' },
      { campo: 'Solicitante_ID', etiqueta: 'Solicitante', tipo: 'enum', fk: 'Usuarios' },
      { campo: 'Responsable_ID', etiqueta: 'Responsable', tipo: 'enum', fk: 'Usuarios' },
      { campo: 'Version_Semantica', etiqueta: 'Version estimada', tipo: 'text' },
      { campo: 'Proceso_Impactado', etiqueta: 'Proceso impactado', tipo: 'text' },
      { campo: 'Link_Taiga', etiqueta: 'Issue en Taiga', tipo: 'url' },
      // Lo escribe el proceso: queda el ID creado o el motivo del rechazo.
      { campo: 'Resultado', etiqueta: 'Resultado', tipo: 'text' }
    ]
  },
  /**
   * La cola de avisos que esperan el resumen agrupado.
   *
   * Es una HOJA y no memoria a proposito: si el disparador que la vacia falla o
   * no corre, los avisos siguen ahi y entran en la pasada siguiente. En
   * CacheService se habrian perdido en silencio, y un aviso perdido es peor que
   * un aviso tarde. Ademas se puede mirar: "esto es lo que esta por salir".
   */
  Avisos_Pendientes: {
    etiqueta: 'Avisos por publicar',
    pk: 'ID_Aviso',
    columnas: [
      { campo: 'ID_Aviso', etiqueta: 'ID Aviso', tipo: 'text', requerido: true },
      { campo: 'Fecha_Hora', etiqueta: 'Cuando ocurrio', tipo: 'datetime', requerido: true },
      { campo: 'ID_Solicitud', etiqueta: 'Solicitud', tipo: 'text', requerido: true },
      { campo: 'Evento', etiqueta: 'Evento', tipo: 'text', requerido: true },
      { campo: 'Grupo', etiqueta: 'Grupo en el resumen', tipo: 'text' },
      { campo: 'Resumen', etiqueta: 'Linea del resumen', tipo: 'longtext' },
      { campo: 'Usuario', etiqueta: 'Quien lo hizo', tipo: 'text' },
      { campo: 'Publicado', etiqueta: 'Ya se publico', tipo: 'boolSN' }
    ]
  },
  Roadmap_Versiones: {
    etiqueta: 'Roadmap de Versiones',
    pk: 'ID_Version',
    columnas: [
      { campo: 'ID_Version', etiqueta: 'ID Version', tipo: 'text', requerido: true },
      { campo: 'Plataforma_ID', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital', requerido: true },
      { campo: 'Numero_Version', etiqueta: 'Numero de version', tipo: 'text', requerido: true },
      { campo: 'Estado_Release', etiqueta: 'Estado del release', tipo: 'enum', opciones: ['Planeada', 'En Produccion'] },
      { campo: 'Fecha_Planeada', etiqueta: 'Fecha planeada', tipo: 'date' },
      { campo: 'Fecha_Despliegue_Real', etiqueta: 'Fecha de despliegue real', tipo: 'date' }
    ]
  }
};

/* ================================================================== */
/* Utilidades de esquema                                               */
/* ================================================================== */

/**
 * @param {string} tabla
 * @return {?{libro: string, def: !Object}}
 */
function getDefinicionTabla(tabla) {
  if (ESQUEMA_PARAMETRIZACION[tabla]) {
    return { libro: 'PARAMETRIZACION', def: ESQUEMA_PARAMETRIZACION[tabla] };
  }
  if (ESQUEMA_TRANSACCIONAL[tabla]) {
    return { libro: 'TRANSACCIONAL', def: ESQUEMA_TRANSACCIONAL[tabla] };
  }
  return null;
}

/**
 * @param {string} tabla
 * @return {!Array<string>} Encabezados en el orden exacto de la hoja.
 */
function getEncabezados(tabla) {
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  return info.def.columnas.map(function (c) { return c.campo; });
}

/** Convierte un catalogo en mapa id -> nombre. */
function mapaCatalogo_(lista, claveNombre) {
  return lista.reduce(function (acc, item) {
    acc[item.id] = claveNombre ? item[claveNombre] : item.nombre;
    return acc;
  }, {});
}

/** @return {!Object<string,string>} Mapa ID_Fase -> Nombre_Fase. */
function mapaFases() { return mapaCatalogo_(FASES); }

/** @return {!Object<string,string>} Mapa ID_Estado -> Nombre_Estado. */
function mapaEstados() { return mapaCatalogo_(ESTADOS); }

/** @return {!Object<string,string>} Mapa ID_Estado_Iniciativa -> nombre. */
function mapaEstadosIniciativa() { return mapaCatalogo_(ESTADOS_INICIATIVA); }

/** @return {!Object<string,string>} Mapa ID_Plataforma -> nombre. */
function mapaPlataformas() { return mapaCatalogo_(getPlataformas_()); }

/** @return {string} Nombre legible de un estado. @private */
function nombreDeEstado_(estadoId) {
  return mapaEstados()[estadoId] || estadoId;
}

/**
 * @return {!Object<string,string>} Mapa ID_Version -> numero de version.
 *
 * Las estabilizaciones apuntan a versiones del Roadmap por identificador; lo que
 * la gente lee es el numero.
 * @private
 */
function mapaVersiones_() {
  var mapa = {};
  try {
    leerTabla_('Roadmap_Versiones').forEach(function (v) {
      if (v.ID_Version) mapa[String(v.ID_Version)] = String(v.Numero_Version || v.ID_Version);
    });
  } catch (e) {
    // La hoja aun no existe: se devuelven los identificadores crudos.
  }
  return mapa;
}

/** @return {!Object<string,string>} Mapa ID_LEN -> Nombre_LEN. */
function mapaLineasEstrategicas() { return mapaCatalogo_(getLineasEstrategicas_()); }

/** @return {!Object<string,string>} Mapa ID_Fabrica -> Nombre_Fabrica. */
function mapaFabricas() { return mapaCatalogo_(getFabricas_()); }

/** @return {!Object<string,string>} Mapa ID_Vertical -> Nombre_Vertical. */
function mapaVerticales() { return mapaCatalogo_(getVerticales_()); }

/* ================================================================== */
/* Catalogos vigentes: la hoja manda sobre la lista de arranque        */
/* ================================================================== */

/**
 * Catalogos que el negocio puede ampliar desde Administracion, y donde por
 * tanto la HOJA es la fuente de verdad. La lista que trae el codigo es solo el
 * arranque: sirve para instalar y como respaldo si la hoja aun no existe.
 *
 * Los que NO estan aqui —roles, fases, estados, prioridad— siguen viniendo del
 * codigo a proposito: cada uno tiene logica asociada (la matriz de permisos, el
 * orden del embudo, los colores, el peso de la prioridad) que no se puede
 * deducir de una fila nueva en una hoja. Agregar uno ahi no bastaria para que
 * el sistema supiera que hacer con el.
 */
var CATALOGOS_AMPLIABLES = {
  // Los roles se leen de la hoja SOLO por su nombre y su existencia. Lo que un
  // rol PUEDE hacer sigue saliendo de Permisos_Rol, y su identificador sigue
  // amarrado al codigo: renombrar "Analista Fabrica" a "Ingeniero de software"
  // es cosa del negocio, pero RO-03 tiene que seguir llamandose RO-03.
  Roles: function () { return ROLES; },
  Plataforma_Digital: function () { return PLATAFORMAS; },
  Lineas_Estrategicas: function () { return LINEAS_ESTRATEGICAS; },
  Verticales: function () { return VERTICALES; },
  Causales_Bloqueo: function () { return CAUSALES_BLOQUEO; },
  Causas_Raiz: function () { return CAUSAS_RAIZ; },
  Analistas: function () { return ANALISTAS; },
  Tipos_Solicitud: function () { return TIPOS_SOLICITUD; },
  Tipos_Iniciativa: function () { return TIPOS_INICIATIVA; },
  Fabricas: function () { return FABRICAS; }
};

/**
 * Devuelve un catalogo tal como esta HOY en la hoja.
 *
 * Antes los desplegables se armaban con la lista del codigo, asi que una
 * plataforma agregada desde Administracion existia en la hoja pero no aparecia
 * al editar una iniciativa. Ahora manda la hoja.
 *
 * @param {string} tabla
 * @return {!Array<{id: string, nombre: string, orden: number}>}
 */
function catalogoVigente(tabla) {
  var respaldo = CATALOGOS_AMPLIABLES[tabla] ? CATALOGOS_AMPLIABLES[tabla]() : null;
  if (!respaldo) return respaldo;

  try {
    var def = getDefinicionTabla(tabla).def;
    var filas = leerTabla_(tabla);
    if (!filas.length) return respaldo;          // hoja vacia: aun no se instalo

    var pk = def.pk;
    var campoNombre = def.columnas[1] ? def.columnas[1].campo : pk;
    var campoOrden = def.columnas[2] && /^Orden_/.test(def.columnas[2].campo)
        ? def.columnas[2].campo : null;

    var lista = filas.filter(function (f) { return f[pk]; }).map(function (f, i) {
      return {
        id: String(f[pk]),
        nombre: String(f[campoNombre] || f[pk]),
        orden: campoOrden ? (Number(f[campoOrden]) || i + 1) : i + 1
      };
    });

    if (campoOrden) lista.sort(function (a, b) { return a.orden - b.orden; });
    return lista;
  } catch (e) {
    return respaldo;      // sin hoja legible, el sistema sigue con lo del codigo
  }
}

/** @return {!Array} Plataformas digitales vigentes. */
function getRoles_() { return catalogoVigente('Roles'); }
function getPlataformas_() { return catalogoVigente('Plataforma_Digital'); }
/** @return {!Array} Lineas estrategicas vigentes. */
function getLineasEstrategicas_() { return catalogoVigente('Lineas_Estrategicas'); }
/** @return {!Array} Verticales vigentes. */
function getVerticales_() { return catalogoVigente('Verticales'); }
/** @return {!Array} Analistas registrados. */
function getAnalistas_() { return catalogoVigente('Analistas'); }
/** @return {!Array} Causas raiz vigentes. */
function getCausasRaiz_() { return catalogoVigente('Causas_Raiz'); }
/** @return {!Array} Causales de bloqueo vigentes. */
function getCausalesBloqueo_() { return catalogoVigente('Causales_Bloqueo'); }
/** @return {!Array} Tipos de solicitud vigentes. */
function getTiposSolicitud_() { return catalogoVigente('Tipos_Solicitud'); }
/** @return {!Array} Tipos de iniciativa vigentes. */
function getTiposIniciativa_() { return catalogoVigente('Tipos_Iniciativa'); }
/** @return {!Array} Fabricas de software vigentes. */
function getFabricas_() { return catalogoVigente('Fabricas'); }
