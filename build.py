# Сборка: src/* -> worker.js (его разворачивает Cloudflare). Запуск: python3 build.py
import json, base64, os
here = os.path.dirname(os.path.abspath(__file__))
p = lambda *a: os.path.join(here, *a)
rd = lambda *a: open(p(*a), encoding='utf-8').read()
shared = rd('src', 'shared.js')
html = rd('src', 'index.html').replace('/*SHARED*/', shared).replace('/*CLIENT*/', rd('src', 'client.js'))
icons = {n: base64.b64encode(open(p('assets', 'icon-%d.png' % n), 'rb').read()).decode() for n in (192, 512)}
w = rd('src', 'server.js').replace('/*SHARED*/', shared)
w = w.replace('__ICON192__', icons[192]).replace('__ICON512__', icons[512]).replace('__INDEX_HTML__', json.dumps(html, ensure_ascii=False))
open(p('worker.js'), 'w', encoding='utf-8').write(w)
print('worker.js', len(w.encode()), 'bytes')
