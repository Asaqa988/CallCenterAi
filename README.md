# CallCenterAi

An Arabic (Jordanian dialect) voice assistant built with [Pipecat](https://github.com/pipecat-ai/pipecat).
You talk to it in the browser; it answers by voice from a small company knowledge base.

Everything runs on one Google Gemini API key:

| Step | Service |
|---|---|
| Speech to text | Gemini (`GeminiSTTService`) |
| Thinking | Gemini 3.8 Flash (`GoogleLLMService`) |
| Text to speech | Gemini TTS (`GeminiTTSService`) |
| Transport | SmallWebRTC (browser) |

## Project layout

```
server/            the bot (Python)
  bot.py             pipeline, system prompt (Jordanian dialect) and the web server setup
  knowledge.md       company facts the bot answers from (a made-up example company)
  ui/                the built web page served by the bot
  .env.example       copy to .env and add your key
client/            source of the web page (Vite, plain JavaScript)
  src/               main.js (connection), orb.js (voice orb), i18n.js (Arabic/English), style.css
```

## Run it

You need [uv](https://docs.astral.sh/uv/) and a Google Gemini API key.

```bash
cd server
cp .env.example .env        # then put your key after GOOGLE_API_KEY=
uv sync
uv run bot.py
```

Open http://localhost:7860, allow the microphone, and press *Start conversation*.
The first conversation after starting the server takes longer to connect while models load.

- The original Pipecat playground is available at http://localhost:7860/classic/.
- Never commit `server/.env`. It is ignored by git.

## Change what the bot knows or how it talks

- **Instructions and dialect:** edit `SYSTEM_PROMPT` and `TTS_INSTRUCTIONS` in `server/bot.py`, then restart.
- **Company knowledge:** edit `server/knowledge.md`; it is re-read at the start of each conversation.
- **Voice or models:** set `GEMINI_VOICE`, `GEMINI_TTS_MODEL` or `GOOGLE_MODEL` in `server/.env`.

## Change the web page

The page is built from `client/` into `server/ui/`. After editing `client/src/`:

```bash
cd client
npm install      # first time only
npm run build
```

See `client/README.md` for live preview.
