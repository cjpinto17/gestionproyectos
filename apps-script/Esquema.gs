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
  Tipos_Iniciativa: function () { return TIPOS_INICIATIVA; }
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
