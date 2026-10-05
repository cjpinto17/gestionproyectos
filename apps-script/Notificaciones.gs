/**
 * Notificaciones.gs | Los avisos de Chat y correo sobre las solicitudes (D-131).
 *
 * Antes habia TRES eventos para los tres gobiernos juntos, asi que una tarea
 * terminada llegaba a Chat titulada "Cambio de fase" con la fase vacia —el
 * campo decia literalmente " · Terminada", con el separador huerfano—, el correo
 * decia "La solicitud avanzo de fase", levantar un bloqueo no avisaba nada y
 * ningun aviso traia enlace para llegar a la solicitud.
 *
 * Lo que cambia de fondo: el aviso ya no describe el ESTADO de la solicitud,
 * describe el CAMBIO. Por eso notificar_ recibe `cambio`, no solo el registro:
 * de donde a donde, quien lo hizo y cuanto duro. Sin ese dato lo unico que se
 * puede decir es "algo pasó", que es lo que decia antes.
 *
 * Dos vias de salida, decididas por evento en EVENTOS_NOTIFICACION:
 *  - Al instante, lo que alguien tiene que atender ahora (bloqueos, devoluciones,
 *    produccion, indisponibilidad, incidentes graves).
 *  - Agrupado, todo lo demas: se encola en la hoja Avisos_Pendientes y un
 *    disparador la vacia cada hora en una sola tarjeta. Avisar cada movimiento de
 *    fase volveria el espacio ilegible, y un espacio que no se lee no avisa nada.
 *
 * El correo SI sale al instante siempre, porque va dirigido a los implicados y
 * no a un espacio comun: ahi el volumen lo pone cada solicitud, no el area.
 */

/* Cuantos avisos encolados se publican de una vez. Una hora con cientos de
   movimientos no debe producir una tarjeta que Chat rechace por tamano: lo que
   no entra espera la pasada siguiente, que es lo que la hoja permite. */
var TOPE_AVISOS_RESUMEN = 60;

/* Los nombres de las funciones que se programan. Estan en una lista porque
   instalar y desinstalar tienen que mirar exactamente las mismas. */
var DISPARADORES_AVISOS = ['publicarResumenAgrupado', 'publicarResumenDiario',
                           'enviarResumenSemanal'];

/* ================================================================== */
/* La entrada: notificar un cambio                                     */
/* ================================================================== */

/**
 * Avisa de un cambio en una solicitud. Nunca interrumpe la operacion: si Chat o
 * Gmail fallan, devuelve el aviso y la solicitud queda guardada igual.
 *
 * @param {!Object} solicitud El registro ya guardado.
 * @param {string} evento Una clave de EVENTOS_NOTIFICACION.
 * @param {!Object=} cambio Lo que cambio: {faseOrigen, faseDestino, estadoOrigen,
 *     estadoDestino, quien, diasEnFase, campos:[{nombre,antes,despues}], ...}
 * @return {!Array<string>} Avisos para mostrar a quien hizo el cambio.
 */
function notificar_(solicitud, evento, cambio) {
  var avisos = [];
  var def = EVENTOS_NOTIFICACION[evento];
  if (!def) {
    // Un evento que no esta en el catalogo es un error de programacion, no del
    // usuario: se registra y no se manda nada, en vez de mandar algo sin texto.
    try { Logger.log('Evento de notificacion desconocido: ' + evento); } catch (e) {}
    return avisos;
  }
  /* Una edicion que no toco ningun campo relevante no genera aviso. Sin esto,
     guardar el formulario sin cambiar nada mandaria "0 datos actualizados". */
  if (evento === 'edicion' && !((cambio || {}).campos || []).length) return avisos;

  var d = describirCambio_(solicitud, evento, cambio || {});
  d.cambio = cambio || {};

  if (CONFIG.NOTIFICAR_CHAT && getChatWebhookUrl_()) {
    try {
      if (esUrgente_(def, solicitud)) publicarTarjetaChat_(tarjetaDeCambio_(d));
      else encolarAviso_(d);   // si la hoja no existe, el catch de abajo lo dice
    } catch (e) {
      avisos.push('No se pudo avisar por Google Chat: ' + e.message);
    }
  }
  if (CONFIG.NOTIFICAR_CORREO) {
    try { enviarCorreoDeCambio_(d); }
    catch (e) { avisos.push('No se pudo enviar el correo: ' + e.message); }
  }
  return avisos;
}

/**
 * Si el evento sale al instante o espera el resumen.
 * @private
 */
function esUrgente_(def, solicitud) {
  if (def.urgencia === 'siempre') return true;
  if (def.urgencia === 'siCritica') {
    return PRIORIDADES_URGENTES.indexOf(normalizarPrioridad_(solicitud.Prioridad)) !== -1;
  }
  return false;
}

/* ================================================================== */
/* Describir el cambio: el corazon del asunto                          */
/* ================================================================== */

/**
 * Convierte un cambio en el texto que leen las personas.
 *
 * Devuelve un solo objeto que usan las tres salidas —tarjeta de Chat, correo y
 * linea del resumen— para que las tres digan lo MISMO. Antes el titulo de la
 * tarjeta y el asunto del correo salian de dos mapas distintos, y por eso se
 * podian desincronizar sin que nada avisara.
 *
 * @return {!Object} {evento, id, nombre, titular, lineas, asunto, resumen, grupo,
 *     quien, url, acento}
 * @private
 */
