/**
 * Barreras deterministas alrededor de la IA que atiende a los clientes.
 *
 * El prompt le pide al modelo que no obedezca instrucciones del cliente, que no
 * hable de temas ajenos y que no reparta enlaces ni telefonos. Nada de eso es
 * una garantia: un modelo se deja convencer. Este modulo es la parte que si se
 * cumple siempre, porque no depende de lo que el modelo decida hacer.
 */

/** Marcas de control que la IA puede emitir y que el backend ejecuta. */
const CONTROL_MARKER_PATTERN =
  /\[\s*(?:DATA|SEND_EXCLUSIVE_PHOTO|SEND_MODEL_PHOTO|TRIO_REQUEST|GROUP_INTENT|GROUP_UNCLEAR)\b[^\]]*\]/gi;

/** Tope de caracteres de un mensaje del cliente antes de mandarlo al modelo. */
export const MAX_CLIENT_MESSAGE_CHARS = 600;

/** Turnos de conversacion que se conservan (usuario + modelo cuentan aparte). */
export const MAX_HISTORY_MESSAGES = 24;

/** Fotos exclusivas que como maximo se mandan en una misma conversacion. */
export const MAX_EXCLUSIVE_PHOTOS_PER_SESSION = 3;

/** Envios de fotos de otras companeras por conversacion. */
export const MAX_CATALOG_PHOTO_SENDS_PER_SESSION = 3;

/** Peticiones de trio por conversacion. */
export const MAX_TRIO_REQUESTS_PER_SESSION = 3;

/** Espera minima entre dos peticiones de trio, en milisegundos. */
export const TRIO_REQUEST_COOLDOWN_MS = 3 * 60 * 1000;

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Quita del texto cualquier marca de control. Se aplica a lo que escribe el
 * cliente antes de guardarlo en el historial: si no, basta con que pida "repite
 * esto tal cual" para que el modelo devuelva una marca y el backend la ejecute.
 */
