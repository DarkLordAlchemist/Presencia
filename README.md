![Presencia](docs/images/logo.jpg)

# Presencia

**Frictionless Security at Face Value.**

Started as facial recognition time-in/time-out for HR attendance — now a
full facial-recognition security platform: HR attendance *and*
multi-camera security monitoring that tracks who's moving where across
multiple physical locations, live.

## Screenshots

| | |
|---|---|
| ![Sign in](docs/images/login.jpg) | ![Dashboard](docs/images/dashboard.jpg) |
| Sign in | Role-aware dashboard |
| ![Security — multi-camera monitoring](docs/images/security-dashboard.jpg) | ![Facial enrollment](docs/images/enroll.jpg) |
| Security — live multi-camera movement log | Facial enrollment |

Two services:

- **`web/`** — Next.js (App Router) + TypeScript + Prisma/SQLite. Handles
  users, roles, schedules, attendance logs, and the kiosk clock-in UI.
- **`face-engine/`** — Python/FastAPI service isolating the ML pipeline:
  face detection, recognition (embeddings), and liveness/anti-spoofing.

## Roles

- **System Administrator** — user accounts, role assignment, biometric
  match/liveness thresholds.
- **HR & Payroll Administrator** — enrolls employees' faces, runs
  onboarding, certificates, and payslips.
- **Department Manager** — assigns schedules to their own direct reports,
  reviews their leave/overtime/correction requests.
- **Regular Employee** — clocks in/out, views their own log, files
  leave/overtime/correction/certificate requests.
- **Kiosk/Device** — a locked-down account for a shared tablet at the
  entrance; no nav, no logout button, camera-only clock-in loop.
- **Security** — runs the multi-camera monitoring dashboard: watches one
  or more physical cameras at once and logs recognized, live faces by
  location automatically, no interaction required.

## Features

- **Facial recognition clock-in/out** — detection (MTCNN) + recognition
  (SFace embeddings) + liveness/anti-spoofing (MiniFASNet), with a
  verify-then-choose kiosk flow (identify a face, show status, let the
  employee pick Time In/Break Out/Break In/Time Out themselves).
- **Multi-camera security monitoring** (`/security`) — the newest
  capability, and the one that turns this from a single-kiosk time clock
  into a real facial-recognition security platform. Add any number of
  camera tiles, each bound to a specific physical camera
  (`navigator.mediaDevices.enumerateDevices()` — pick the exact device,
  not just whatever the browser defaults to) and a typed location label
  ("Back Door", "Lobby", "2nd Floor"). Each tile scans continuously on
  its own, runs the same liveness + recognition pipeline as the kiosk (so
  a held-up photo can't fake a sighting), and automatically logs
  **employee, location, and time** the moment it recognizes someone — no
  tap, no confirmation, no kiosk-style interaction at all. A live table
  on the same page shows recent movement across every camera at once. No
  physical door/lock hardware integration yet (that's the planned phase 2
  step) — today it's full visibility into who's where, the access-control
  trigger comes next.
- **Attendance rules** — grace periods, overtime, midnight-crossing-aware
  night differential, single-break and daily-total break budgets.
- **Location/network controls** — GPS geofencing and IP/prefix locking,
  enforced before face recognition even runs; every real punch gets a
  location snapshot (lat/lng + best-effort reverse-geocoded address).
- **Rostering** — fixed/flexible/rotating shifts, valid-from/valid-to
  date ranges, group assignment.
- **Leave & requests** — leave (VL/SL/emergency/OB/other) and
  overtime/shift-swap requests with manager/HR/admin approval.
- **Timesheet corrections** — request a missing punch or fix an existing
  one; approval recomputes the same late/OT/night-diff/break flags a live
  scan would produce, and is blocked inside a locked pay period.
- **Audit log** — every leave/overtime/correction decision and
  pay-period lock/unlock, timestamped with who and why.
- **Payroll cut-offs** — lock a pay period, export computed hours to CSV,
  or push them to a configured payroll/HRIS webhook.
- **Who's In dashboard** — live per-person status (on-site, on break,
  late, on leave, absent, done for the day), with live-ticking worked/
  break timers.
