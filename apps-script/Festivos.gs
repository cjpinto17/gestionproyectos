/**
 * Festivos.gs
 * Calendario laboral colombiano y aritmetica de dias habiles.
 *
 * Los SLA por fase se miden en DIAS HABILES, asi que el sistema necesita saber
 * que dias no cuentan. Los festivos no se cargan a mano: se calculan con la
 * regla oficial (Ley 51 de 1983, "Ley Emiliani"), que traslada varios festivos
 * al lunes siguiente, y con la fecha de Pascua para los festivos moviles.
 *
 * Si la compania tiene dias no laborables adicionales (jornadas internas,
 * cierres), se agregan en la hoja Festivos del libro de parametrizacion y el
 * calculo los toma en cuenta.
 */

var MS_DIA_HABIL = 86400000;

/**
 * Domingo de Pascua por el algoritmo de Meeus/Jones/Butcher (calendario
 * gregoriano).
 * @param {number} anio
 * @return {!Date} Fecha a medianoche.
 */
function domingoDePascua(anio) {
  var a = anio % 19;
  var b = Math.floor(anio / 100);
  var c = anio % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31);
  var dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

/**
 * Traslada una fecha al lunes siguiente si no cae lunes (Ley Emiliani).
 * @param {!Date} fecha
 * @return {!Date}
 * @private
 */
function trasladarALunes_(fecha) {
  var d = new Date(fecha.getTime());
  var dia = d.getDay();                 // 0 domingo ... 6 sabado
  if (dia === 1) return d;
  var faltan = dia === 0 ? 1 : (8 - dia);
  d.setDate(d.getDate() + faltan);
  return d;
}

/**
 * @param {!Date} base
 * @param {number} dias
 * @return {!Date}
 * @private
 */
function sumarDias_(base, dias) {
  var d = new Date(base.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

/** @return {string} Clave 'yyyy-MM-dd' local, independiente de la hora. */
function claveDia_(fecha) {
  return fecha.getFullYear() + '-' +
         ('0' + (fecha.getMonth() + 1)).slice(-2) + '-' +
         ('0' + fecha.getDate()).slice(-2);
}

/**
 * Festivos colombianos de un anio.
 * @param {number} anio
 * @return {!Array<!Date>} 18 festivos, ordenados.
 */
function festivosColombia(anio) {
  var pascua = domingoDePascua(anio);
  var festivos = [
    new Date(anio, 0, 1),                              // Ano nuevo
    trasladarALunes_(new Date(anio, 0, 6)),            // Reyes Magos
    trasladarALunes_(new Date(anio, 2, 19)),           // San Jose
    sumarDias_(pascua, -3),                            // Jueves Santo
    sumarDias_(pascua, -2),                            // Viernes Santo
    new Date(anio, 4, 1),                              // Dia del trabajo
    sumarDias_(pascua, 43),                            // Ascension (ya trasladada)
    sumarDias_(pascua, 64),                            // Corpus Christi
    sumarDias_(pascua, 71),                            // Sagrado Corazon
    trasladarALunes_(new Date(anio, 5, 29)),           // San Pedro y San Pablo
    new Date(anio, 6, 20),                             // Independencia
    new Date(anio, 7, 7),                              // Batalla de Boyaca
    trasladarALunes_(new Date(anio, 7, 15)),           // Asuncion de la Virgen
    trasladarALunes_(new Date(anio, 9, 12)),           // Dia de la Raza
    trasladarALunes_(new Date(anio, 10, 1)),           // Todos los Santos
    trasladarALunes_(new Date(anio, 10, 11)),          // Independencia de Cartagena
    new Date(anio, 11, 8),                             // Inmaculada Concepcion
    new Date(anio, 11, 25)                             // Navidad
  ];
  // En algunos anios dos festivos caen el mismo lunes (2025: San Pedro y
  // Sagrado Corazon el 30 de junio); se devuelve un solo dia.
  var vistos = {};
  return festivos.sort(function (a, b) { return a - b; }).filter(function (f) {
    var k = claveDia_(f);
    if (vistos[k]) return false;
    vistos[k] = true;
    return true;
  });
}

/** Cache por ejecucion: evita recalcular el calendario en cada comparacion. */
var _cacheFestivos = {};

/**
 * @param {number} anio
 * @return {!Object<string, boolean>} Mapa 'yyyy-MM-dd' -> true.
 * @private
 */
function mapaFestivos_(anio) {
  if (!_cacheFestivos[anio]) {
    var mapa = {};
    festivosColombia(anio).forEach(function (f) { mapa[claveDia_(f)] = true; });
    // Dias no laborables adicionales definidos por la compania, si la hoja existe.
    try {
      leerTabla('Festivos').forEach(function (fila) {
        var d = aFecha_(fila.Fecha);
        if (d && d.getFullYear() === anio) mapa[claveDia_(d)] = true;
      });
    } catch (e) {
      // La hoja Festivos es opcional: sin ella solo aplican los festivos de ley.
    }
    _cacheFestivos[anio] = mapa;
  }
  return _cacheFestivos[anio];
}

/**
 * @param {!Date} fecha
 * @return {boolean} True si es lunes a viernes y no es festivo.
 */
function esDiaHabil(fecha) {
  var dia = fecha.getDay();
  if (dia === 0 || dia === 6) return false;
  return !mapaFestivos_(fecha.getFullYear())[claveDia_(fecha)];
}

/**
 * Dias habiles transcurridos entre dos instantes, con fraccion.
 * Cuenta cada dia habil completo entre ambas fechas y prorratea los extremos
 * sobre una jornada de 24 horas, para que una fase que duro medio dia habil
 * no se contabilice como un dia entero.
 *
 * @param {Date} inicio
 * @param {Date} fin
 * @return {?number} Dias habiles, o null si falta alguna fecha o el rango es invalido.
 */
function diasHabilesEntre(inicio, fin) {
  if (!inicio || !fin) return null;
  var ini = inicio instanceof Date ? inicio : new Date(inicio);
  var f = fin instanceof Date ? fin : new Date(fin);
  if (isNaN(ini.getTime()) || isNaN(f.getTime()) || f < ini) return null;

  var cursor = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
  var ultimo = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  var total = 0;
  var guarda = 0;

  while (cursor <= ultimo && guarda++ < 3700) {   // tope ~10 anios
    if (esDiaHabil(cursor)) {
      var inicioDia = cursor.getTime();
      var finDia = inicioDia + MS_DIA_HABIL;
      var desde = Math.max(ini.getTime(), inicioDia);
      var hasta = Math.min(f.getTime(), finDia);
      if (hasta > desde) total += (hasta - desde) / MS_DIA_HABIL;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total * 100) / 100;
}