function describirCambio_(solicitud, evento, cambio) {
  var def = EVENTOS_NOTIFICACION[evento];
  var fases = mapaFases(), estados = mapaEstados();
  var nf = function (id) { return fases[id] || id || 'sin fase'; };
  var ne = function (id) { return estados[id] || id || 'sin estado'; };

  var proyecto = solicitud.ID_Proyecto
      ? buscarPorPk_('Proyectos', solicitud.ID_Proyecto) : null;
  var iniciativa = proyecto ? proyecto.Nombre_Proyecto
                            : (solicitud.ID_Proyecto || 'Sin iniciativa');
  var plataforma = mapaPlataformas()[solicitud.Plataforma_ID] || '';
  var quien = cambio.quien || '';
  var cuando = cambio.cuando ? aFecha_(cambio.cuando) : new Date();
  var cuandoTexto = Utilities.formatDate(cuando, CONFIG.ZONA_HORARIA,
                                         CONFIG.FORMATO_FECHA_HORA);

  var d = {
    evento: evento,
    id: solicitud.ID_Solicitud,
    nombre: solicitud.Nombre_Solicitud || solicitud.ID_Solicitud,
    iniciativa: iniciativa,
    plataforma: plataforma,
    quien: quien,
    grupo: def.grupo,
    acento: 'normal',
    lineas: [],
    // El titular responde QUE cambio. Cada evento lo arma a su manera abajo.
    titular: def.titulo,
    // La linea del resumen agrupado: una sola, sin etiquetas.
    resumen: ''
  };

  /* --- El titular y lo propio de cada evento --- */
  if (evento === 'avance' || evento === 'devolucion') {
    d.titular = nf(cambio.faseOrigen) + ' → ' + nf(cambio.faseDestino);
    d.resumen = d.titular;
    if (evento === 'devolucion') {
      d.acento = 'alerta';
      d.titular = 'Devuelta: ' + d.titular;
      d.resumen = d.titular;
    }
    if (cambio.diasEnFase !== undefined && cambio.diasEnFase !== null) {
      d.lineas.push(['Estuvo en ' + nf(cambio.faseOrigen),
                     textoDias_(cambio.diasEnFase) + textoContraSla_(cambio)]);
    }
  } else if (evento === 'produccion') {
    d.titular = 'Llegó a producción';
    d.resumen = 'llegó a producción';
    d.acento = 'bueno';
    if (solicitud.Version_Semantica) {
      d.lineas.push(['Versión', String(solicitud.Version_Semantica)]);
    }
  } else if (evento === 'aprobacion') {
    d.titular = 'Aprobada en ' + nf(solicitud.Fase_Actual);
    d.resumen = 'aprobada en ' + nf(solicitud.Fase_Actual);
    d.acento = 'bueno';
  } else if (evento === 'bloqueo') {
    var causal = nombreDeCausal_(solicitud.Causal_Bloqueo);
    d.titular = 'Bloqueada' +
        (solicitud.Fase_Actual ? ' en ' + nf(solicitud.Fase_Actual) : '');
    d.resumen = d.titular.toLowerCase() + ' · ' + causal;
    d.acento = 'alerta';
    d.lineas.push(['Causal', causal]);
    if (solicitud.Observacion_Bloqueo) {
      d.lineas.push(['Qué pasa', String(solicitud.Observacion_Bloqueo)]);
    }
  } else if (evento === 'desbloqueo') {
    d.titular = 'Bloqueo levantado' +
        (solicitud.Fase_Actual ? ' · ' + nf(solicitud.Fase_Actual) : '');
    d.resumen = 'bloqueo levantado';
    d.acento = 'bueno';
    if (cambio.diasBloqueada !== undefined && cambio.diasBloqueada !== null) {
      d.lineas.push(['Estuvo bloqueada', textoDias_(cambio.diasBloqueada)]);
      d.resumen += ' tras ' + textoDias_(cambio.diasBloqueada);
    }
    // La causal se borra al liberar, asi que si se quiere decir hay que haberla
    // leido ANTES de guardar. Quien llama la pasa en el cambio.
    if (cambio.causalQueTenia) {
      d.lineas.push(['Causal que tenía', nombreDeCausal_(cambio.causalQueTenia)]);
    }
  } else if (evento === 'estado_tarea') {
    d.titular = 'Tarea ' + ne(cambio.estadoDestino).toLowerCase();
    d.resumen = ne(cambio.estadoOrigen) + ' → ' + ne(cambio.estadoDestino);
    if (cambio.estadoDestino === 'EST-06') d.acento = 'bueno';
    d.lineas.push(['Cambió', d.resumen]);
    if (solicitud.Fecha_Compromiso) {
      d.lineas.push(['Compromiso', soloFecha_(solicitud.Fecha_Compromiso) +
                                   textoContraCompromiso_(solicitud, cambio)]);
    }
  } else if (evento === 'estado_incidente') {
    d.titular = 'Incidente ' + ne(cambio.estadoDestino).toLowerCase();
    d.resumen = ne(cambio.estadoOrigen) + ' → ' + ne(cambio.estadoDestino);
    d.lineas.push(['Cambió', d.resumen]);
  } else if (evento === 'cierre_incidente') {
    d.titular = 'Incidente cerrado';
    d.resumen = 'cerrado';
    d.acento = 'bueno';
    if (solicitud.Causa_Raiz) {
      d.lineas.push(['Causa raíz', nombreDeCausaRaiz_(solicitud.Causa_Raiz)]);
    }
    if (solicitud.Version_Correccion) {
      d.lineas.push(['Se corrige con', nombreDeVersion_(solicitud.Version_Correccion)]);
    }
    var caida = textoIndisponibilidad_(solicitud);
    if (caida) d.lineas.push(['Indisponibilidad', caida]);
  } else if (evento === 'incidente') {
    d.titular = 'Incidente registrado · ' + nombreDePrioridad_(solicitud.Prioridad);
    d.resumen = 'registrado · ' + nombreDePrioridad_(solicitud.Prioridad);
    d.acento = esUrgente_(def, solicitud) ? 'alerta' : 'normal';
    if (solicitud.Version_Afectada) {
      d.lineas.push(['Versión afectada', nombreDeVersion_(solicitud.Version_Afectada)]);
    }
  } else if (evento === 'indisponibilidad') {
    d.titular = 'Indisponibilidad registrada';
    d.resumen = 'indisponibilidad: ' + (textoIndisponibilidad_(solicitud) || 'sin duración');
    d.acento = 'alerta';
    var det = textoIndisponibilidad_(solicitud);
    if (det) d.lineas.push(['Duración', det]);
  } else if (evento === 'compromiso') {
    d.titular = 'Compromiso: ' + (cambio.antes ? soloFecha_(cambio.antes) : 'sin fecha') +
                ' → ' + (cambio.despues ? soloFecha_(cambio.despues) : 'sin fecha');
    d.resumen = d.titular;
  } else if (evento === 'edicion') {
    var campos = cambio.campos || [];
    d.titular = campos.length === 1
        ? campos[0].nombre + ': ' + textoDe_(campos[0].antes) + ' → ' +
          textoDe_(campos[0].despues)
        : campos.length + ' datos actualizados';
    d.resumen = d.titular;
    campos.forEach(function (c) {
      d.lineas.push([c.nombre, textoDe_(c.antes) + ' → ' + textoDe_(c.despues)]);
    });
  } else if (evento === 'creacion') {
    d.titular = 'Nueva solicitud · ' + nombreDeTipo_(solicitud.Tipo_Solicitud);
    d.resumen = nombreDeTipo_(solicitud.Tipo_Solicitud) + ' · ' +
                nombreDePrioridad_(solicitud.Prioridad);
    if (solicitud.Fase_Actual) d.lineas.push(['Entra en', nf(solicitud.Fase_Actual)]);
    if (solicitud.Fecha_Compromiso) {
      d.lineas.push(['Compromiso', soloFecha_(solicitud.Fecha_Compromiso)]);
    }
  }

  /* --- Lo comun, al final: contexto, no titular --- */
  d.lineas.push(['Iniciativa', iniciativa + (plataforma ? ' · ' + plataforma : '')]);
  if (quien) d.lineas.push(['Quién', quien + ' · ' + cuandoTexto]);
  else d.lineas.push(['Cuándo', cuandoTexto]);

  /* El asunto del correo: el ID primero para poder buscar y ordenar, el cambio
     despues y el nombre al final. Antes era el mismo asunto para los ocho
     avances posibles, asi que una bandeja con diez correos no distinguia
     ninguno. */
  d.asunto = d.id + ' · ' + d.titular + ' — ' + d.nombre;
  d.url = urlDeSolicitud_(d.id);
  return d;
}

