// Navigation bridge. The voice agent's commands arrive outside the UI code, so they
// cannot reach a router or a component directly; the page registers one navigator here
// and everything else calls goTo().
//
// Critical: moving around must never reload the page. A reload (or setting
// window.location to another document) tears down the WebRTC connection and ends the
// call mid-sentence. The registered navigator only scrolls; the hash fallback below only
// runs if nothing has been registered yet, and a hash change never reloads.

import { uiState } from "./ui-state.js";

let navigator = null;

export function registerNavigator(fn) {
  navigator = fn;
}

export function goTo(href) {
  if (navigator) {
    navigator(href);
    return;
  }
  window.location.hash = href.startsWith("#") ? href : `#${href}`;
}

export function currentSection() {
  return uiState.get().visibleSectionId;
}
