# Voice assistant web client

The redesigned interface served by the bot at http://localhost:7860/ and
http://localhost:7860/client/ (the original Pipecat client is still available at
/classic/).

- Source: `src/` (`main.js` talks to the bot, `orb.js` draws the orb, `i18n.js` has the
  Arabic/English texts, `style.css` has the design tokens for dark and light themes).
- Rebuild after editing: `npm install` (once), then `npm run build`. It writes `../server/ui`,
  which `server/bot.py` serves.
- Live preview while editing: start the bot (`uv run bot.py` in `../server`), then `npm run dev`
  and open http://localhost:5173/.
