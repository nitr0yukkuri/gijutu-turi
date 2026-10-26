# Technology Fishing — GIJUTU TURI

[日本語](README.md) | [English](README.en.md)

![Technology Fishing logo](./assets/gijutu-turi-logo.png)

**A web fishing game where differences between technologies are experienced as the pull of a fish.**

Cast into the sea on a PC, then connect a smartphone as a fishing-rod controller. The concepts behind Go, Docker, CSS, Kubernetes, Rust, and JavaScript are represented through distinct fish movement and appearance.

[Public demo](https://gijutu-turi-e7ranic5ja-an.a.run.app/) · [Start with the demo](#start-with-the-demo) · [Fish and technology](#fish-and-technology) · [Architecture](#architecture) · [Run locally](#getting-started)

## Start with the demo

1. On a PC, open the [fixed Go Fish route](https://gijutu-turi-e7ranic5ja-an.a.run.app/gofish). The species-fixed URL avoids the random selection on the regular route.
2. Scan the QR code on the PC with a smartphone to connect to the same fishing spot. If motion sensors are unavailable, use the phone screen controls. You can also play with the PC alone.
3. Cast and set the hook when the float sinks. Watch the Go Fish split into a school and pull from several directions as you alternate between reeling and waiting.
4. After catching it, open the encyclopedia to see how the fish’s behavior relates to parallel processing.

A demonstration should take about 2–3 minutes. Catch time varies with the fish’s resistance and how it is played, so try the full flow on both PC and smartphone before presenting. Also check that the on-screen controls work if the connection or sensors are unavailable.

## What the project aims to do

**Intended audience:** People who find it difficult to imagine how technical terms and differences work from explanations alone, and would rather understand them through interaction and feedback.

The project aims to make programming concepts tangible through the response to a user’s actions instead of asking them to memorize descriptions. Casting, setting the hook, and reeling connect to fish resistance, rod flex, line tension, and surface reactions. The intention is to make the “character of each technology” part of the feel of play.

Fish behavior is a representation for communicating technical concepts; this is not a simulator of the internal behavior of Go, Docker, or Kubernetes.

## Gameplay overview

1. Hold a button to charge casting strength and cast into the sea.
2. When the float sinks, set the hook at the right moment.
3. Watch fish resistance and line tension as you alternate between reeling and waiting.
4. Catches are recorded in an encyclopedia, where you can review each species’ characteristics.

The game centers on a sea and fish rendered with Three.js, while controls appear only when needed. It can be played on a PC alone. Connect a smartphone by QR code to make it a fishing controller: shake to cast, rotate to reel, or use on-screen controls.

## Fish and technology

| Fish | Concept represented | Behavior in the game |
| --- | --- | --- |
| Go Fish | Parallel processing | Splits from one fish into a school and pulls from several directions at once |
| Docker Whale | Containers and runtime environments | Pulls heavily after being hooked and moves slowly with inertia |
| CSS Fish | Separation of structure and appearance | Keeps its shape while colors, patterns, and glow change with state |
| K8s Leviathan | Clusters and replicas | Two visual shadows follow the main fish; the shadows do not count as separate catches |
| Rust Marlin | Ownership and moves | A blue-striped marlin makes short bursts, changes direction, and leaves no trail |
| JS Conger Eel | Event loop and asynchronous processing | Modeled on a Japanese conger eel that undulates as it swims over a sandy-muddy bottom |

The regular route `/` randomly selects from the active species other than K8s (Go Fish, Docker Whale, CSS Fish, Rust Marlin, and JS Conger Eel). K8s Leviathan is not included in the regular random selection and is available from its dedicated URL. After a catch, the sequence is Go Fish → Docker Whale → Rust Marlin → JS Conger Eel → Go Fish; after catching CSS Fish, the next fish is Go Fish. Species-specific URLs keep selecting the same species after each catch.

## Technical stack

| Layer | Technology | Role |
| --- | --- | --- |
| UI | React 19, TypeScript, Vite | Sea scene, controls, smartphone controller, and encyclopedia |
| 3D | Three.js, WebGL, GLSL | Render the sea, fish, rod, line, ripples, and trails |
| Audio | Web Audio API | Generate ambient and effect sounds in the browser |
| Server | Node.js 22.12+, Hono | HTTP API, static files, and game-room management |
| Real-time communication | WebSocket (`ws`) | Synchronize game state and controls between PC and smartphone |
| Input validation | Zod | Validate data received through the API and WebSocket |
| Game state | `OceanFishingGame` | Server-side decisions for fish movement, tension, distance, catch, and escape |
| Encyclopedia | Local: SQLite (`node:sqlite`) / Production: Cloudflare D1 or PostgreSQL required | Store species data, per-player catch counts, and catch events |
| Delivery | Docker, Cloud Run or Vercel configuration | Docker / Cloud Run combine the app; Vercel is for the static frontend |

## Architecture

```text
PC browser (React + Three.js) ── WebSocket ──┐
                                              ├─ Node.js + Hono server
Smartphone (React controller) ─── WebSocket ──┘  ├─ Ocean Rooms (connections, input, delivery)
                                                 ├─ OceanFishingGame (20 Hz game decisions)
                                                 └─ Catch event ──► SQLite / D1 / PostgreSQL
```

- **The server is authoritative for game state.** It decides when a fish is hooked, fish position and resistance, distance, and whether the fish is caught or escapes.
- **The client handles input and presentation.** It receives game snapshots and smoothly interpolates fish and rod movement.
- **The smartphone is an input device.** It connects to the same room as the PC, preventing competing control.
- **The encyclopedia updates from catch events.** The server saves each catch to the database once, and the screen reloads the encyclopedia.
- **API input and CORS are controlled.** The session-creation API accepts JSON only, and allowed Origins can be limited with `FRONTEND_ORIGIN`. Browsers from permitted origins can read the `Retry-After` value when rate-limited.
- **Surface effects are visual reactions.** K8s surfacing, splashes, and trails are synchronized with fish presentation but do not alter catch decisions or fish strength. Implementation and tests are described in [Technical design and verification](#technical-design-and-verification).

## Technical design and verification

| Problem | Design and implementation | Relevant code and checks |
| --- | --- | --- |
| Make the same fishing session work on PC and smartphone | The server decides game state, validates WebSocket input using a shared Zod contract, and synchronizes state. While a smartphone is connected, only one device controls input; the client interpolates received state for display. | [`src/ocean-contract.ts`](src/ocean-contract.ts), [`src/ocean-room.ts`](src/ocean-room.ts), [`src/ocean-game.ts`](src/ocean-game.ts), [`scripts/verify-ocean.ts`](scripts/verify-ocean.ts) |
| Keep K8s fish surfacing and water reactions aligned | Detect water contact from the interpolated fish presentation state. The CPU-side contact calculation and water-surface shader use the same wave and ripple equations. Hysteresis prevents repeated splashes from small vertical movement in the waves. | [`src/rendering/k8s-surface-motion.ts`](src/rendering/k8s-surface-motion.ts), [`src/rendering/fish-water.ts`](src/rendering/fish-water.ts), [`src/rendering/k8s-surface-motion.test.ts`](src/rendering/k8s-surface-motion.test.ts), [`src/rendering/fish-water.test.ts`](src/rendering/fish-water.test.ts) |
| Avoid counting a catch twice after a retry | Each catch event has a unique key, and the persistence layer treats resubmission of the same event as a duplicate. SQLite, D1, and PostgreSQL persistence implementations are separate. | [`src/catch-save.ts`](src/catch-save.ts), [`src/catch-save.test.ts`](src/catch-save.test.ts), [`src/collection-db.test.ts`](src/collection-db.test.ts) |

These are examples of how the work represents, synchronizes, and stores technical concepts. Fish behavior is a metaphor for an entry point to understanding; it does not reproduce the underlying implementation of each technology.

## Getting started

### Requirements

- Node.js 22.12+
- npm
- A smartphone on the same Wi-Fi network if testing smartphone connection

### Install and run

```powershell
npm ci
npm run dev
```

Open [http://127.0.0.1:8788/](http://127.0.0.1:8788/) on the PC. `npm run dev` starts the frontend and backend together.

| Port | Purpose |
| --- | --- |
| `8788` | Vite development server; open this in the browser |
| `8787` | Backend for HTTP API, WebSocket, and SQLite |

The development server accepts LAN connections. If the PC is using `localhost`, the QR code is replaced with the PC’s LAN address so a smartphone on the same Wi-Fi can connect. Allow the development server through the PC firewall. Local HTTP supports touch controls. Motion sensors require an HTTPS environment reachable from the smartphone and browser permission for sensors.

#### Use smartphone motion locally

Regular `npm run dev` uses HTTP. To test sensor input, run the following from a separate terminal. The HTTPS screen uses port `8790`, the local CA certificate download uses `8791`, and a dedicated backend uses `8792`, leaving the regular development server untouched. A test encyclopedia database is also isolated in `.local-certs/phone-https/`.

```powershell
npm run dev:https
```

Open `https://localhost:8790/gofish` on the PC and `https://<PC-LAN-address>:8790/gofish` on the smartphone, using the address shown in the startup log. Open the HTTPS screen on the PC first, then scan the “Connect phone” QR code; it will contain the HTTPS URL. Connect both devices to the same Wi-Fi network.

The first time, install and trust the local CA certificate on the smartphone. Open `http://<PC-LAN-address>:8791/dev-ca.crt` from the phone to download it. Before installing, check the certificate’s SHA-256 fingerprint on the device and trust it only if it matches the `CA SHA-256` in the startup log. On iPhone, after installing the downloaded profile, enable full trust for this CA under **Settings → General → About → Certificate Trust Settings**. Android setting names and steps vary by device. After installation, open the HTTPS game screen and grant the browser motion permission. If the PC browser also displays a certificate warning, add the same CA to the user certificate store. Do not use the CA distribution URL on a shared or public network.

To remove the certificate warning in a Windows PC browser, open PowerShell in the repository root and add the certificate to the user trust store. Save the displayed thumbprint for removal later.

```powershell
$devCa = Import-Certificate -FilePath .local-certs/phone-https/dev-ca.crt -CertStoreLocation Cert:\CurrentUser\Root
$devCa.Thumbprint
```

To remove it after development, use the saved thumbprint:

```powershell
Remove-Item "Cert:\CurrentUser\Root\<thumbprint>"
```

The development CA and private key are generated in `.local-certs/phone-https/` and are not added to Git. The CA private key is not distributed over the network. Environment variables for Cloudflare D1, PostgreSQL, and production backend URLs are removed from child processes; the app uses a dedicated SQLite database. This is a certificate authority for the development PC only. Do not share its certificate with others, and remove it from both the smartphone and PC trust stores after development. OpenSSL 3.x is required. If it is not detected automatically, set `OPENSSL_BIN` to the full path to `openssl.exe`.

### 3D fish models

Species-specific 3D models can be viewed in the fishing scene and encyclopedia.

### Species-specific URLs

| URL | Starting fish | Notes |
| --- | --- | --- |
| `/` | Random Go Fish, Docker Whale, CSS Fish, Rust Marlin, or JS Conger Eel | Selects from active species except K8s |
| `/gofish` | Go Fish | Fixed species |
| `/dockerwhale` | Docker Whale | Fixed species |
| `/cssfish` | CSS Fish | Fixed species |
| `/rustfish` | Rust Marlin | Fixed species |
| `/jseel` | JS Conger Eel | Fixed species |
| `/k8sfish` | K8s Leviathan | Fixed species; not in the regular random selection |
| `/docker` | Docker Whale | Compatibility URL for `/dockerwhale` |
| `/complete` | Display with all species discovered | Does not read or write catch records or encyclopedia data |

The sample state in `/complete` is generated only in the screen and is separate from an actual player’s catch state.

Older URL formats such as `?fish=go`, `?fish=docker`, `?fish=cssfish`, or `/fish=...` remain available for compatibility. Use the URLs in the table when sharing new links. The room and fish species created on the PC are also used on the smartphone.

### Controls

| Action | PC | Smartphone |
| --- | --- | --- |
| Cast | Hold and release “Cast.” You can also use `Space`. Aim left or right with the mouse position. | Use the screen controls. In supported environments, shake the phone to cast. |
| Set the hook | Press “Set Hook” when the float sinks. | Press the on-screen control button. |
| Reel | Hold “Reel.” You can also use `R`. | Press the on-screen reel, or rotate the device. |
| Pull the rod | — | During a fight, pull the device back, or use the rod action button. |

When a fish is running, do not reel too aggressively; watch the line tension as you play. Sound effects can be enabled with the sound button on screen.

## Configuration

`.env.example` is an example configuration. Vite reads `VITE_*` values from `.env` for the frontend, but the `npm run dev` startup script and Node.js backend do not read `.env`. Set `BACKEND_PORT`, `VITE_PORT`, `HOST`, database configuration, and other values in the shell or runtime environment before starting the app. `VITE_PUBLIC_ORIGIN` is also read when the Vite config is evaluated, so pass it as a build environment variable. Vite values are included in the client; do not put secrets in `VITE_*`.

| Variable | Purpose | Default / notes |
| --- | --- | --- |
| `BACKEND_PORT` | Backend port for `npm run dev` | `8787` |
| `VITE_PORT` | Vite development server port | `8788` |
| `PORT` | Node server port | `8787`; `8080` in the Dockerfile |
| `HOST` | Node server bind address | `0.0.0.0` if unset with `npm run dev`; set to `127.0.0.1` to disable LAN access |
| `GIJUTU_DB_PATH` | SQLite location when D1 / PostgreSQL is not configured | `data/gijutu-turi.sqlite` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for D1 | Set when using D1 |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 database ID | Set when using D1 |
| `CLOUDFLARE_API_TOKEN` | D1 API token (D1 Read / Write) | Set through a Secret Manager or similar when using D1 |
| `DATABASE_URL` | Optional PostgreSQL connection URL | Do not configure at the same time as D1 |
| `VITE_BACKEND_URL` | Backend URL used by the Vercel frontend | Set in the Vercel build environment |
| `VITE_PUBLIC_ORIGIN` | Public URL Origin embedded in OGP / Twitter cards | Set for production builds; e.g. `https://example.com` (no trailing slash) |
| `FRONTEND_ORIGIN` | Frontend Origin allowed by the API / WebSocket | Set on Cloud Run; comma-separated for multiple values |

Example with custom ports:

```powershell
$env:BACKEND_PORT='8791'
$env:VITE_PORT='8792'
npm run dev
```

## Build and verification

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run test:browser` starts the built server on port `8789` and checks the home page, WebGL rendering for six species, lazy loading of fish models, and horizontal overflow at four viewport widths. It uses a test-only in-memory database separate from the fish-model backend (`8787`).

Additional checks that require a running server:

```powershell
# Start in a separate terminal
npm run dev:server

# Run in another terminal
npm run test:ocean
npm run test:fish
npm run test:whale
```

`npm test` checks game rules, WebSocket contracts, encyclopedia, fish movement, rod, line, and water-surface effects. Integration and fish-model checks connect to a running backend. GitHub Actions runs type checking, tests, build, integration checks, Playwright / Chromium browser checks, and a Docker image build. Browser checks in CI use software WebGL. Differences on real GPUs and behavior of physical device sensors still require checks on the target device.

## Deployment and data notes

- `npm run build` outputs the client to `dist/client` and the Node.js server to `dist`. For a production-like local start, use `npm start`.
- With Docker / Cloud Run, the Node server serves the UI, API, and WebSocket together. Do not include a port number in the public Cloud Run URL.
- The Vercel configuration is for the static frontend. Set up the WebSocket / API server separately, and configure Vercel’s `VITE_BACKEND_URL` and the backend’s `FRONTEND_ORIGIN`.
- Room state is held in Node process memory. A Cloud Run restart or instance switch loses connected rooms.
- Production requires Cloudflare D1 or PostgreSQL; the app does not start if neither is configured. `/ready` returns the selected `collectionBackend` and database connectivity. See the [Cloudflare D1 persistence guide](./docs/cloudflare-d1-persistence.md) and [Cloud SQL / PostgreSQL guide](./docs/cloud-sql-persistence.md). D1 and PostgreSQL `DATABASE_URL` cannot be used together. Creating a Cloud SQL instance and configuring its connection are separate steps and incur costs.
- There can be up to 128 rooms and 8 connections per room, with one smartphone controller per room. Unattended rooms are removed after 30 minutes. Anyone with a QR code / room URL can connect to the sea, so do not share it carelessly in a public place.
- The Service Worker caches static files, but gameplay and catch records require an online backend connection.

See the [Cloudflare Workers guide](./docs/cloudflare-workers.md) for the Cloudflare Workers deployment architecture and steps.

For deployment, Cloud Run costs, WebSocket, and SQLite limitations, see the [low-cost configuration guide](./docs/cloud-run-cheap.md). Responsibilities and data flow are described in the [technical architecture notes](./docs/technical-architecture.md), while fish design is covered in the [Go Fish design notes](./docs/go-fish-design.md) and [Docker Whale design notes](./docs/docker-whale-design.md).

## Main files

- `src/client/App.tsx`: React game screen, controller, and encyclopedia UI
- `src/client/useOceanRuntime.ts`: WebSocket connection, fish state, and screen lifecycle coordination
- `src/client/usePhoneMotion.ts`: Smartphone acceleration / rotation input and conversion to fishing controls
- `src/client/useOceanCollection.ts` / `src/client/ocean-api.ts`: Encyclopedia state and authenticated HTTP communication
- `src/ocean-game.ts`: Server-authoritative fishing state machine and species-specific fight rules
- `src/ocean-session-route.ts`: Anonymous session authorization, HTTP room creation, and encyclopedia API
- `src/ocean-room.ts`: WebSocket rooms, connection roles, input queue, state delivery, and fixed tick
- `src/ocean-contract.ts`: Shared Zod contract for outgoing WebSocket commands and incoming state
- `src/ocean-contract.ts` / `src/fish-contract.ts`: Communication DTOs and fish-swimming data contract
- `src/fish-species.ts` / `src/fishing-routes.ts`: Fish registry and URL resolution
- `src/rendering/ocean-scene.ts`: Three.js sea, fish, rod, line, and surface effects
- `src/rendering/k8s-surface-motion.ts` / `src/rendering/fish-water.ts`: K8s water contact and shared wave-surface calculations
- `src/collection-db.ts` / `src/d1-collection-db.ts` / `src/postgres-collection-db.ts`: SQLite / D1 / PostgreSQL encyclopedia data
- `vendor/`: Third-party Three.js distribution files and licenses

## License

Original code is under the [MIT License](./LICENSE). See [THIRD-PARTY-NOTICES.txt](./THIRD-PARTY-NOTICES.txt) for licenses of third-party components such as Three.js, React, and Hono. Production builds also serve these files as `/license.txt` and `/third-party-notices.txt`.
