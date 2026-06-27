/** Coalesce hot-path UI updates into one animation frame per tick. */
let frame = 0;
const batch = {
  chat: null,
  list: false,
  header: false,
  /** @type {Map<string, () => void>} */
  live: new Map(),
  /** @type {Map<string, () => void>} */
  composer: new Map(),
};

function bump() {
  if (frame) return;
  frame = requestAnimationFrame(flush);
}

function flush() {
  frame = 0;
  for (const fn of batch.live.values()) fn();
  batch.live.clear();

  if (batch.chat) {
    const { fn, opts } = batch.chat;
    batch.chat = null;
    fn(opts);
  }

  if (batch.header) {
    batch.headerFn?.();
    batch.header = false;
  }

  for (const fn of batch.composer.values()) fn();
  batch.composer.clear();

  if (batch.list) {
    batch.listFn?.();
    batch.list = false;
  }
}

/** @param {(opts?: object) => void} fn */
export function scheduleRenderChat(fn, opts = {}) {
  const prev = batch.chat?.opts ?? {};
  batch.chat = { fn, opts: { ...prev, ...opts } };
  bump();
}

/** @param {() => void} fn */
export function scheduleRenderChatsList(fn) {
  batch.listFn = fn;
  batch.list = true;
  bump();
}

/** @param {string} chatId @param {() => void} fn */
export function scheduleRenderLiveStream(chatId, fn) {
  batch.live.set(chatId, fn);
  bump();
}

/** @param {() => void} fn */
export function scheduleUpdateThreadHeader(fn) {
  batch.headerFn = fn;
  batch.header = true;
  bump();
}

/** @param {string} chatId @param {() => void} fn */
export function scheduleComposerState(chatId, fn) {
  batch.composer.set(chatId, fn);
  bump();
}
