export const CHATGPT_BANNER_GUIDE_SOURCE = "chatgpt-banner-guide";

export function bannerOrderSource(handle, source) {
  if (handle !== "13oz-vinyl-banner" || source !== CHATGPT_BANNER_GUIDE_SOURCE) return null;
  return { tag: CHATGPT_BANNER_GUIDE_SOURCE, label: "ChatGPT banner guide" };
}
