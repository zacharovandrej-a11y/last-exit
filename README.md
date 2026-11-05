# 🚀 LAST EXIT

Онлайн «королевская битва» для браузера (телефон и ПК). Планета гибнет от кометы, последний выживший улетает на корабле.

- `src/shared.js` — общий код: сфера, мир, оружие, волна
- `src/server.js` — сервер: Cloudflare Worker + Durable Object `World` (один матч на всех)
- `src/client.js`, `src/index.html` — игра в браузере
- `python3 build.py` собирает `worker.js`; push в `main` → Cloudflare разворачивает автоматически
- `#perf` в адресе — счётчик FPS
