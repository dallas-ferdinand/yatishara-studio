# Yatishara Studio UI Polish Notes

Use this as porting guide for bringing recent MercuryOS Desk interaction polish into Yatishara Studio.

## Goal

Make Studio feel calmer, more modern, and more alive without adding noise. Interactions should confirm touch/click, make hierarchy clearer, and keep work surfaces readable.

## Motion Rules

- Buttons and clickable controls should **grow slightly on hover**, not float upward.
- Press state should compress slightly: `scale(0.985)`.
- Hover timing: ~160ms.
- Card/depth timing: ~240ms.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Respect `prefers-reduced-motion: reduce`.

Suggested tokens:

```css
:root {
  --studio-motion-fast: 160ms;
  --studio-motion-med: 240ms;
  --studio-motion-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --studio-hover-scale: 1.018;
  --studio-press-scale: 0.985;
}
```

## Hover And Click Behavior

Apply to:

- Primary buttons
- Icon buttons
- File manager rows/cards
- Client cards
- Media bucket tiles
- Tabs/chips
- Dropdown rows
- Upload/action pills

Behavior:

- Hover: `transform: scale(var(--studio-hover-scale))`
- Active: `transform: scale(var(--studio-press-scale))`
- Focus: visible accent ring
- Disabled: no transform, lower opacity

Avoid:

- `translateY(-1px)` hover lift
- Large bouncing
- Motion on every passive element

## File Manager / Media Manager

Bring these Desk patterns into Studio file/client media areas:

- Row hover gets subtle background + border tint.
- Grid/file card hover gets soft shadow, slightly brighter border, grow-scale.
- Selected file/client has stronger accent border and quiet glow.
- Folder/file rows should expose inline actions only on hover/focus.
- Preview panels should feel like glass cards: soft border, inset highlight, shadow.
- Drag/drop state should tint border and background, not jump layout.

Good target:

```css
.studio-file-row,
.studio-file-card,
.studio-client-card {
  transition:
    transform var(--studio-motion-fast) var(--studio-motion-ease),
    border-color var(--studio-motion-fast) var(--studio-motion-ease),
    background var(--studio-motion-fast) var(--studio-motion-ease),
    box-shadow var(--studio-motion-med) var(--studio-motion-ease);
}

@media (hover: hover) {
  .studio-file-row:hover,
  .studio-file-card:hover,
  .studio-client-card:hover {
    transform: scale(var(--studio-hover-scale));
  }
}

.studio-file-row:active,
.studio-file-card:active,
.studio-client-card:active {
  transform: scale(var(--studio-press-scale));
}
```

## Live Status / Work State

Use newer Desk pattern:

- No pill around live status.
- Show only three animated dots + status text.
- Shimmer text while work is happening.
- Bottom of scrolling chat/work feed fades into background near composer/action bar.
- Hide tool/thought/code blocks when user preference says tools are hidden.

This avoids blinking/raw tool-code flashes while still showing useful progress.

## Composer / Input Areas

- Text input containers should glow subtly on focus.
- Mic/live transcription state should use small status text, not big banners.
- Attachments should have hover grow + reveal remove/open controls.
- Drag/drop should tint container and keep layout stable.

## Visual Tone

- Dark glass surfaces
- Soft borders
- Accent glow only for active state
- Small shimmer, never full-card strobe
- More depth on cards, less motion on text-heavy panes

## Porting Checklist

- [ ] Replace hover lift with hover grow across Studio buttons/cards.
- [ ] Add active press scale.
- [ ] Add focus-visible rings.
- [ ] Add file manager row/card hover states.
- [ ] Add media bucket tile hover/selected states.
- [ ] Add live status plain dots + shimmer text.
- [ ] Add bottom fade on scroll containers above composer/action bars.
- [ ] Ensure hidden tool/thought UI does not render raw internals.
- [ ] Test with reduced motion enabled.
