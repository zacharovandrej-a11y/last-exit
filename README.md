# 🔥 LAST EXIT

Онлайн «королевская битва» для браузера (телефон и ПК). Плоская карта 3000×3000, изометрическая камера, огонь сужается кругом — побеждает последний.

- `src/shared.js` — общий код: карта, мир, оружие, зона огня
- `src/server.js` — сервер: Cloudflare Worker + Durable Object `World` (один матч на всех)
- `src/render3d.js` — 3D (Three.js), ортогональная камера под изометрическим углом
- `src/client.js`, `src/index.html` — игра в браузере
- `python3 build.py` собирает `worker.js`; push в `main` → Cloudflare разворачивает автоматически
- `#perf` в адресе — счётчик FPS
