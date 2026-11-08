# Festival & special-event animations

A decorative seasonal layer for the public landing page. It resolves the active
Indian festival in `Asia/Kolkata`, then renders one restrained animation behind
the hero content. It is not part of the dashboard, auth, or portfolio code.

## Architecture

Four independent layers, each testable on its own:

| Layer | Files | Responsibility |
| --- | --- | --- |
| Event data | `src/lib/events/types.ts`, `src/lib/events/data/` | Typed records and the versioned annual calendar |
| Calendar provider | `src/lib/events/calendarProvider.ts` | Fetch, normalise, cache, fall back |
| Resolution | `src/lib/events/dateUtils.ts`, `src/lib/events/eventResolver.ts` | Pure IST date maths and event selection |
| Rendering | `src/components/events/` | Typed lazy registry, renderer, artwork |

The resolver never imports React. The renderer never does date maths. The
calendar provider never knows which animation an event uses.

### Display window

One calendar day before, the event day (or every day of a multi-day observance),
and one calendar day after. For Diwali on 8 November 2026:

| Date (IST) | Result |
| --- | --- |
| 6 Nov | no animation |
| 7 Nov | Diwali |
| 8 Nov | Diwali |
| 9 Nov | Diwali |
| 10 Nov | no animation |

Windows are compared as integer day ordinals (`dateUtils.toOrdinal`), never by
adding `24 * 60 * 60 * 1000`. "Today" comes from `Intl.DateTimeFormat` with
`timeZone: "Asia/Kolkata"`, so the rollover happens at 18:30 UTC regardless of
the visitor's clock.

When two windows overlap, the higher `priority` wins; ties break on the earlier
window start, then on event id. Only one animation is ever mounted.

## Calendar data source

**Shipped source: a versioned curated dataset** in
`src/lib/events/data/calendar-<year>.ts`.

Calendarific was evaluated. It can return Indian holidays with regional
filtering, but:

- it requires a secret API key, which must not reach the browser;
- proxying it would add a credentialed third-party dependency and a new
  deployment secret, which this feature is not allowed to do;
- its lunar-festival dates still need per-festival verification before they can
  drive a brand surface.

The provider abstraction keeps that door open. `createHttpCalendarProvider`
reads a **same-origin** endpoint (for example an existing Pages Function) and
normalises `{ records: [...] }` or `{ holidays: [...] }`. Set
`VITE_EVENT_CALENDAR_ENDPOINT` at build time to prefer it. On any error,
timeout, non-2xx response or malformed payload the cached provider falls back to
the curated dataset, so the homepage never depends on the network for this.

### Limitations

- The dataset is **not exhaustive**. It lists the fixed national days plus the
  two supported festivals. A record without a rule in `eventRegistry.ts` is
  ignored, so extra holidays are harmless.
- Lunar dates are transcribed, not computed. Diwali 2026 is 8 November
  (Lakshmi Puja, amavasya tithi); Diwali 2027 is 29 October. Both were
  cross-checked against published panchang calendars.
- Only 2026 and 2027 are transcribed. A missing year is a supported state: the
  provider returns `null`, the resolver finds no event, and the site renders
  normally with no animation.
- Regional observance (for example Telangana vs. the rest of India) is modelled
  by `regions` on a record, but no regional split is used yet.

### Updating the dates

Once a year, before the year starts:

1. Add `src/lib/events/data/calendar-<year>.ts` with the verified dates.
2. Register it in `src/lib/events/data/index.ts`.
3. Bump `retrievedAt` and the source note.
4. Run `npx vitest run src/lib/events`.

The event tests use fixed dates and never read the real clock, so they stay
green across year boundaries.

## Adding a new festival

Three edits, none of them in the resolver or the renderer:

1. **Calendar data** — add a `CalendarRecord` to the year file.
2. **Display rule** — add an entry to `EVENT_RULES` in
   `src/lib/events/eventRegistry.ts` (animation id, priority, window, config).
