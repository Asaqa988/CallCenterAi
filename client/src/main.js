import "./style.css";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { messages } from "./i18n.js";
import { createOrb } from "./orb.js";
import { renderSite } from "./site.js";
import { currentSection, goTo, registerNavigator } from "./nav.js";
import { uiState } from "./ui-state.js";

const $ = (id) => document.getElementById(id);
const el = {
  fab: $("fab"),
  fabText: $("fabText"),
  bar: $("callbar"),
  barStatus: $("barStatus"),
  barMic: $("barMic"),
  barEnd: $("barEnd"),
  status: $("status"),
  statusText: $("statusText"),
  callBtn: $("callBtn"),
  callLabel: $("callLabel"),
  micBtn: $("micBtn"),
  settingsBtn: $("settingsBtn"),
  menu: $("menu"),
  micSelect: $("micSelect"),
  micHint: $("micHint"),
  langBtn: $("langBtn"),
  themeBtn: $("themeBtn"),
  clearBtn: $("clearBtn"),
  log: $("log"),
  error: $("error"),
  botAudio: $("botAudio"),
};

const orb = createOrb($("orb"));

// ---- preferences (storage can be blocked, so every access is guarded) -------
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

let lang = store.get("lang") || "ar";
let theme =
  store.get("theme") ||
  (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

const t = (key) => messages[lang][key] ?? key;

// ---- conversation state -----------------------------------------------------
// phase: idle | connecting | connected
const state = {
  phase: "idle",
  muted: false,
  userSpeaking: false,
  botSpeaking: false,
  thinking: false,
  error: null,
};
let client = null;
let micId = null;

function statusKey() {
  if (state.phase === "idle") return "idle";
  if (state.phase === "connecting") return "connecting";
  if (state.muted) return "muted";
  if (state.userSpeaking) return "listening";
  if (state.botSpeaking) return "speaking";
  if (state.thinking) return "thinking";
  return "ready";
}

function render() {
  const key = statusKey();
  const label = key[0].toUpperCase() + key.slice(1);
  el.status.dataset.state = key;
  el.statusText.textContent = t("status" + label);

  const connected = state.phase === "connected";
  el.callBtn.dataset.state = state.phase;
  el.callBtn.disabled = state.phase === "connecting";
  el.callLabel.textContent = t(
    state.phase === "idle" ? "start" : state.phase === "connecting" ? "connecting" : "end",
  );

  el.fabText.textContent = t("fabIdle");
  el.barStatus.textContent = t("status" + label);
  el.bar.dataset.state = key;
  el.barEnd.setAttribute("aria-label", t("end"));
  el.barEnd.title = t("end");
  updateDock();

  for (const b of [el.micBtn, el.barMic]) {
    b.setAttribute("aria-pressed", String(state.muted));
    b.setAttribute("aria-label", t(state.muted ? "unmute" : "mute"));
    b.title = t(state.muted ? "unmute" : "mute");
  }
  el.micBtn.disabled = !connected;
  el.micSelect.disabled = !connected || el.micSelect.options.length === 0;
  el.micHint.hidden = connected && el.micSelect.options.length > 0;

  const orbMode =
    state.phase === "connecting"
      ? "connecting"
      : state.phase === "idle"
        ? "idle"
        : state.muted
          ? "muted"
          : state.botSpeaking
            ? "speaking"
            : state.userSpeaking
              ? "listening"
              : "idle";
  orb.setMode(orbMode);

  el.error.hidden = !state.error;
  el.error.textContent = state.error || "";
}

function setError(key, detail) {
  state.error = detail ? `${t(key)} (${detail})` : t(key);
  render();
}

// ---- language / theme --------------------------------------------------------
function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = `${t("brand")} · ${t("title")}`;
  document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
  document.querySelectorAll("[data-i18n-label]").forEach((n) => {
    n.setAttribute("aria-label", t(n.dataset.i18nLabel));
    n.title = t(n.dataset.i18nLabel);
  });
  el.langBtn.textContent = t("langBtn");
  el.langBtn.setAttribute("lang", lang === "ar" ? "en" : "ar");
  document.querySelectorAll(".msg .who").forEach((n) => {
    n.textContent = t(n.closest(".msg").classList.contains("user") ? "you" : "bot");
  });
  renderSite(lang);
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

function setLang(next) {
  if (!messages[next] || next === lang) return;
  lang = next;
  store.set("lang", lang);
  applyLanguage();
  sendUiState();
}
function setTheme(next) {
  if (!["light", "dark"].includes(next) || next === theme) return;
  theme = next;
  store.set("theme", theme);
  applyTheme();
  sendUiState();
}
el.langBtn.addEventListener("click", () => setLang(lang === "ar" ? "en" : "ar"));
el.themeBtn.addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"));

// ---- transcript ---------------------------------------------------------------
const turn = { user: null, bot: null };

function addMessage(role) {
  const li = document.createElement("li");
  li.className = `msg ${role}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = t(role === "user" ? "you" : "bot");
  const body = document.createElement("span");
  body.className = "body";
  // The text's own script decides its direction, so Arabic reads right-to-left
  // (and its punctuation lands correctly) even when the interface is English.
  body.dir = "auto";
  li.append(who, body);
  el.log.append(li);
  return { li, body, finalText: "", interim: "", segments: new Map() };
}

function paint(m) {
  m.body.textContent = "";
  m.body.append(m.finalText);
  if (m.interim) {
    const i = document.createElement("span");
    i.className = "interim";
    i.textContent = (m.finalText ? " " : "") + m.interim;
    m.body.append(i);
  }
  el.log.scrollTop = el.log.scrollHeight;
}

function onUserTranscript({ text, final }) {
  if (!text) return;
  turn.bot = null;
  turn.user ??= addMessage("user");
  const m = turn.user;
  if (final) {
    m.finalText = m.finalText ? `${m.finalText} ${text}` : text;
    m.interim = "";
  } else {
    m.interim = text;
  }
  paint(m);
}

let segmentSeq = 0;

function onBotOutput(data) {
  // Only whole sentences go in the transcript; word/token events are the same
  // text again in smaller pieces.
  const type = data.output_type ?? data.text_type ?? data.aggregated_by;
  if (!data.text || (type && type !== "sentence" && type !== "backchannel")) return;
  turn.user = null;
  turn.bot ??= addMessage("bot");
  const m = turn.bot;

  // The bot reports each sentence twice: once when it is queued ("new") and
  // again once it has been spoken ("completed"). Both carry the same
  // segment_id, so they update one element instead of adding two.
  const key = data.segment_id ?? `n${++segmentSeq}`;
  let seg = m.segments.get(key);
  if (!seg) {
    seg = document.createElement("span");
    seg.className = "seg";
    if (m.segments.size) m.body.append(" ");
    m.segments.set(key, seg);
    m.body.append(seg);
  }
  seg.textContent = data.text;
  // Text that was queued but not spoken yet (or was cut off) is shown dimmed.
  seg.classList.toggle("pending", !!data.spoken_status && data.spoken_status !== "completed");
  el.log.scrollTop = el.log.scrollHeight;
}

el.clearBtn.addEventListener("click", () => {
  el.log.textContent = "";
  turn.user = turn.bot = null;
});

// ---- Pipecat client -----------------------------------------------------------
function resetSession() {
  state.phase = "idle";
  state.muted = false;
  state.userSpeaking = state.botSpeaking = state.thinking = false;
  orb.setLevel(0);
  el.botAudio.srcObject = null;
  el.micSelect.replaceChildren();
  turn.user = turn.bot = null;
  client = null;
  render();
}

function fillMics(mics) {
  el.micSelect.replaceChildren(
    ...mics.map((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `Microphone ${i + 1}`;
      return o;
    }),
  );
  if (micId && mics.some((d) => d.deviceId === micId)) el.micSelect.value = micId;
  render();
}

function createClient() {
  return new PipecatClient({
    transport: new SmallWebRTCTransport({ waitForICEGathering: true }),
    enableMic: true,
    enableCam: false,
    callbacks: {
      onTransportStateChanged: (s) => {
        if (s === "disconnected" && state.phase === "connected") resetSession();
      },
      onBotReady: () => {
        state.phase = "connected";
        render();
        sendUiState();
      },
      onUICommand: handleUICommand,
      onDisconnected: () => resetSession(),
      onError: (msg) => {
        const detail = msg?.data?.error || msg?.data?.message;
        setError("errGeneric", detail);
      },
      onTrackStarted: (track, participant) => {
        if (track.kind !== "audio" || participant?.local) return;
        el.botAudio.srcObject = new MediaStream([track]);
        el.botAudio.play().catch(() => {});
      },
      onLocalAudioLevel: (level) => {
        if (!state.botSpeaking && !state.muted) orb.setLevel(level);
      },
      onRemoteAudioLevel: (level) => {
        if (state.botSpeaking) orb.setLevel(level);
      },
      onUserStartedSpeaking: () => {
        state.userSpeaking = true;
        state.thinking = false;
        render();
      },
      onUserStoppedSpeaking: () => {
        state.userSpeaking = false;
        state.thinking = true;
        orb.setLevel(0);
        render();
      },
      onBotStartedSpeaking: () => {
        state.botSpeaking = true;
        state.thinking = false;
        render();
      },
      onBotStoppedSpeaking: () => {
        state.botSpeaking = false;
        orb.setLevel(0);
        render();
      },
      onUserTranscript,
      onBotOutput,
      onAvailableMicsUpdated: fillMics,
      onMicUpdated: (mic) => {
        micId = mic?.deviceId ?? micId;
        if (micId) el.micSelect.value = micId;
      },
    },
  });
}

async function start() {
  state.error = null;
  state.phase = "connecting";
  render();
  client = createClient();
  try {
    await client.startBotAndConnect({
      endpoint: "/start",
      requestData: { createDailyRoom: false, enableDefaultIceServers: true, transport: "webrtc" },
    });
    if (micId) client.updateMic(micId);
  } catch (err) {
    const denied = err?.name === "NotAllowedError" || /permission|denied|notallowed/i.test(String(err));
    resetSession();
    setError(denied ? "errMic" : "errConnect", denied ? null : err?.message);
  }
}

async function stop() {
  const c = client;
  resetSession();
  try {
    await c?.disconnect();
  } catch {
    /* already closed */
  }
}

el.callBtn.addEventListener("click", () => {
  if (state.phase === "idle") start();
  else if (state.phase === "connected") stop();
});

function toggleMute() {
  if (!client) return;
  state.muted = !state.muted;
  client.enableMic(!state.muted);
  if (state.muted) orb.setLevel(0);
  render();
}
el.micBtn.addEventListener("click", toggleMute);
el.barMic.addEventListener("click", toggleMute);
el.barEnd.addEventListener("click", () => {
  if (state.phase === "connected") stop();
});

el.micSelect.addEventListener("change", () => {
  micId = el.micSelect.value;
  client?.updateMic(micId);
});

// ---- settings menu ------------------------------------------------------------
function toggleMenu(open) {
  el.menu.hidden = !open;
  el.settingsBtn.setAttribute("aria-expanded", String(open));
}
el.settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu(el.menu.hidden);
});
document.addEventListener("click", (e) => {
  if (!el.menu.contains(e.target)) toggleMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleMenu(false);
});

// ---- docked controls -----------------------------------------------------------
// While the assistant section is off screen, the user still needs the call controls: an
// idle visitor gets a "talk" shortcut, and someone mid-call gets a small bar with mute and
// end (the agent may have scrolled the page away from the buttons).
const onScreen = new Set();

function updateDock() {
  const connected = state.phase === "connected";
  const assistantOn = onScreen.has("assistant");
  el.fab.classList.toggle("away", connected || assistantOn || onScreen.has("hero"));
  el.bar.hidden = !(connected && !assistantOn);
}

if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.isIntersecting ? onScreen.add(e.target.id) : onScreen.delete(e.target.id));
      updateDock();
    },
    { threshold: 0.35 },
  );
  io.observe($("assistant"));
  io.observe($("hero"));

  // The section crossing the middle of the screen is "where the user is". The voice
  // agent is told this so it can tell whether something is already in front of them.
  const band = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) uiState.set({ visibleSectionId: e.target.id });
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  for (const id of ["hero", "assistant", "prices", "about", "contact"]) band.observe($(id));
}

// ---- voice agent -> page ---------------------------------------------------------
// The agent sends UI commands over the same connection. Moving around only ever scrolls
// or toggles classes; nothing here reloads the page (that would end the call).
registerNavigator((href) => {
  document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", href);
});

const SECTION_TITLE = {
  assistant: "assistantTitle",
  prices: "pricesTitle",
  about: "aboutTitle",
  contact: "contactTitle",
};

function handleUICommand({ command, payload }) {
  const p = payload || {};
  switch (command) {
    case "show": {
      if (p.item) {
        uiState.highlight(p.item); // scrolls it into view if it is not already
      } else if (p.mode === "navigate") {
        uiState.set({ focusSectionId: p.section });
      } else if (SECTION_TITLE[p.section]) {
        uiState.highlight(SECTION_TITLE[p.section]);
      }
      uiState.spotlight(p.spotlight && p.item ? p.item : null);
      break;
    }
    case "select":
      uiState.set({ selectedPackage: p.package ?? null });
      break;
    case "set-language":
      setLang(p.lang);
      break;
    case "set-theme":
      setTheme(p.mode);
      break;
  }
}

function inView(node) {
  const r = node.getBoundingClientRect();
  return r.top >= 70 && r.bottom <= window.innerHeight - 70;
}

uiState.subscribe((s, changed) => {
  if (changed.includes("focusSectionId") && s.focusSectionId) {
    goTo(`#${s.focusSectionId}`);
    uiState.set({ focusSectionId: null });
  }
  if (changed.includes("highlightId")) {
    document.querySelector(".hl")?.classList.remove("hl");
    const node = s.highlightId && $(s.highlightId);
    if (node) {
      if (node.tagName === "DETAILS") node.open = true;
      node.classList.add("hl");
      if (!inView(node)) node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (changed.includes("spotlightId")) {
    document.querySelector(".spot")?.classList.remove("spot");
    document.body.toggleAttribute("data-spot", !!s.spotlightId);
    if (s.spotlightId) $(s.spotlightId)?.classList.add("spot");
  }
  if (changed.includes("selectedPackage")) {
    renderSite(lang);
    sendUiState();
  }
  if (changed.includes("visibleSectionId")) sendUiState();
});

// ---- page -> voice agent -----------------------------------------------------------
// Tell the agent where the user is, so its tools can decide between "scroll there" and
// "it is already on screen". Debounced so scrolling does not flood the connection.
let uiTimer = 0;
function sendUiState() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    if (state.phase !== "connected" || !client) return;
    try {
      client.sendUIEvent("ui-state", {
        section: currentSection(),
        lang,
        theme,
        selectedPackage: uiState.get().selectedPackage,
      });
    } catch {
      /* the connection is closing */
    }
  }, 200);
}

// Leaving the page should hang up so the bot's session ends on the server.
window.addEventListener("pagehide", () => client?.disconnect());

applyTheme();
applyLanguage();
