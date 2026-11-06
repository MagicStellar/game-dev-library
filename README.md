# Game Dev Library

Browse 6,928 game development talks, tutorials, and studio videos across 22 topics. Search the catalog, filter by topic or channel, and play videos in the site.

Run this project with Node.js 22 or newer. The app uses Node's built-in modules and has no packages to install.

```sh
git clone https://github.com/MagicStellar/game-dev-library.git
cd game-dev-library
npm start
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/) in your browser. Use `npm run dev` to restart the server automatically as you edit. If PowerShell blocks the npm script wrapper, use `npm.cmd start`.

Click a thumbnail or title to play a video in the site. If the uploader restricts embedded playback, use **Open on YouTube** in the player.

## Project structure

- **public/** contains the HTML, CSS, and browser JavaScript.
- **src/server.mjs** runs the HTTP server and handles search and thumbnail requests.
- **data/catalog.json** contains the video catalog loaded by the server.
