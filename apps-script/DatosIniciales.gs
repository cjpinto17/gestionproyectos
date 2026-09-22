/**
 * DatosIniciales.gs
 * Data real entregada por la Gerencia de Desarrollo de Plataformas Digitales.
 * cargarDatosIniciales() escribe solo en las hojas vacias: es segura de repetir.
 *
 * Convenciones aplicadas sobre la fuente, todas editables desde Administracion:
 *   - El ID de iniciativa se prefija "INI-": Google Sheets convierte el texto
 *     "001" en el numero 1 y se perderia el formato de la llave.
 *   - "Portal Empresarial" llegaba con el mismo ID que "Shivam" (PL-07): se le
 *     asigno PL-08.
 *   - El estado usa el catalogo de Estados de Iniciativa (EIN-01 Por iniciar,
 *     EIN-02 En progreso), que es distinto del estado de las solicitudes.
 *   - Los Business Owner se crean como usuarios con rol RO-09 y sin correo:
 *     quedan asignables de inmediato y podran iniciar sesion cuando se les
 *     registre la cuenta corporativa.
 *   - Las iniciativas no traen fechas ni plataforma: se cargan vacias y se
 *     completan en la hoja o desde la aplicacion.
 */

/** Plataformas digitales (en este modelo, plataforma y aplicacion son lo mismo). */
var PLATAFORMAS_REALES = [
  { id: 'PL-01', nombre: 'Analizamos' },
  { id: 'PL-02', nombre: 'Aseguramos' },
  { id: 'PL-03', nombre: 'Banca Movil' },
  { id: 'PL-04', nombre: 'Notificamos' },
  { id: 'PL-05', nombre: 'Talanquera' },
  { id: 'PL-06', nombre: 'Configuramos' },
  { id: 'PL-07', nombre: 'Shivam' },
  { id: 'PL-08', nombre: 'Portal Empresarial' },
];

/** Business Owners entregados con la data. Sin correo corporativo todavia. */
var USUARIOS_SEMILLA = [
  { id: 'USR-001', nombre: 'Claudia Gomez', cargo: 'Business Owner', area: 'Negocio', rol: 'RO-09' },
  { id: 'USR-002', nombre: 'Mauricio Osorio', cargo: 'Business Owner', area: 'Negocio', rol: 'RO-09' },
];

