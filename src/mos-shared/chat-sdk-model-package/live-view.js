import { buildViewFromSdkMessages } from "./turn-builder.js";

export function rebuildLiveSdkView(sdkMessages = []) {
  const built = buildViewFromSdkMessages(sdkMessages, { streaming: true });
  return {
    blocks: built.blocks,
    content: built.content,
    _messages: [...sdkMessages],
  };
}

export function createLiveSdkView() {
  return rebuildLiveSdkView([]);
}

export function applySdkMessageToLiveView(view, message) {
  if (!view) return rebuildLiveSdkView(message ? [message] : []);
  if (!Array.isArray(view._messages)) view._messages = [];
  if (message) view._messages.push(message);
  const next = rebuildLiveSdkView(view._messages);
  view.blocks = next.blocks;
  view.content = next.content;
  view._messages = next._messages;
  return view;
}