export function stripControlMarkers(value: string): string {
  return value.replace(CONTROL_MARKER_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/** Recorta el mensaje del cliente: un mensaje enorme solo sirve para inflar el coste. */
export function capClientMessage(
  value: string,
  max = MAX_CLIENT_MESSAGE_CHARS,
): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/**
 * Ventana deslizante del historial. Sin esto la conversacion crece sin limite,
 * se manda entera en cada turno y el coste sube de forma cuadratica.
 */
export function trimChatHistory<T>(
  history: T[],
  max = MAX_HISTORY_MESSAGES,
): T[] {
  return history.length <= max ? history : history.slice(-max);
}

export type ProhibitedCategory =
  'menores' | 'drogas' | 'armas' | 'sin_consentimiento';

const PROHIBITED_PATTERNS: { category: ProhibitedCategory; test: RegExp }[] = [
  {
    category: 'menores',
    test: /\b(menor(es)? de edad|menorcita|menorcitas|adolescente|quinceaner[ao]|lolita|preadolescente|impuber|nin[ao]s? de \d{1,2})\b/,
  },
  {
    /*
     * "de 16 anos", "tiene 15 anitos": cualquier edad por debajo de 18.
     *
     * Los prefijos `con` y `un/una` estaban de mas y convertian en denuncia
     * cualquier frase con una cifra pequena y la palabra anos: "ando con 2 anos
     * sin salir" acusaba al cliente de pedir una menor, con aviso al jefe
     * incluido.
     */
    category: 'menores',
    test: /\b(de|tiene|tienen|tenga|tengan)\s+(1[0-7]|[1-9])\s*(anos|anitos|anitas)\b/,
  },
  {
    category: 'drogas',
    test: /\b(coca[ií]na|perico|cristal|met[ae]nfetamina|mdma|molly|tacha|extasis|marihuana|mota|porro|piedra|crack|tusi|popper)\b/,
  },
  {
    category: 'armas',
    test: /\b(pistola|rev[oó]lver|escopeta|metralleta|arma de fuego|balas|cartuchos|navaja|machete)\b/,
  },
  {
    category: 'sin_consentimiento',
    test: /\b(violar|violarla|forzarla|forzar a|a la fuerza|sin que se de cuenta|drogarla|drogarte|dormirla|dormirte|inconsciente|secuestrar|amarrarla sin|sin su consentimiento)\b/,
  },
  {
    /*
     * Estar dormida es un estado, no una peticion. Suelto en la lista anterior,
     * "perdon, estabas dormida?" --a medianoche, que es cuando escribe la mitad
     * de los clientes-- se contestaba con un "asi no, conmigo eso no va a pasar
     * nunca" y una alerta al jefe. Lo que hay que detectar es la intencion de
     * aprovecharlo, y esa siempre viene con su verbo.
     */
    category: 'sin_consentimiento',
    test: /\bque\s+(llegue|llegues|venga|vengas|este|estes|estuviera|estuvieras|se quede|te quedes)\s+(dormida|dormido|desmayada|inconsciente)\b/,
  },
  {
    // La otra forma de pedir lo mismo: aprovechar que lo esta.
    category: 'sin_consentimiento',
    test: /\b(aprovech\w+|mientras|cuando)\b[^.]{0,25}\b(dormida|desmayada|inconsciente)\b/,
  },
];

/**
 * Deteccion de peticiones que no pueden llegar al modelo bajo ningun concepto.
 * Aqui un falso positivo cuesta una venta y un falso negativo cuesta el negocio,
 * asi que se corta antes de gastar una llamada de IA y se avisa al jefe.
 */
export function detectProhibitedRequest(
  message: string,
): ProhibitedCategory | null {
  const normalized = normalizeForMatch(message);
  for (const { category, test } of PROHIBITED_PATTERNS) {
    if (test.test(normalized)) return category;
  }
  return null;
}

/**
 * Sondas que siempre lo son: sacarla del personaje, leerle las instrucciones o
 * preguntarle por el modelo que la mueve. Ninguna excusa las exime.
 *
 * `llama` va con numero a proposito ("llama 3", "meta-llama"). Suelto atrapaba
 * el verbo llamar --"como te llama", "se llama Valentina", "ya me llama mi
 * jefe"-- y a ese cliente se le contestaba con una frase enlatada sobre que se
 * le enreda la cabeza, sin que su mensaje llegara nunca al modelo.
 */
const JAILBREAK_PATTERNS: RegExp[] = [
  /\bignora (todas |las |tus )?(instrucciones|reglas|indicaciones)/,
  /\b(system ?prompt|prompt del sistema|tus instrucciones|tu prompt)\b/,
  /\bmodo (desarrollador|dios|dan)\b|\bjailbreak\b/,
  /\bactua como\b|\bhaz de cuenta que eres\b|\bfinge ser\b/,
  /\beres (una |un )?(ia|inteligencia artificial|bot|robot|chatbot|asistente|maquina|programa)\b/,
  /\b(chat ?gpt|openai|grok|claude|gemini|modelo de lenguaje)\b/,
  /\b(meta[- ]?)?llama\s*\d/,
  /\b(repite|repiteme|dime|muestrame|escribe) (exactamente|tal cual|literal)\b/,
];

/**
 * Tareas que la delatarian por saber resolverlas. A diferencia de las
 * anteriores, estas SI ceden ante una pregunta sobre el servicio: un cliente
 * que pregunta "cuanto es en total" esta comprando, no sondeando.
 */
const TASK_PATTERNS: RegExp[] = [
  /\btraduce(me)?\b|\btraduccion de\b/,
  /\bescribe(me)? (un|una) (poema|ensayo|carta|codigo|cuento|programa|script)\b/,
  /\bresume(me)?\b|\bhazme un resumen\b/,
  /\bcalcula(me)?\b/,
  /\bcodigo (en )?(python|javascript|java|c\+\+|html)\b/,
  /\breceta de\b|\bcomo se hace\b.*\bpastel\b/,
  /\b(raiz cuadrada|derivada|integral|factorial|logaritmo)\b/,
  // Aritmetica de sonda: "3847*2913". El signo + y las cifras cortas quedan
  // fuera porque "2500 + 500" es el cliente sumando su propia cotizacion.
  /\d{3,}\s*[*x×/]\s*\d{2,}/,
];

/**
 * Lo que es su trabajo. El prompt ya se lo dice ("una pregunta sobre el
 * servicio NO se desvia nunca"), pero la barrera determinista corre ANTES que
 * el modelo, asi que tenia que saberlo tambien: `cuanto es` estaba en la lista
 * de sondas y se tragaba "cuanto es la hora" y "cuanto es en total", que es la
 * pregunta de compra mas frecuente que existe.
 */
const SERVICE_TOPIC_PATTERN =
  /\b(tarifa|precio|precios|costo|cuesta|vale|total|hora|horas|horita|ratico|extra|extras|transporte|traslado|pago|pagar|efectivo|tarjeta|transferencia|anticipo|deposito|motel|moteles|ubicacion|direccion|servicio|servicios|cita)\b/;

/**
 * Sondas clasicas para detectar que del otro lado hay una IA. Se responden con
 * una frase enlatada en personaje sin gastar una llamada al modelo: es mas
 * barato, mas rapido y, sobre todo, no falla nunca.
 */
export function detectBotProbe(message: string): boolean {
  const normalized = normalizeForMatch(message);
  if (JAILBREAK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (SERVICE_TOPIC_PATTERN.test(normalized)) return false;
  return TASK_PATTERNS.some((pattern) => pattern.test(normalized));
}

const ARRIVAL_TIME_PATTERNS: RegExp[] = [
  /\ben cuanto( tiempo)? (llegas|llegarias|vienes|vendrias|estas aqui|sales)\b/,
  /\bcuanto (tiempo )?(tardas|te tardas|tarda|demoras|te demoras|falta)\b/,
  /\ba que hora (llegas|vienes|estarias|sales)\b/,
  /\bcuando (llegas|vienes|sales|estarias)\b/,
  /\bcuanto (me )?(falta|queda) para que llegues\b/,
  /\bya (vienes|saliste|vas a salir|estas en camino|venias)\b/,
  /\bcomo cuanto (tiempo|te tardas|tardas)\b/,
  // Reinsistencias cortas: "masomenos bb?", "aprox?", "un aproximado".
  /^(mas o menos|masomenos|aproximadamente|aprox|un aproximado|como cuanto)\b/,
];

/**
 * El cliente esta preguntando cuanto falta para que la modelo llegue.
 *
 * Es la pregunta que mas conversaciones cerradas ha tumbado: el personaje tiene
 * prohibido dar un tiempo de llegada --y con razon, porque nadie ha asignado
 * todavia el transporte-- asi que el modelo la esquiva, el cliente insiste y la
 * charla se muere en tres evasivas seguidas. Detectarla aqui permite contestar
 * una vez con una frase estable y, si vuelve, pasarle la conversacion a una
 * persona en vez de seguir dando largas.
 */
export function detectArrivalTimeQuestion(message: string): boolean {
  const normalized = normalizeForMatch(message);
  return ARRIVAL_TIME_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Respuesta a la primera pregunta por el tiempo de llegada.
 *
 * No promete una hora --eso sigue dependiendo de que el jefe acepte y asigne el
 * transporte-- pero tampoco se escuda en que "se lo confirman", que era la
 * formula que traia el prompt: sugiere que hay alguien mas detras y es
 * exactamente lo que delata al personaje. Habla en primera persona y deja claro
 * que el aviso llega por aqui mismo.
 */
export const ARRIVAL_TIME_REPLIES: string[] = [
  'Estoy cuadrando cómo me voy para allá, mor. En cuanto lo tenga te escribo por aquí mismo.',
  'Déjame ver cómo me muevo hasta allá, papi, y te digo por aquí en un ratico.',
  'Ando viendo el tema del traslado, amor. Apenas lo tenga claro te aviso por acá.',
];

export function pickArrivalTimeReply(previous?: string | null): string {
  const options = ARRIVAL_TIME_REPLIES.filter((option) => option !== previous);
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Desvios en personaje. Nunca dicen que no pueden hablar de algo: una negativa
 * con forma de politica de contenido delata al bot tanto como decir "soy una IA".
 */
export const IN_CHARACTER_DEFLECTIONS: string[] = [
  'Ay mor, de eso yo no sé nada, yo en lo mío 🙈',
  'Jajaja papi, yo para eso soy un desastre',
  'Uy no, esas cosas se me salen de las manos, cuéntame mejor de ti',
  'Ay lindo, yo de eso ni idea',
  'Mmm eso ni lo intento, mejor cuéntame qué andas buscando',
  'No me pongas a pensar tanto que se me enreda la cabeza 😅',
  'Ay no corazón, yo soy más de otras cosas',
  'Eso déjaselo a otro papi, lo mío es otra cosa 😏',
];

/** Elige un desvío distinto al anterior para que no suene enlatado. */
export function pickDeflection(previous?: string | null): string {
  const options = IN_CHARACTER_DEFLECTIONS.filter(
    (option) => option !== previous,
  );
  return options[Math.floor(Math.random() * options.length)];
}

/** Rechazo firme pero en personaje para lo que no se negocia nunca. */
export const PROHIBITED_REPLIES: Record<ProhibitedCategory, string> = {
  menores:
    'No papi, con eso no cuentes conmigo ni de broma. Si es por ahí, mejor déjalo hasta aquí.',
  drogas:
    'Ay no amor, con eso yo no me meto. Si quieres seguimos hablando de otra cosa.',
  armas: 'No mor, con esas cosas yo no quiero nada. Ahí sí no.',
  sin_consentimiento:
    'No papi, así no. Conmigo eso no va a pasar nunca, mejor lo dejamos hasta aquí.',
};

const ASSISTANT_REGISTER_PATTERNS: RegExp[] = [
  /\bno puedo (responder|ayudar|hablar|darte|proporcionar|asistir)/,
  /\bno (estoy autorizad|tengo permitid|me esta permitid)/,
  /\bno me es posible\b/,
  /\blamento no poder\b|\blo siento, pero no\b/,
  /\bcomo (asistente|ia|inteligencia artificial|modelo)\b/,
  /\bsoy (una |un )?(ia|inteligencia artificial|asistente|bot|modelo de lenguaje)\b/,
  /\b(mis|estas) instrucciones\b/,
  /\bno (debo|puedo) hablar de (ese|este|esos) tema/,
  /\bsolo puedo (hablar|ayudar|responder)/,
  /\bfuera de mi alcance\b|\bno esta dentro de mis\b/,
];

/**
 * Detecta que la respuesta generada suena a asistente. Si aparece, se descarta
 * la respuesta entera: el cliente prefiere un desvío coqueto antes que una
 * frase que huele a política de contenido.
 */
export function looksLikeAssistantRegister(reply: string): boolean {
  const normalized = normalizeForMatch(reply);
  return ASSISTANT_REGISTER_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/**
 * El ofrecimiento de mostrador: "¿en qué te puedo ayudar?".
 *
 * No es una respuesta de asistente de las de arriba --no hay negativa ni
 * politica de contenido-- y por eso pasaba entera: el primer mensaje que ve
 * todo cliente nuevo terminaba con la formula exacta de un call center. Delata
 * al personaje tanto como decir "soy una IA", porque una chica que le escribe
 * a alguien no le ofrece asistencia: le habla.
 *
 * Aqui no se descarta la respuesta entera, como en el registro de asistente,
 * porque el saludo lleva ademas la tarifa y la disponibilidad, que si sirven.
 * Se quita solo esa frase.
 *
 * Los acentos van opcionales porque esto corre sobre el texto que sale hacia
 * el cliente, no sobre la version normalizada.
 */
const FRONT_DESK_PATTERNS: RegExp[] = [
  /¿?\s*\b(?:en\s+qu[eé]|c[oó]mo|con\s+qu[eé])\s+(?:te|le|los?|las?)\s+(?:puedo|podr[ií]a|puedo\s+yo)\s+(?:ayudar|servir|atender|colaborar|apoyar)\b[^.!?\n]*[?!.]?/gi,
  /\b(?:estoy|quedo|me\s+pongo)\s+(?:aqu[ií]\s+)?(?:para|a)\s+(?:servirte|ayudarte|atenderte|tus\s+[oó]rdenes)\b[^.!?\n]*[?!.]?/gi,
  /¿?\s*\ben\s+qu[eé]\s+(?:te|le)\s+(?:ayudo|sirvo|atiendo)\b[^.!?\n]*[?!.]?/gi,
  /\ba\s+tus\s+[oó]rdenes\b[^.!?\n]*[?!.]?/gi,
];

/**
 * Quita el ofrecimiento de mostrador y deja el resto del mensaje en pie.
 *
 * La limpieza posterior es la parte que importa: al arrancar la frase del
 * final queda colgando la coma que la unia al resto ("...por $2500 la hora,
 * 😊"), y eso se lee peor que la frase original.
 */
export function stripFrontDeskOffer(reply: string): string {
  let limpio = reply;
  for (const pattern of FRONT_DESK_PATTERNS) {
    limpio = limpio.replace(pattern, ' ');
  }
  if (limpio === reply) return reply;

  return (
    limpio
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([.!?,;])/g, '$1')
      // La coma se va, pero el espacio que la seguia se queda: sin esto la
      // frase acababa pegada al emoji ("...la hora😊").
      .replace(
        /([,;])(\s*)(?=$|[)\]]|\p{Extended_Pictographic})/gu,
        (_coincidencia, _signo, espacios: string) => (espacios ? ' ' : ''),
      )
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.|t\.me\/)\S+/gi;
const HANDLE_PATTERN = /(^|\s)@[A-Za-z0-9_]{3,}/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * Lo que el prompt promete (nada de enlaces, arrobas ni telefonos) aplicado de
 * verdad sobre el texto que sale hacia el cliente. Tambien barre cualquier marca
 * de control que se haya colado sin consumir.
 */
export function sanitizeAiReply(reply: string): string {
  return reply
    .replace(CONTROL_MARKER_PATTERN, ' ')
    .replace(URL_PATTERN, ' ')
    .replace(HANDLE_PATTERN, ' ')
    .replace(PHONE_PATTERN, (match) => {
      // Nueve digitos o mas: un movil mexicano tiene diez y una fecha escrita
      // como 23-08-2026 tiene ocho, asi que el corte deja pasar las fechas.
      const digits = match.replace(/\D/g, '');
      return digits.length >= 9 ? ' ' : match;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

const OWN_PHOTOS_PATTERN =
  /\b(fotos?|foticos?|imagen|imagenes|selfie|pack|videos?|verte|mostrarte|muestrame|ensename|mandame algo)\b/;

const OTHER_MODELS_PATTERN =
  /\b(otra|otras|companeras|amigas|chicas|modelos|catalogo|quien mas|las demas|opciones)\b/;

/** ¿El cliente pidió fotos de ella? Corrobora la marca [SEND_EXCLUSIVE_PHOTO]. */
export function clientAskedForOwnPhotos(messages: string[]): boolean {
  return messages.some((message) =>
    OWN_PHOTOS_PATTERN.test(normalizeForMatch(message)),
  );
}

/** ¿El cliente preguntó por otras chicas? Corrobora la marca [SEND_MODEL_PHOTO]. */
export function clientAskedForOtherModels(messages: string[]): boolean {
  return messages.some((message) => {
    const normalized = normalizeForMatch(message);
    return (
      OTHER_MODELS_PATTERN.test(normalized) ||
      OWN_PHOTOS_PATTERN.test(normalized)
    );
  });
}

const AFFIRMATIVE_PATTERN =
  /\b(si+|claro|dale+|va|listo|obvio|esa|esa misma|ella|con ella|de una|perfecto)\b/;

/**
 * ¿El cliente eligió de verdad a esa modelo para el trío? Se acepta que la
 * nombre o que conteste que sí a la propuesta; sin una de las dos cosas, la
 * marca [TRIO_REQUEST] se ignora y no se molesta al jefe.
 */
export function clientEndorsedTrioModel(
  messages: string[],
  modelName: string,
): boolean {
  const normalizedName = normalizeForMatch(modelName).trim();
  return messages.some((message) => {
    const normalized = normalizeForMatch(message);
    return (
      (normalizedName.length > 0 && normalized.includes(normalizedName)) ||
      AFFIRMATIVE_PATTERN.test(normalized)
    );
  });
}

/**
 * El cliente nombro a esta modelo, con nombre y apellido o solo con el nombre.
 *
 * Se distingue de `clientEndorsedTrioModel` en que NO acepta un "si" suelto.
 * Aquel se usa cuando el modelo ya dijo a quien se refiere y solo hace falta
 * comprobar que el cliente estuvo de acuerdo; este se usa cuando no hay marca
 * del modelo y el nombre es lo unico que dice a quien quiere: un "dale" ahi
 * podria ser la respuesta a cualquier otra cosa --al metodo de pago, a la
 * hora-- y acabaria mandandole al jefe una autorizacion que nadie pidio.
 *
 * Se compara por palabras sueltas de cuatro letras o mas: el catalogo guarda
 * "Catalina Velez" y el cliente escribe "la catalina". Las palabras cortas se
 * descartan porque un "de" o "la" dentro de un nombre compuesto casaria con
 * cualquier frase.
 */
export function clienteNombroALaModelo(
  messages: string[],
  modelName: string,
): boolean {
  const distintivas = normalizeForMatch(modelName)
    .split(/\s+/)
    .filter((palabra) => palabra.length >= 4);
  if (distintivas.length === 0) return false;

  return messages.some((message) => {
    const palabras = new Set(normalizeForMatch(message).split(/\s+/));
    return distintivas.some((palabra) => palabras.has(palabra));
  });
}

/**
 * Cada cuantos mensajes de la modelo se permite un emoji.
 *
 * El prompt ya lo pedia ("maximo 1 emoji cada 2 o 3 mensajes") y el modelo lo
 * ignoraba: en una conversacion real de veinticinco turnos salio un emoji en
 * los veinticinco. Como con los enlaces y los telefonos, lo que el prompt
 * promete pero no puede garantizar se aplica aqui.
 */
export const MENSAJES_ENTRE_EMOJIS = 3;

/**
 * Un emoji, entero y contado como uno solo.
 *
 * `Extended_Pictographic` cubre las caritas, los gestos y los simbolos, y a eso
 * se le anaden el tono de piel, el selector de variacion y las uniones de ancho
 * cero. Van en secuencia y no dentro de una clase de caracteres a proposito:
 * una familia o una mujer pelirroja son varios puntos de codigo unidos, y en
 * una clase se contarian como varios emojis y se podrian partir por la mitad.
 */
const EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}|[0-9#*]️?⃣)(?:[\u{1F3FB}-\u{1F3FF}]|️)*(?:‍\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|️)*)*/gu;

/** Deja el texto sin espacios dobles ni espacios colgando antes de un signo. */
function recomponerEspacios(texto: string): string {
  return texto
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function contarEmojis(texto: string): number {
  return (texto.match(EMOJI_PATTERN) || []).length;
}

/**
 * Recorta los emojis de una respuesta segun la cadencia.
 *
 * `mensajesDesdeElUltimo` es cuantos mensajes lleva la modelo sin usar ninguno.
 * Si todavia no toca, la respuesta sale limpia; si toca, se queda UNO --el
 * primero, que es donde el modelo suele poner el que de verdad acompana- y se
 * quitan los demas.
 */
export function limitarEmojis(
  texto: string,
  mensajesDesdeElUltimo: number,
): { texto: string; llevaEmoji: boolean } {
  if (contarEmojis(texto) === 0) {
    return { texto, llevaEmoji: false };
  }

  const tocaEmoji = mensajesDesdeElUltimo >= MENSAJES_ENTRE_EMOJIS - 1;
  let conservados = 0;
  const limpio = texto.replace(EMOJI_PATTERN, (match) => {
    if (tocaEmoji && conservados === 0) {
      conservados += 1;
      return match;
    }
    return ' ';
  });

  const resultado = recomponerEspacios(limpio);
  // Un mensaje que era solo un emoji se quedaria vacio: mejor dejarlo pasar
  // entero que mandar una respuesta en blanco.
  if (!resultado) return { texto, llevaEmoji: true };
  return { texto: resultado, llevaEmoji: conservados > 0 };
}

/**
 * La apertura de un mensaje: el vocativo con el que arranca.
 *
 * "Ay mi vida, dime dónde prefieres" → "ay mi vida". Sirve para darse cuenta de
 * que la modelo lleva quince mensajes empezando igual, que es lo que la delata
 * incluso cuando el resto de la frase cambia.
 */
export function aperturaDeMensaje(texto: string): string | null {
  const corte = texto.trim().match(/^([^,.!?\n]{2,28})[,.!?\n]/);
  if (!corte) return null;
  const apertura = normalizeForMatch(corte[1]).trim();
  // Una apertura util tiene a lo sumo cuatro palabras ("ay mi vida", "uy mor").
  if (!apertura || apertura.split(/\s+/).length > 4) return null;
  return apertura;
}

/** Aperturas que la modelo ya gastó, de la más reciente hacia atrás. */
export function aperturasRecientes(
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  max = 4,
): string[] {
  const vistas: string[] = [];
  for (let i = historial.length - 1; i >= 0 && vistas.length < max; i -= 1) {
    const turno = historial[i];
    if (turno.role !== 'model') continue;
    const apertura = aperturaDeMensaje(turno.parts?.[0]?.text ?? '');
    if (apertura && !vistas.includes(apertura)) vistas.push(apertura);
  }
  return vistas;
}

/**
 * Extras cuyo precio la modelo ya solto en esta conversacion.
 *
 * En la conversacion que motivo esto, el precio del oral se repitio tres veces
 * --con su condicion de higiene entera-- despues de que el cliente ya lo
 * hubiera aceptado. Repetir una tarifa que nadie ha vuelto a preguntar suena a
 * bucle de robot y, peor, a que se le esta regateando.
 */
export function extrasYaCotizados(
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  nombresDeExtras: string[],
): string[] {
  const dichoPorElla = historial
    .filter((turno) => turno.role === 'model')
    .map((turno) => normalizeForMatch(turno.parts?.[0]?.text ?? ''))
    .join(' ');
  if (!dichoPorElla) return [];
  return nombresDeExtras.filter((nombre) => {
    const normalizado = normalizeForMatch(nombre).trim();
    return normalizado.length > 2 && dichoPorElla.includes(normalizado);
  });
}

/**
 * La condicion que acompaña siempre a un extra: la higiene.
 *
 * El prompt lo pide en tres sitios distintos y aun asi el modelo se la salta
 * cuando recita la lista de extras con sus precios. Es la condicion que evita
 * la discusion en el motel, asi que no puede depender de que se acuerde.
 */
const MENCIONA_HIGIENE =
  /\b(higiene|aseo|aseado|asead|limpio|limpia|limpieza|banad|duchad|bañad)/;

/**
 * La respuesta nombra un extra pero no dice de que depende.
 *
 * Solo mira los extras del catalogo de esa modelo: si no ha nombrado ninguno,
 * no hay condicion que recordar y el mensaje se queda como esta.
 */
export function faltaCondicionDeHigiene(
  reply: string,
  nombresDeExtras: string[],
): boolean {
  const normalizado = normalizeForMatch(reply);
  if (!normalizado.trim()) return false;
  if (MENCIONA_HIGIENE.test(normalizado)) return false;
  return nombresDeExtras.some((nombre) => {
    const limpio = normalizeForMatch(nombre).trim();
    return limpio.length > 2 && normalizado.includes(limpio);
  });
}

/**
 * Como se recuerda la condicion. Varias formas para que no suene a plantilla
 * pegada al final de cada mensaje.
 */
export const RECORDATORIOS_DE_HIGIENE: string[] = [
  'Eso sí, todo eso es si llegas bien bañadito, mor.',
  'Ah, y eso va siempre de la mano de que vengas bien aseado.',
  'Todo eso depende de que llegues con buena higiene, papi.',
  'Eso sí, con higiene impecable; si no, no hay nada de eso.',
];

export function pickRecordatorioDeHigiene(previo?: string | null): string {
  const opciones = RECORDATORIOS_DE_HIGIENE.filter((o) => o !== previo);
  return opciones[Math.floor(Math.random() * opciones.length)];
}

const INSEGURIDAD_PATTERNS: RegExp[] = [
  /\bmi primera vez\b|\bes la primera vez que\b|\bnunca (lo )?he (estado|hecho|ido)\b/,
  /\bprimerizo\b|\bsoy virgen\b|\bno tengo experiencia\b|\bsoy inexperto\b/,
  /\b(estoy|ando|me siento) (un poco |algo |medio )?(nervioso|nerviosa|apenado|penoso)\b/,
  /\bme da (pena|cosa|nervios|verguenza)\b|\bque pena contigo\b/,
  /\bno se (bien )?(como|que) (funciona|se hace|hacerle)\b/,
  /\b(soy|estoy) precoz\b|\bduro poco\b|\bse me baja\b|\btermino rapido\b/,
];

/**
 * El cliente esta confesando una inseguridad: que es su primera vez, que esta
 * nervioso, que dura poco.
 *
 * Es el momento mas fragil de toda la conversacion y el prompt ya lo trataba
 * con cuidado --nada de burlas, nada de usarlo para vender horas-- pero la
 * modelo remataba igual con "¿cuantas horas te gustaria?". Contestar a una
 * confesion con una pregunta comercial la convierte en un cobro, y el cliente
 * lo nota. Detectarlo aqui permite prohibir esa pregunta en ese turno concreto.
 */
export function detectaInseguridad(message: string): boolean {
  const normalized = normalizeForMatch(message);
  return INSEGURIDAD_PATTERNS.some((pattern) => pattern.test(normalized));
}

const CLIENTE_EN_FUGA_PATTERNS: RegExp[] = [
  /\bni\s?modo\b/,
  /\bsera (en |para )?(la |otra |otro )?(proxima|ocasion|dia|vez)\b/,
  /\botro dia (sera|te escribo|nos vemos|hablamos)\b/,
  /\bque ganas tenia\b|\bcon las ganas que tenia\b/,
  /\b(que|una) lastima\b/,
  /\bmejor lo dejamos\b|\blo dejamos (asi|hasta aqui|para despues|para otro dia)\b/,
  /\bgracias de (todos modos|todas formas|todas maneras)\b/,
  /\bentonces (no se puede|nada|nada que hacer)\b/,
];

/**
 * El cliente se esta despidiendo sin comprar.
 *
 * "Que ganas tenia de verte", en pasado, es un cliente que ya se rindio. En la
 * conversacion que motivo esto la modelo contesto "yo tambien con ganas de
 * verte rico" y siguio como si nada: nadie se entero de que la venta se estaba
 * cayendo en ese mismo mensaje. No se detecta por el sentimiento general, sino
 * por estas formulas de resignacion, que son casi siempre las mismas.
 */
export function detectaClienteEnFuga(message: string): boolean {
  const normalized = normalizeForMatch(message);
  return CLIENTE_EN_FUGA_PATTERNS.some((pattern) => pattern.test(normalized));
}
