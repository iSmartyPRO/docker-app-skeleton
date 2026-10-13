# Robot assistant

An animated helper drawn over every signed-in page (module `assistant`, an *overlay* module: no page of its own, listed in Settings → Modules, not in the app launcher).

- **Characters (28):** robots Pixel, Orbi, Kiko, Classic (retro), Pro (business suit), Boltik (chatty), Nexus (chrome, holographic halo), Bubbles (round, spinning propeller); professions Builder, Asel the builder, Architect, Doctor (white coat, stethoscope, head mirror); kids Girl, Boy, Toddler (curl, dungarees, a bobbing balloon) and Bunny (a girl in a bunny-ear hood); Kyrgyz style Ermek (ak-kalpak, chapan), Aichurok (topu with an owl feather, braids), Berkutchi (fur tebetey, a golden eagle that flaps its wing) and Jibek (white elechek, velvet kemsel); superheroes Superbot and Supergirl (athletic bodies, the “S” shield, fluttering capes), Shadow (cowl with ears, gold bat, scalloped cape) and Aurora (star tiara, silver bracers, glowing lasso); animals Barsik (snow-leopard cub), Ryzhik (a lively fox cub), Bao (panda cub with bamboo) and Pingo (a waddling penguin chick). Robots are whole figures — a head at 80 % over a shared body with arms, legs and feet. SVG drawings (`modules/assistant/robots.jsx`) animated with CSS (`assistant.css`). Moods: idle (blinks, hovers, eyes follow the pointer), happy, wave, think, surprised (dragged), sleepy (after two minutes without activity). `prefers-reduced-motion` stops the motion; nothing is printed.
- **Placement:** drag anywhere with mouse or finger; the spot is stored per device in `localStorage` (`da_assistant_pos`, relative to the window). Sizes S/M/L (52/64/80 px; at most 56 px on phones). The default spot is the right edge above the bottom, clear of composers.
- **Help:** the panel answers from the help content of the current section (`helpForPath`): a tip, short guide (help drawer), full guide (`/help/<id>`), FAQ and a search over all articles, sections and questions.
- **Offers:** with *Offer help in sections* on, the robot waves once in each section a person opens; the sections already greeted are stored in the person's prefs.
- **Settings:** administrators — Settings → Modules → Robot assistant (on/off, default robot, offers). People — Account → Appearance (show, robot, size, back to the corner, offers again) or the ⋯ menu in the panel (also "hide until reload").

| Method | Path | Purpose |
|--------|------|---------|
| GET / PUT | `/api/app/assistant/prefs` | `{ enabled, avatar: <character id>\|null, size: S\|M\|L, colors: { <id>: '#rrggbb'\|null }, greeted: [section…], resetGreetings }` → resolved prefs with `defaultAvatar`, `proactive` |

Storage: `assistant_prefs (user_id, prefs jsonb)`. The module's `avatar` and `proactive` settings are public (`publicSettings` in the catalog).

- **Colour:** each character has one main colour (clothes, shell, cape…). A person may pick another from ten swatches per character (`colors`), shown everywhere at once: the colour is the CSS variable `--rb-tint` and the drawings derive their shades with `color-mix()`.
- **Changing:** the avatar in the panel header opens the cast (grouped, with the colour row); Account → Appearance shows the same.
- **Administrator's rules** (Settings → Modules → Robot assistant): *Any character*, *Selected only* (tick the allowed ones) or *One for everyone* (a single character for the whole organisation, e.g. a company mascot; personal picks are ignored); *People may change colours* on/off. Stored in the module settings `choice: all|some|one`, `allowed: [ids]`, `allowColors`, all public; the server ignores picks outside the rules and the default always belongs to the allowed set.