- **HR onboarding + Certificate of Employment** — job title, department,
  hire date, employment status, compensation, and benefits per employee;
  employees request a COE (General, Government Transaction, Bank/Loan, or
  Visa/Travel), HR approves, and the certificate text is generated
  automatically from a point-in-time snapshot of the onboarding record.
- **Payslips with real Philippine Labor Code premium pay** — holiday
  calendar (Regular/Special Non-Working), and auto-suggested earnings/
  deductions computed from real attendance using the actual Labor Code
  rate table (ordinary OT 125%; rest day 130%/169% OT; special non-working
  130%/169% OT, 150%/195% on a rest day; regular holiday 200%/260% OT,
  260%/338% on a rest day; night differential +10% stacked on whatever
  rate already applies). Everything stays editable before issuing; once
  issued, a payslip is locked and point-in-time, same as a certificate.

## Setup

### 1. face-engine (Python)

```bash
cd face-engine
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

First run downloads the model weights it needs (MTCNN, SFace ~39MB,
MiniFASNet ~4.5MB total) — needs internet once, cached under
`~/.deepface/weights/` after that.

**Do not upgrade `opencv-contrib-python`/`opencv-python` past 4.10.0.84**
without re-verifying face detection still actually works end to end —
newer 5.x builds silently break DeepFace's YuNet detector wrapper (it
returns zero detections even on an obvious face). This project avoids that
by using the MTCNN detector backend instead. See the comment at the top
of `requirements.txt`.

### 2. web (Next.js)

```bash
cd web
npm install
cp .env.example .env
# generate SESSION_SECRET and FACE_EMBEDDING_KEY, paste into .env — see the comments there
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3000`. First visit shows a one-time setup screen to
create the System Administrator account. Create the other role accounts
from `/users` afterward.

The kiosk terminal is `/kiosk` — log in with a `KIOSK`-role account on
whatever device/tablet sits at the entrance, then leave that tab open in
fullscreen. It has no navigation and no logout button by design.

### Requirements

- Node.js 20+, Python 3.11+ (both services must be running simultaneously
  — the web app calls the face-engine over HTTP for every enroll/verify).
- No database server — SQLite is a single file (`dev.db`).
- A camera-equipped browser for enrollment and kiosk clock-in (uses
  `getUserMedia`).

## Verifying the face-engine

`face-engine/scripts/test_pipeline.py` runs real DeepFace inference
(not mocked) against real test images:

```bash
cd face-engine
bash scripts/fetch_test_images.sh
python scripts/test_pipeline.py
```

## Stack notes

- **Detection: MTCNN. Recognition: SFace (128-dim embeddings). Liveness:
  MiniFASNet** (via DeepFace's `anti_spoofing=True`, but with our own
  configurable threshold applied to the raw `antispoof_score` rather than
  trusting DeepFace's fixed internal cutoff — see `SystemConfig` in
  `web/prisma/schema.prisma` and `liveness_threshold` in
  `face-engine/app/main.py`).
- Combined model footprint is small (well under 100MB) and runs
  comfortably on CPU or an 8GB-VRAM GPU.
- Face embeddings are encrypted at rest (AES-256-GCM, `FACE_EMBEDDING_KEY`
  in `.env`) — the web app decrypts them in memory only to send to
  face-engine for comparison, never stores them in plaintext.
- JWT session cookie via `jose`, bcrypt password hashing, a DAL pattern
  with `requireRole()` gating every Server Action and route.
- **Pay periods are Manila calendar days, not naive UTC days**
  (`web/src/lib/attendance/pay-period-math.ts`) — a date-only form input
  like "2026-10-09" parses as UTC midnight, which is 8 hours off the
  actual Manila business day it's meant to represent.
