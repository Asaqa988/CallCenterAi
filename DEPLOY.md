# Deploying to Railway

The whole app (bot + web page) runs as one service built from `server/Dockerfile.railway`.
The web page is served by the bot at `/client/`, so there is nothing else to host.

## Why a TURN server is required

Railway accepts incoming HTTP but not incoming UDP, and WebRTC audio normally needs UDP.
A TURN server solves this: the browser and the bot both connect *out* to it and it relays
the audio. Without one, the page loads and the bot answers the connection request, but you
hear nothing.

Get TURN credentials from any provider (for example Metered, Cloudflare, Twilio). You need a
server URL, a username and a password.

## Steps

1. **Railway project.** Railway dashboard, *New Project*, *Deploy from GitHub repo*, choose
   `Asaqa988/CallCenterAi`.
2. **Service settings.**
   - *Settings*, *Source*, *Root Directory*: `server`
   - *Settings*, *Networking*, *Generate Domain* (port `7860`)
3. **Variables** (*Variables* tab):

   | Name | Value |
   |---|---|
   | `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.railway` |
   | `PORT` | `7860` |
   | `GOOGLE_API_KEY` | your Gemini key |
   | `PIPECAT_ICE_SERVERS` | JSON list, see below |
   | `N8N_UNANSWERED_WEBHOOK_URL` | optional: your n8n webhook that saves questions the bot could not answer |
   | `UI_TOOLS` | optional: the bot scrolls and highlights the page while it talks. Default `auto` (a background model does it, no extra silence). `tools` lets the voice model call the tools itself (about 2 seconds more silence per answer). `0` turns it off |

   `PIPECAT_ICE_SERVERS` example (paste it as plain text, with the double quotes):

   ```json
   [{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR-TURN-HOST:3478","username":"YOUR-USER","credential":"YOUR-PASSWORD"}]
   ```

   If your provider also offers TURN over TCP/TLS (port 443), add it as another entry; it
   helps on networks that block UDP.
4. **Deploy.** Railway builds the image (about 4 minutes the first time, the image is ~2.6 GB)
   and starts it. Open `https://<your-domain>.up.railway.app/`.
5. **Test.** Press *Start conversation* and allow the microphone. The first conversation after
   a deploy takes longer to connect (models load).

## Cost and size

Railway bills by usage. The free trial gives $5 of credit for 30 days; after that the free plan
limits a service to 0.5 GB of RAM, which is probably too small for this bot, so plan on the
Hobby plan. See https://railway.com/pricing.

## Troubleshooting

- **Page loads, connects, but silent or stuck on "Connecting"**: the TURN settings are wrong or
  missing. Check `PIPECAT_ICE_SERVERS` is valid JSON and the credentials work.
- **Build fails with "no such file"**: Root Directory must be `server`.
- **Changing the page**: edit `client/src/`, run `npm run build` in `client/`, commit the
  updated `server/ui/`, and push. Railway redeploys on every push.
