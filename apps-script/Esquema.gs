/**
 * Esquema.gs
 * Definicion declarativa del modelo de datos. Es la unica fuente de verdad sobre
 * hojas, columnas, tipos y llaves: Setup.gs la usa para crear los libros, el CRUD
 * de Administracion la usa para generar formularios dinamicos y las validaciones
 * la usan para tipar los valores antes de escribir en Sheets.
 *
 * Tipos soportados: 'text' | 'longtext' | 'number' | 'decimal' | 'date' |
 *                   'datetime' | 'enum' | 'boolSN' | 'url' | 'email'
 */

/** Codigos de fase del embudo (8 fases secuenciales). */
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
 * Estados operacionales. DECISION: se unificaron en 6 (el documento fuente
 * listaba 7 con 'En proceso' y 'En progreso' como duplicado semantico).
 */
var ESTADOS = [
  { id: 'EST-01', nombre: 'Por iniciar' },
  { id: 'EST-02', nombre: 'En progreso' },
  { id: 'EST-03', nombre: 'Aprobada' },
  { id: 'EST-04', nombre: 'Bloqueada' },
  { id: 'EST-05', nombre: 'Cancelada' },
  { id: 'EST-06', nombre: 'Terminada' }
];

/** Catalogo de plataformas digitales. */
var PLATAFORMAS = [
  { id: 'PL-01', nombre: 'Analizamos' },
  { id: 'PL-02', nombre: 'Aseguramos' },
  { id: 'PL-03', nombre: 'Banca Movil' },
  { id: 'PL-04', nombre: 'Notificamos' },
  { id: 'PL-05', nombre: 'Talanquera' }
];

var TIPOS_SOLICITUD = [
  { id: 'TIP-01', nombre: 'Nueva funcionalidad' },
  { id: 'TIP-02', nombre: 'Mejora en una funcionalidad' },
  { id: 'TIP-03', nombre: 'Ajuste' }
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
  { id: 'CAU-03', nombre: 'Dependencia' }
];

/** Lineas Estrategicas de Negocio (LEN): eje horizontal de la matriz de iniciativas. */
var LINEAS_ESTRATEGICAS = [
  { id: 'LEN-01', nombre: 'Ingreso estable', orden: 1 },
  { id: 'LEN-02', nombre: 'Agro', orden: 2 },
  { id: 'LEN-03', nombre: 'Desarrollo empresarial', orden: 3 },
  { id: 'LEN-04', nombre: 'Mi negocio independiente', orden: 4 }
];

/** Verticales de producto: eje vertical de la matriz de iniciativas. */
var VERTICALES = [
  { id: 'VER-01', nombre: 'Credito', orden: 1 },
  { id: 'VER-02', nombre: 'Ahorro e inversion', orden: 2 },
  { id: 'VER-03', nombre: 'Proteccion', orden: 3 },
  { id: 'VER-04', nombre: 'Servicios de recaudo', orden: 4 }
];

var ROLES = [
  { id: 'RO-01', nombre: 'Solicitante' },
  { id: 'RO-02', nombre: 'Product Owner' },
  { id: 'RO-03', nombre: 'Analista Fabrica' },
  { id: 'RO-04', nombre: 'Desarrollador' },
  { id: 'RO-05', nombre: 'Analista QA' },
  { id: 'RO-06', nombre: 'Equipo UAT' },
  { id: 'RO-07', nombre: 'Comite CAB' },
  { id: 'RO-08', nombre: 'Administrador' }
];

/* ------------------------------------------------------------------ */
/* Esquema del Libro 1: Parametrizacion (maestros)                     */
/* ------------------------------------------------------------------ */