/* ------------------------------------------------------------------ */
/* Textos pequenos, cada uno en su funcion para poder probarlos        */
/* ------------------------------------------------------------------ */

/** @return {string} "12 días hábiles", "1 día hábil", "medio día hábil". */
function textoDias_(dias) {
  var n = Number(dias) || 0;
  if (n < 0.1) return 'menos de un día hábil';
  if (n < 1) return 'medio día hábil';
  var r = Math.round(n * 10) / 10;
  var txt = String(r).replace('.', ',');
  return txt + (r === 1 ? ' día hábil' : ' días hábiles');
}

/** Si la fase se paso de su SLA, dicho en una coletilla. @private */
function textoContraSla_(cambio) {
  if (cambio.slaFase === undefined || cambio.slaFase === null || !cambio.slaFase) return '';
  var dias = Number(cambio.diasEnFase) || 0;
  return dias > cambio.slaFase
      ? ' · se pasó del objetivo de ' + cambio.slaFase
      : ' · dentro del objetivo de ' + cambio.slaFase;
}

/** Si la tarea se entrego antes o despues de su compromiso. @private */
function textoContraCompromiso_(solicitud, cambio) {
  if (cambio.estadoDestino !== 'EST-06') return '';
  var meta = aFecha_(solicitud.Fecha_Compromiso);
  var cierre = cambio.cuando ? aFecha_(cambio.cuando) : new Date();
  if (!meta || !cierre) return '';
  var dias = diasHabilesEntre(meta < cierre ? meta : cierre,
                              meta < cierre ? cierre : meta) || 0;
  if (dias < 0.5) return ' · entregada el mismo día';
  return meta < cierre
      ? ' · entregada ' + textoDias_(dias) + ' tarde'
      : ' · entregada ' + textoDias_(dias) + ' antes';
}

/** La indisponibilidad en palabras, o '' si no hubo o falta el dato. @private */
function textoIndisponibilidad_(solicitud) {
  if (!esSi_(solicitud.Hubo_Indisponibilidad)) return '';
  var ini = aFecha_(solicitud.Inicio_Indisponibilidad);
  var fin = aFecha_(solicitud.Fin_Indisponibilidad);
  var tipo = solicitud.Tipo_Indisponibilidad
      ? ' · ' + String(solicitud.Tipo_Indisponibilidad).toLowerCase() : '';
  if (!ini) return 'sí, sin horas registradas';
  if (!fin) return 'desde ' + Utilities.formatDate(ini, CONFIG.ZONA_HORARIA,
                                                   CONFIG.FORMATO_FECHA_HORA) +
                  ', sin cerrar' + tipo;
  // En horas de reloj, no en dias habiles: un incidente del sabado no espera al
  // lunes, y asi se mide tambien el indicador de disponibilidad (D-101).
  var horas = (fin.getTime() - ini.getTime()) / 3600000;
  if (horas < 1) return Math.round(horas * 60) + ' min' + tipo;
  var h = Math.floor(horas), m = Math.round((horas - h) * 60);
  return h + ' h' + (m ? ' ' + m + ' min' : '') + tipo;
}

/** Un valor cualquiera, listo para mostrar. @private */
function textoDe_(valor) {
  if (valor === null || valor === undefined || valor === '') return 'sin dato';
  if (valor instanceof Date) return soloFecha_(valor);
  var texto = String(valor).trim();
  if (!texto) return 'sin dato';
  // Un alcance de tres parrafos no cabe en una linea de aviso.
  return texto.length > 120 ? texto.slice(0, 117) + '…' : texto;
}

/** @return {string} Solo el dia, sin hora. @private */
function soloFecha_(valor) {
  var f = aFecha_(valor);
  return f ? Utilities.formatDate(f, CONFIG.ZONA_HORARIA, 'yyyy-MM-dd') : 'sin fecha';
}

/* Los catalogos se leen de la HOJA y no de la lista del codigo: una causal o una
   causa raiz agregada desde Administracion salia como su codigo —"CB-99"— porque
   el aviso buscaba en la constante. Es el mismo defecto que D-101. */
/** @private */
function nombreDeCausal_(id) {
  if (!id) return 'sin causal registrada';
  return mapaCatalogo_(getCausalesBloqueo_())[id] || String(id);
}
/** @private */
function nombreDeCausaRaiz_(id) {
  if (!id) return 'sin causa raíz';
  return mapaCatalogo_(getCausasRaiz_())[id] || String(id);
}
/** @private */
function nombreDePrioridad_(valor) {
  var id = normalizarPrioridad_(valor);
  return mapaCatalogo_(PRIORIDADES)[id] || String(valor || 'sin prioridad');
}
/** @private */
function nombreDeTipo_(id) {
  return mapaCatalogo_(getTiposSolicitud_())[id] || String(id || 'sin tipo');
}
/** @private */
function nombreDeVersion_(id) {
  return mapaVersiones_()[String(id)] || String(id);
}

/**
 * El enlace que abre la solicitud en la aplicacion.
 *
 * Ningun aviso lo traia, asi que para ver de que se trataba habia que entrar,
 * ir a Gestion y buscar la tarjeta. El correo de los comentarios ya armaba este
 * enlace: aqui se reutiliza la misma mecanica.
 *
 * @return {string} '' si la aplicacion todavia no conoce su direccion.
 * @private
 */
function urlDeSolicitud_(idSolicitud) {
  var base = getUrlAplicacion_();
  if (!base) return '';
  return base + (base.indexOf('?') === -1 ? '?' : '&') +
         'page=gestion&id=' + encodeURIComponent(idSolicitud);
}

/* ================================================================== */
/* Salida 1: la tarjeta de Chat                                        */
/* ================================================================== */

/** Los iconos de cada acento. @private */
var ICONO_ACENTO = { alerta: '⚠', bueno: '✓', normal: '▸' };

/**
 * Arma la tarjeta de un cambio.
 * @private
 */
