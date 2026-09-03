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
    // "de 16 anos", "tiene 15 anitos": cualquier edad por debajo de 18.
    category: 'menores',
    test: /\b(de|tiene|tienen|con|una?)\s+(1[0-7]|[1-9])\s*(anos|anitos|anitas)\b/,
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
    test: /\b(violar|violarla|forzarla|forzar a|a la fuerza|sin que se de cuenta|drogarla|dormida|inconsciente|secuestrar|amarrarla sin|sin su consentimiento)\b/,
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

const BOT_PROBE_PATTERNS: RegExp[] = [
  // Intentos de sacarla del personaje o de leer las instrucciones.
  /\bignora (todas |las |tus )?(instrucciones|reglas|indicaciones)/,
  /\b(system ?prompt|prompt del sistema|tus instrucciones|tu prompt)\b/,
  /\bmodo (desarrollador|dios|dan)\b|\bjailbreak\b/,
  /\bactua como\b|\bhaz de cuenta que eres\b|\bfinge ser\b/,
  /\beres (una |un )?(ia|inteligencia artificial|bot|robot|chatbot|asistente|maquina|programa)\b/,
  /\b(chat ?gpt|openai|grok|claude|gemini|llama|modelo de lenguaje)\b/,
  /\b(repite|repiteme|dime|muestrame|escribe) (exactamente|tal cual|literal)\b/,
  // Tareas: que sepa resolverlas es justo lo que la delata.
  /\btraduce(me)?\b|\btraduccion de\b/,
  /\bescribe(me)? (un|una) (poema|ensayo|carta|codigo|cuento|programa|script)\b/,
  /\bresume(me)?\b|\bhazme un resumen\b/,
  /\bcalcula(me)?\b|\bcuanto es\b|\bcuanto da\b/,
  /\bcodigo (en )?(python|javascript|java|c\+\+|html)\b/,
  /\breceta de\b|\bcomo se hace\b.*\bpastel\b/,
  // Aritmetica suelta: "3847*2913", "234 + 981".
  /\d{2,}\s*[*x×/+]\s*\d{2,}/,
];

/**
 * Sondas clasicas para detectar que del otro lado hay una IA. Se responden con
 * una frase enlatada en personaje sin gastar una llamada al modelo: es mas
 * barato, mas rapido y, sobre todo, no falla nunca.
 */
export function detectBotProbe(message: string): boolean {
  const normalized = normalizeForMatch(message);
  return BOT_PROBE_PATTERNS.some((pattern) => pattern.test(normalized));
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
  const options = ARRIVAL_TIME_REPLIES.filter(
    (option) => option !== previous,
  );
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
