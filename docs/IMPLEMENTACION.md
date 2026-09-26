# Guía de implementación

Pensada para hacerse **sin conocimientos técnicos**, desde tu cuenta corporativa de Google.
Cada parte se hace una sola vez, salvo la última.

Tiempo estimado: **45 minutos** la primera vez.

> Necesitas permiso para crear archivos en la Unidad Compartida y para publicar aplicaciones
> web de Apps Script. Si tu organización lo restringe, pídeselo al administrador de Google
> Workspace antes de empezar.

---

## Parte 1 · Crear el proyecto en Google (5 min)

1. Entra a **[script.google.com](https://script.google.com)** con tu correo corporativo.
2. Clic en **Nuevo proyecto**.
3. Arriba a la izquierda, donde dice *Proyecto sin título*, clic y escribe:
   `Sistema de Gestión de Plataformas Digitales`.
4. En el menú lateral izquierdo, clic en el engranaje **Configuración del proyecto**.
5. Marca la casilla **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
6. En esa misma pantalla, busca **ID de la secuencia de comandos** y cópialo a un bloc de
   notas. Lo vas a necesitar más adelante. Se ve así: `1a2B3c...` (unos 57 caracteres).

---

## Parte 2 · Llevar el código de GitHub a Google

Tienes tres caminos. **Te recomiendo el A**: se configura una vez y después cada cambio que
yo haga en el repositorio llega solo a Google.

### Camino A · Automático (recomendado)

Una vez configurado, **no tienes que hacer nada más**: cada vez que actualicemos el código en
GitHub, se publica solo en tu proyecto de Google.

> En el paso A.2 vas a ver una página de error con la dirección `localhost:8888`. **Es parte
> del procedimiento**, no es una falla: el paso 9 explica qué hacer con ella.

**A.1 · Habilitar la API de Apps Script**

1. Entra a **[script.google.com/home/usersettings](https://script.google.com/home/usersettings)**.
2. Activa el interruptor **API de Google Apps Script**.

**A.2 · Obtener la credencial (se hace en el navegador, no instalas nada)**

1. Entra a **[shell.cloud.google.com](https://shell.cloud.google.com)** con tu correo
   corporativo. Es una terminal que Google te presta dentro del navegador.
2. Acepta el mensaje de bienvenida. Cuando veas la línea que termina en `$`, escribe esto y
   presiona Enter:

   ```
   npm install -g @google/clasp
   ```

3. Espera a que termine (1–2 minutos) y escribe **exactamente esto** (sin `--no-localhost`):

   ```
   clasp login
   ```

4. Te muestra un enlace largo y la terminal **se queda esperando**. Es normal: no la cierres
   ni presiones nada ahí.
5. Copia el enlace, ábrelo en otra pestaña del navegador y autoriza con tu cuenta corporativa.
6. **La página te va a dar error** (*No se puede acceder a este sitio*, `localhost:8888`).
   Eso es lo esperado: esa dirección vive dentro de la terminal de Google, no en tu
   computador. **No cierres esa pestaña.**
7. Copia la **dirección completa** de la barra de direcciones de esa pestaña con error.
   Empieza por `http://localhost:8888/?code=` y sigue con un texto muy largo.
8. Vuelve a la pestaña de la terminal y **abre una segunda terminal**: botón **+** en la
   barra superior de Cloud Shell.
9. En esa terminal nueva escribe `curl ` (con el espacio), pega la dirección **entre comillas
   dobles** y presiona Enter. Queda así:

   ```
   curl "http://localhost:8888/?code=4/0AX4...&scope=https://www.googleapis..."
   ```

   > Las comillas son obligatorias: sin ellas la dirección se corta y falla.
   > Hazlo dentro de los 2 minutos siguientes: el código se vence rápido. Si se venció,
   > repite desde el paso 3.

10. En la **primera** terminal debe aparecer *Authorization successful* o
    *Logged in as tu.correo@empresa.com*. Ya puedes cerrar la segunda.
11. En la primera terminal escribe:

    ```
    cat ~/.clasprc.json
    ```

12. Selecciona **todo** lo que imprime (empieza con `{` y termina con `}`) y cópialo.

> Ese texto es una llave de acceso a tu cuenta: trátalo como una contraseña. Va a quedar
> guardado cifrado en GitHub y no se puede volver a leer una vez guardado.

**A.3 · Guardar los secretos en GitHub**

1. Entra al repositorio **cjpinto17/gestionproyectos** en GitHub.
2. Clic en **Settings** (arriba) → en el menú izquierdo, **Secrets and variables** →
   **Actions**.
3. Botón **New repository secret**. Crea estos dos:

   | Name | Secret |
   | --- | --- |
   | `CLASP_CREDENTIALS` | el texto completo que copiaste en el paso A.2.6 |
   | `SCRIPT_ID` | el ID que copiaste en la Parte 1, paso 6 |

4. Listo. Desde ahora, cada cambio en la carpeta `apps-script/` se publica solo.

**A.4 · Probar que funciona**

1. En GitHub, pestaña **Actions** → en la izquierda, **Desplegar en Google Apps Script**.
2. Botón **Run workflow** → **Run workflow**.
3. Al minuto debe aparecer un chulo verde. Vuelve a tu proyecto de Apps Script, recarga la
   página y verás todos los archivos.

Si sale un error rojo, ábrelo y léeme el mensaje: casi siempre es que falta activar la API
(paso A.1) o que el secreto se pegó incompleto.

### Camino B · Un botón dentro del editor de Google

Si tu organización no permite lo anterior, existe una extensión de Chrome llamada
**Google Apps Script GitHub Assistant** (de la tienda de extensiones de Chrome). Al
instalarla aparece un menú de GitHub dentro del editor de Apps Script, donde eliges el
repositorio y la rama `claude/project-management-system-w58l3v` y presionas **Pull** para
traer el código. Cada actualización es un clic.

Es una extensión de un tercero, no de Google. Consúltalo con seguridad informática antes de
instalarla.

### Camino C · Copiar y pegar (sin configurar nada)

Sirve para salir del paso, pero hay que repetirlo con cada cambio.

En el editor de Apps Script, por cada archivo de la carpeta `apps-script/` del repositorio:
**+ Archivo** → elige **Secuencia de comandos** (para los `.gs`) o **HTML** (para los
`.html`) → nómbralo **igual, sin la extensión** → abre el archivo en GitHub, botón *Copy raw
file*, y pega.

Son 17 archivos. El manifiesto `appsscript.json` no se crea: se reemplaza su contenido.

---

## Parte 3 · Encender el sistema (10 min)

Todo esto se hace desde el editor de Apps Script, con el código ya cargado.

1. En la lista desplegable de arriba (dice *Seleccionar función*), elige **`setupInicial`** y
   presiona **Ejecutar**.
2. La primera vez Google pide permisos:
   - **Revisar permisos** → elige tu cuenta.
   - Si sale *Google no ha verificado esta aplicación*: **Configuración avanzada** → **Ir a
     Sistema de Gestión de Plataformas Digitales (no seguro)**. Es tu propio proyecto, no hay
     riesgo.
   - **Permitir**.
3. Espera el mensaje *Ejecución completada*. Acabas de crear:

   > Si la ejecución se interrumpe a la mitad, **vuelve a ejecutar `setupInicial`**: está hecha
   > para repetirse sin duplicar nada. Reutiliza lo que ya existe y crea solo lo que falta.

   - Los dos archivos de Google Sheets, con sus 17 hojas y los catálogos.
   - La plantilla del formato de requerimiento.
4. Elige la función **`cargarDatosIniciales`** y presiona **Ejecutar**. Esto carga las 8
   plataformas y las 39 iniciativas del portafolio.
5. Elige **`validarInstalacion`** y presiona **Ejecutar**. Luego abre **Registros de
   ejecución** (abajo): debe decir `problemas: []`. Si lista algo, mándamelo.
6. Para ver los archivos creados: menú **Ver → Registros**, ahí aparecen los enlaces de los
   dos Google Sheets.

### Cuando una versión nueva agrega una tabla o una columna

Sobre un sistema **ya instalado y con datos** no hace falta volver a correr el instalador: se
ejecuta **`actualizarEstructura`** desde el editor de Apps Script, igual que las anteriores.
Crea las hojas que falten y agrega las columnas que falten, cada una en su posición, y en
**Registros de ejecución** reporta exactamente qué agregó.

Lo que **no** hace, a propósito: no renombra, no reordena, no borra y no siembra datos. Una
columna que el sistema ya no usa se queda quieta en la hoja con su contenido; si algún día se
quiere eliminar de verdad, se borra a mano desde Google Sheets después de revisar que no tenga
nada que valga la pena.

Se puede ejecutar las veces que sea: la segunda vez no hace nada.

### Permisos por rol

Se configuran desde la aplicación: **Administración → Configurar permisos**. Ocupa la página
entera: los permisos en las filas, los once roles en las columnas. Se marca lo que cada rol puede
hacer y se presiona **Guardar permisos**. El enlace *todos* al final de cada fila marca o desmarca
ese permiso para todos los roles a la vez.

Nada se guarda hasta presionar el botón, así que se puede probar sin miedo. Si intenta salir con
cambios sin guardar, la aplicación se lo advierte.

Mientras no se guarde por primera vez, la aplicación usa los valores de fábrica, que son
exactamente lo que hacía antes de que esto fuera configurable. La pantalla lo avisa.

Dos cosas que el sistema no deja hacer, a propósito: dejar la aplicación sin ningún rol que
administre, y quitarle la administración al rol de quien está guardando. Para ceder la
administración, cambie de rol al usuario en la tabla `Usuarios`.

Cuando además hay que **mover datos** de una columna vieja a una nueva, la versión trae una
función aparte para eso y se dice al publicar. Hoy hay una: **`unificarAlcanceSolicitudes`** (archivo **`Mantenimiento.gs`**), que
pasa a `Alcance` lo que estaba escrito en `Objetivo` y `Entregable`. Se ejecuta primero sin nada
entre paréntesis para ver qué haría, y luego con `true` entre paréntesis para aplicarlo.

---

## Parte 4 · Configurar las notificaciones y el dominio (5 min)

1. **Webhook de Google Chat**: abre el espacio de Chat donde quieres recibir los avisos →
   flecha junto al nombre del espacio → **Apps y integraciones** → **Webhooks** →
   **Agregar webhook** → nómbralo `Plataformas Digitales` → **Guardar** → copia la URL.
2. En el editor de Apps Script, abre el archivo **`Config.gs`**, y **sin modificar nada**,
   ve a la lista de funciones, elige **`guardarConfiguracion_`**… *no*: esta función necesita
   datos. Hazlo así de simple:
   - Menú **+ Archivo → Secuencia de comandos**, nómbralo `Temporal`.
   - Pega esto, reemplazando los dos valores por los tuyos:

     ```javascript
     function configurar() {
       guardarConfiguracion_({
         CHAT_WEBHOOK_URL: 'PEGA_AQUI_LA_URL_DEL_WEBHOOK',
         DOMINIO_CORPORATIVO: 'tuempresa.com.co'
       });
     }
     ```

   - Elige la función **`configurar`** y presiona **Ejecutar**.
   - Cuando termine, puedes borrar el archivo `Temporal`.
3. Para verificar: ejecuta **`diagnosticoConfiguracion`** y revisa los registros. Debe decir
   `chatWebhookConfigurado: true`.

### Qué avisa la aplicación

| Cuándo | Canal | A quién |
| --- | --- | --- |
| Se registra una solicitud | Chat + correo | Solicitante y responsable |
| Una solicitud cambia de fase | Chat + correo | Solicitante y responsable |
| Se marca un bloqueo | Chat + correo | Solicitante y responsable |
| **Alguien comenta una solicitud** | Correo | Solicitante, responsable y quien ya haya comentado ahí |
| **Alguien comenta una iniciativa** | Correo | Business Owner, Product Owner y quien ya haya comentado ahí |
| Correo de bienvenida (lo dispara el administrador) | Correo | El usuario, con copia a quien lo envía |
| Código de acceso (ingreso por correo) | Correo | Quien lo pide |

Los avisos de comentario **nunca le llegan al autor**, ni a un usuario inactivo, ni a uno sin correo
registrado, ni a quien no tenga permiso de ver esa sección.

Los tres interruptores generales están en **`Config.gs`**: `NOTIFICAR_CHAT`, `NOTIFICAR_CORREO` y
`NOTIFICAR_COMENTARIOS`. El de comentarios va aparte porque es de otra naturaleza: los tres
primeros son hechos del proceso y un comentario es una conversación.

**Para que los correos lleven el enlace directo** hace falta que la aplicación sepa su propia
dirección. Para saber si ya la sabe, ejecute **`verUrlAplicacion`** (archivo **`Config.gs`**): si
los registros muestran una dirección, no hay nada que hacer.

Si no la sabe, ejecute **`configurarUrlAplicacion`** (mismo archivo), **sin escribir nada**: la
averigua sola de la implementación publicada. Sin esto los correos salen igual, pero sin el botón
para abrir la solicitud.

### Enlaces directos

Se puede enlazar a una solicitud o a una iniciativa concreta agregando `&id=` a la dirección:

- `…/exec?page=gestion&id=SOL-0042` abre el tablero y el detalle de esa solicitud.
- `…/exec?page=iniciativas&id=INI-004` abre Seguimiento con esa iniciativa desplegada.

Es lo que usan los correos de comentario, y sirve igual para pegar en un chat o en un correo propio.

---

## Parte 5 · Publicar la aplicación (5 min)

1. Botón azul **Implementar** (arriba a la derecha) → **Nueva implementación**.
2. En el engranaje junto a *Seleccionar tipo*, elige **Aplicación web**.
3. Llena así:
   - **Descripción**: `Versión 1`
   - **Ejecutar como**: **Usuario que accede a la aplicación web**
     *(esto es lo que hace que cada persona entre con su propio usuario y permisos)*
   - **Quién tiene acceso**: **Cualquier usuario de tu organización**
4. **Implementar** → copia la **URL de la aplicación web**. Esa es la dirección que le
   compartes al equipo.
5. *(Opcional, para el Camino A)* En la misma ventana verás el **ID de implementación**.
   Guárdalo como un tercer secreto en GitHub con el nombre `DEPLOYMENT_ID`: así cada cambio
   no solo sube el código, sino que actualiza la aplicación que usa el equipo.

---

## Parte 5.1 · La URL estable, y cómo publicarla en Google Sites

### Lo primero: la URL no tiene por qué cambiar

La dirección de la aplicación **solo cambia cuando se crea una implementación nueva**. Si en
lugar de eso se actualiza la existente, la URL es la misma para siempre:

**Implementar → Administrar implementaciones →** el lápiz de la implementación activa **→
Versión: Nueva → Implementar**

Ese es el camino correcto para publicar cada cambio. *Nueva implementación* se usa una sola
vez, el primer día.

Si configuró el secreto `DEPLOYMENT_ID` (Parte 2, paso A.3), esto ya ocurre solo: el flujo de
GitHub actualiza esa misma implementación en cada cambio y usted no entra al editor.

### Publicarla en Google Sites

Aun con URL estable, un sitio de Google le da una dirección corta, con el nombre de la
compañía, y le permite acompañar la aplicación con instrucciones o enlaces. La aplicación ya
está preparada para ir embebida.

1. Entre a **[sites.google.com](https://sites.google.com)** y cree un sitio nuevo.
2. Póngale nombre: `Gestión de Plataformas Digitales`.
3. En el panel derecho, pestaña **Insertar** → botón **Insertar** (el del icono `<>`).
4. Elija la pestaña **Por URL** y pegue la **URL de la aplicación web** (la que termina en
   `/exec`). **Insertar**.
5. Estire el marco hasta ocupar todo el ancho y unos **900 px de alto**: la aplicación trae su
   propio desplazamiento interno, pero con poco alto el tablero se ve apretado.
6. Para ganar espacio: engranaje de la página → desactive el encabezado, o póngalo en modo
   **Solo título**. En el tema, elija el ancho **completo**.
7. Botón **Publicar** (arriba a la derecha). En *Quién puede ver*, elija **Cualquier usuario
   de su organización**, no público.
8. Comparta con el equipo la dirección del sitio, no la del `/exec`.

### Qué tener en cuenta

- **Cada persona entra con su propia cuenta.** El sitio no cambia eso: la aplicación sigue
  reconociendo al usuario y aplicando su rol.
- **Si el marco aparece en blanco**, casi siempre es el bloqueo de cookies de terceros del
  navegador. Solución: permitir cookies para `googleusercontent.com`, o abrir la aplicación en
  pestaña aparte. Conviene dejar en el sitio un enlace de respaldo a la URL `/exec`.
- **La primera vez** que alguien entra, Google le pide autorizar la aplicación. Eso ocurre una
  sola vez por persona y no se puede hacer desde dentro del marco: si se queda trabada, que
  abra la URL `/exec` directamente, autorice, y vuelva al sitio.
- **El sitio no guarda datos**: es solo la ventana. Todo sigue viviendo en las hojas de
  cálculo y en Drive.

### Si el botón de editar la implementación no funciona

Pasa, y hay salida. Primero, las tres trampas frecuentes:

1. **El lápiz está arriba a la derecha de la tarjeta** de la implementación, no junto al
   nombre. Es fácil no verlo y terminar en *Nueva implementación*.
2. Al abrirlo, el desplegable **Versión** muestra un número (1, 2, 3…). Hay que abrirlo y
   elegir **Nueva versión**, que aparece *arriba* de los números. Elegir un número existente
   no publica nada nuevo.
3. Si la lista **no ofrece "Nueva versión"**, casi siempre es porque esa implementación es de
   tipo **Prueba** (URL terminada en `/dev`) y no una aplicación web, o porque el proyecto lo
   creó otra cuenta y usted no es el propietario.

Y si aun así no se deja, hay dos caminos que **no pasan por ese botón**:

- **Publicar desde GitHub.** Con el secreto `DEPLOYMENT_ID` configurado (Parte 2, paso A.3),
  cada cambio actualiza esa misma implementación, con la misma URL, sin abrir el editor.
- **Repartir la dirección del sitio y no la del `/exec`.** Si algún día toca crear una
  implementación nueva, usted cambia el enlace dentro del sitio en medio minuto y el equipo no
  se entera. Esta es la razón de fondo para montar el sitio aunque la URL hoy sea estable: es
  lo único que hace que un error de implementación no cueste reenviarle el enlace a todo el
  mundo.

## Parte 5.2 · Quién puede entrar, y cómo

La aplicación **no corre a nombre de cada persona sino de la cuenta que la publica**. Eso
significa que nadie más necesita —ni tiene— acceso a las hojas de cálculo: se entra por la
aplicación o no se entra. Es lo que permite dar acceso a gente de fuera de la compañía sin
abrirles los archivos.

Hay dos formas de identificarse, y la aplicación elige sola:

- **Gente de la compañía.** Google la reconoce por el dominio y entra directo, sin escribir
  nada. Igual que siempre.
- **Gente de fuera.** Escribe su correo, recibe un **código de 6 dígitos en ese buzón**, lo
  escribe y entra. El código vence en 10 minutos, sirve una sola vez y admite 3 intentos.

En los dos casos **la hoja de Usuarios sigue mandando**: quien no esté registrado y activo no
entra, aunque Google lo reconozca o acierte el código. Y hay una segunda condición: el correo
debe ser **del dominio de la compañía o de un dominio aliado** (hoy, `hexasolutions.co`). Un
correo personal registrado por error en la hoja no entra.

Para sumar un aliado sin publicar una versión nueva, ejecute desde el editor:

```javascript
function agregarAliado() {
  guardarConfiguracion_({ DOMINIOS_ALIADOS: 'hexasolutions.co,otroproveedor.com' });
}
```

> **Hoy el segundo camino está dormido.** El Workspace de la compañía prohíbe publicar
> aplicaciones accesibles a cuentas externas, así que la aplicación sigue restringida al
> dominio y la fábrica de software no puede llegar a la pantalla de ingreso. El mecanismo está
> construido y probado; se activa cambiando una línea el día que TI levante la restricción o
> se decida darle cuentas corporativas a la fábrica (ver D-53).

### Cerrar las hojas de cálculo

El cambio de código **habilita** cerrarlas, pero no las cierra. Mientras sigan compartidas con
todo el dominio, cualquiera puede abrirlas y editar datos por fuera de la aplicación: sin
control de roles, sin validaciones y sin bitácora.

Para cerrarlas, en Drive, sobre **cada uno de los dos archivos** (`Parametrizacion_...` y
`Gestion_Proyectos_...`): **Compartir** → quite el acceso general del dominio y déjelo en
**Restringido**. Solo la cuenta que publica la aplicación necesita seguir con acceso de editor.

Hágalo **después** de confirmar que la aplicación funciona con la publicación nueva, no antes.

### Si necesita sacar a alguien

Póngalo en **Activo = NO** en la hoja de Usuarios. No podrá entrar ni recibir códigos. Si
además quiere cortar las sesiones que ya estén abiertas, ejecute
**`cerrarTodasLasSesiones`** desde el editor: todos tendrán que identificarse de nuevo.

---

## Parte 6 · Dar de alta a las personas (5 min)

Al entrar por primera vez verás el mensaje *"Su correo no está asociado a ningún usuario del
sistema"*. Es la señal de que **la aplicación quedó bien publicada**: te reconoció, leyó la
hoja de Usuarios y no te encontró. Falta registrarte.

**Forma rápida (recomendada):**

1. Vuelve al editor de Apps Script.
2. Abre el archivo **`Setup.gs`**.
3. En el desplegable de funciones elige **`registrarmeComoAdministrador`** y presiona
   **Ejecutar**.
4. Recarga la aplicación web. Ya entras, y verás la pestaña **Admin**.

Esa función te crea con rol **Administrador** usando el correo de tu sesión. Se puede repetir
sin problema: si ya existes, solo se asegura de que estés activo y con ese rol.

**Forma manual**, si prefieres verlo en la hoja: abre el Google Sheets
**Parametrizacion_Plataformas_Completo**, ve a la pestaña **Usuarios** y agrega tu fila:

| ID_Usuario | Nombre_Completo | Correo_ID | Cargo | Area | Rol_ID | Activo |
| --- | --- | --- | --- | --- | --- | --- |
| USR-003 | Tu nombre | tu.correo@empresa.com | Gerente | Plataformas Digitales | RO-08 | SI |

`RO-08` es **Administrador**. Los demás roles están en la hoja `Roles`.

**De aquí en adelante no vuelvas a tocar el Sheets**: desde la pestaña Admin creas usuarios,
les asignas rol y administras todos los catálogos.

> Recuerda: una persona **sin correo** también se puede registrar (por ejemplo un Business
> Owner que aún no tiene cuenta). Queda asignable en las iniciativas, pero no podrá entrar a
> la aplicación hasta que le completes el correo.

---

## Parte 7 · El día a día

| Quiero… | Dónde |
| --- | --- |
| Crear una actividad | Pestaña **Gestión** → botón **+ Nueva Actividad** |
| Cargar muchas actividades de una vez | Editor → `CargaMasiva.gs` → `prepararCargaMasiva`, llenar la hoja, luego `procesarCargaMasiva` |
| Migrar una actividad con toda su historia | Pestaña **Admin** → **+ Migrar solicitud** |
| Mover una actividad de fase | Arrastrar la tarjeta a otra columna |
| Marcar o levantar un bloqueo | Clic en la tarjeta → botón **Marcar bloqueo** |
| Ver la carpeta o el documento | Clic en la tarjeta → botones de Drive |
| Agregar una persona | Pestaña **Admin** → Usuarios → **+ Nuevo registro** |
| Cambiar los días de SLA | Pestaña **Admin** → SLA Fases |
| Registrar un día no laborable | Pestaña **Admin** → Festivos |
| Ver los indicadores | Pestaña **Home** |

---

## Parte 7.1 · Carga masiva de actividades

Cuando haya que registrar de golpe el trabajo que ya venía en curso:

1. En el editor, abre **`CargaMasiva.gs`**, elige **`prepararCargaMasiva`** y ejecuta. Se crea
   la hoja **Carga_Solicitudes** en el libro transaccional, con listas desplegables en cada
   columna para que no haya que escribir códigos de memoria.
2. Llena la hoja con calma. Solo el nombre y la iniciativa son obligatorios; lo demás se puede
   completar después desde la aplicación.
3. Vuelve al editor, elige **`procesarCargaMasiva`** y ejecuta. Por cada fila se crea la
   actividad con su carpeta en Drive y su registro de auditoría, y en la columna **Resultado**
   queda el ID generado (`SOL-…`) o el motivo del rechazo.
4. Corrige las filas que hayan quedado con `ERROR:` y vuelve a ejecutar. Las que ya tienen ID
   no se repiten.

Procesa 25 filas por ejecución, para no agotar el tiempo máximo que Google le da a un script.
Si quedan pendientes, el registro te lo dice y basta con ejecutarla de nuevo.

## Parte 7.2 · Dejar la aplicación siempre tibia (2 min, una sola vez)

La aplicación guarda en memoria lo que ya leyó de las hojas. Mientras esa memoria está tibia,
las consultas tardan un cuarto de segundo; cuando se enfría —porque nadie entró en un rato—, la
primera persona paga unos cinco segundos. Este paso hace que esa primera persona **no sea una
persona**, sino un proceso automático.

1. Abra el editor de Apps Script.
2. En la lista de funciones (arriba, al lado del botón Ejecutar) elija **`instalarCalentamiento`**.
3. **Ejecutar**.
4. La primera vez Google le pedirá autorizar un permiso nuevo (el de programar tareas).
   **Revisar permisos → su cuenta → Permitir.** Vuelva a **Ejecutar**.
5. En el registro debe aparecer: *"Listo: la caché se refrescará sola cada 10 minutos"*.

Puede verlo en el menú de la izquierda, en el icono del **reloj** (*Activadores*). Si alguna vez
quiere quitarlo, ejecute **`desinstalarCalentamiento`**.

> **Importante:** este paso agrega un permiso nuevo al proyecto. La **primera vez que alguien
> abra la aplicación** después de publicarla, Google le volverá a pedir autorización. Es normal
> y pasa una sola vez por persona.

---

## Parte 7.3 · La bienvenida a cada persona (1 min la primera vez)

Registrar a alguien en la hoja de Usuarios lo habilita, pero no le avisa. Desde
**Administración → Usuarios**, el botón **Bienvenida** de cada fila le envía un correo con el
objetivo de la herramienta, el paso a paso para ingresar y el enlace de acceso. Usted recibe
copia de cada uno.

**Antes del primer envío hay que decirle cuál es la dirección que se reparte.** En el editor de
Apps Script, abra `Config.gs`, seleccione la función **`configurarUrlAplicacion`** y ejecútela
una vez con su dirección — o más cómodo, péguela primero en el editor así:

```javascript
function fijarDireccion() {
  configurarUrlAplicacion('https://sites.google.com/su-dominio/gestion-plataformas');
}
```

y ejecute `fijarDireccion`. Use la dirección del **sitio de Google** si lo montó (Parte 5.1);
si no, la de la aplicación terminada en `/exec`.

Si no la configura, el sistema usa la de la implementación activa. Y si tampoco la encuentra,
el botón avisa en lugar de mandar un correo con un enlace roto.

> El botón aparece gris cuando a la persona le falta el correo corporativo en su ficha:
> primero regístreselo y vuelva a intentar.

---

## Parte 8 · Cuando actualicemos el código

- **Si configuraste el Camino A**: no haces nada. El cambio se publica solo. Si además
  guardaste `DEPLOYMENT_ID`, el equipo ve la versión nueva de inmediato; si no, entra a
  **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva → Implementar**.
- **Si usas el Camino B**: abre el editor → menú GitHub → **Pull**.
- **Si usas el Camino C**: copia y pega los archivos que cambiaron.

---

## Funciones que se ejecutan a mano, y dónde están

En el editor de Apps Script las funciones se eligen del desplegable de arriba, pero **primero hay
que abrir el archivo en el que viven** (panel izquierdo, sección *Archivos*): el desplegable solo
lista las del archivo abierto.

| Función | Archivo | Para qué |
| --- | --- | --- |
| `setupInicial` | `Setup.gs` | Crear los dos libros de Google Sheets y todas sus hojas. Solo la primera vez |
| `cargarDatosIniciales` | `DatosIniciales.gs` | Cargar las 8 plataformas y las 39 iniciativas. Solo la primera vez |
| `validarInstalacion` | `Setup.gs` | Comprobar que quedó todo bien. Debe decir `problemas: []` |
| `registrarmeComoAdministrador` | `Setup.gs` | Darse de alta como usuario administrador |
| `actualizarEstructura` | `Setup.gs` | **La más frecuente.** Poner las hojas al día cuando una versión agrega una tabla o una columna |
| `configurarUrlAplicacion` | `Config.gs` | Guardar la dirección de la aplicación, que usan los enlaces de los correos. Se ejecuta **sin escribir nada**: la averigua sola |
| `verUrlAplicacion` | `Config.gs` | Decir qué dirección usan hoy los correos, sin cambiar nada |
| `unificarAlcanceSolicitudes` | `Mantenimiento.gs` | Pasar a `Alcance` lo que estaba en `Objetivo` y `Entregable` |
| `renumerarSolicitudes` | `Mantenimiento.gs` | Llevar los ID viejos al formato `SOL-0015` |
| `verificarEstructura` | `Mantenimiento.gs` | Revisar que las hojas coincidan con el esquema |
| `diagnosticarSolicitudes` | `Mantenimiento.gs` | Buscar filas con datos inconsistentes |
| `repararSolicitudesDesalineadas` | `Mantenimiento.gs` | Corregir filas que quedaron corridas una columna |
| `sincronizarCatalogos` | `Setup.gs` | Reponer catálogos maestros que falten |
| `medirRendimiento` | `Cache.gs` | Medir cuánto tarda cada consulta |

Las que aceptan `true` entre paréntesis (`unificarAlcanceSolicitudes`, `renumerarSolicitudes`)
**primero se ejecutan sin nada** para ver qué harían, y solo después con `true` para aplicarlo.

## Si algo sale mal

| Mensaje | Qué significa | Qué hacer |
| --- | --- | --- |
| *Su correo no está asociado a ningún usuario* | No estás en la hoja Usuarios | Ejecuta `registrarmeComoAdministrador` en `Setup.gs` (Parte 6) |
| *Configuración faltante: ID_LIBRO_…* | No se ejecutó el instalador | Parte 3 |
| *No se pudo crear la carpeta en Drive* | Falta permiso en la Unidad Compartida | Pide acceso de editor a la unidad `1ib9cr7o47ecPQ3KSpcAn_mBjiY9LzqaY` |
| *Specified permissions are not sufficient…* | El proyecto cambió su lista de permisos | Vuelve a ejecutar la función: Google mostrará de nuevo la pantalla de autorización y hay que aceptarla |
| *Su rol no tiene permiso sobre la fase…* | El RBAC funcionando | Revisa el rol del usuario en Admin |
| *El sistema está ocupado atendiendo otro cambio* | Dos personas guardaron a la vez | Reintenta en unos segundos |
| *No se puede acceder a este sitio · localhost:8888* al autorizar clasp | Es el comportamiento normal de Google | Parte 2, camino A, pasos 6 a 10 |
| *invalid_grant* o *Bad Request* al hacer `curl` | El código de autorización se venció | Repite desde `clasp login` y haz el `curl` en menos de 2 minutos |
| *Faltan estos secretos del repositorio…* en GitHub Actions | No se guardaron `CLASP_CREDENTIALS` o `SCRIPT_ID` | Parte 2, camino A, paso A.3 |
| *invalid_grant* dentro de GitHub Actions | La credencial guardada caducó o se revocó | Repite el paso A.2 y actualiza el secreto `CLASP_CREDENTIALS` |
| *Error retrieving access token… reading 'access_token'* | La credencial viene de una versión de `clasp` más nueva | El flujo la convierte solo. Si aun así falla, en Cloud Shell: `npm install -g @google/clasp@2.4.2`, `clasp login` y vuelve a copiar `cat ~/.clasprc.json` |

La actividad **nunca se pierde** por un fallo de Drive, Chat o correo: se guarda igual y el
sistema te avisa qué no pudo hacer.