function tarjetaDeCambio_(d) {
  var widgets = d.lineas.map(function (par) {
    return { decoratedText: { topLabel: par[0], text: String(par[1]), wrapText: true } };
  });
  if (d.url) {
    widgets.push({ buttonList: { buttons: [{
      text: 'Abrir la solicitud',
      onClick: { openLink: { url: d.url } }
    }] } });
  }
  return {
    cardsV2: [{
      cardId: d.id + '-' + d.evento + '-' + new Date().getTime(),
      card: {
        header: {
          title: (ICONO_ACENTO[d.acento] || '▸') + ' ' + d.titular,
          subtitle: d.id + ' · ' + d.nombre
        },
        sections: [{ widgets: widgets }]
      }
    }]
  };
}

/**
 * Publica en el espacio. Separada para que todas las salidas de Chat pasen por
 * un solo sitio y una sola comprobacion de la respuesta.
 * @private
 */
function publicarTarjetaChat_(payload) {
  var url = getChatWebhookUrl_();
  if (!url) throw new Error('No hay webhook de Google Chat configurado.');
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = resp.getResponseCode();
  /* Antes no se miraba la respuesta: un webhook revocado devolvia 404 y la
     aplicacion seguia como si hubiera publicado. Nadie se enteraba de que el
     espacio llevaba semanas sin recibir nada. */
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Google Chat respondió ' + codigo + ': ' +
                    String(resp.getContentText() || '').slice(0, 200));
  }
}

/* ================================================================== */
/* Salida 2: el correo                                                 */
/* ================================================================== */

/**
 * Los correos de las personas que deben enterarse de este evento.
 *
 * Devuelve tambien a QUIEN no se le pudo avisar y por que: sin correo
 * corporativo registrado (S-12) o sin la persona asignada (S-17, el PO esta
 * vacio en las 39 iniciativas). Creer que se esta avisando cuando no, es peor
 * que no avisar.
 *
 * @return {!Object} {correos: [], faltan: []}
 * @private
 */
function destinatariosDeEvento_(solicitud, evento, cambio) {
  var def = EVENTOS_NOTIFICACION[evento] || { a: [] };
  var papeles = (def.a || []).slice();

  /* El analista entra solo si el movimiento TOCA una de sus fases: se entera de
     que su analisis arranco y de que salio, no de los seis movimientos
     siguientes. */
  if (def.analistaEnFases && solicitud.Analista_ID) {
    var toca = def.analistaEnFases.some(function (f) {
      return (cambio || {}).faseOrigen === f || (cambio || {}).faseDestino === f;
    });
    if (toca) papeles.push('analista');
  }

  var proyecto = solicitud.ID_Proyecto
      ? buscarPorPk_('Proyectos', solicitud.ID_Proyecto) : null;
  var deDonde = {
    solicitante: { tabla: 'Usuarios', id: solicitud.Solicitante_ID, papel: 'Solicitante' },
    responsable: { tabla: 'Usuarios', id: solicitud.Responsable_ID, papel: 'Responsable' },
    analista: { tabla: 'Analistas', id: solicitud.Analista_ID, papel: 'Analista' },
    po: { tabla: 'Usuarios', id: proyecto ? proyecto.PO_Usuario : '', papel: 'Product Owner' },
    bo: { tabla: 'Usuarios', id: proyecto ? proyecto.BO_Usuario : '', papel: 'Business Owner' }
  };

  var correos = [], faltan = [];
  papeles.forEach(function (p) {
    var ref = deDonde[p];
    if (!ref) return;
    if (!ref.id) { faltan.push(ref.papel + ': sin asignar'); return; }
    var fila = buscarPorPk_(ref.tabla, ref.id);
    var correo = fila ? String(fila.Correo_ID || fila.Correo || '').trim() : '';
    if (!correo) { faltan.push(ref.papel + ': sin correo registrado'); return; }
    if (correos.indexOf(correo) === -1) correos.push(correo);
  });
  return { correos: correos, faltan: faltan };
}

/**
 * Manda el correo del cambio.
 * @private
 */
function enviarCorreoDeCambio_(d) {
  var sol = buscarPorPk_('Solicitudes', d.id);
  var r = destinatariosDeEvento_(sol || {}, d.evento, d.cambio || {});
  if (!r.correos.length) return;              // nadie a quien avisar todavia
  MailApp.sendEmail({
    to: r.correos.join(','),
    subject: d.asunto,
    htmlBody: cuerpoCorreoDeCambio_(d)
  });
}

/**
 * El cuerpo del correo: arriba QUE cambio, debajo el contexto, y un boton.
 * @private
 */
function cuerpoCorreoDeCambio_(d) {
  var color = d.acento === 'alerta' ? '#B45309'
            : d.acento === 'bueno' ? '#1BB26C' : '#00306E';
  var filas = d.lineas.map(function (par) {
    return '<tr><td style="padding:6px 14px 6px 0;color:#5A6B8C;font-size:13px;' +
           'vertical-align:top;white-space:nowrap">' + esc_(par[0]) +
           '</td><td style="padding:6px 0;font-size:13px;color:#0D1F3C">' +
           esc_(par[1]) + '</td></tr>';
  }).join('');

  var boton = d.url
      ? '<div style="margin-top:22px"><a href="' + d.url + '" style="background:#1DD982;' +
        'color:#00306E;text-decoration:none;font-weight:bold;padding:11px 18px;' +
        'border-radius:8px;display:inline-block">Abrir la solicitud</a></div>'
      : '<p style="margin-top:22px;font-size:12px;color:#8A98B4">La aplicación todavía no ' +
        'conoce su propia dirección, así que este correo no trae enlace. Se arregla ' +
        'abriéndola una vez desde el navegador.</p>';

  return '<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;' +
    'border:1px solid #EDF1F8;border-radius:12px;overflow:hidden">' +
    '<div style="background:#00306E;color:#fff;padding:14px 20px;font-size:15px;' +
    'font-weight:bold">' + esc_(CONFIG.APP_NOMBRE) + '</div>' +
    '<div style="padding:20px">' +
    // El cambio, grande y primero: es lo unico que quien abre el correo
    // necesita leer para saber si tiene que hacer algo.
    '<div style="border-left:4px solid ' + color + ';padding:2px 0 2px 12px;' +
    'margin-bottom:18px">' +
    '<div style="font-size:11px;color:#8A98B4;text-transform:uppercase;' +
    'letter-spacing:.06em">Qué cambió</div>' +
    '<div style="font-size:17px;font-weight:bold;color:' + color + ';' +
    'margin-top:3px">' + esc_(d.titular) + '</div>' +
    '<div style="font-size:13px;color:#5A6B8C;margin-top:4px">' +
    esc_(d.id) + ' · ' + esc_(d.nombre) + '</div></div>' +
    '<table style="width:100%;border-collapse:collapse">' + filas + '</table>' +
    boton +
    '</div></div>';
}

