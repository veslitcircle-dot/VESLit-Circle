# VESLit Circle site

The website is a pre-rendered 3D room. Scrolling moves the camera between six stops: the wide
room, the crest, the notice board, the owl at the window, the trophy cabinet, and the library.
Everything that changes week to week is plain HTML laid over the render, driven by one file.

## Updating content (no code)

Edit **`public/content.json`** and push. Vercel redeploys in about a minute.

| what | where in `content.json` | notes |
|---|---|---|
| Latest Instagram post | `instagram` | replace `public/content/latest-post.jpg` (any aspect, about 1600 px wide), set `caption`, `url`, `posted` |
| Events | `events[]` | `name`, `date`, `venue` (leave either `""` to hide it), `form` (Google Form link), `status`: `open`, `soon` (closing soon) or `closed` |
| Event section title | `eventsTitle`, `eventsSubtitle` | e.g. "Vigilance Week"; leave the subtitle `""` to hide that line |
| Wins | `wins.counts`, `wins.list[]` | counts are numbers (they count up on screen); list rows are `event`, `fest`, `year`, `placing`, or `[]` to hide the list |
| About text | `about` | `lead`, `body`, `closing`, `shelf` (tags) |
| Socials | `socials[]` | `label`, `sub`, `url` |
| Credits | `credits[]` | keep the CC BY credits, the asset licences require them |

Anything in `[BRACKETS]` is a placeholder still to be filled.

## Running locally

```bash
cd web && npm install && npm run dev
```

## Regenerating the room (only when the 3D scene changes)

Needs Blender 4.2+ and the downloaded models (see `assets/models/README.md`). From the repo root:

1. `blender -b -P assets/blender/build_crest_from_svg.py -- --out assets/blender/crest.blend` (once; the room appends it)
2. `blender -b -P assets/blender/build_room.py -- --out assets/blender/room_anim_hd.blend --render assets/blender/frames_desktop_hd --stop anim --frames 1-313:2 --res 1920x1200`
3. the same with `--portrait --res 1080x2340` into `room_anim_m_hd.blend` / `frames_mobile_hd`, and `--stop lightson --frames 1-48` for both orientations into `frames_lightson_hd` / `frames_lightson_m_hd`
4. `blender -b assets/blender/room_anim_hd.blend -P assets/blender/export_board.py -- web/public/frames/board_d.json 121 0.04` and `export_camera.py -- web/public/frames/cam_d.json`; the same from the `_m_hd` file into `board_m.json` / `cam_m.json`
5. `python assets/tools/convert_frames.py` writes the HD and SD WebP tiers into `public/frames/`

The camera stops, hold and move lengths live in `assets/blender/build_room.py` and must match
`HOLD`, `MOVE` and `STOPS` at the top of `src/main.js` (and the constants at the top of `src/owl3d.js`).

Handy while testing: `?fast` skips the lights-on intro, `/#cabinet` (any stop name) opens on that stop,
and `window.__room` exposes the current frame.
