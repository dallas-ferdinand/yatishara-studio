# Studio fix log

Things to fix later. Add fresh entries below.

## Open

-

## Done

### 9. Attachment URL metadata can poison brief notes (fake phone)
Strip CDN `?token=&expires=` in `buildPromptWithAttachments`; `stripHttpUrlQueryParams` before contact extraction / bootstrap.

### 10. Salvage / critic exhaustion leaves review_ready with no generate
Proceed-without-delta re-emits gen sheet (`tryReemitReadyReview`); commit soft-fails if generation plan missing instead of stranded `review_ready`.

### 11. `folder_switched` thrash floods chat events
Debounced folder sync + mutation no-op; `listEvents` / API / agent history exclude `folder_switched` with over-fetch.

### 12. Hypermotion / video cold-start hard-aborts
Empty/`collecting` video turns soft-fail with a recoverable ask (subject + audio) instead of opaque abort.

### 13. Generated asset names / style refs from AUTHORITATIVE headers
`promptSnippetForName` strips AUTHORITATIVE preamble; optional subject preferred for filenames.

### 14. Brief subject / production field pollution on complex flyers
Mode-aware `emptyBriefPayload` (no image duration); plan omits duration for non-video; subject capped ~100 chars with overflow → visualDirection; logo-led exact fidelity.

### 15. Early style overconfidence + weak revise delta capture
Agent rules: ask style when unset; lock revise deltas into notes/visualDirection before critic polish.

### Chat always shows last 80 messages
Live tail is newest-80 (not empty + Load earlier). Older history still via Load earlier. Display always merges live page so the latest window never disappears.

### 1. Chat media context menu → attach to composer
Long-press (mobile) / right-click (desktop) on chat result media opens explorer context menu (Download, Use in chat). Wired via `StudioChatResultCard` → `setContextMenu`.

### 2. Ghost / sticky references on every later message
Turn attachments are authoritative (no brief merge / no auto prior-gen fill). Brief no longer rehydrates ghost attachment state into the empty composer.

### 3. Edit-an-image / flyer revise flow
Agent rules: edit/fix/revise → `list_generations` + `set_references` + `match_reference` when fidelity matters; prompt as deltas.

### 4. Users cannot change username
`profiles.changeUsername` + editable handle in Profile settings.

### 5. Profile grid LogoLoader — square clip + wrong fade target
Breathe animates the mark only; glass plate stable; bare/tile CSS hides plate square.

### 6. Feed media not centered in frame (letterbox)
`.profile-post-slide-frame` centers media; full-height → center X, full-width → center Y.

### 7. Title-bar tab chip only appears when tab is active
Restored `.cursor-unified-tab-preview` CSS; inactive tabs read attachments from `composerContextsRef`.

### 8. Chat agent: ask only for real missing info; otherwise emit gen sheet once
`salvageReviewWhenBriefComplete` + rules/tool copy forbid readiness-only `ask_user`.