/** Escape de HTML para los correos, que no tienen el esc() del navegador. */
function esc_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ================================================================== */
/* La cola y el resumen agrupado                                       */
/* ================================================================== */

/**
 * Guarda un aviso para que salga en el resumen de la hora.
 *
 * Escribe en una HOJA y no en memoria: si el disparador falla o no corre, el
 * aviso sigue ahi y entra en la pasada siguiente. Un aviso tarde se nota; uno
 * perdido en CacheService, no.
 *
 * @private
 */
function encolarAviso_(d) {
  agregarFila_('Avisos_Pendientes', {
    // Como la auditoria: la marca de tiempo mas un aleatorio, porque dos avisos
    // del mismo milisegundo compartirian ID y el marcado los confundiria.
    ID_Aviso: 'AV-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000),
    Fecha_Hora: new Date(),
    ID_Solicitud: d.id,
    Evento: d.evento,
    Grupo: d.grupo || 'Otros cambios',
    // Se guarda la linea YA ARMADA y no los datos crudos: si se armara al
    // publicar, el resumen describiria el estado de HOY y no el cambio de
    // entonces. Dos movimientos en la misma hora se leerian como uno.
    Resumen: d.id + '  ' + d.nombre + '  ·  ' + (d.resumen || d.titular),
    Usuario: d.quien || '',
    Publicado: 'NO'
  });
}

/**
 * Publica en Chat todo lo encolado y lo marca como publicado.
 *
 * La programa instalarResumenes() cada hora. Si no hay nada pendiente NO publica
 * nada: un espacio con una tarjeta de "0 cambios" cada hora es exactamente el
 * ruido que este diseno existe para evitar.
 *
 * @return {!Object} Para poder ejecutarla a mano y ver que hizo.
 */
function publicarResumenAgrupado() {
  var pendientes;
  try {
    pendientes = leerTabla_('Avisos_Pendientes').filter(function (a) {
      return !esSi_(a.Publicado);
    });
  } catch (e) {
    /* La hoja se crea con actualizarEstructura. Un disparador que revienta cada
       hora llena el buzon del dueno de correos de error; mejor devolver que
       falta el paso. */
    return { ok: false, publicados: 0,
             mensaje: 'La hoja Avisos_Pendientes no existe. Ejecute actualizarEstructura.' };
  }
  if (!pendientes.length) return { ok: true, publicados: 0, mensaje: 'Nada pendiente.' };
  if (!getChatWebhookUrl_()) {
    return { ok: false, publicados: 0,
             mensaje: 'No hay webhook de Google Chat configurado: los ' +
                      pendientes.length + ' avisos siguen en la cola.' };
  }

  // Los mas viejos primero, y con tope: una hora con cientos de movimientos no
  // debe producir una tarjeta que Chat rechace por tamano.
  pendientes.sort(function (a, b) {
    return (aFecha_(a.Fecha_Hora) || 0) - (aFecha_(b.Fecha_Hora) || 0);
  });
  var lote = pendientes.slice(0, TOPE_AVISOS_RESUMEN);

  var porGrupo = {};
  var solicitudes = {};
  lote.forEach(function (a) {
    porGrupo[a.Grupo] = porGrupo[a.Grupo] || [];
    porGrupo[a.Grupo].push(a);
    solicitudes[a.ID_Solicitud] = true;
  });

  var widgets = [];
  Object.keys(porGrupo).forEach(function (g) {
    var lineas = porGrupo[g].map(function (a) {
      return String(a.Resumen) + (a.Usuario ? '  —  ' + a.Usuario : '');
    }).join('\n');
    widgets.push({ decoratedText: { topLabel: g + '  (' + porGrupo[g].length + ')',
                                    text: lineas, wrapText: true } });
  });

  var base = getUrlAplicacion_();
  if (base) {
    widgets.push({ buttonList: { buttons: [{
      text: 'Abrir Gestión',
      onClick: { openLink: { url: base + (base.indexOf('?') === -1 ? '?' : '&') +
                                  'page=gestion' } }
    }] } });
  }

  publicarTarjetaChat_({
    cardsV2: [{
      cardId: 'resumen-' + new Date().getTime(),
      card: {
        header: {
          title: '▸ Movimiento reciente',
          subtitle: lote.length + ' cambio' + (lote.length === 1 ? '' : 's') + ' en ' +
                    Object.keys(solicitudes).length + ' solicitud' +
                    (Object.keys(solicitudes).length === 1 ? '' : 'es') + '  ·  ' +
                    Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'HH:mm')
        },
        sections: [{ widgets: widgets }]
      }
    }]
  });

  /* Se marca DESPUES de publicar, nunca antes: si se marcara primero y la
     publicacion fallara, los avisos quedarian como enviados sin haber salido.
     Y si el marcado falla, se dice: ya se publico y no se puede deshacer, pero
     callarlo significaria republicar lo mismo cada hora. */
  try {
    marcarAvisosPublicados_(lote);
  } catch (e) {
    return { ok: false, publicados: lote.length,
             mensaje: 'Se publicó el resumen pero NO se pudo marcar la cola, así que ' +
                      'se volvería a publicar en la próxima pasada: ' + e.message };
  }

  return { ok: true, publicados: lote.length,
           quedanEnCola: pendientes.length - lote.length,
           grupos: Object.keys(porGrupo).length };
}

/**
 * Marca como publicadas las filas de un lote, en una sola escritura por rango.
 * @private
 */
function marcarAvisosPublicados_(lote) {
  /* Aqui NO se tragan los errores. Si el marcado falla despues de haber
     publicado, los avisos se volverian a publicar en la pasada siguiente, y en
     la siguiente, y en la siguiente: el espacio recibiria el mismo resumen cada
     hora para siempre. Quien llama tiene que enterarse (D-131). */
  var hoja = getHoja_('Avisos_Pendientes');
  if (!hoja) throw new Error('No se encontró la hoja Avisos_Pendientes.');
  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var col = encabezados.indexOf('Publicado') + 1;
  var colId = encabezados.indexOf('ID_Aviso') + 1;
  if (!col || !colId) return;

  var ids = {};
  lote.forEach(function (a) { ids[String(a.ID_Aviso)] = true; });
  var ultima = hoja.getLastRow();
  if (ultima < 2) return;
  var columnaIds = hoja.getRange(2, colId, ultima - 1, 1).getValues();
  var columnaPub = hoja.getRange(2, col, ultima - 1, 1).getValues();
  var cambios = 0;
  for (var i = 0; i < columnaIds.length; i++) {
    if (ids[String(columnaIds[i][0])]) { columnaPub[i][0] = 'SI'; cambios++; }
  }
  if (cambios) hoja.getRange(2, col, ultima - 1, 1).setValues(columnaPub);
}