/** Las 39 iniciativas del portafolio, en el orden entregado. */
var INICIATIVAS_REALES = [
  { id: 'INI-001', nombre: 'Evolución y Mantenimiento Analizamos', descripcion: '', prioridad: 'Media', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-002', nombre: 'Evolución y Mantenimiento Aseguramos', descripcion: '', prioridad: 'Media', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-003', nombre: 'Evolución y Mantenimiento Banca móvil', descripcion: '', prioridad: 'Media', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-004', nombre: 'InterOperabilidad ProAgro - Aprogresar', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-02', vertical: 'VER-03', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-005', nombre: 'Integración go Bravo', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-04', vertical: 'VER-02', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-006', nombre: 'Integración Chiper', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-04', vertical: 'VER-02', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-007', nombre: 'Intervención estructura de datos y acciones sobre el tercero', descripcion: 'Estructura de datos PN y PJ, Actualización y Corrección de datos', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-008', nombre: 'Servicio de Recaudo (Pasarela)', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-04', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-009', nombre: 'Gestión de solicitudes (Matrix Fase 3)', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-010', nombre: 'Gestión comercial (Matrix Fase 4)', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-011', nombre: 'Gestión comercial (Matrix Fase 5)', descripcion: '', prioridad: '', tipo: '',
    bo: '', po: '', len: '', vertical: '', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: '' },
  { id: 'INI-012', nombre: 'Mejoras proyecto Innpulsa', descripcion: 'Identificar agremiación + Control de parametros', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-013', nombre: 'Hallazgos de auditoría Analizamos', descripcion: '', prioridad: 'Media', tipo: 'TIN-02',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-014', nombre: 'Migración funcionalidades de Originación a Analizamos (Desembolso)', descripcion: 'Hacer desembolso en Analizamos', prioridad: 'Media', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-015', nombre: 'Troncal (Flujos Producto / Cliente / Canal)', descripcion: 'Permitir la apertura de productos de manera unificada en todos los front', prioridad: 'Crítica', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-016', nombre: 'Iniciativa UIN en Banca Móvil', descripcion: '', prioridad: 'Alta', tipo: 'TIN-04',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-02', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-017', nombre: 'Actualización temas de Mercadeo / Y2D', descripcion: 'Requerimiento técnico para trazabilidad de conversiones en pautas digitales. Actualización plugin de meta en página web, y2d y mercadeo.', prioridad: 'Media', tipo: 'TIN-04',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-018', nombre: 'Implementación Devops', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-019', nombre: 'Automatización pruebas UAT', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-020', nombre: 'Innovación con próposito', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-05',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-021', nombre: 'Plataforma gestión administrativa (HexaAdmin)', descripcion: '', prioridad: 'Media', tipo: 'TIN-05',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-022', nombre: 'Implementación de Observabilidad', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-023', nombre: 'Mejoras Revinculamos - Activar modulo de notificaciones en SAC', descripcion: '', prioridad: 'Media', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-024', nombre: 'Mejoras Revinculamos - Independencia telefónica para Acercasa', descripcion: '', prioridad: 'Media', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-025', nombre: 'Implementación nueva plataforma de contact center para Revinculamos', descripcion: '', prioridad: 'Alta', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-026', nombre: 'Proyecto Data Lake House', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: 'USR-001', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-027', nombre: 'Proyecto Agentes IA', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-028', nombre: 'Santander Agro 360', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-02', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-029', nombre: 'Apertura de CDT con MejorCDT', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: 'USR-002', po: '', len: 'LEN-00', vertical: 'VER-02', plataforma: '',
    fechaEstimada: '', fechaInicio: '14/09/2026', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-030', nombre: 'Hub Digital Crezcamos', descripcion: 'Rediseño página Web', prioridad: 'Crítica', tipo: 'TIN-04',
    bo: 'USR-002', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-031', nombre: 'Plan de acción Intervención Crédito', descripcion: 'Realizar las mejoras para el canal ejecutivo en la APK de Analizamos para mejorar la experiencia y aumentar la productividad.', prioridad: 'Crítica', tipo: 'TIN-04',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '14/09/2026', fechaFin: '', estado: 'EIN-02' },
  { id: 'INI-032', nombre: 'Ach 2.0', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-03',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-033', nombre: 'Alkilagro 2.0', descripcion: '', prioridad: 'Crítica', tipo: 'TIN-04',
    bo: '', po: '', len: 'LEN-02', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-034', nombre: 'Troncal - Compra de cartera', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-035', nombre: 'Modificación pre oferta', descripcion: '', prioridad: 'Alta', tipo: 'TIN-04',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-036', nombre: 'Revision de producto Crédito Empresarial', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-037', nombre: 'Amortizaciones', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-01', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-038', nombre: 'Control de fraude', descripcion: '', prioridad: 'Alta', tipo: 'TIN-02',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-00', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
  { id: 'INI-039', nombre: 'Apertura de cuenta de ahorro y CDT en Analizamos', descripcion: '', prioridad: 'Alta', tipo: 'TIN-01',
    bo: '', po: '', len: 'LEN-00', vertical: 'VER-02', plataforma: '',
    fechaEstimada: '', fechaInicio: '', fechaFin: '', estado: 'EIN-01' },
];

/**
 * Carga catalogos, usuarios e iniciativas en el libro de parametrizacion.
 * @return {!Object} Resumen de lo cargado y lo omitido.
 */
function cargarDatosIniciales() {
  var libro = SpreadsheetApp.openById(getIdLibroParametrizacion());
  var resumen = { cargado: [], omitido: [] };

  cargarSiVacio_(libro, 'Plataforma_Digital', PLATAFORMAS_REALES.map(function (p) {
    return [p.id, p.nombre];
  }), resumen);

  cargarSiVacio_(libro, 'Usuarios', USUARIOS_SEMILLA.map(function (u) {
    return [u.id, u.nombre, '', u.cargo, u.area, u.rol, 'SI'];
  }), resumen);

  cargarSiVacio_(libro, 'Proyectos', INICIATIVAS_REALES.map(function (i) {
    return [i.id, i.nombre, i.descripcion, i.prioridad, i.tipo, i.bo, i.po,
            i.len, i.vertical, i.plataforma, i.fechaEstimada, i.fechaInicio,
            i.fechaFin, i.estado];
  }), resumen);

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

/**
 * Escribe filas solo si la hoja no tiene datos todavia.
 * @private
 */
function cargarSiVacio_(libro, nombreHoja, filas, resumen) {
  var hoja = libro.getSheetByName(nombreHoja);
  if (!hoja) throw new Error('Falta la hoja ' + nombreHoja + '. Ejecute setupInicial() primero.');
  if (hoja.getLastRow() > 1) {
    resumen.omitido.push(nombreHoja + ' (ya tiene ' + (hoja.getLastRow() - 1) + ' filas)');
    return;
  }
  if (!filas.length) return;
  hoja.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
  resumen.cargado.push(nombreHoja + ': ' + filas.length + ' filas');
}