3. **Animation** — add the id to `ANIMATION_IDS` in
   `src/lib/events/animationIds.ts` and the lazy component to
   `ANIMATION_REGISTRY` in `src/components/events/animationRegistry.ts`.

The registry is typed `Record<AnimationId, …>`, so a missing component is a
compile error. Two dates (or two regional observances) can share one animation
by pointing their rules at the same id.

## Visual design

Both scenes are original SVG/CSS artwork, built from separate parts so the
composition can be refined without touching event logic.

**Diwali** — `AmbientGlow`, `Diya` (bowl, oil, two-layer flame), `Rangoli`
(concentric rings, dotted band, 16 petals, 8 diamonds), `LightParticles`
(deterministic golden motes). Sequence: warm glow fades in, three diyas
illuminate in a stagger, motes begin to drift, then a low-intensity loop. The
flame is two SVG paths animated with `transform` around its base, with a
different duration per diya so they never pulse in sync.

**Christmas** — `AmbientGlow` (cool), `EvergreenRidge` (abstract curved tiers,
no ornaments), `StarField` (five distant sparkles), `SnowField` (22 flakes with
depth faked by size, opacity and duration). Sequence: light fades in, snow
starts at different depths, sparkles appear occasionally, then a calm loop.

Design constraints applied:

- Palette stays inside the existing ink/orange identity; gold and amber are
  local tokens on `.zl-event`, with light and dark variants.
- The layer is masked away from the copy column (horizontal on desktop,
  vertical on the single-column hero), so it can never reduce text contrast.
- `pointer-events: none`, `aria-hidden="true"`, no focusable nodes, no modal.
- Only `transform` and `opacity` animate. No animated blur, no animated
  box-shadow, no per-frame script, no canvas.
- Node counts are bounded: 3 diyas + 14 motes + 1 rangoli, or 22 flakes + 5
  stars + 1 ridge.
- Animations pause via `animation-play-state` when the tab is hidden.
- `prefers-reduced-motion: reduce` renders the same composition static: lit
  diyas and ambient light, no motes, no snow, no sparkles, no flicker.

### OpenPencil

OpenPencil (https://openpencil.dev) was inspected as a design reference. Its
headless CLI ships inside the desktop application; the public releases provide
only AppImage/deb/rpm/desktop installers, and there is no published npm package.
This environment has no display and no `.fig`/`.op` design file to operate on,
so no OpenPencil document was created or exported. The artwork above was
authored directly as SVG/CSS following the same discipline the tool would
enforce: separate components per element, explicit layer order, shared colour
tokens, and light/dark variants. No OpenPencil runtime or dependency is in the
bundle.

## Performance

- The animation code is lazy: `DiwaliAnimation` and `ChristmasAnimation` are
  separate chunks, downloaded only when that event is active.
- With no active event the layer renders nothing and loads no animation chunk.
- The calendar is resolved once per mount and again at the next IST midnight;
  results are cached per year for the page lifetime.
- The layer is absolutely positioned, so mounting it causes no layout shift.

## Testing

- `src/lib/events/dateUtils.test.ts` — parsing, leap years, ordinal arithmetic,
  IST rollover, next midnight.
- `src/lib/events/eventResolver.test.ts` — day before/on/after, first day
  outside, year boundaries, overlapping windows, priority, next event,
  malformed data, leap years.
- `src/lib/events/calendarProvider.test.ts` — curated data, caching, in-flight
  dedupe, fallback on throw/null/empty, HTTP normalisation and rejection.
- `src/components/events/EventAnimationLayer.test.tsx` — Diwali, Christmas, no
  event, unknown id, reduced motion, paused.
- `src/components/events/animations/*.test.tsx` — composition and reduced-motion
  behaviour of each scene.
- `src/pages/Landing.events.test.tsx` — integration with fixed system dates.

All tests use fixed dates; none depends on the day they run.
