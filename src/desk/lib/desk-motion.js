/**
 * Desk motion — CSS chat-motion.css handles loaders; restart keyframes after innerHTML patches.
 */
import { animate } from "@motionone/dom";

/** Force CSS keyframe animations to restart after innerHTML swap. */
export function restartCssAnimation(el, name) {
  if (!el) return;
  el.style.animation = "none";
  void el.offsetHeight;
  el.style.animation = "";
  if (name) el.style.animationName = name;
}

/** Restart CSS-driven live indicators after streaming HTML patch. */
export function restartChatAnimations(root) {
  if (!root) return;

  root.querySelectorAll(".flow-planning-text--live").forEach((el) => {
    restartCssAnimation(el, "planning-shimmer-slide");
  });

  root.querySelectorAll(".chat-sheen-text").forEach((el) => {
    restartCssAnimation(el, "chat-sheen-slide");
  });

  root.querySelectorAll(".flow-status-chev, .flow-tool-bar-chev--live").forEach((chev) => {
    restartCssAnimation(chev, "flow-status-chev-pulse");
  });

  root.querySelectorAll(
    ".flow-tool-bar.is-live, .flow-tool-inline.is-live, .flow-tool-card.is-live, .flow-tool-group.is-live, .flow-status-line.is-live"
  ).forEach((card) => {
    restartCssAnimation(card);
    card.querySelectorAll(".flow-tool-bar-icon--live").forEach((icon) => {
      restartCssAnimation(icon, "chat-tool-icon-pulse");
    });
  });

  root.querySelectorAll(".flow-tool-await-bar").forEach((bar) => {
    restartCssAnimation(bar, "await-shimmer");
  });
}

/** Message / panel entrance */
export function animateIn(el, opts = {}) {
  if (!el) return;
  animate(
    el,
    { opacity: [0, 1], y: [opts.y ?? 8, 0] },
    { duration: opts.duration ?? 0.28, easing: "ease-out" }
  );
}

export function markDeskMotionOn() {
  document.documentElement.classList.add("desk-motion-on");
}
