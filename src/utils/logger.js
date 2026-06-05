// Leichtgewichtiger, farbiger Logger (ANSI). Levels: info/warn/error/success/debug.
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
};

function ts() {
  return new Date().toISOString();
}

function format(level, color, args) {
  const prefix = `${COLORS.gray}${ts()}${COLORS.reset} ${color}${level}${COLORS.reset}`;
  console.log(prefix, ...args);
}

export const logger = {
  info: (...args) => format('INFO ', COLORS.cyan, args),
  warn: (...args) => format('WARN ', COLORS.yellow, args),
  error: (...args) => format('ERROR', COLORS.red, args),
  success: (...args) => format('OK   ', COLORS.green, args),
  debug: (...args) => {
    if (process.env.DEBUG) format('DEBUG', COLORS.gray, args);
  },
};

export default logger;