var ESQUEMA_PARAMETRIZACION = {
  Usuarios: {
    etiqueta: 'Usuarios',
    pk: 'Correo_ID',
    columnas: [
      { campo: 'Correo_ID', etiqueta: 'Correo corporativo', tipo: 'email', requerido: true },
      { campo: 'Nombre_Completo', etiqueta: 'Nombre completo', tipo: 'text', requerido: true },
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
    etiqueta: 'Proyectos',
    pk: 'ID_Proyecto',
    columnas: [
      { campo: 'ID_Proyecto', etiqueta: 'ID Proyecto', tipo: 'text', requerido: true },
      { campo: 'Nombre_Proyecto', etiqueta: 'Nombre del proyecto', tipo: 'text', requerido: true },
      { campo: 'Descripcion', etiqueta: 'Descripcion', tipo: 'longtext' },
      { campo: 'Fecha_Inicio', etiqueta: 'Fecha de inicio', tipo: 'date' },
      { campo: 'Fecha_Fin_Estimada', etiqueta: 'Fecha fin estimada', tipo: 'date' },
      { campo: 'Estado_Proyecto', etiqueta: 'Estado', tipo: 'enum', opciones: ['Activo', 'Cerrado', 'Pausado'] },
      { campo: 'LEN_ID', etiqueta: 'Linea estrategica de negocio', tipo: 'enum', fk: 'Lineas_Estrategicas', requerido: true },
      { campo: 'Vertical_ID', etiqueta: 'Vertical', tipo: 'enum', fk: 'Verticales', requerido: true },
      { campo: 'Responsable_Correo', etiqueta: 'Responsable', tipo: 'email', fk: 'Usuarios' },
      { campo: 'ID_Aplicacion', etiqueta: 'Aplicacion principal', tipo: 'enum', fk: 'Aplicaciones' }
    ]
  },
  Plataforma_Digital: {
    etiqueta: 'Plataformas Digitales',
    pk: 'ID_Plataforma',
    columnas: [
      { campo: 'ID_Plataforma', etiqueta: 'ID Plataforma', tipo: 'text', requerido: true },
      { campo: 'Nombre_Plataforma', etiqueta: 'Nombre', tipo: 'text', requerido: true }
    ]
  },
  Aplicaciones: {
    etiqueta: 'Aplicaciones',
    pk: 'ID_Aplicacion',
    columnas: [
      { campo: 'ID_Aplicacion', etiqueta: 'ID Aplicacion', tipo: 'text', requerido: true },
      { campo: 'Nombre_Aplicacion', etiqueta: 'Nombre de la aplicacion', tipo: 'text', requerido: true },
      { campo: 'Plataforma_ID', etiqueta: 'Plataforma', tipo: 'enum', fk: 'Plataforma_Digital', requerido: true }
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
    etiqueta: 'Estados',
    pk: 'ID_Estado',
    columnas: [
      { campo: 'ID_Estado', etiqueta: 'ID Estado', tipo: 'text', requerido: true },
      { campo: 'Nombre_Estado', etiqueta: 'Nombre del estado', tipo: 'text', requerido: true }
    ]
  },
  Tipos_Solicitud: {
    etiqueta: 'Tipos de Solicitud',
    pk: 'ID_Tipo',
    columnas: [
      { campo: 'ID_Tipo', etiqueta: 'ID Tipo', tipo: 'text', requerido: true },
      { campo: 'Nombre_Tipo', etiqueta: 'Nombre del tipo', tipo: 'text', requerido: true }
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
  }
};

/* ------------------------------------------------------------------ */
/* Esquema del Libro 2: Transaccional                                  */
/* ------------------------------------------------------------------ */

var ESQUEMA_TRANSACCIONAL = {
  Solicitudes: {
    etiqueta: 'Solicitudes',
    pk: 'ID_Solicitud',
    columnas: [
      { campo: 'ID_Solicitud', etiqueta: 'ID Solicitud', tipo: 'text', requerido: true },
      { campo: 'Fecha_Registro', etiqueta: 'Fecha de registro', tipo: 'datetime', requerido: true },
      { campo: 'Nombre_Solicitud', etiqueta: 'Nombre de la solicitud', tipo: 'text', requerido: true },
      { campo: 'Objetivo', etiqueta: 'Objetivo', tipo: 'longtext', requerido: true },
      { campo: 'Entregable', etiqueta: 'Entregable', tipo: 'text' },
      { campo: 'ID_Proyecto', etiqueta: 'Proyecto', tipo: 'enum', fk: 'Proyectos', requerido: true },
      { campo: 'ID_Aplicacion', etiqueta: 'Aplicacion', tipo: 'enum', fk: 'Aplicaciones' },
      { campo: 'Solicitante_Correo', etiqueta: 'Solicitante', tipo: 'email', fk: 'Usuarios', requerido: true },
      { campo: 'Tipo_Solicitud', etiqueta: 'Tipo de solicitud', tipo: 'enum', fk: 'Tipos_Solicitud', requerido: true },
      { campo: 'Prioridad', etiqueta: 'Prioridad', tipo: 'enum', fk: 'Prioridad', requerido: true },
      { campo: 'Plataforma', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital', requerido: true },
      { campo: 'Proceso_Impactado', etiqueta: 'Proceso impactado', tipo: 'text' },
      { campo: 'Doc_Requerimiento_URL', etiqueta: 'Documento de requerimiento', tipo: 'url' },
      { campo: 'Carpeta_Drive_URL', etiqueta: 'Carpeta en Drive', tipo: 'url' },
      { campo: 'Fase_Actual', etiqueta: 'Fase actual', tipo: 'enum', fk: 'Fases', requerido: true },
      { campo: 'Estado_Actual', etiqueta: 'Estado actual', tipo: 'enum', fk: 'Estados', requerido: true },
      { campo: 'Tiene_Bloqueo', etiqueta: 'Tiene bloqueo', tipo: 'boolSN', requerido: true },
      { campo: 'Causal_Bloqueo', etiqueta: 'Causal de bloqueo', tipo: 'enum', fk: 'Causales_Bloqueo' },
      { campo: 'Link_Taiga', etiqueta: 'Issue en Taiga', tipo: 'url' },
      { campo: 'Version_Semantica', etiqueta: 'Version semantica', tipo: 'text' },
      { campo: 'Responsable_Actual', etiqueta: 'Responsable actual', tipo: 'email', fk: 'Usuarios' },
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
      { campo: 'Usuario_Responsable', etiqueta: 'Usuario responsable', tipo: 'email', requerido: true },
      { campo: 'Horas_En_Fase', etiqueta: 'Horas en fase origen', tipo: 'decimal' }
    ]
  },
  Roadmap_Versiones: {
    etiqueta: 'Roadmap de Versiones',
    pk: 'ID_Version',
    columnas: [
      { campo: 'ID_Version', etiqueta: 'ID Version', tipo: 'text', requerido: true },
      { campo: 'ID_Aplicacion', etiqueta: 'Aplicacion', tipo: 'enum', fk: 'Aplicaciones', requerido: true },
      { campo: 'Plataforma', etiqueta: 'Plataforma digital', tipo: 'enum', fk: 'Plataforma_Digital', requerido: true },
      { campo: 'Numero_Version', etiqueta: 'Numero de version', tipo: 'text', requerido: true },
      { campo: 'Estado_Release', etiqueta: 'Estado del release', tipo: 'enum', opciones: ['Planeada', 'En Produccion'] },
      { campo: 'Fecha_Planeada', etiqueta: 'Fecha planeada', tipo: 'date' },
      { campo: 'Fecha_Despliegue_Real', etiqueta: 'Fecha de despliegue real', tipo: 'date' }
    ]
  }
};

/* ------------------------------------------------------------------ */
/* Utilidades de esquema                                               */
/* ------------------------------------------------------------------ */

/**
 * Resuelve la definicion de una tabla por nombre, en cualquiera de los libros.
 * @param {string} tabla Nombre de la hoja.
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
 * @param {string} tabla Nombre de la hoja.
 * @return {!Array<string>} Encabezados en el orden exacto de la hoja.
 */
function getEncabezados(tabla) {
  var info = getDefinicionTabla(tabla);
  if (!info) throw new Error('Tabla desconocida: ' + tabla);
  return info.def.columnas.map(function (c) { return c.campo; });
}

/** @return {!Object<string,string>} Mapa ID_Fase -> Nombre_Fase. */
function mapaFases() {
  return FASES.reduce(function (acc, f) { acc[f.id] = f.nombre; return acc; }, {});
}

/** @return {!Object<string,string>} Mapa ID_Estado -> Nombre_Estado. */
function mapaEstados() {
  return ESTADOS.reduce(function (acc, e) { acc[e.id] = e.nombre; return acc; }, {});
}

/** @return {!Object<string,string>} Mapa ID_LEN -> Nombre_LEN. */
function mapaLineasEstrategicas() {
  return LINEAS_ESTRATEGICAS.reduce(function (acc, l) { acc[l.id] = l.nombre; return acc; }, {});
}

/** @return {!Object<string,string>} Mapa ID_Vertical -> Nombre_Vertical. */
function mapaVerticales() {
  return VERTICALES.reduce(function (acc, v) { acc[v.id] = v.nombre; return acc; }, {});
}
