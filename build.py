# Сборка: src/* -> worker.js (его разворачивает Cloudflare). Запуск: python3 build.py
import json, base64, os
here = os.path.dirname(os.path.abspath(__file__))
p = lambda *a: os.path.join(here, *a)
rd = lambda *a: open(p(*a), encoding='utf-8').read()
shared = rd('src', 'shared.js')
sp = p('assets', 'sprites'); art = {f[:-5]: 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(sp, f), 'rb').read()).decode() for f in sorted(os.listdir(sp)) if f in ('grass.webp', 'crate.webp')}
html = rd('src', 'index.html').replace('/*SHARED*/', shared).replace('/*CLIENT*/', 'const ART = ' + json.dumps(art) + ';\n' + rd('src', 'render3d.js') + '\n' + rd('src', 'client.js'))
icons = {n: base64.b64encode(open(p('assets', 'icon-%d.png' % n), 'rb').read()).decode() for n in (192, 512)}
w = rd('src', 'server.js').replace('/*SHARED*/', shared).replace('__THREE__', json.dumps(rd('assets', 'three.min.js')))
w = w.replace('__ICON192__', icons[192]).replace('__ICON512__', icons[512]).replace('__INDEX_HTML__', json.dumps(html, ensure_ascii=False))
open(p('worker.js'), 'w', encoding='utf-8').write(w)
print('worker.js', len(w.encode()), 'bytes')