/**
 * Borra los avisos ya publicados que llevan mas de treinta dias.
 *
 * La hoja es una cola, no una bitacora: la bitacora de lo que paso es
 * Auditoria_Transiciones, que no se borra. Sin esta limpieza la cola crece para
 * siempre y leerla se vuelve lento.
 *
 * @return {!Object}
 */
function limpiarAvisosPublicados() {
  exigirOperador_();
  var hoja;
  try { hoja = getHoja_('Avisos_Pendientes'); }
  catch (e) { return { ok: false, mensaje: 'La hoja Avisos_Pendientes no existe. ' +
                                           'Ejecute actualizarEstructura.' }; }
  var filas = leerTabla_('Avisos_Pendientes');
  var limite = new Date(new Date().getTime() - 30 * 86400000);
  var sobran = filas.filter(function (a) {
    return esSi_(a.Publicado) && (aFecha_(a.Fecha_Hora) || new Date()) < limite;
  });
  // De abajo hacia arriba: borrar de arriba corre las filas de abajo y el
  // siguiente borrado se lleva la fila equivocada.
  sobran.map(function (a) { return a._fila; })
        .sort(function (x, y) { return y - x; })
        .forEach(function (f) { hoja.deleteRow(f); });
  invalidarTabla_('Avisos_Pendientes');
  return { ok: true, borrados: sobran.length };
}

/* ================================================================== */
/* Los dos resumenes periodicos                                        */
/* ================================================================== */

/**
 * Lo que paso en una ventana de dias, leido de la bitacora.
 *
 * Sale de Auditoria_Transiciones y no de la cola de avisos: la cola se vacia y
 * se limpia, la bitacora es completa y no se borra. Un resumen que depende de
 * una cola ya publicada contaria de menos.
 *
 * @param {number} dias Cuantos dias hacia atras.
 * @return {!Object}
 * @private
 */
function movimientoDeLosUltimos_(dias) {
  var desde = new Date(new Date().getTime() - dias * 86400000);
  var datos = cargarDatos_();
  var porId = {};
  datos.solicitudes.forEach(function (s) { porId[s.ID_Solicitud] = s; });
  var fases = mapaFases();

  var aProduccion = [], avances = 0, movidas = {}, bloqueos = [], liberadas = 0;
  datos.auditoria.forEach(function (a) {
    var f = aFecha_(a.Fecha_Hora_Cambio);
    if (!f || f < desde) return;
    var s = porId[a.ID_Solicitud];
    if (String(a.Estado_Destino) === 'EST-04') {
      bloqueos.push({ id: a.ID_Solicitud,
                      nombre: s ? s.Nombre_Solicitud : a.ID_Solicitud });
      return;
    }
    if (String(a.Estado_Origen) === 'EST-04') { liberadas++; return; }
    if (a.Fase_Destino && a.Fase_Origen && a.Fase_Destino !== a.Fase_Origen) {
      avances++;
      movidas[a.ID_Solicitud] = true;
      if (a.Fase_Destino === 'FAS-08') {
        aProduccion.push({ id: a.ID_Solicitud,
                           nombre: s ? s.Nombre_Solicitud : a.ID_Solicitud });
      }
    }
  });

  // Lo que sigue trabado HOY, con la espera mas larga: es el dato que mueve a
  // alguien a actuar, y no sale de la ventana sino del estado actual.
  var trabadas = datos.solicitudes.filter(function (s) {
    return String(s.Estado_Actual) === 'EST-04';
  }).map(function (s) {
    var desdeCuando = aFecha_(s.Fecha_Ultimo_Cambio) || aFecha_(s.Fecha_Registro);
    return { id: s.ID_Solicitud, nombre: s.Nombre_Solicitud,
             fase: fases[s.Fase_Actual] || s.Fase_Actual || '',
             dias: desdeCuando ? (diasHabilesEntre(desdeCuando, new Date()) || 0) : 0,
             causal: nombreDeCausal_(s.Causal_Bloqueo) };
  }).sort(function (a, b) { return b.dias - a.dias; });

  // Y lo que lleva mucho tiempo quieto en su fase sin estar bloqueado: no es un
  // bloqueo declarado, y por eso nadie lo esta mirando.
  var quietas = datos.solicitudesFabrica.filter(function (s) {
    if (FASES_EN_VUELO.indexOf(s.Fase_Actual) === -1) return false;
    if (String(s.Estado_Actual) === 'EST-04') return false;
    var desdeCuando = aFecha_(s.Fecha_Ultimo_Cambio) || aFecha_(s.Fecha_Registro);
    if (!desdeCuando) return false;
    return (diasHabilesEntre(desdeCuando, new Date()) || 0) > 10;
  });

  return {
    dias: dias,
    aProduccion: aProduccion,
    avances: avances,
    solicitudesMovidas: Object.keys(movidas).length,
    bloqueosNuevos: bloqueos,
    liberadas: liberadas,
    trabadas: trabadas,
    quietas: quietas.length,
    sinBitacora: datos.auditoria.length === 0
  };
}

/**
 * La tarjeta de cierre del dia, a Chat.
 * La programa instalarResumenes() a las 17:45 de Bogota.
 * @return {!Object}
 */
function publicarResumenDiario() {
  var m = movimientoDeLosUltimos_(1);
  if (!getChatWebhookUrl_()) {
    return { ok: false, mensaje: 'No hay webhook de Google Chat configurado.' };
  }
  var hoy = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd');
  var lineas = [
    ['Entregado', m.aProduccion.length
        ? m.aProduccion.length + ' llegaron a producción: ' +
          m.aProduccion.map(function (x) { return x.id; }).join(', ')
        : 'nada llegó a producción'],
    ['Avanzó', m.avances
        ? m.avances + ' movimientos de fase en ' + m.solicitudesMovidas + ' solicitudes'
        : 'sin movimientos de fase'],
    ['Se trabó', (m.bloqueosNuevos.length
        ? m.bloqueosNuevos.length + ' bloqueo' + (m.bloqueosNuevos.length === 1 ? '' : 's') +
          ' nuevo' + (m.bloqueosNuevos.length === 1 ? '' : 's')
        : 'ningún bloqueo nuevo') +
        (m.trabadas.length
          ? ' · ' + m.trabadas.length + ' sigue' + (m.trabadas.length === 1 ? '' : 'n') +
            ' trabada' + (m.trabadas.length === 1 ? '' : 's') +
            ' (la más vieja, ' + textoDias_(m.trabadas[0].dias) + ')'
          : '')],
    ['Se liberó', m.liberadas
        ? m.liberadas + ' bloqueo' + (m.liberadas === 1 ? '' : 's') + ' levantado' +
          (m.liberadas === 1 ? '' : 's')
        : 'ninguno']
  ];
  if (m.quietas) {
    lineas.push(['Sin movimiento', m.quietas + ' solicitudes llevan más de 10 días ' +
                                   'hábiles en su fase']);
  }
  /* Si la bitacora esta vacia, "0 movimientos" no es una buena noticia: es que
     no hay con que medirlo, y decir lo contrario es mentir con un cero. */
  if (m.sinBitacora) {
    lineas.push(['Atención', 'La bitácora está vacía: estos ceros significan que no hay ' +
                             'con qué medir, no que no pasó nada.']);
  }

  var widgets = lineas.map(function (par) {
    return { decoratedText: { topLabel: par[0], text: par[1], wrapText: true } };
  });
  var base = getUrlAplicacion_();
  if (base) {
    widgets.push({ buttonList: { buttons: [{ text: 'Abrir el tablero',
      onClick: { openLink: { url: base + (base.indexOf('?') === -1 ? '?' : '&') +
                                  'page=gestion' } } }] } });
  }
  publicarTarjetaChat_({
    cardsV2: [{ cardId: 'diario-' + hoy, card: {
      header: { title: '▸ Cierre del día', subtitle: hoy },
      sections: [{ widgets: widgets }]
    } }]
  });
  return { ok: true, mensaje: 'Resumen del día publicado.', movimiento: m };
}

