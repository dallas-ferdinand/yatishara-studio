/**
 * Offline ElevenLabs v3 audio-tag canon for Create Enhance (and docs sync).
 * Agent loads the same catalog from skills/prompt-voiceover.md — keep in sync when editing.
 */
export const ELEVEN_V3_AUDIO_TAG_CATALOG = [
  "OFFLINE TAG CATALOG (prefer these; infer close variants only). Place [tag] immediately before/after the affected segment. Sparse: usually 0–3 tags per short ad.",
  "Emotion: [happy]/[happily]=warm win/payoff; [excited]/[excitedly]=hook/reveal/offer energy; [sad]=pre-turn pain (rare); [angry]/[annoyed]=broken/frustrating problem; [appalled]=strong disbelief at the problem; [surprised]=before-after flip; [curious]/[curiously]=invite lean-in; [thoughtful]=reflective/witness; [sarcastic]=dry humor if brand allows; [mischievously]=playful tease; [professional]=corporate/service open; [sympathetic]=empathy for viewer pain; [reassuring]=calm post-turn/CTA; [questioning]=rhetorical Q; [impressed]=react to proof; [cute]=soft lifestyle if voice fits; [dismissive]=shrug off old way; [warmly]=intimate close/sign-off.",
  "Volume: [whispers]/[whisper]/[whispering]=secret/intimate (not hard CTA); [softly]=gentle care; [shouts]/[shout]=rare hype only if voice can shout — else prefer CAPS+!.",
  "Non-verbal voice: [laughs]/[laughing]/[chuckles]/[giggles]=light release; [laughs harder]/[starts laughing]/[wheezing]=strong comedy only; [sighs]/[sigh]/[frustrated sigh]=exhaustion before relief; [exhales]/[exhales sharply]=reset into the fix; [inhales deeply]=rare big-news beat; [clears throat]=comic/formal reset; [snorts]=comic disbelief; [crying]=almost never in ads; [happy gasp]=delight at reveal; [gulps]/[swallows]=nervous story beat.",
  "Pacing: [short pause]/[pause]/[pauses]=problem→product or before CTA; [long pause]=heavy drama (often too much in 15s); [rushed]=busy chaos; [drawn out]=weary/sarcastic stretch. Also use … CAPS ! ? for pace without tags.",
  "Accent/performance ONLY if brief asks: [strong French accent]/[strong X accent]; [sings]/[singing]/[singing quickly]; [woo].",
  "BANNED: [standing] [grinning] [pacing] [smiling] [music] [applause] [clapping] [gunshot] [explosion] and any visual/stage or music/SFX tags.",
].join(" ");
