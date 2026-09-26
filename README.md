# VESLit Circle 🦉

The website of [@veslit_circle](https://www.instagram.com/veslit_circle/), the literature circle of VESIT, Mumbai.

The site is a pre-rendered 3D room. Scrolling walks the camera between six stops: the wide room, the
crest, the notice board (latest Instagram post and the events with their registration forms), the owl at
the window, the trophy cabinet, and the library. The room is a sequence of rendered frames scrubbed on
scroll; the text, the notice board and the owl are live layers on top, so week-to-week content is a one-file
edit and the owl is a real 3D model that flies in, lands and idles.

## Layout

```
web/                 the site (Vite). Deployed by Vercel from vercel.json
  public/content.json   everything the committee edits: post, events, wins, about, socials
  public/content/       the latest Instagram post image
  public/frames/        rendered room frames (WebP), board and camera data per frame
  public/models/owl/    the owl glTF (Sketchfab, CC BY-NC)
  src/main.js           scroll -> frame, pinned cards, notice-board projection, effects
  src/owl3d.js          the live three.js owl
assets/
  logo/              the crest traced from the logo PNG (trace_logo.py -> veslit-logo.svg)
  blender/           scripts that build the crest and the room and render the frames
  tools/             frame conversion and Poly Haven fetch
  models/            Sketchfab downloads (not in git; see assets/models/README.md)
```

Updating content: see [web/README.md](web/README.md). Rebuilding the room: same file, bottom section.

## Credits

3D assets by their authors under CC BY / CC BY-NC / CC0, listed in `web/public/content.json` and shown
on the site. Site code MIT.