/**
 * El resumen semanal, por correo, a los Product Owners y Business Owners.
 * La programa instalarResumenes() los lunes a las 7:40 de Bogota.
 * @return {!Object}
 */
function enviarResumenSemanal() {
  var m = movimientoDeLosUltimos_(7);
  var correos = correosDeOwners_();
  if (!correos.length) {
    return { ok: false, mensaje: 'Ningún Product Owner ni Business Owner tiene correo ' +
                                 'registrado: no hay a quién enviarlo.' };
  }

  var filas = [
    ['Llegaron a producción', String(m.aProduccion.length)],
    ['Movimientos de fase', m.avances + ' en ' + m.solicitudesMovidas + ' solicitudes'],
    ['Bloqueos nuevos', String(m.bloqueosNuevos.length)],
    ['Bloqueos levantados', String(m.liberadas)],
    ['Siguen trabadas', String(m.trabadas.length)],
    ['Quietas más de 10 días hábiles', String(m.quietas)]
  ];
  var tabla = filas.map(function (p) {
    return '<tr><td style="padding:6px 14px 6px 0;color:#5A6B8C;font-size:13px">' +
           esc_(p[0]) + '</td><td style="padding:6px 0;font-size:13px;' +
           'font-weight:bold;color:#0D1F3C">' + esc_(p[1]) + '</td></tr>';
  }).join('');

  var detalle = '';
  if (m.trabadas.length) {
    detalle += '<div style="margin-top:20px"><div style="font-size:12px;color:#8A98B4;' +
      'text-transform:uppercase;letter-spacing:.06em">Lo que sigue trabado</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:6px">' +
      m.trabadas.slice(0, 15).map(function (t) {
        return '<tr><td style="padding:4px 10px 4px 0;font-size:13px">' + esc_(t.id) +
          '</td><td style="padding:4px 10px 4px 0;font-size:13px">' + esc_(t.nombre) +
          '</td><td style="padding:4px 0;font-size:12px;color:#B45309">' +
          esc_(textoDias_(t.dias)) + ' · ' + esc_(t.causal) + '</td></tr>';
      }).join('') + '</table></div>';
  }
  if (m.aProduccion.length) {
    detalle += '<div style="margin-top:20px"><div style="font-size:12px;color:#8A98B4;' +
      'text-transform:uppercase;letter-spacing:.06em">Entregado a producción</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:6px">' +
      m.aProduccion.map(function (x) {
        return '<tr><td style="padding:4px 10px 4px 0;font-size:13px">' + esc_(x.id) +
          '</td><td style="padding:4px 0;font-size:13px">' + esc_(x.nombre) +
          '</td></tr>';
      }).join('') + '</table></div>';
  }
  if (m.sinBitacora) {
    detalle += '<p style="margin-top:18px;font-size:12px;color:#B45309">La bitácora está ' +
      'vacía: los ceros de arriba significan que no hay con qué medir, no que no pasó nada.</p>';
  }

  var base = getUrlAplicacion_();
  var boton = base
      ? '<div style="margin-top:22px"><a href="' + base + '" style="background:#1DD982;' +
        'color:#00306E;text-decoration:none;font-weight:bold;padding:11px 18px;' +
        'border-radius:8px;display:inline-block">Abrir la aplicación</a></div>'
      : '';

  MailApp.sendEmail({
    to: correos.join(','),
    subject: 'Resumen semanal · ' +
             Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyy-MM-dd'),
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;' +
      'border:1px solid #EDF1F8;border-radius:12px;overflow:hidden">' +
      '<div style="background:#00306E;color:#fff;padding:14px 20px;font-size:15px;' +
      'font-weight:bold">' + esc_(CONFIG.APP_NOMBRE) + '</div>' +
      '<div style="padding:20px">' +
      '<p style="font-size:14px;color:#0D1F3C;margin:0 0 16px">Movimiento de los ' +
      'últimos siete días.</p>' +
      '<table style="width:100%;border-collapse:collapse">' + tabla + '</table>' +
      detalle + boton + '</div></div>'
  });
  return { ok: true, destinatarios: correos.length, movimiento: m };
}

/**
 * Los correos de los Product Owners y Business Owners de las iniciativas.
 * @private
 */
function correosDeOwners_() {
  var correos = [];
  var usuarios = {};
  leerTabla_('Usuarios').forEach(function (u) { usuarios[u.ID_Usuario] = u; });
  leerTabla_('Proyectos').forEach(function (p) {
    [p.PO_Usuario, p.BO_Usuario].forEach(function (id) {
      if (!id) return;
      var u = usuarios[id];
      var c = u ? String(u.Correo_ID || '').trim() : '';
      if (c && correos.indexOf(c) === -1) correos.push(c);
    });
  });
  return correos;
}

/* ================================================================== */
/* Instalar los disparadores y diagnosticar                            */
/* ================================================================== */

/**
 * Programa los tres disparadores de los resumenes.
 *
 * Se ejecuta UNA vez a mano desde el editor, igual que instalarCalentamiento.
 * Borra antes los suyos para no acumular copias si se corre dos veces.
 *
 * Las horas no son en punto a proposito: los disparadores de Apps Script que
 * caen a la hora exacta compiten con los de todo el mundo y se atrasan.
 *
 * @return {!Object}
 */
