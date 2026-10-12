# Robot assistant

An animated helper drawn over every signed-in page (module `assistant`, an *overlay* module: no page of its own, listed in Settings → Modules, not in the app launcher).

- **Robots:** Pixel, Orbi, Kiko and two in Kyrgyz style — Ermek (ak-kalpak, chapan) and Aichurok (velvet topu with an owl feather, braids with chach uchtuk) — SVG drawings (`modules/assistant/robots.jsx`) animated with CSS (`assistant.css`). Moods: idle (blinks, hovers, eyes follow the pointer), happy, wave, think, surprised (dragged), sleepy (after two minutes without activity). `prefers-reduced-motion` stops the motion; nothing is printed.
- **Placement:** drag anywhere with mouse or finger; the spot is stored per device in `localStorage` (`da_assistant_pos`, relative to the window). Sizes S/M/L (52/64/80 px; at most 56 px on phones). The default spot is the right edge above the bottom, clear of composers.
- **Help:** the panel answers from the help content of the current section (`helpForPath`): a tip, short guide (help drawer), full guide (`/help/<id>`), FAQ and a search over all articles, sections and questions.
- **Offers:** with *Offer help in sections* on, the robot waves once in each section a person opens; the sections already greeted are stored in the person's prefs.
- **Settings:** administrators — Settings → Modules → Robot assistant (on/off, default robot, offers). People — Account → Appearance (show, robot, size, back to the corner, offers again) or the ⋯ menu in the panel (also "hide until reload").

| Method | Path | Purpose |
|--------|------|---------|
| GET / PUT | `/api/app/assistant/prefs` | `{ enabled, avatar: pixel\|orbi\|kiko\|ermek\|aichurok\|null, size: S\|M\|L, greeted: [section…], resetGreetings }` → resolved prefs with `defaultAvatar`, `proactive` |

Storage: `assistant_prefs (user_id, prefs jsonb)`. The module's `avatar` and `proactive` settings are public (`publicSettings` in the catalog).
