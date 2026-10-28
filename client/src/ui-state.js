// Tiny shared store for what the page is showing. The voice agent's UI commands write
// to it and the page reacts: sections scroll into view, cards get highlighted.
// Nothing here talks to the network.

const state = {
  visibleSectionId: "hero", // the section crossing the middle of the screen (read-only for commands)
  focusSectionId: null, // set to scroll a section into view; cleared once handled
  spotlightId: null, // a card that is shown while the others are dimmed
  highlightId: null, // an element that pulses for a few seconds
  selectedPackage: null, // the system the user picked: small | medium | business
};

const listeners = new Set();
let highlightTimer = 0;
let spotlightTimer = 0;

export const uiState = {
  get: () => state,

  set(patch) {
    const changed = Object.keys(patch).filter((k) => state[k] !== patch[k]);
    if (!changed.length) return;
    Object.assign(state, patch);
    listeners.forEach((fn) => fn(state, changed));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Highlight an element for a moment, then let it go.
  highlight(id, ms = 4500) {
    clearTimeout(highlightTimer);
    // Asking for the same element again must pulse (and scroll) again.
    if (state.highlightId === id) uiState.set({ highlightId: null });
    uiState.set({ highlightId: id });
    if (id) highlightTimer = setTimeout(() => uiState.set({ highlightId: null }), ms);
  },

  spotlight(id, ms = 7000) {
    clearTimeout(spotlightTimer);
    uiState.set({ spotlightId: id });
    if (id) spotlightTimer = setTimeout(() => uiState.set({ spotlightId: null }), ms);
  },
};