function instalarResumenes() {
  exigirOperador_();
  var previos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (DISPARADORES_AVISOS.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
      previos++;
    }
  });

  ScriptApp.newTrigger('publicarResumenAgrupado').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('publicarResumenDiario').timeBased()
      .atHour(17).nearMinute(45).inTimezone(CONFIG.ZONA_HORARIA).everyDays(1).create();
  ScriptApp.newTrigger('enviarResumenSemanal').timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(7).nearMinute(40).inTimezone(CONFIG.ZONA_HORARIA).create();

  var resultado = {
    ok: true,
    disparadoresAnterioresBorrados: previos,
    programados: ['agrupado cada hora', 'cierre del día 17:45', 'semanal lunes 7:40'],
    mensaje: 'Listo. Puede verlos en Activadores (el reloj del menú de la izquierda).'
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Quita los disparadores de los resumenes.
 * @return {!Object}
 */
function desinstalarResumenes() {
  exigirOperador_();
  var borrados = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (DISPARADORES_AVISOS.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
      borrados++;
    }
  });
  var resultado = { ok: true, borrados: borrados,
    mensaje: borrados ? 'Resúmenes desprogramados.' : 'No había resúmenes programados.' };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Dice a cuanta gente REAL llega hoy cada evento, y por que no llega al resto.
 *
 * Existe porque creer que se esta avisando cuando no, es peor que no avisar: el
 * correo corporativo esta pendiente (S-12) y el Product Owner esta sin asignar
 * en las 39 iniciativas (S-17), asi que varias filas de la tabla de
 * destinatarios hoy no le llegan a nadie. Esto lo dice antes de que alguien lo
 * descubra echando de menos un aviso.
 *
 * @return {!Object}
 */
function diagnosticoNotificaciones() {
  exigirOperador_();
  var solicitudes = leerTabla_('Solicitudes');
  var eventos = Object.keys(EVENTOS_NOTIFICACION);
  var porEvento = {};

  eventos.forEach(function (ev) {
    var conDestino = 0, sumaCorreos = 0, motivos = {};
    solicitudes.forEach(function (s) {
      var r = destinatariosDeEvento_(s, ev, { faseOrigen: s.Fase_Actual,
                                              faseDestino: s.Fase_Actual });
      if (r.correos.length) { conDestino++; sumaCorreos += r.correos.length; }
      r.faltan.forEach(function (f) { motivos[f] = (motivos[f] || 0) + 1; });
    });
    porEvento[ev] = {
      urgencia: EVENTOS_NOTIFICACION[ev].urgencia,
      va: EVENTOS_NOTIFICACION[ev].urgencia === 'nunca' ? 'resumen agrupado' : 'al instante',
      solicitudesConAlgunDestinatario: conDestino,
      solicitudesSinNadie: solicitudes.length - conDestino,
      promedioDestinatarios: conDestino ? Math.round(sumaCorreos / conDestino * 10) / 10 : 0,
      porQueFaltan: motivos
    };
  });

  var pendientes = 0;
  try {
    pendientes = leerTabla_('Avisos_Pendientes').filter(function (a) {
      return !esSi_(a.Publicado);
    }).length;
  } catch (e) { pendientes = -1; }   // la hoja todavia no existe

  var programados = {};
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var f = t.getHandlerFunction();
      if (DISPARADORES_AVISOS.indexOf(f) !== -1) programados[f] = true;
    });
  } catch (e) { /* sin permiso para leerlos no es un error del diagnostico */ }

  var resultado = {
    solicitudes: solicitudes.length,
    chatConfigurado: !!getChatWebhookUrl_(),
    correoActivo: !!CONFIG.NOTIFICAR_CORREO,
    chatActivo: !!CONFIG.NOTIFICAR_CHAT,
    urlParaLosEnlaces: getUrlAplicacion_() || '(la aplicación todavía no la conoce)',
    hojaDeLaCola: pendientes === -1 ? 'no existe: ejecute actualizarEstructura'
                                    : pendientes + ' avisos esperando',
    disparadoresProgramados: DISPARADORES_AVISOS.map(function (f) {
      return f + ': ' + (programados[f] ? 'sí' : 'NO');
    }),
    porEvento: porEvento
  };
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/* ================================================================== */
/* Que cambio al editar                                               */
/* ================================================================== */

/**
 * Los campos que de verdad cambiaron y merecen aviso, con su antes y su despues
 * ya traducidos a nombres.
 *
 * Compara solo los de CAMPOS_AVISAN_EDICION. Lo demas cambia sin avisar a
 * proposito: las doce columnas de fecha por fase se estan diligenciando hacia
 * atras, y un aviso por celda es la forma mas rapida de que se dejen de leer los
 * avisos.
 *
 * @return {!Array<{nombre: string, antes: string, despues: string}>} Vacio si no
 *     cambio nada relevante, y entonces notificar_ no manda nada.
 * @private
 */
function camposQueCambiaron_(antes, despues) {
  var cambios = [];
  CAMPOS_AVISAN_EDICION.forEach(function (c) {
    var a = antes[c.campo], b = despues[c.campo];
    if (sonElMismoValor_(a, b)) return;
    cambios.push({
      campo: c.campo,
      nombre: c.nombre,
      antes: traducirValor_(c, a),
      despues: traducirValor_(c, b)
    });
  });
  return cambios;
}

/**
 * Si dos valores son el mismo para efectos del aviso.
 *
 * Las fechas llegan como Date desde la hoja y como texto desde el formulario, y
 * comparandolos crudos TODA edicion parecia cambiar la fecha de compromiso.
 * @private
 */
function sonElMismoValor_(a, b) {
  var fa = aFecha_(a), fb = aFecha_(b);
  if (fa && fb) return soloFecha_(fa) === soloFecha_(fb);
  var ta = a === null || a === undefined ? '' : String(a).trim();
  var tb = b === null || b === undefined ? '' : String(b).trim();
  return ta === tb;
}

/**
 * Un valor con el nombre que lee una persona: "Crítica", no "PRI-01".
 * @private
 */
function traducirValor_(def, valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return '';
  if (!def.catalogo) return valor;
  var id = String(valor).trim();
  // El catalogo se lee de la HOJA: uno editado desde Administracion tiene que
  // salir con su nombre nuevo, no con el de la lista del codigo.
  var mapas = {
    Prioridad: function () { return mapaCatalogo_(PRIORIDADES); },
    Usuarios: function () {
      var m = {};
      leerTabla_('Usuarios').forEach(function (u) { m[u.ID_Usuario] = u.Nombre_Completo; });
      return m;
    },
    Analistas: function () { return mapaCatalogo_(getAnalistas_()); },
    Proyectos: function () {
      var m = {};
      leerTabla_('Proyectos').forEach(function (p) { m[p.ID_Proyecto] = p.Nombre_Proyecto; });
      return m;
    },
    Plataforma_Digital: function () { return mapaPlataformas(); }
  };
  var mapa = mapas[def.catalogo] ? mapas[def.catalogo]() : {};
  return mapa[id] || id;
}
