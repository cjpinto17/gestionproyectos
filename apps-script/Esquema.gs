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
  { id: 'TIP-04', nombre: 'Tarea' }
];

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
  Proyectos: {
    etiqueta: 'Iniciativas',
    pk: 'ID_Proyecto',
    columnas: [
      { campo: 'ID_Proyecto', etiqueta: 'ID Iniciativa', tipo: 'text', requerido: true },
      { campo: 'Nombre_Proyecto', etiqueta: 'Nombre de la iniciativa', tipo: 'text', requerido: true },
      { campo: 'Descripcion', etiqueta: 'Descripcion', tipo: 'longtext' },
      { campo: 'Prioridad', etiqueta: 'Prioridad', tipo: 'enum', fk: 'Prioridad' },
      { campo: 'Tipo_Iniciativa', etiqueta: 'Tipo de iniciativa', tipo: 'enum', fk: 'Tipos_Iniciativa' },
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
      { campo: 'Estado_Iniciativa', etiqueta: 'Estado', tipo: 'enum', fk: 'Estados_Iniciativa' }
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
      { campo: 'Doc_Requerimiento_URL', etiqueta: 'Documento de requerimiento', tipo: 'url' },
      { campo: 'Carpeta_Drive_URL', etiqueta: 'Carpeta en Drive', tipo: 'url' },
      { campo: 'Fase_Actual', etiqueta: 'Fase actual', tipo: 'enum', fk: 'Fases', requerido: true },
      { campo: 'Estado_Actual', etiqueta: 'Estado actual', tipo: 'enum', fk: 'Estados', requerido: true },
      { campo: 'Tiene_Bloqueo', etiqueta: 'Tiene bloqueo', tipo: 'boolSN', requerido: true },
      { campo: 'Causal_Bloqueo', etiqueta: 'Causal de bloqueo', tipo: 'enum', fk: 'Causales_Bloqueo' },
      // La causal dice de que tipo es el bloqueo; la observacion dice que pasa
      // exactamente y que se esta esperando. Sin ella el tablero muestra la
      // etiqueta pero no el contexto que necesita quien tiene que destrabarlo.
      { campo: 'Observacion_Bloqueo', etiqueta: 'Observacion del bloqueo', tipo: 'longtext' },
      { campo: 'Link_Taiga', etiqueta: 'Issue en Taiga', tipo: 'url' },
      { campo: 'Version_Semantica', etiqueta: 'Version estimada', tipo: 'text' },
      { campo: 'Responsable_ID', etiqueta: 'Responsable actual', tipo: 'enum', fk: 'Usuarios' },
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
  Plataforma_Digital: function () { return PLATAFORMAS; },
  Lineas_Estrategicas: function () { return LINEAS_ESTRATEGICAS; },
  Verticales: function () { return VERTICALES; },
  Causales_Bloqueo: function () { return CAUSALES_BLOQUEO; },
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
function getPlataformas_() { return catalogoVigente('Plataforma_Digital'); }
/** @return {!Array} Lineas estrategicas vigentes. */
function getLineasEstrategicas_() { return catalogoVigente('Lineas_Estrategicas'); }
/** @return {!Array} Verticales vigentes. */
function getVerticales_() { return catalogoVigente('Verticales'); }
/** @return {!Array} Causales de bloqueo vigentes. */
function getCausalesBloqueo_() { return catalogoVigente('Causales_Bloqueo'); }
/** @return {!Array} Tipos de solicitud vigentes. */
function getTiposSolicitud_() { return catalogoVigente('Tipos_Solicitud'); }
/** @return {!Array} Tipos de iniciativa vigentes. */
function getTiposIniciativa_() { return catalogoVigente('Tipos_Iniciativa'); }
