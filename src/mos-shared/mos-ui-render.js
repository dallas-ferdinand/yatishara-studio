/**
 * mos-ui — rich whitelisted JSON → HTML for desk chat.
 * AI defaults to ```mos-ui``` blocks (see desk-context.mjs).
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/'/g, "&#39;");
}

function jsonAttr(value) {
  return escAttr(JSON.stringify(value ?? {}));
}

function hoverAttrs(text, aria = text) {
  const tip = String(text ?? "").trim();
  if (!tip) return "";
  const label = String(aria ?? tip).trim() || tip;
  return ` title="${escAttr(tip)}" aria-label="${escAttr(label)}" data-mos-hover="${escAttr(tip)}"`;
}

function normalizePath(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function fileName(path) {
  const parts = normalizePath(path).split("/").filter(Boolean);
  return parts.pop() ?? path;
}

function fileExt(path) {
  const name = fileName(path);
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function fileVisualKind(item, path, actionKind = "") {
  const explicit = String(item.kind ?? item.type ?? "").toLowerCase();
  if (explicit === "dir" || explicit === "folder" || actionKind === "open-dir") return "dir";
  if (["url", "link", "href"].includes(explicit) || item.href || item.url) return "link";
  const ext = fileExt(path);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) return "audio";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "html", "json", "py", "rb", "go", "rs", "java", "kt", "swift"].includes(ext)) return "code";
  if (["md", "mdx", "txt", "rst"].includes(ext)) return "doc";
  if (["csv", "tsv", "db", "sqlite", "parquet", "yaml", "yml", "toml", "xml"].includes(ext)) return "data";
  if (["zip", "tar", "gz", "tgz", "7z", "rar"].includes(ext)) return "archive";
  if (["env", "config", "conf", "ini", "lock"].includes(ext) || /(^|\/)(package-lock|bun\.lock|pnpm-lock)\./i.test(path)) return "config";
  if (ext === "pdf") return "pdf";
  return "file";
}

function renderMiniTags(items, className) {
  const tags = (Array.isArray(items) ? items : [])
    .map((tag) => {
      const label = typeof tag === "string" ? tag : tag?.label ?? tag?.text ?? tag?.name ?? tag?.value ?? "";
      if (!label) return "";
      const tone = typeof tag === "object" ? toneClass(tag.tone ?? tag.status ?? tag.variant) : "mos-ui-tone-neutral";
      return `<span class="${className} ${tone}">${esc(label)}</span>`;
    })
    .filter(Boolean)
    .join("");
  return tags;
}

function fileMetaTags(item) {
  const tags = [];
  if (item.status) tags.push({ label: item.status, tone: item.status });
  if (item.meta) tags.push(String(item.meta));
  if (item.badge) tags.push(String(item.badge));
  if (Array.isArray(item.tags)) tags.push(...item.tags);
  return tags;
}

function toneClass(tone) {
  const t = String(tone ?? "neutral").toLowerCase();
  if (["success", "ok", "done"].includes(t)) return "mos-ui-tone-success";
  if (["warn", "warning"].includes(t)) return "mos-ui-tone-warn";
  if (["error", "danger", "fail"].includes(t)) return "mos-ui-tone-error";
  if (["info", "note"].includes(t)) return "mos-ui-tone-info";
  if (["accent", "brand", "purple"].includes(t)) return "mos-ui-tone-accent";
  return "mos-ui-tone-neutral";
}

function safeImageSrc(src) {
  const u = String(src ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:image\//i.test(u)) return u;
  return null;
}

function safeMediaSrc(src) {
  const u = String(src ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return null;
}

function ratioClass(ratio) {
  const r = String(ratio ?? "16-9").replace(":", "-").replace("/", "-").toLowerCase();
  if (["auto", "1-1", "4-3", "16-9", "21-9", "9-16"].includes(r)) return `mos-ui-media--ratio-${r}`;
  return "mos-ui-media--ratio-16-9";
}

function safeVariant(value, allowed, fallback = "default") {
  const v = String(value ?? fallback).toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function mediaKind(media) {
  const kind = String(media?.kind ?? media?.type ?? "").toLowerCase();
  if (["image", "video", "audio", "pdf", "embed"].includes(kind)) return kind;
  const path = normalizePath(media?.path ?? media?.file ?? media?.src ?? media?.url ?? "");
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return "video";
  if (/\.(mp3|wav|m4a|ogg|flac)$/i.test(path)) return "audio";
  if (/\.pdf$/i.test(path)) return "pdf";
  return "image";
}

function mediaShellClass(media, className, extra = []) {
  const classes = [
    className,
    `mos-ui-media--kind-${mediaKind(media)}`,
    ratioClass(media?.ratio ?? media?.aspect),
    media?.fit === "contain" ? "mos-ui-media--fit-contain" : "",
    media?.size ? `mos-ui-media--size-${escAttr(media.size)}` : "",
    media?.lightbox === false ? "" : mediaKind(media) === "video" ? "mos-ui-media--lightbox-video" : "mos-ui-media--lightbox",
    ...extra,
  ];
  return classes.filter(Boolean).join(" ");
}

function renderMedia(media, { className = "mos-ui-media" } = {}) {
  if (!media) return "";
  const path = normalizePath(media.path ?? media.file ?? "");
  const src = safeImageSrc(media.src ?? media.url ?? media.href);
  const rawSrc = safeMediaSrc(media.src ?? media.url ?? media.href);
  const alt = escAttr(media.alt ?? media.label ?? fileName(path) ?? "Image");
  const caption = media.caption ? `<figcaption class="mos-ui-media-cap">${esc(media.caption)}</figcaption>` : "";
  const kind = mediaKind(media);
  const cls = mediaShellClass(media, className);

  if (kind === "video") {
    const posterPath = normalizePath(media.posterPath ?? media.posterFile ?? "");
    const poster = safeImageSrc(media.poster ?? media.thumbnail ?? media.thumb);
    const posterAttr = poster ? ` poster="${escAttr(poster)}"` : "";
    const posterData = posterPath ? ` data-mos-workspace-poster="${escAttr(posterPath)}"` : "";
    const sourceAttrs = path
      ? ` data-mos-workspace-media="video" data-mos-path="${escAttr(path)}"${posterData}`
      : rawSrc
        ? ` src="${escAttr(rawSrc)}"`
        : "";
    if (!sourceAttrs) return "";
    return `<figure class="${cls}">
      <div class="mos-ui-media-frame">
        <video class="mos-ui-video" controls playsinline preload="metadata"${posterAttr}${sourceAttrs}></video>
        <button type="button" class="mos-ui-media-play" aria-label="Preview video">Play</button>
      </div>${caption}
    </figure>`;
  }

  if (kind === "audio") {
    const sourceAttrs = path
      ? ` data-mos-workspace-media="audio" data-mos-path="${escAttr(path)}"`
      : rawSrc
        ? ` src="${escAttr(rawSrc)}"`
        : "";
    if (!sourceAttrs) return "";
    return `<figure class="${cls}">
      <div class="mos-ui-audio-shell">
        <span class="mos-ui-audio-title">${esc(media.title ?? media.label ?? fileName(path) ?? "Audio")}</span>
        <audio class="mos-ui-audio" controls preload="metadata"${sourceAttrs}></audio>
      </div>${caption}
    </figure>`;
  }

  if (kind === "pdf") {
    const title = esc(media.title ?? media.label ?? fileName(path) ?? "PDF preview");
    const frameAttrs = path
      ? ` data-mos-workspace-pdf="${escAttr(path)}"`
      : rawSrc
        ? ` src="${escAttr(rawSrc)}#view=FitH&toolbar=0"`
        : "";
    if (!frameAttrs) return "";
    return `<figure class="${cls} mos-ui-pdf">
      <div class="mos-ui-pdf-head"><span>${title}</span>${path ? actionBtn({ label: "Open", action: "open-file", path }, { compact: true }) : ""}</div>
      <iframe class="mos-ui-pdf-frame" title="${escAttr(title)}"${frameAttrs}></iframe>${caption}
    </figure>`;
  }

  if (kind === "embed") {
    return renderEmbed(media);
  }

  if (path) {
    return `<figure class="${cls}">
      <div class="mos-ui-media-frame"><img class="mos-ui-img" data-mos-workspace-image="${escAttr(path)}" alt="${alt}" loading="lazy" decoding="async" /></div>${caption}
    </figure>`;
  }
  if (src) {
    return `<figure class="${cls}">
      <div class="mos-ui-media-frame"><img class="mos-ui-img" src="${escAttr(src)}" alt="${alt}" loading="lazy" decoding="async" /></div>${caption}
    </figure>`;
  }
  return "";
}

function actionBtn(item, { compact = false, primary = false } = {}) {
  const label = esc(item.label ?? item.text ?? "Action");
  const action = String(item.action ?? item.type ?? "").toLowerCase();
  const path = normalizePath(item.path ?? item.file ?? item.dir ?? "");
  const href = String(item.href ?? item.url ?? "").trim();
  const copy = String(item.copy ?? item.value ?? item.message ?? "").trim();
  const variant = String(item.variant ?? item.tone ?? "").toLowerCase();
  const cls = [
    "mos-ui-btn",
    compact ? "mos-ui-btn--compact" : "",
    primary ? "mos-ui-btn--primary" : "",
    variant ? `mos-ui-btn--${escAttr(variant)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const confirm = item.confirm ? ` data-mos-confirm="${escAttr(item.confirm)}"` : "";
  const resultMode = item.result ? ` data-mos-result="${escAttr(item.result)}"` : "";
  const success = item.successLabel ? ` data-mos-success-label="${escAttr(item.successLabel)}"` : "";
  const failure = item.failureLabel ? ` data-mos-failure-label="${escAttr(item.failureLabel)}"` : "";
  const actionTip = item.hint ?? item.title ?? item.tooltip ?? label;

  if (action === "open-file" || action === "file") {
    if (!path) return "";
    return `<button type="button" class="${cls} mos-ui-btn-file" data-mos-action="open-file" data-mos-path="${escAttr(path)}"${hoverAttrs(`Open file: ${path}`, actionTip)}>${label}</button>`;
  }
  if (action === "open-dir" || action === "dir" || action === "folder") {
    if (!path) return "";
    return `<button type="button" class="${cls} mos-ui-btn-dir" data-mos-action="open-dir" data-mos-path="${escAttr(path)}"${hoverAttrs(`Open folder: ${path}`, actionTip)}>${label}</button>`;
  }
  if (action === "url" || action === "link") {
    if (!href) return "";
    return `<a class="${cls} mos-ui-btn-link" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer"${hoverAttrs(`Open link: ${href}`, actionTip)}>${label}</a>`;
  }
  if (action === "open-raw" || action === "raw") {
    if (!path) return "";
    return `<button type="button" class="${cls} mos-ui-btn-file" data-mos-action="open-raw" data-mos-path="${escAttr(path)}"${confirm}${hoverAttrs(`Open raw file: ${path}`, actionTip)}>${label}</button>`;
  }
  if (action === "copy") {
    const text = copy || path || href;
    if (!text) return "";
    return `<button type="button" class="${cls} mos-ui-btn-copy" data-mos-action="copy" data-mos-copy="${escAttr(text)}"${hoverAttrs("Copy to clipboard", actionTip)}>${label}</button>`;
  }
  if (action === "composer" || action === "fill") {
    const text = copy || item.prompt || item.message || "";
    if (!text) return "";
    return `<button type="button" class="${cls} mos-ui-btn-composer" data-mos-action="composer" data-mos-composer="${escAttr(text)}"${hoverAttrs("Fill composer", actionTip)}>${label}</button>`;
  }
  if (action === "send" || action === "send-chat" || action === "chat") {
    const text = copy || item.prompt || item.message || "";
    if (!text) return "";
    return `<button type="button" class="${cls} mos-ui-btn-send" data-mos-action="send" data-mos-send="${escAttr(text)}"${confirm}${hoverAttrs("Send prompt", actionTip)}>${label}</button>`;
  }
  if (action === "api" || action === "mos-api") {
    const name = String(item.api ?? item.name ?? item.method ?? "").trim();
    if (!name) return "";
    return `<button type="button" class="${cls} mos-ui-btn-api" data-mos-action="api" data-mos-api="${escAttr(name)}" data-mos-payload="${jsonAttr(item.body ?? item.payload ?? item.params)}"${confirm}${resultMode}${success}${failure}${hoverAttrs(`Run ${name}`, actionTip)}>${label}</button>`;
  }
  if (action === "event" || action === "emit") {
    const name = String(item.event ?? item.name ?? "").trim();
    if (!name) return "";
    return `<button type="button" class="${cls} mos-ui-btn-event" data-mos-action="event" data-mos-event="${escAttr(name)}" data-mos-payload="${jsonAttr(item.detail ?? item.payload)}"${confirm}${hoverAttrs(`Trigger ${name}`, actionTip)}>${label}</button>`;
  }
  return "";
}

function renderActions(items, opts = {}) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item, i) => actionBtn(item, { ...opts, primary: opts.primaryFirst && i === 0 }))
    .filter(Boolean);
  if (!rows.length) return "";
  return `<div class="mos-ui-actions">${rows.join("")}</div>`;
}

function pathActionAttrs(item) {
  const path = normalizePath(item.path ?? item.file ?? item.dir ?? "");
  if (!path) return "";
  const kind = item.kind === "dir" || item.type === "dir" || item.action === "open-dir" ? "open-dir" : "open-file";
  const tip = kind === "open-dir" ? `Open folder: ${path}` : `Open file: ${path}`;
  return ` data-mos-action="${kind}" data-mos-path="${escAttr(path)}"${hoverAttrs(tip)}`;
}

function renderBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((b) => renderBlock(b))
    .filter(Boolean)
    .join("");
}

function renderTextList(items, className, itemClassName) {
  if (!Array.isArray(items) || !items.length) return "";
  const rows = items
    .map((item) => {
      const text = typeof item === "string" ? item : item.text ?? item.label ?? item.title ?? "";
      if (!text) return "";
      const tone = typeof item === "object" ? toneClass(item.tone) : "mos-ui-tone-neutral";
      return `<li class="${itemClassName} ${tone}">${esc(text)}</li>`;
    })
    .filter(Boolean)
    .join("");
  return rows ? `<ul class="${className}">${rows}</ul>` : "";
}

function renderHero(block) {
  const tone = toneClass(block.tone ?? block.variant);
  const eyebrow = block.eyebrow ? `<p class="mos-ui-hero-eyebrow">${esc(block.eyebrow)}</p>` : "";
  const title = block.title ? `<h3 class="mos-ui-hero-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-hero-sub">${esc(block.subtitle)}</p>` : "";
  const body = block.body || block.text ? `<p class="mos-ui-hero-body">${esc(block.body ?? block.text)}</p>` : "";
  const media = renderMedia(block.image ?? block.media, { className: "mos-ui-hero-media" });
  const actions = renderActions(block.actions, { primaryFirst: true });
  return `<section class="mos-ui-hero ${tone}">${media}<div class="mos-ui-hero-copy">${eyebrow}${title}${subtitle}${body}${actions}</div></section>`;
}

function renderSpotlight(block) {
  const tone = toneClass(block.tone ?? "accent");
  const eyebrow = block.eyebrow ? `<p class="mos-ui-spotlight-eyebrow">${esc(block.eyebrow)}</p>` : "";
  const title = block.title ? `<h3 class="mos-ui-spotlight-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-spotlight-sub">${esc(block.subtitle)}</p>` : "";
  const body = block.body || block.text ? `<p class="mos-ui-spotlight-body">${esc(block.body ?? block.text)}</p>` : "";
  const stats = block.stats?.length ? renderStatRow({ items: block.stats }) : "";
  const chips = block.tags?.length || block.chips?.length ? renderChips({ items: block.tags ?? block.chips }) : "";
  const media = renderMedia(block.media ?? block.image, { className: "mos-ui-spotlight-media" });
  const actions = renderActions(block.actions, { primaryFirst: true });
  const side = media || stats ? `<aside class="mos-ui-spotlight-side">${media}${stats}</aside>` : "";
  return `<section class="mos-ui-spotlight ${tone}"><div class="mos-ui-spotlight-copy">${eyebrow}${title}${subtitle}${body}${chips}${actions}</div>${side}</section>`;
}

function renderPage(block) {
  const variant = safeVariant(block.variant ?? block.layout, ["default", "website", "landing", "split", "docs"], "website");
  const navItems = Array.isArray(block.nav ?? block.links)
    ? block.nav ?? block.links
    : [];
  const nav = navItems
    .map((item) => {
      const label = esc(item.label ?? item.title ?? item.text ?? "");
      if (!label) return "";
      const href = String(item.href ?? item.url ?? "").trim();
      if (href) return `<a class="mos-ui-page-nav-link" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer"${hoverAttrs(`Open link: ${href}`, label)}>${label}</a>`;
      const attrs = pathActionAttrs(item);
      return attrs ? `<button type="button" class="mos-ui-page-nav-link"${attrs}>${label}</button>` : `<span class="mos-ui-page-nav-link">${label}</span>`;
    })
    .filter(Boolean)
    .join("");
  const brand = block.brand ?? block.eyebrow ? `<span class="mos-ui-page-brand">${esc(block.brand ?? block.eyebrow)}</span>` : "";
  const navHtml = brand || nav ? `<nav class="mos-ui-page-nav" aria-label="Page links">${brand}<div>${nav}</div></nav>` : "";
  const eyebrow = block.eyebrow ? `<p class="mos-ui-page-eyebrow">${esc(block.eyebrow)}</p>` : "";
  const title = block.title ? `<h3 class="mos-ui-page-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-page-sub">${esc(block.subtitle)}</p>` : "";
  const body = block.body || block.text ? `<p class="mos-ui-page-body">${esc(block.body ?? block.text)}</p>` : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  const media = renderMedia(block.media ?? block.image, { className: "mos-ui-page-media" });
  const hero = title || subtitle || body || media || actions
    ? `<header class="mos-ui-page-hero"><div class="mos-ui-page-copy">${eyebrow}${title}${subtitle}${body}${actions}</div>${media ? `<div class="mos-ui-page-visual">${media}</div>` : ""}</header>`
    : "";
  const sections = renderBlocks(block.sections ?? block.blocks ?? block.items);
  return `<section class="mos-ui-page mos-ui-page--${variant} ${toneClass(block.tone)}">${navHtml}${hero}${sections ? `<div class="mos-ui-page-sections">${sections}</div>` : ""}</section>`;
}

function renderCarousel(block) {
  const slides = Array.isArray(block.slides) ? block.slides : [];
  if (!slides.length) return "";
  const id = `c_${Math.random().toString(36).slice(2, 9)}`;
  const slideHtml = slides
    .map((slide, i) => {
      const active = i === 0 ? " is-active" : "";
      const inner = renderBlock({ type: "card", ...slide, tone: slide.tone ?? "neutral" });
      return `<div class="mos-ui-carousel-slide${active}" data-slide="${i}">${inner || `<p>${esc(slide.title ?? slide.body ?? "")}</p>`}</div>`;
    })
    .join("");
  const dots = slides
    .map(
      (_, i) =>
        `<button type="button" class="mos-ui-carousel-dot${i === 0 ? " is-active" : ""}" data-mos-carousel-dot="${i}" aria-label="Slide ${i + 1}"></button>`
    )
    .join("");
  return `<div class="mos-ui-carousel" data-mos-carousel="${escAttr(id)}">
    <div class="mos-ui-carousel-track">${slideHtml}</div>
    <div class="mos-ui-carousel-nav">
      <button type="button" class="mos-ui-carousel-btn" data-mos-carousel-prev aria-label="Previous">‹</button>
      <div class="mos-ui-carousel-dots">${dots}</div>
      <button type="button" class="mos-ui-carousel-btn" data-mos-carousel-next aria-label="Next">›</button>
    </div>
  </div>`;
}

function renderGallery(block) {
  const items = Array.isArray(block.items ?? block.images ?? block.media) ? (block.items ?? block.images ?? block.media) : [];
  if (!items.length) return "";
  const cols = Math.min(Math.max(Number(block.columns ?? block.cols ?? 3) || 3, 1), 4);
  const variant = safeVariant(block.variant ?? block.layout, ["grid", "masonry", "polaroid", "showcase"], "grid");
  const title = block.title ? `<p class="mos-ui-gallery-title">${esc(block.title)}</p>` : "";
  const cells = items
    .map((item) => {
      const media = typeof item === "string" ? { path: item } : item;
      const rendered = renderMedia({ ratio: block.ratio ?? "1-1", fit: block.fit, ...media, lightbox: media.lightbox ?? true }, { className: "mos-ui-gallery-media" });
      return rendered ? `<div class="mos-ui-gallery-cell">${rendered}</div>` : "";
    })
    .filter(Boolean)
    .join("");
  if (!cells) return "";
  return `<section class="mos-ui-gallery mos-ui-gallery--cols-${cols} mos-ui-gallery--${variant}">${title}<div class="mos-ui-gallery-grid">${cells}</div></section>`;
}

function renderMediaRow(block) {
  const items = Array.isArray(block.items ?? block.media ?? block.images) ? (block.items ?? block.media ?? block.images) : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-media-row-title">${esc(block.title)}</p>` : "";
  const cells = items
    .map((item) => {
      const media = typeof item === "string" ? { path: item } : item;
      const rendered = renderMedia({ ratio: block.ratio ?? "16-9", fit: block.fit, ...media, lightbox: media.lightbox ?? true }, { className: "mos-ui-media-row-media" });
      return rendered ? `<div class="mos-ui-media-row-cell">${rendered}</div>` : "";
    })
    .filter(Boolean)
    .join("");
  if (!cells) return "";
  return `<section class="mos-ui-media-row">${title}<div class="mos-ui-media-row-track">${cells}</div></section>`;
}

function renderEmbed(block) {
  const src = safeMediaSrc(block.src ?? block.url ?? block.href);
  if (!src) return "";
  const title = escAttr(block.title ?? block.label ?? "Embedded preview");
  const caption = block.caption ? `<figcaption class="mos-ui-media-cap">${esc(block.caption)}</figcaption>` : "";
  return `<figure class="${mediaShellClass(block, "mos-ui-embed")}">
    <div class="mos-ui-embed-frame"><iframe src="${escAttr(src)}" title="${title}" loading="lazy" allowfullscreen></iframe></div>${caption}
  </figure>`;
}

function renderCompare(block) {
  const before = block.before ?? block.left;
  const after = block.after ?? block.right;
  if (!before || !after) return "";
  const beforePath = normalizePath(before.path ?? before.file ?? "");
  const afterPath = normalizePath(after.path ?? after.file ?? "");
  const beforeSrc = safeImageSrc(before.src ?? before.url ?? before.href);
  const afterSrc = safeImageSrc(after.src ?? after.url ?? after.href);
  const beforeImg = beforePath
    ? `<img data-mos-workspace-image="${escAttr(beforePath)}" alt="${escAttr(before.alt ?? before.label ?? "Before")}" loading="lazy" decoding="async" />`
    : beforeSrc
      ? `<img src="${escAttr(beforeSrc)}" alt="${escAttr(before.alt ?? before.label ?? "Before")}" loading="lazy" decoding="async" />`
      : "";
  const afterImg = afterPath
    ? `<img class="mos-ui-compare-after" data-mos-workspace-image="${escAttr(afterPath)}" alt="${escAttr(after.alt ?? after.label ?? "After")}" loading="lazy" decoding="async" />`
    : afterSrc
      ? `<img class="mos-ui-compare-after" src="${escAttr(afterSrc)}" alt="${escAttr(after.alt ?? after.label ?? "After")}" loading="lazy" decoding="async" />`
      : "";
  if (!beforeImg || !afterImg) return "";
  const title = block.title ? `<p class="mos-ui-compare-title">${esc(block.title)}</p>` : "";
  const beforeLabel = esc(before.label ?? block.beforeLabel ?? "Before");
  const afterLabel = esc(after.label ?? block.afterLabel ?? "After");
  return `<section class="mos-ui-compare" data-mos-compare>
    ${title}
    <div class="mos-ui-compare-stage">${beforeImg}<div class="mos-ui-compare-after-wrap">${afterImg}</div><input class="mos-ui-compare-slider" type="range" min="0" max="100" value="${Number(block.value ?? 50)}" aria-label="Compare images" /></div>
    <div class="mos-ui-compare-labels"><span>${beforeLabel}</span><span>${afterLabel}</span></div>
  </section>`;
}

function renderDashboard(block) {
  const title = block.title ? `<h3 class="mos-ui-dashboard-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-dashboard-sub">${esc(block.subtitle)}</p>` : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  const stats = block.stats?.length ? renderStatRow({ title: block.statsTitle, items: block.stats }) : "";
  const bodyBlocks = renderBlocks(block.blocks ?? block.items);
  const media = block.media || block.image ? renderMedia(block.media ?? block.image, { className: "mos-ui-dashboard-media" }) : "";
  return `<section class="mos-ui-dashboard ${toneClass(block.tone)}">
    <header class="mos-ui-dashboard-head"><div>${title}${subtitle}</div>${actions}</header>
    ${stats}
    <div class="mos-ui-dashboard-body">${bodyBlocks}${media}</div>
  </section>`;
}

function renderBento(block) {
  const items = Array.isArray(block.items ?? block.cards ?? block.blocks) ? (block.items ?? block.cards ?? block.blocks) : [];
  if (!items.length) return "";
  const title = block.title ? `<h3 class="mos-ui-bento-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-bento-sub">${esc(block.subtitle)}</p>` : "";
  const cells = items
    .map((item) => {
      const span = safeVariant(item.span ?? item.size, ["default", "wide", "tall", "large"], "default");
      const content = item.type ? renderBlock(item) : renderCard({ ...item, type: "card" });
      return content ? `<div class="mos-ui-bento-cell mos-ui-bento-cell--${span}">${content}</div>` : "";
    })
    .filter(Boolean)
    .join("");
  if (!cells) return "";
  return `<section class="mos-ui-bento ${toneClass(block.tone)}">${title || subtitle ? `<header class="mos-ui-bento-head">${title}${subtitle}</header>` : ""}<div class="mos-ui-bento-grid">${cells}</div></section>`;
}

function renderJourney(block) {
  const items = Array.isArray(block.items ?? block.steps ?? block.slides) ? (block.items ?? block.steps ?? block.slides) : [];
  if (!items.length) return "";
  const title = block.title ? `<h3 class="mos-ui-journey-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-journey-sub">${esc(block.subtitle)}</p>` : "";
  const cards = items
    .map((item, i) => {
      const eyebrow = item.eyebrow ? `<span class="mos-ui-journey-eyebrow">${esc(item.eyebrow)}</span>` : "";
      const title = esc(item.title ?? item.label ?? `Step ${i + 1}`);
      const body = item.body ?? item.text ?? item.description;
      const bodyHtml = body ? `<p>${esc(body)}</p>` : "";
      const media = renderMedia(item.media ?? item.image, { className: "mos-ui-journey-media" });
      const actions = renderActions(item.actions);
      return `<article class="mos-ui-journey-card ${toneClass(item.tone)}"><span class="mos-ui-journey-num">${i + 1}</span>${media}<div>${eyebrow}<h4>${title}</h4>${bodyHtml}${actions}</div></article>`;
    })
    .join("");
  return `<section class="mos-ui-journey ${toneClass(block.tone)}">${title || subtitle ? `<header class="mos-ui-journey-head">${title}${subtitle}</header>` : ""}<div class="mos-ui-journey-track">${cards}</div></section>`;
}

function renderChecklist(block) {
  const items = Array.isArray(block.items ?? block.tasks) ? (block.items ?? block.tasks) : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-checklist-title">${esc(block.title)}</p>` : "";
  const rows = items
    .map((item) => {
      const status = String(item.status ?? (item.done ? "done" : "pending")).toLowerCase();
      const state = ["done", "complete", "completed", "success"].includes(status)
        ? "is-done"
        : ["active", "running", "current", "in_progress"].includes(status)
          ? "is-active"
          : ["error", "blocked", "fail"].includes(status)
            ? "is-error"
            : "";
      const label = esc(item.label ?? item.title ?? item.text ?? "");
      const hint = item.hint ?? item.body ?? item.detail;
      if (!label) return "";
      return `<li class="mos-ui-check ${state}"><span class="mos-ui-check-mark" aria-hidden="true"></span><span><strong>${label}</strong>${hint ? `<small>${esc(hint)}</small>` : ""}</span></li>`;
    })
    .filter(Boolean)
    .join("");
  return rows ? `<section class="mos-ui-checklist ${toneClass(block.tone)}">${title}<ul>${rows}</ul></section>` : "";
}

function renderKanban(block) {
  const columns = Array.isArray(block.columns ?? block.items) ? (block.columns ?? block.items) : [];
  if (!columns.length) return "";
  const title = block.title ? `<h3 class="mos-ui-kanban-title">${esc(block.title)}</h3>` : "";
  const cols = columns
    .map((col) => {
      const cards = (Array.isArray(col.items ?? col.cards) ? (col.items ?? col.cards) : [])
        .map((card) => {
          const label = esc(card.title ?? card.label ?? card.text ?? "");
          if (!label) return "";
          const body = card.body ?? card.detail ?? card.description;
          const chips = card.tags?.length ? renderChips({ items: card.tags }) : "";
          return `<article class="mos-ui-kanban-card ${toneClass(card.tone)}"><strong>${label}</strong>${body ? `<p>${esc(body)}</p>` : ""}${chips}</article>`;
        })
        .filter(Boolean)
        .join("");
      return `<section class="mos-ui-kanban-col"><header><span>${esc(col.title ?? col.label ?? "Lane")}</span><b>${(col.items ?? col.cards ?? []).length}</b></header><div>${cards}</div></section>`;
    })
    .join("");
  return `<section class="mos-ui-kanban ${toneClass(block.tone)}">${title}<div class="mos-ui-kanban-board">${cols}</div></section>`;
}

function renderPricing(block) {
  const plans = Array.isArray(block.plans ?? block.items) ? (block.plans ?? block.items) : [];
  if (!plans.length) return "";
  const title = block.title ? `<h3 class="mos-ui-pricing-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-pricing-sub">${esc(block.subtitle)}</p>` : "";
  const cards = plans
    .map((plan, i) => {
      const featured = plan.featured || i === Number(block.featuredIndex ?? -1);
      const name = esc(plan.name ?? plan.title ?? `Plan ${i + 1}`);
      const price = esc(plan.price ?? plan.value ?? "");
      const period = plan.period ? `<span>${esc(plan.period)}</span>` : "";
      const desc = plan.body ?? plan.description;
      const features = renderTextList(plan.features ?? plan.items, "mos-ui-pricing-features", "mos-ui-pricing-feature");
      const actions = renderActions(plan.actions, { primaryFirst: true });
      return `<article class="mos-ui-pricing-card ${featured ? "is-featured" : ""} ${toneClass(plan.tone)}"><header><h4>${name}</h4>${price ? `<p class="mos-ui-price">${price}${period}</p>` : ""}${desc ? `<p>${esc(desc)}</p>` : ""}</header>${features}${actions}</article>`;
    })
    .join("");
  return `<section class="mos-ui-pricing ${toneClass(block.tone)}">${title || subtitle ? `<header class="mos-ui-pricing-head">${title}${subtitle}</header>` : ""}<div class="mos-ui-pricing-grid">${cards}</div></section>`;
}

function renderTestimonial(block) {
  const items = Array.isArray(block.items ?? block.quotes) ? (block.items ?? block.quotes) : [block];
  const cards = items
    .map((item) => {
      const quote = esc(item.quote ?? item.text ?? item.body ?? "");
      if (!quote) return "";
      const avatar = renderMedia(item.avatar ?? item.image, { className: "mos-ui-testimonial-avatar" });
      const name = item.author ?? item.name ? `<strong>${esc(item.author ?? item.name)}</strong>` : "";
      const role = item.role ?? item.title ? `<span>${esc(item.role ?? item.title)}</span>` : "";
      return `<figure class="mos-ui-testimonial-card ${toneClass(item.tone)}"><blockquote>${quote}</blockquote><figcaption>${avatar}<div>${name}${role}</div></figcaption></figure>`;
    })
    .filter(Boolean)
    .join("");
  if (!cards) return "";
  const title = block.title ? `<h3 class="mos-ui-testimonials-title">${esc(block.title)}</h3>` : "";
  return `<section class="mos-ui-testimonials ${toneClass(block.tone)}">${title}<div class="mos-ui-testimonials-grid">${cards}</div></section>`;
}

function renderPromptChips(block) {
  const items = Array.isArray(block.items ?? block.prompts ?? block.chips) ? (block.items ?? block.prompts ?? block.chips) : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-prompt-title">${esc(block.title)}</p>` : "";
  const mode = safeVariant(block.mode ?? block.action, ["send", "composer"], "send");
  const chips = items
    .map((item) => {
      const obj = typeof item === "string" ? { label: item, message: item } : item;
      const label = obj.label ?? obj.title ?? obj.text ?? obj.message;
      const message = obj.message ?? obj.prompt ?? obj.text ?? label;
      if (!label || !message) return "";
      const data =
        mode === "composer"
          ? `data-mos-action="composer" data-mos-composer="${escAttr(message)}"`
          : `data-mos-action="send" data-mos-send="${escAttr(message)}"`;
      const tip = mode === "composer" ? "Fill composer" : "Send prompt";
      return `<button type="button" class="mos-ui-prompt-chip ${toneClass(obj.tone)}" ${data}${hoverAttrs(tip, label)}>${esc(label)}</button>`;
    })
    .filter(Boolean)
    .join("");
  return chips ? `<section class="mos-ui-prompts ${toneClass(block.tone)}">${title}<div class="mos-ui-prompt-row">${chips}</div></section>` : "";
}

function renderSourceGrid(block) {
  const items = Array.isArray(block.items ?? block.sources ?? block.connectors)
    ? (block.items ?? block.sources ?? block.connectors)
    : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-source-title">${esc(block.title)}</p>` : "";
  const cards = items
    .map((item) => {
      const status = String(item.status ?? item.state ?? "ready").toLowerCase();
      const label = esc(item.label ?? item.name ?? item.source ?? "Source");
      const detail = item.detail ?? item.body ?? item.description;
      const detailHtml = detail ? `<p class="mos-ui-source-detail">${esc(detail)}</p>` : "";
      const meta = item.meta ?? item.metric ?? item.count ?? item.auth;
      const metaHtml = meta ? `<span class="mos-ui-source-meta">${esc(meta)}</span>` : "";
      const tool = item.tool ?? item.platform ?? item.kind;
      const toolHtml = tool ? `<span class="mos-ui-source-tool">${esc(tool)}</span>` : "";
      return `<article class="mos-ui-source-card is-${escAttr(status)}">
        <div class="mos-ui-source-status" aria-hidden="true"></div>
        <div class="mos-ui-source-copy">
          <strong>${label}</strong>
          ${detailHtml}
        </div>
        <div class="mos-ui-source-tags">${toolHtml}${metaHtml}</div>
      </article>`;
    })
    .join("");
  return `<section class="mos-ui-source-grid ${toneClass(block.tone)}">${title}<div class="mos-ui-source-grid-inner">${cards}</div></section>`;
}

function renderRouterMap(block) {
  const items = Array.isArray(block.items ?? block.routes ?? block.tools) ? (block.items ?? block.routes ?? block.tools) : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-router-title">${esc(block.title)}</p>` : "";
  const routes = items
    .map((item, idx) => {
      const status = String(item.status ?? item.state ?? "ready").toLowerCase();
      const label = esc(item.label ?? item.intent ?? item.name ?? `Route ${idx + 1}`);
      const tool = esc(item.tool ?? item.platform ?? item.connector ?? "Tool");
      const fallback = item.fallback ? `<span class="mos-ui-router-fallback">Fallback: ${esc(item.fallback)}</span>` : "";
      const detail = item.detail ?? item.body ?? item.description;
      const detailHtml = detail ? `<p class="mos-ui-router-detail">${esc(detail)}</p>` : "";
      return `<li class="mos-ui-router-step is-${escAttr(status)}">
        <span class="mos-ui-router-num">${idx + 1}</span>
        <div class="mos-ui-router-copy">
          <strong>${label}</strong>
          <span class="mos-ui-router-tool">${tool}</span>
          ${detailHtml}
          ${fallback}
        </div>
      </li>`;
    })
    .join("");
  return `<section class="mos-ui-router ${toneClass(block.tone)}">${title}<ol class="mos-ui-router-list">${routes}</ol></section>`;
}

function renderResearchOs(block) {
  const title = block.title ? `<h3 class="mos-ui-research-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-research-sub">${esc(block.subtitle)}</p>` : "";
  const eyebrow = block.eyebrow ? `<p class="mos-ui-research-eyebrow">${esc(block.eyebrow)}</p>` : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  const stats = block.stats?.length ? renderStatRow({ items: block.stats }) : "";
  const routes = block.routes?.length ? renderRouterMap({ title: block.routesTitle ?? "Routing", items: block.routes }) : "";
  const sources = block.sources?.length ? renderSourceGrid({ title: block.sourcesTitle ?? "Connected sources", items: block.sources }) : "";
  const body = renderBlocks(block.blocks ?? block.items);
  return `<section class="mos-ui-research-os ${toneClass(block.tone ?? "accent")}">
    <header class="mos-ui-research-head">
      <div>${eyebrow}${title}${subtitle}</div>
      ${actions}
    </header>
    ${stats}
    <div class="mos-ui-research-body">${routes}${sources}${body}</div>
  </section>`;
}

function renderSection(block) {
  const title = block.title ? `<h3 class="mos-ui-section-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-section-sub">${esc(block.subtitle)}</p>` : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  const inner = renderBlocks(block.blocks ?? block.items);
  if (!title && !subtitle && !inner && !actions) return "";
  const copy = title || subtitle ? `<div class="mos-ui-section-copy">${title}${subtitle}</div>` : "";
  return `<section class="mos-ui-section ${toneClass(block.tone)}"><header class="mos-ui-section-head">${copy}${actions}</header>${inner ? `<div class="mos-ui-section-body">${inner}</div>` : ""}</section>`;
}

function renderEmpty(block) {
  const title = esc(block.title ?? "Nothing here yet");
  const body = block.body || block.text ? `<p class="mos-ui-empty-body">${esc(block.body ?? block.text)}</p>` : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  return `<section class="mos-ui-empty ${toneClass(block.tone)}"><div class="mos-ui-empty-mark" aria-hidden="true"></div><h3>${title}</h3>${body}${actions}</section>`;
}

function renderLoading(block) {
  const label = esc(block.label ?? block.text ?? "Working");
  return `<section class="mos-ui-loading ${toneClass(block.tone)}" aria-busy="true"><span class="mos-ui-loading-orb" aria-hidden="true"></span><span>${label}</span></section>`;
}

function renderGrid(block) {
  const cols = Math.min(Math.max(Number(block.columns ?? block.cols ?? 2) || 2, 1), 4);
  const items = Array.isArray(block.items) ? block.items : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-grid-title">${esc(block.title)}</p>` : "";
  const cells = items
    .map((item) => `<div class="mos-ui-grid-cell">${renderBlock({ type: "card", ...item })}</div>`)
    .join("");
  return `<div class="mos-ui-grid mos-ui-grid--${cols}">${title}<div class="mos-ui-grid-inner">${cells}</div></div>`;
}

function renderCard(block) {
  const title = block.title ? `<h4 class="mos-ui-card-title">${esc(block.title)}</h4>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-card-sub">${esc(block.subtitle)}</p>` : "";
  const body = block.body || block.text || block.message;
  const bodyHtml = body ? `<div class="mos-ui-card-body">${esc(body)}</div>` : "";
  const media = renderMedia(block.image ?? block.media, { className: "mos-ui-card-media" });
  const nested = block.blocks?.length ? `<div class="mos-ui-card-nested">${renderBlocks(block.blocks)}</div>` : "";
  const actions = renderActions(block.actions ?? block.items, { primaryFirst: true });
  const tone = toneClass(block.tone ?? block.variant);
  const dense = body && String(body).length > 180 ? "mos-ui-card--dense" : "";
  return `<article class="mos-ui-card ${dense} ${tone}">${media}${title}${subtitle}${bodyHtml}${nested}${actions}</article>`;
}

function renderBanner(block) {
  const text = esc(block.text ?? block.message ?? block.title ?? "");
  if (!text) return "";
  const tone = toneClass(block.tone ?? block.variant);
  return `<div class="mos-ui-banner ${tone}" role="status">${text}</div>`;
}

function renderActionRow(block) {
  const title = block.title ? `<p class="mos-ui-row-title">${esc(block.title)}</p>` : "";
  const actions = renderActions(block.items ?? block.actions ?? block.buttons, { primaryFirst: true });
  if (!actions) return "";
  return `<div class="mos-ui-action-row">${title}${actions}</div>`;
}

function renderActionMenu(block) {
  const items = Array.isArray(block.items ?? block.actions ?? block.buttons) ? (block.items ?? block.actions ?? block.buttons) : [];
  if (!items.length) return "";
  const title = esc(block.title ?? block.label ?? "Options");
  const body = items.map((item, i) => actionBtn(item, { compact: true, primary: i === 0 && block.primaryFirst !== false })).filter(Boolean).join("");
  if (!body) return "";
  const open = block.open ? " open" : "";
  return `<details class="mos-ui-action-menu"${open}><summary class="mos-ui-action-menu-head">${title}</summary><div class="mos-ui-action-menu-body">${body}</div></details>`;
}

function renderFileList(block) {
  const items = Array.isArray(block.items) ? block.items : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-list-title">${esc(block.title)}</p>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-list-sub">${esc(block.subtitle)}</p>` : "";
  const rows = items
    .map((item) => {
      const path = normalizePath(item.path ?? item.file ?? "");
      if (!path) return "";
      const name = esc(item.label ?? item.name ?? fileName(path));
      const sub = item.subtitle ?? item.hint ?? path;
      const subHtml = sub ? `<span class="mos-ui-file-sub">${esc(sub)}</span>` : "";
      const kind = item.kind === "dir" || item.type === "dir" ? "open-dir" : "open-file";
      const visual = fileVisualKind(item, path, kind);
      const ext = kind === "open-dir" ? "" : fileExt(path).slice(0, 4).toUpperCase();
      const badge = item.kindLabel ?? item.typeLabel ?? (kind === "open-dir" ? "Folder" : ext || "File");
      const tags = renderMiniTags(fileMetaTags(item), "mos-ui-file-tag");
      const tagsHtml = tags ? `<span class="mos-ui-file-tags">${tags}</span>` : "";
      const tip = kind === "open-dir" ? `Open folder: ${path}` : `Open file: ${path}`;
      return `<button type="button" class="mos-ui-file-row mos-ui-file-row--${escAttr(visual)}" data-mos-action="${kind}" data-mos-path="${escAttr(path)}"${hoverAttrs(tip, name)}><span class="mos-ui-file-icon mos-ui-file-icon--${escAttr(visual)}" data-ext="${escAttr(ext)}" aria-hidden="true"></span><span class="mos-ui-file-copy"><span class="mos-ui-file-name">${name}</span>${subHtml}${tagsHtml}</span><span class="mos-ui-file-kind">${esc(badge)}</span><span class="mos-ui-file-open">Open</span></button>`;
    })
    .filter(Boolean)
    .join("");
  if (!rows) return "";
  return `<div class="mos-ui-file-list">${title}${subtitle}<div class="mos-ui-file-rows">${rows}</div></div>`;
}

function renderArtifactGrid(block) {
  const items = Array.isArray(block.items ?? block.artifacts ?? block.files ?? block.links)
    ? block.items ?? block.artifacts ?? block.files ?? block.links
    : [];
  if (!items.length) return "";
  const title = block.title ? `<h3 class="mos-ui-artifacts-title">${esc(block.title)}</h3>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-artifacts-sub">${esc(block.subtitle)}</p>` : "";
  const cards = items
    .map((item) => {
      const title = esc(item.title ?? item.label ?? item.name ?? fileName(item.path ?? item.file ?? item.href ?? ""));
      if (!title) return "";
      const body = item.body ?? item.description ?? item.subtitle ?? item.hint;
      const bodyHtml = body ? `<p>${esc(body)}</p>` : "";
      const meta = item.meta ?? item.kind ?? item.type;
      const metaHtml = meta ? `<span class="mos-ui-artifact-meta">${esc(meta)}</span>` : "";
      const href = String(item.href ?? item.url ?? "").trim();
      const path = normalizePath(item.path ?? item.file ?? "");
      const visual = fileVisualKind(item, path || href, href ? "url" : "");
      const ext = visual === "dir" || visual === "link" ? "" : fileExt(path || href).slice(0, 4).toUpperCase();
      const tags = renderMiniTags(fileMetaTags(item), "mos-ui-artifact-tag");
      const tagsHtml = tags ? `<div class="mos-ui-artifact-tags">${tags}</div>` : "";
      const pathAttrs = pathActionAttrs(item);
      const open = href
        ? `<a class="mos-ui-artifact-open" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer"${hoverAttrs(`Open link: ${href}`, title)}>Open</a>`
        : pathAttrs
          ? `<button type="button" class="mos-ui-artifact-open"${pathAttrs}>Open</button>`
          : "";
      const actions = renderActions(item.actions, { compact: true });
      return `<article class="mos-ui-artifact-card mos-ui-artifact-card--${escAttr(visual)} ${toneClass(item.tone)}"><div class="mos-ui-artifact-icon mos-ui-file-icon--${escAttr(visual)}" data-ext="${escAttr(ext)}" aria-hidden="true"></div><div class="mos-ui-artifact-copy"><h4>${title}</h4>${bodyHtml}${metaHtml}${tagsHtml}</div>${open}${actions}</article>`;
    })
    .filter(Boolean)
    .join("");
  return cards ? `<section class="mos-ui-artifacts ${toneClass(block.tone)}">${title || subtitle ? `<header>${title}${subtitle}</header>` : ""}<div class="mos-ui-artifact-grid">${cards}</div></section>` : "";
}

function renderBreadcrumb(block) {
  const parts = Array.isArray(block.path)
    ? block.path.map(String)
    : normalizePath(block.path ?? "")
        .split("/")
        .filter(Boolean);
  if (!parts.length) return "";
  const crumbs = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push(
      `<button type="button" class="mos-ui-crumb" data-mos-action="open-dir" data-mos-path="${escAttr(acc)}">${esc(part)}</button>`
    );
  }
  return `<nav class="mos-ui-breadcrumb" aria-label="Folder path">${crumbs.join('<span class="mos-ui-crumb-sep">/</span>')}</nav>`;
}

function renderKv(block) {
  const rows = Array.isArray(block.items)
    ? block.items
    : Object.entries(block.data ?? block.fields ?? {}).map(([k, v]) => ({ key: k, value: v }));
  if (!rows.length) return "";
  const title = block.title ? `<p class="mos-ui-kv-title">${esc(block.title)}</p>` : "";
  const body = rows
    .map((row) => {
      const k = esc(row.key ?? row.label ?? "");
      const v = esc(row.value ?? row.text ?? "");
      if (!k) return "";
      return `<div class="mos-ui-kv-row"><span class="mos-ui-kv-key">${k}</span><span class="mos-ui-kv-val">${v}</span></div>`;
    })
    .filter(Boolean)
    .join("");
  return `<div class="mos-ui-kv">${title}${body}</div>`;
}

function renderStatRow(block) {
  const items = Array.isArray(block.items ?? block.stats) ? (block.items ?? block.stats) : [];
  if (!items.length) return "";
  const title = block.title ? `<p class="mos-ui-stat-title">${esc(block.title)}</p>` : "";
  const cells = items
    .map((item) => {
      const val = esc(item.value ?? item.stat ?? "—");
      const label = esc(item.label ?? item.name ?? "");
      const hint = item.hint ? `<span class="mos-ui-stat-hint">${esc(item.hint)}</span>` : "";
      return `<div class="mos-ui-stat ${toneClass(item.tone)}"><span class="mos-ui-stat-val">${val}</span><span class="mos-ui-stat-label">${label}</span>${hint}</div>`;
    })
    .join("");
  return `<div class="mos-ui-stat-row">${title}<div class="mos-ui-stat-inner">${cells}</div></div>`;
}

function renderTimeline(block) {
  const steps = Array.isArray(block.steps ?? block.items) ? (block.steps ?? block.items) : [];
  if (!steps.length) return "";
  const title = block.title ? `<p class="mos-ui-timeline-title">${esc(block.title)}</p>` : "";
  const rows = steps
    .map((step, i) => {
      const status = String(step.status ?? (step.done ? "done" : "pending")).toLowerCase();
      const st = ["done", "complete", "success"].includes(status)
        ? "is-done"
        : ["active", "running", "current"].includes(status)
          ? "is-active"
          : ["error", "fail"].includes(status)
            ? "is-error"
            : "";
      return `<div class="mos-ui-step ${st}"><span class="mos-ui-step-num">${i + 1}</span><div class="mos-ui-step-body"><strong>${esc(step.title ?? step.label ?? `Step ${i + 1}`)}</strong><p>${esc(step.body ?? step.text ?? "")}</p></div></div>`;
    })
    .join("");
  return `<div class="mos-ui-timeline">${title}${rows}</div>`;
}

function renderChips(block) {
  const items = Array.isArray(block.items ?? block.chips ?? block.tags) ? (block.items ?? block.chips ?? block.tags) : [];
  if (!items.length) return "";
  const chips = items
    .map((item) => {
      const label = typeof item === "string" ? item : item.label ?? item.text ?? "";
      const tone = typeof item === "object" ? toneClass(item.tone) : "mos-ui-tone-neutral";
      return `<span class="mos-ui-chip ${tone}">${esc(label)}</span>`;
    })
    .join("");
  return `<div class="mos-ui-chips">${chips}</div>`;
}

function renderQuote(block) {
  const text = esc(block.text ?? block.body ?? block.quote ?? "");
  if (!text) return "";
  const cite = block.cite ?? block.author ? `<cite class="mos-ui-quote-cite">${esc(block.cite ?? block.author)}</cite>` : "";
  return `<blockquote class="mos-ui-quote ${toneClass(block.tone)}"><p>${text}</p>${cite}</blockquote>`;
}

function renderDivider(block) {
  const label = block.label ?? block.text;
  if (label) return `<div class="mos-ui-divider mos-ui-divider--label"><span>${esc(label)}</span></div>`;
  return `<hr class="mos-ui-divider" />`;
}

function renderProgress(block) {
  const value = Math.min(100, Math.max(0, Number(block.value ?? block.percent ?? 0)));
  const label = block.label ? `<span class="mos-ui-progress-label">${esc(block.label)}</span>` : "";
  const sub = block.hint ? `<span class="mos-ui-progress-hint">${esc(block.hint)}</span>` : "";
  return `<div class="mos-ui-progress ${toneClass(block.tone)}">${label}<div class="mos-ui-progress-track"><div class="mos-ui-progress-fill" style="width:${value}%"></div></div><span class="mos-ui-progress-val">${value}%</span>${sub}</div>`;
}

function renderTable(block) {
  const cols = Array.isArray(block.columns) ? block.columns.map(String) : [];
  const rows = Array.isArray(block.rows) ? block.rows : [];
  if (!cols.length && !rows.length) return "";
  const headers = cols.length
    ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`
    : "";
  const body = rows
    .map((row) => {
      const cells = Array.isArray(row) ? row : Object.values(row);
      return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  const title = block.title ? `<p class="mos-ui-table-title">${esc(block.title)}</p>` : "";
  return `<div class="mos-ui-table-wrap">${title}<table class="mos-ui-table">${headers}<tbody>${body}</tbody></table></div>`;
}

function renderField(field, formId) {
  const name = escAttr(field.name ?? field.id ?? "");
  const label = field.label ? `<label class="mos-ui-field-label" for="${formId}_${name}">${esc(field.label)}</label>` : "";
  const hint = field.hint ? `<span class="mos-ui-field-hint">${esc(field.hint)}</span>` : "";
  const type = String(field.type ?? "text").toLowerCase();
  const val = escAttr(field.value ?? field.default ?? "");
  const required = field.required ? " required" : "";
  const min = field.min != null ? ` min="${escAttr(field.min)}"` : "";
  const max = field.max != null ? ` max="${escAttr(field.max)}"` : "";
  const step = field.step != null ? ` step="${escAttr(field.step)}"` : "";
  if (type === "hidden") {
    return `<input type="hidden" id="${formId}_${name}" name="${name}" value="${val}" />`;
  }
  if (type === "textarea") {
    return `<div class="mos-ui-field"><label class="mos-ui-field-label">${esc(field.label ?? name)}</label>${hint}<textarea class="mos-ui-input mos-ui-textarea" id="${formId}_${name}" name="${name}" rows="${field.rows ?? 3}" placeholder="${escAttr(field.placeholder ?? "")}"${required}>${esc(field.value ?? field.default ?? "")}</textarea></div>`;
  }
  if (type === "select" && Array.isArray(field.options)) {
    const multiple = field.multiple ? " multiple" : "";
    const opts = field.options
      .map((o) => {
        const v = typeof o === "string" ? o : o.value ?? o.label ?? "";
        const l = typeof o === "string" ? o : o.label ?? o.value ?? "";
        const sel = v === (field.value ?? field.default) ? " selected" : "";
        return `<option value="${escAttr(v)}"${sel}>${esc(l)}</option>`;
      })
      .join("");
    return `<div class="mos-ui-field">${label}${hint}<select class="mos-ui-input mos-ui-select" id="${formId}_${name}" name="${name}"${multiple}${required}>${opts}</select></div>`;
  }
  if (type === "checkbox") {
    const checked = field.checked || field.value === true ? " checked" : "";
    return `<label class="mos-ui-field mos-ui-field-check"><input type="checkbox" class="mos-ui-input" id="${formId}_${name}" name="${name}" value="1"${checked} /><span>${esc(field.label ?? name)}</span></label>`;
  }
  if (type === "toggle" || type === "switch") {
    const checked = field.checked || field.value === true ? " checked" : "";
    return `<label class="mos-ui-field mos-ui-field-toggle"><span><strong>${esc(field.label ?? name)}</strong>${hint}</span><input type="checkbox" id="${formId}_${name}" name="${name}" value="1"${checked} /><i aria-hidden="true"></i></label>`;
  }
  if ((type === "radio" || type === "segmented") && Array.isArray(field.options)) {
    const opts = field.options
      .map((o, i) => {
        const v = typeof o === "string" ? o : o.value ?? o.label ?? "";
        const l = typeof o === "string" ? o : o.label ?? o.value ?? "";
        const checked = v === (field.value ?? field.default) || (!field.value && !field.default && i === 0) ? " checked" : "";
        return `<label class="mos-ui-choice"><input type="radio" name="${name}" value="${escAttr(v)}"${checked} /><span>${esc(l)}</span></label>`;
      })
      .join("");
    return `<fieldset class="mos-ui-field mos-ui-choice-group"><legend class="mos-ui-field-label">${esc(field.label ?? name)}</legend>${hint}<div class="mos-ui-choices">${opts}</div></fieldset>`;
  }
  const inputType = ["number", "email", "url", "password", "range", "color", "date", "time", "datetime-local", "search", "tel"].includes(type) ? type : "text";
  return `<div class="mos-ui-field">${label}${hint}<input class="mos-ui-input" type="${inputType}" id="${formId}_${name}" name="${name}" value="${val}" placeholder="${escAttr(field.placeholder ?? "")}"${min}${max}${step}${required} /></div>`;
}

function renderForm(block) {
  const formId = `f_${Math.random().toString(36).slice(2, 9)}`;
  const fields = Array.isArray(block.fields) ? block.fields : [];
  const title = block.title ? `<h4 class="mos-ui-form-title">${esc(block.title)}</h4>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-form-sub">${esc(block.subtitle)}</p>` : "";
  const body = fields.map((f) => renderField(f, formId)).join("");
  const submit = block.submit ?? {};
  const submitLabel = esc(submit.label ?? block.submitLabel ?? "Send to chat");
  const template = escAttr(submit.template ?? submit.message ?? "{{json}}");
  const sendMode = escAttr(submit.mode ?? block.mode ?? "send");
  const apiName = submit.api ?? block.api ? ` data-mos-api="${escAttr(submit.api ?? block.api)}"` : "";
  const resultMode = submit.result ?? block.result ? ` data-mos-result="${escAttr(submit.result ?? block.result)}"` : "";
  const confirm = submit.confirm ?? block.confirm ? ` data-mos-confirm="${escAttr(submit.confirm ?? block.confirm)}"` : "";
  const success = submit.successLabel ? ` data-mos-success-label="${escAttr(submit.successLabel)}"` : "";
  const failure = submit.failureLabel ? ` data-mos-failure-label="${escAttr(submit.failureLabel)}"` : "";
  return `<form class="mos-ui-form ${toneClass(block.tone)}" data-mos-form="${escAttr(formId)}" data-mos-form-template="${template}" data-mos-form-send="${sendMode}"${apiName}${resultMode}${confirm} onsubmit="return false">
    ${title}${subtitle}<div class="mos-ui-form-fields">${body}</div>
    <button type="button" class="mos-ui-btn mos-ui-btn--primary mos-ui-form-submit" data-mos-action="form-submit"${success}${failure}>${submitLabel}</button>
  </form>`;
}

function renderSelect(block) {
  const options = Array.isArray(block.options ?? block.items) ? (block.options ?? block.items) : [];
  if (!options.length) return "";
  const id = `s_${Math.random().toString(36).slice(2, 9)}`;
  const label = block.label ? `<label class="mos-ui-select-label" for="${id}">${esc(block.label)}</label>` : "";
  const opts = options
    .map((o, i) => {
      const v = escAttr(typeof o === "string" ? o : o.value ?? o.id ?? String(i));
      const l = esc(typeof o === "string" ? o : o.label ?? o.title ?? v);
      return `<option value="${v}"${i === 0 ? " selected" : ""}>${l}</option>`;
    })
    .join("");
  const panels = options
    .map((o, i) => {
      const content = typeof o === "object" ? o.content ?? o.body ?? o.text ?? o.description ?? "" : "";
      const blocks = typeof o === "object" && o.blocks?.length ? renderBlocks(o.blocks) : "";
      const inner = blocks || (content ? `<p>${esc(content)}</p>` : "");
      const active = i === 0 ? " is-active" : "";
      return `<div class="mos-ui-select-panel${active}" data-select-panel="${i}">${inner}</div>`;
    })
    .join("");
  return `<div class="mos-ui-select" data-mos-select="${escAttr(id)}">${label}<select class="mos-ui-input mos-ui-select mos-ui-select-main" id="${id}" data-mos-select-trigger>${opts}</select><div class="mos-ui-select-panels">${panels}</div></div>`;
}

function renderAccordion(block) {
  const items = Array.isArray(block.items) ? block.items : [];
  if (!items.length) return "";
  const rows = items
    .map((item, i) => {
      const open = item.open || i === 0;
      const body = item.blocks?.length ? renderBlocks(item.blocks) : `<p>${esc(item.body ?? item.content ?? item.text ?? "")}</p>`;
      return `<details class="mos-ui-accordion-item"${open ? " open" : ""}><summary class="mos-ui-accordion-head">${esc(item.title ?? item.label ?? `Section ${i + 1}`)}</summary><div class="mos-ui-accordion-body">${body}</div></details>`;
    })
    .join("");
  return `<div class="mos-ui-accordion">${rows}</div>`;
}

function renderTabs(block) {
  const tabs = Array.isArray(block.tabs ?? block.items) ? (block.tabs ?? block.items) : [];
  if (!tabs.length) return "";
  const id = `t_${Math.random().toString(36).slice(2, 9)}`;
  const bar = tabs
    .map((tab, i) => {
      const active = i === 0 ? " is-active" : "";
      return `<button type="button" class="mos-ui-tab${active}" data-mos-tab="${i}">${esc(tab.label ?? tab.title ?? `Tab ${i + 1}`)}</button>`;
    })
    .join("");
  const panels = tabs
    .map((tab, i) => {
      const active = i === 0 ? " is-active" : "";
      const inner = tab.blocks?.length ? renderBlocks(tab.blocks) : `<p>${esc(tab.body ?? tab.content ?? "")}</p>`;
      return `<div class="mos-ui-tab-panel${active}" data-mos-tab-panel="${i}">${inner}</div>`;
    })
    .join("");
  return `<div class="mos-ui-tabs" data-mos-tabs="${escAttr(id)}"><div class="mos-ui-tab-bar" role="tablist">${bar}</div><div class="mos-ui-tab-panels">${panels}</div></div>`;
}

function renderCreativePanel(block) {
  const title = block.title ? `<h4 class="mos-ui-creative-title">${esc(block.title)}</h4>` : "";
  const subtitle = block.subtitle ? `<p class="mos-ui-creative-sub">${esc(block.subtitle)}</p>` : "";
  const preview = renderMedia(block.preview ?? block.image, { className: "mos-ui-creative-preview" });
  const controls = block.controls?.length
    ? `<div class="mos-ui-creative-controls">${block.controls.map((f, i) => renderField(f, `cp_${i}`)).join("")}</div>`
    : block.fields?.length
      ? renderForm({ ...block, type: "form", title: null, subtitle: null })
      : "";
  const actions = renderActions(block.actions, { primaryFirst: true });
  const chips = block.tags?.length ? renderChips({ items: block.tags }) : "";
  return `<div class="mos-ui-creative ${toneClass(block.tone)}"><header class="mos-ui-creative-head">${title}${subtitle}${chips}</header><div class="mos-ui-creative-body">${preview}<div class="mos-ui-creative-side">${controls}${actions}</div></div></div>`;
}

function renderStack(block) {
  const inner = renderBlocks(block.blocks ?? block.items);
  return inner ? `<div class="mos-ui-stack">${inner}</div>` : "";
}

function renderBlock(block) {
  if (!block || typeof block !== "object") return "";
  const type = String(block.type ?? "card").toLowerCase();
  switch (type) {
    case "stack":
    case "group":
      return renderStack(block);
    case "hero":
      return renderHero(block);
    case "page":
    case "landing":
    case "website":
    case "webpage":
      return renderPage(block);
    case "spotlight":
    case "feature-spotlight":
    case "showcase":
      return renderSpotlight(block);
    case "carousel":
    case "slider":
      return renderCarousel(block);
    case "gallery":
    case "image-gallery":
      return renderGallery(block);
    case "media-row":
    case "filmstrip":
    case "preview-row":
      return renderMediaRow(block);
    case "compare":
    case "before-after":
      return renderCompare(block);
    case "embed":
    case "iframe":
      return renderEmbed(block);
    case "dashboard":
    case "panel":
      return renderDashboard(block);
    case "bento":
    case "bento-grid":
    case "feature-grid":
      return renderBento(block);
    case "journey":
    case "scroll-journey":
    case "story-row":
      return renderJourney(block);
    case "checklist":
    case "task-list":
      return renderChecklist(block);
    case "kanban":
    case "board":
      return renderKanban(block);
    case "pricing":
    case "plans":
      return renderPricing(block);
    case "testimonial":
    case "testimonials":
    case "social-proof":
      return renderTestimonial(block);
    case "prompt-chips":
    case "suggestions":
    case "quick-prompts":
      return renderPromptChips(block);
    case "research-os":
    case "research":
    case "command-center":
    case "operating-system":
      return renderResearchOs(block);
    case "source-grid":
    case "sources":
    case "connectors":
    case "doctor":
    case "health-check":
    case "capability-check":
      return renderSourceGrid(block);
    case "router-map":
    case "routing":
    case "routes":
      return renderRouterMap(block);
    case "section":
      return renderSection(block);
    case "empty":
    case "empty-state":
      return renderEmpty(block);
    case "loading":
    case "working":
      return renderLoading(block);
    case "grid":
    case "card-grid":
      return renderGrid(block);
    case "card":
      return renderCard(block);
    case "banner":
    case "alert":
    case "status":
      return renderBanner(block);
    case "action-row":
    case "actions":
    case "buttons":
      return renderActionRow(block);
    case "action-menu":
    case "button-options":
    case "dropdown-actions":
      return renderActionMenu(block);
    case "file-list":
    case "files":
      return renderFileList(block);
    case "artifact-grid":
    case "artifacts":
    case "links":
    case "link-grid":
      return renderArtifactGrid(block);
    case "breadcrumb":
    case "crumbs":
      return renderBreadcrumb(block);
    case "kv":
    case "key-value":
    case "meta":
      return renderKv(block);
    case "stat-row":
    case "stats":
    case "metrics":
      return renderStatRow(block);
    case "timeline":
    case "steps":
      return renderTimeline(block);
    case "chips":
    case "tags":
    case "badges":
      return renderChips(block);
    case "quote":
    case "callout":
      return renderQuote(block);
    case "divider":
    case "separator":
      return renderDivider(block);
    case "progress":
      return renderProgress(block);
    case "table":
      return renderTable(block);
    case "form":
    case "editor":
      return renderForm(block);
    case "select":
    case "dropdown":
      return renderSelect(block);
    case "accordion":
      return renderAccordion(block);
    case "tabs":
      return renderTabs(block);
    case "creative-panel":
    case "media-editor":
    case "higgsfield":
      return renderCreativePanel(block);
    case "media":
    case "image":
    case "video":
    case "audio":
    case "pdf":
      return renderMedia(block, { className: "mos-ui-media-block" });
    default:
      return renderCard({ ...block, type: "card" });
  }
}

function looksLikePartialMosUiJson(text) {
  const t = String(text ?? "").trim();
  if (!t || t.length < 2) return true;
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return false;
  } catch {
    return true;
  }
}

export function renderMosUiSkeleton() {
  return `<div class="mos-ui mos-ui-streaming" aria-busy="true">
    <div class="mos-ui-skeleton mos-ui-skeleton-hero"></div>
    <div class="mos-ui-skeleton mos-ui-skeleton-lines"></div>
  </div>`;
}

export function parseMosUiPayload(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data.filter((b) => b && typeof b === "object");
    if (data && typeof data === "object") return [data];
    return null;
  } catch {
    return null;
  }
}

function renderInvalidMosUiFallback(text) {
  const body = String(text ?? "").trim();
  const compact = body.length > 4000 ? `${body.slice(0, 4000)}\n\n...` : body;
  return renderCard({
    type: "card",
    tone: "warn",
    title: "MOS UI could not parse this block",
    body: compact || "The assistant returned an empty or malformed mos-ui JSON block.",
  });
}

export function renderMosUi(raw, opts = {}) {
  const text = String(raw ?? "").trim();
  const blocks = parseMosUiPayload(raw);
  if (!blocks?.length) {
    if (opts.streaming && looksLikePartialMosUiJson(text)) {
      return renderMosUiSkeleton();
    }
    return `<div class="mos-ui mos-ui-error" role="alert">${renderInvalidMosUiFallback(text)}</div>`;
  }
  const inner = blocks.map(renderBlock).filter(Boolean).join("");
  if (!inner) {
    return `<div class="mos-ui mos-ui-error" role="alert">Empty mos-ui block</div>`;
  }
  return `<div class="mos-ui">${inner}</div>`;
}
