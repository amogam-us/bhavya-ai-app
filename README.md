# Bhavya AI

An AI independence companion for autistic children, built for the Meta Global AI Developer
Hackathon. Parents teach daily routines by writing, speaking or recording a short video; Bhavya
turns them into step-by-step missions with picture cards and guides the child through them, while
keeping the camera off in private rooms.

All AI runs on **Meta Muse models** through the Meta Model API. No other LLMs are used.

| Muse model | Used for |
|---|---|
| `muse-spark-1.3` | Drafting missions from text or a demo video, checking camera steps |
| `sam-3.1` | Finding and highlighting the next object |
| `muse-image-1.0` | Picture cards for each step and the communication board |
| `muse-voice-transcribe-1.0` | Parents speaking instructions instead of typing |

Spoken guidance uses the device's built-in text-to-speech (not an AI model).

## Quick start

Requirements: Node.js 22.13 or newer, and a Meta Model API key.

```bash
npm install
cp .env.example .env      # then put your key in MODEL_API_KEY
npm run dev
```

Open <http://localhost:5173>. The home page links to the parent dashboard and the child app:

- **Parent dashboard** (`/parent`): create, review and approve routines; progress; child settings and rooms.
- **Child app** (`/child`): the step player, communication board and break screen.
- **Home simulator** (`/simulator`): stands in for presence sensors and smart lights. It is not
  linked from the home page; open the address directly.

Two demo routines are added on first start: *Using the restroom* (private room, starts
automatically, camera off) and *Pack your school bag* (living room, camera checks).

### Demo walkthrough

1. Open the simulator and the child app side by side.
2. In the child app, tap **Start** (browsers only allow sound after a tap).
3. In the simulator, click **Restroom**: the camera turns off, the light turns on and the routine
   starts on the child's screen. Tap **Done**, **Help** or **Break** to see each path.
4. Click **Living room**, then start *Pack your school bag* in the child app. The camera opens,
   SAM 3.1 highlights the object and Muse Spark confirms each step.
5. Watch help requests and progress arrive in the parent dashboard.

### Using a phone

The child app works on a phone on the same Wi-Fi, at `http://<computer-ip>:5173/child` (the hub
prints the address). Browsers only allow the **camera and microphone over HTTPS**, so for camera
steps on a phone start the dev server with HTTPS:

```bash
BHAVYA_HTTPS=1 npm run dev     # PowerShell: $env:BHAVYA_HTTPS=1; npm run dev
```

Then open `https://<computer-ip>:5173/child` and accept the self-signed certificate warning.

### Production build

```bash
npm run build     # builds the web app into web/dist
npm start         # the hub serves the API and the web app on http://localhost:8787
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Hub (with reload) on port 8787 and the web app on port 5173 |
| `npm run check` | Typecheck, lint and unit tests |
| `npm test` | Unit tests only |
| `npm run format` | Format the code with Prettier |

## Architecture

```
web (React)  ── REST + WebSocket ──>  hub (Node.js)  ── HTTPS ──>  Meta Model API (Muse)
 parent / child / simulator             mission engine, privacy gate,
                                        Muse gateway, device bridge, SQLite
```

```
shared/   Types and zod schemas shared by hub and web (missions, protocol, API)
hub/      Home hub: Fastify REST API, WebSocket device bridge, SQLite (node:sqlite)
  src/engine/    Mission state machine, prompt levels, timers, smart-home actions
  src/muse/      Meta Model API client, prompts, JSON schemas, SAM output parser
  src/missions/  Drafting, safety rules, picture cards
  src/http/      Routes, WebSocket bridge, error handling
  test/          Unit tests (vitest)
web/      Vite + React app
  src/pages/parent     Parent dashboard
  src/pages/child      Child app
  src/pages/simulator  Home simulator
android/  Kotlin app for Meta glasses: hosts the child app, adds the glasses camera and voice
data/     Database and generated pictures (created at runtime, not committed)
```

### Android app for the glasses

The [Android app](android/README.md) shows the child app from the hub and connects Meta glasses
through the Meta Wearables Device Access Toolkit. Inside it, the child app uses the glasses camera
and Android's voice instead of the browser's (`web/src/lib/native.ts`). Without glasses, Meta's
Mock Device Kit uses the phone camera as the glasses camera.

### Design rules

- **The engine decides, Muse advises.** The mission engine is deterministic code. Muse drafts
  missions and judges camera frames, but only the engine changes steps or switches devices.
- **Smart-home actions are an allowlist** (`light_on`, `light_off`) scoped to the mission's room.
  There is no lock action, so door locks can never be automated. A light is never switched off
  while the child is in that room.
- **Privacy gate.** The camera is allowed only while the child is in a known camera-OK room. In
  private rooms the child app stops the camera and the hub rejects frames. Frames are never stored,
  Muse requests are sent with `store: false`, and the `-contributor` models are never used.
- **Muse is never asked about the child's body, face, emotions or movements**, only objects and
  task state. Repetitive movements are never flagged.
- **Parents approve every AI draft.** Any edit sends a routine back to draft.
- **Progress measures support needed, not obedience.** Prompts fade one level after three
  independent completions and come back after help is needed.

## Status and next steps

Built and tested: the hub, the parent dashboard, the child app (web) and the home simulator,
against the live Meta Model API.

Built, compiled and unit tested, not yet run on a phone: the Android glasses app.

Not built yet:

- Showing steps on the Meta Ray-Ban Display screen, and tapping the glasses touchpad for Done.
- A living-room observer camera, and real smart-home devices (Home Assistant).

See [PLAN.md](PLAN.md) for the full plan.
