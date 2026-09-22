/**
 * normalizar-credencial.js
 *
 * clasp guarda la credencial en dos formatos distintos segun su version:
 *
 *   clasp 2.x  { "token": { access_token, refresh_token, ... },
 *                "oauth2ClientSettings": { clientId, clientSecret, redirectUri } }
 *
 *   clasp 3.x  { "tokens": { "default": { client_id, client_secret,
 *                                         refresh_token, type } } }
 *
 * Cloud Shell suele instalar la version mas nueva, mientras que el flujo de
 * despliegue usa la 2.4.2 por estabilidad. Si se entrega el formato nuevo, la
 * 2.4.2 falla con "Cannot read properties of undefined (reading 'access_token')".
 *
 * Este script detecta el formato recibido y lo deja siempre en el que espera
 * clasp 2.4.2, para que la persona no tenga que repetir la autorizacion.
 */

var fs = require('fs');
var ruta = process.env.HOME + '/.clasprc.json';

function morir(mensaje, instruccion) {
  console.error('CREDENCIAL INVALIDA: ' + mensaje);
  console.error(instruccion);
  console.error('El procedimiento completo esta en docs/IMPLEMENTACION.md, parte 2, camino A.');
  process.exit(1);
}

var datos;
try {
  datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
} catch (e) {
  morir('el secreto CLASP_CREDENTIALS no es un JSON valido.',
        'Copie TODO lo que imprime "cat ~/.clasprc.json", desde la llave de apertura ' +
        'hasta la de cierre, y vuelva a guardar el secreto.');
}

// Formato de clasp 3: se traduce al de clasp 2.
if (!datos.token && datos.tokens) {
  var perfil = datos.tokens.default ||
               datos.tokens[Object.keys(datos.tokens)[0]];
  if (!perfil || !perfil.refresh_token) {
    morir('la credencial no trae refresh_token.',
          'Vuelva a ejecutar "clasp login" en Cloud Shell y copie el archivo completo.');
  }
  datos = {
    token: {
      access_token: perfil.access_token || '',
      refresh_token: perfil.refresh_token,
      scope: perfil.scope ||
             'https://www.googleapis.com/auth/script.projects ' +
             'https://www.googleapis.com/auth/script.deployments ' +
             'https://www.googleapis.com/auth/drive.file ' +
             'https://www.googleapis.com/auth/service.management ' +
             'https://www.googleapis.com/auth/logging.read ' +
             'https://www.googleapis.com/auth/userinfo.email ' +
             'https://www.googleapis.com/auth/cloud-platform',
      token_type: 'Bearer',
      // Expirado a proposito: obliga a pedir un token nuevo con el refresh_token.
      expiry_date: 1
    },
    oauth2ClientSettings: {
      clientId: perfil.client_id || '',
      clientSecret: perfil.client_secret || '',
      redirectUri: 'http://localhost'
    },
    isLocalCreds: false
  };
  fs.writeFileSync(ruta, JSON.stringify(datos));
  console.log('Credencial convertida del formato de clasp 3 al de clasp 2.4.2.');
}

if (!datos.token || !datos.token.refresh_token) {
  morir('no se encontro el refresh_token dentro de la credencial.',
        'Repita la autorizacion y copie el archivo completo.');
}
if (!datos.oauth2ClientSettings || !datos.oauth2ClientSettings.clientId) {
  morir('la credencial no trae los datos del cliente OAuth (clientId).',
        'Instale la version fija con "npm install -g @google/clasp@2.4.2", repita ' +
        '"clasp login" y copie de nuevo el archivo.');
}

// Un access_token vencido no es problema: clasp lo renueva con el refresh_token.
// Forzarlo evita usar uno caducado que haya quedado guardado.
if (!datos.token.access_token) {
  datos.token.expiry_date = 1;
  fs.writeFileSync(ruta, JSON.stringify(datos));
}

console.log('Credencial lista para clasp 2.4.2.');
