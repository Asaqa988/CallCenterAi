import "./style.css";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { messages } from "./i18n.js";
import { createOrb } from "./orb.js";

const $ = (id) => document.getElementById(id);
const el = {
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

  el.micBtn.disabled = !connected;
  el.micBtn.setAttribute("aria-pressed", String(state.muted));
  el.micBtn.setAttribute("aria-label", t(state.muted ? "unmute" : "mute"));
  el.micBtn.title = t(state.muted ? "unmute" : "mute");
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
  document.title = `${t("title")} · ${t("brand")}`;
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
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

el.langBtn.addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  store.set("lang", lang);
  applyLanguage();
});
el.themeBtn.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  store.set("theme", theme);
  applyTheme();
});

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
      },
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

el.micBtn.addEventListener("click", () => {
  if (!client) return;
  state.muted = !state.muted;
  client.enableMic(!state.muted);
  if (state.muted) orb.setLevel(0);
  render();
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

// Leaving the page should hang up so the bot's session ends on the server.
window.addEventListener("pagehide", () => client?.disconnect());

applyTheme();
applyLanguage();
