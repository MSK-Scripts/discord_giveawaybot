// Emoji-Validierung & -Parsing für Button-Emojis.
// Erlaubt Unicode-Emojis und Discord-Custom-Emojis (<:name:id> / <a:name:id>).

const CUSTOM_RE = /^<(a)?:([a-zA-Z0-9_]{1,32}):(\d{17,20})>$/;

// Grobe Unicode-Emoji-Erkennung (Emoji-Property). Node 22 unterstützt \p{Emoji}.
const UNICODE_RE = /\p{Extended_Pictographic}/u;

/**
 * Validiert eine Emoji-Eingabe.
 * @param {string} input
 * @returns {boolean}
 */
export function isValidEmoji(input) {
  if (!input || typeof input !== 'string') return false;
  const str = input.trim();
  if (CUSTOM_RE.test(str)) return true;
  // Unicode: enthält mindestens ein Emoji-Zeichen und ist kurz (kein Satz).
  return str.length <= 8 && UNICODE_RE.test(str);
}

/**
 * Wandelt eine Emoji-Eingabe in ein für ButtonBuilder.setEmoji() nutzbares Format.
 * Custom -> { id, name, animated }, Unicode -> der String selbst.
 * @param {string} input
 * @returns {string | { id: string, name: string, animated: boolean } | null}
 */
export function parseEmoji(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const m = CUSTOM_RE.exec(str);
  if (m) {
    return { animated: Boolean(m[1]), name: m[2], id: m[3] };
  }
  if (UNICODE_RE.test(str)) return str;
  return null;
}

export default { isValidEmoji, parseEmoji };
