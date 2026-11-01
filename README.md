# Bhavya AI

An AI independence companion for autistic children, built for the Meta Global AI Developer
Hackathon. Parents teach daily routines by writing, speaking or recording a short video; Bhavya
turns them into step-by-step missions with picture cards and guides the child through them, while
keeping the camera off in private rooms.

All AI runs on **Meta Muse models** through the Meta Model API. No other LLMs are used.

| Muse model | Used for |
|---|---|
| `muse-spark-1.3` | Drafting missions, checking camera steps, understanding the child's spoken requests, suggesting a routine from what the glasses see |
| `muse-image-1.0` | Picture cards for each step and the communication board |
| `muse-voice-transcribe-1.0` | Parents speaking instructions, and the child's **Talk** button |
| `sam-3.1` | The object finder (built, currently switched off, see below) |

Spoken guidance uses the device's built-in text-to-speech (not an AI model).

## Quick start

Requirements: Node.js 22.13 or newer, and a Meta Model API key.

```bash
npm install
cp .env.example .env      # then put your key in MODEL_API_KEY
npm run dev
```

Open <http://localhost:5173>. The home page links to the three apps:

- **Parent dashboard** (`/parent`): create, review and approve routines; progress; child settings and rooms.
- **Child app** (`/child`): the step player, communication board and break screen.
- **Home simulator** (`/simulator`): a 3D home that stands in for presence sensors and smart
  lights, with the real child app in a phone frame next to it.

Two demo routines are added on first start: *Using the restroom* (private room, starts
automatically, camera off) and *Pack your school bag* (living room, camera checks).

### Demo walkthrough

1. Open the simulator. The child app runs in the phone on the right; tap **Start** in it
   (browsers only allow sound after a tap).
2. Walk the child into the **Restroom** (arrow keys, or the "Walk to" buttons): the door sensor
   fires, the camera turns off, the light turns on and the routine starts in the phone. Tap
   **Done**, **Help** or **Break** to see each path.
3. Walk to the **Living room**, then start *Pack your school bag* in the phone. The camera opens
   and Muse Spark confirms each step.
5. During the bag routine, tap **Talk** and say "I need the toilet": the bag routine waits, the
   restroom routine starts, and when it ends the child is asked "Do you want to continue Pack your
   school bag?".
6. Watch help requests and progress arrive in the parent dashboard.

### Home simulator

The 3D home (three.js, loaded only on this page) plays the part of the home's door sensors and
smart lights:

- Walk the child with <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>W</kbd>
  <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> (hold <kbd>Shift</kbd> to run), or click a room. Walls
  and furniture block the way. Walking into a room sends the same event a door sensor would;
  walking out of the front door means the hub no longer knows where the child is.
- Click a lamp, or open **Lights**, to switch a smart light.
- The glasses show a green light and a faint view cone only while the camera is allowed.
- Graphics quality is chosen automatically; slower laptops get a lighter mode. Browsers that
  cannot draw 3D get the original button-based simulator instead.
- To follow the hub's decisions step by step (sensors, privacy, Muse answers, engine), start the
  hub with `LOG_LEVEL=debug`.

Options in `.env` (restart the hub after changing them):

| Option | Values | What it does |
|---|---|---|
| `SIMULATOR` | `show` (default), `hide` | `hide` removes the simulator's link from the home page; `/simulator` still works. |
| `SIMULATOR_VIEW` | `both` (default), `3d`, `simple` | `both`: 3D with a **Simple view** button. `3d`: 3D only. `simple`: the button-based simulator only. |
| `CAMERA_DEBUG` | `off` (default), `on` | For testing: the child app shows what Muse saw in each glasses frame and each step check. |

Rooms are matched to hub rooms by id (`restroom`, `bedroom`, `living_room`, `kitchen`), so names,
privacy and lights follow the parent's settings.

### Talking to Bhavya

The child taps **Talk**, speaks, and taps again (it stops by itself after 10 seconds). Muse Voice
writes down the words and Muse Spark works out what the child wants: start or continue a routine,
help, a break, stop, or "I'm done". The engine then decides what to do. A clear request for another
routine sets the current one aside (only one waits at a time) and offers it again afterwards; a
request Muse is unsure about becomes a yes/no question; anything else changes nothing. Audio is
never stored.

### Routine suggestions from the glasses

Off by default; a parent turns it on in **Child & rooms** ("Suggest routines from the glasses
camera"). While no routine is running, the glasses take a look every 15 seconds and Muse Spark
checks whether one of the approved routines in a camera-OK room fits the place. Bhavya only asks
("Do you want to do Pack your school bag?") after the same answer twice in a row, and never starts
anything without a yes. Limits: a routine the child says no to (or does not answer) is not
suggested again for 15 minutes, at most 4 suggestions per hour, never in a known private room, and
if Muse sees a bathroom or a place to change, the glasses stop looking for 10 minutes. Without
presence sensors the hub cannot know the room in advance, so that first private frame does reach
Muse (with `store: false`, never saved); door sensors in private rooms avoid even that.

### Object finder (switched off)

Highlighting a step's object with SAM 3.1 ("Where is the toothbrush?", "Photo from video") is
still in the code but switched off in `shared/src/features.ts` (`FEATURES.objectFinder`). While it
is off, the hub does not register its routes and the web and Android apps hide its controls.

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
  missions, judges camera frames and interprets the child's words, but only the engine changes
  steps, starts routines or switches devices.
- **Smart-home actions are an allowlist** (`light_on`, `light_off`) scoped to the mission's room.
  There is no lock action, so door locks can never be automated. A light is never switched off
  while the child is in that room.
- **Privacy gate.** Step checks use the camera only while the child is in a known camera-OK room,
  and never during a routine for a private room. In private rooms the child app stops the camera
  and the hub rejects frames. Frames are never stored,
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
