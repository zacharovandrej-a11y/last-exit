"""Головы героев из CC0-ассетов MakeHuman: фото-кожа, глаза, брови, ресницы, волосы прядями.

python3 tools/build_heroes.py MH_DATA MHJS_DATA public/hero
  MH_DATA   — makehuman/data из https://github.com/makehumancommunity/makehuman (base.obj, targets)
  MHJS_DATA — public/data из https://github.com/makehuman-js/makehuman-data (скины, прокси волос/бровей/ресниц/глаз)
Ассеты MakeHuman (сетка, таргеты, скины, системные прокси) — CC0 1.0. Координаты — как у assets/raider-suit.json (база ×3).
"""
import base64, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

MH, MJ, OUT = map(Path, sys.argv[1:4]); OUT.mkdir(parents=True, exist_ok=True)
SCALE, CUT = 3.0, 16.9
V, VT, faces, grp = [], [], [], None
for line in (MH / '3dobjs/base.obj').read_text().splitlines():
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): grp = line.split()[1]
    elif line.startswith('f ') and grp == 'body':
        faces.append([(int(w.split('/')[0]) - 1, int(w.split('/')[1]) - 1) for w in line.split()[1:]])
V, VT = np.array(V), np.array(VT)

def target(name):
    d = np.zeros_like(V)
    for line in (MH / 'targets' / name).read_text().splitlines():
        if line and line[0] != '#': i, x, y, z = line.split(); d[int(i)] = (float(x), float(y), float(z))
    return d
cache = {}
def T(n):
    if n not in cache:
        if n == 'cheeks': cache[n] = target('cheek/l-cheek-bones-incr.target') + target('cheek/r-cheek-bones-incr.target')
        elif n == 'eyes-scale': cache[n] = target('eyes/l-eye-scale-incr.target') + target('eyes/r-eye-scale-incr.target')
        else: cache[n] = target(n)
    return cache[n]
M = 'macrodetails/'
SK = 'skins/{0}_caucasian_{1}/textures/{0}_lightskinned_{1}_diffuse.png'
HEROES = {  # морфы лица, кожа, волосы (прокси, оттенок), брови
    0: dict(m=[(M + 'caucasian-male-young.target', 1), ('head/head-square.target', .55), ('chin/chin-width-incr.target', .5), ('chin/chin-prominent-incr.target', .4), ('eyebrows/eyebrows-trans-down.target', .4), ('nose/nose-hump-incr.target', .35), ('neck/neck-scale-horiz-incr.target', .5)], skin=('young', 'male'), hair=('short02', '#4a3a2e'), brow=('eyebrow001', '#3a2a20')),
    10: dict(m=[(M + 'caucasian-female-young.target', 1), ('head/head-oval.target', .6), ('nose/nose-scale-horiz-decr.target', .35), ('nose/nose-point-up.target', .3), ('mouth/mouth-upperlip-volume-incr.target', .4), ('mouth/mouth-lowerlip-volume-incr.target', .45), ('cheeks', .35), ('chin/chin-width-decr.target', .3), ('eyes-scale', .25)], skin=('young', 'female'), hair=('long01', '#3a2a24'), brow=('eyebrow010', '#2a1e18')),
    11: dict(m=[(M + 'caucasian-male-young.target', .45), (M + 'caucasian-male-old.target', .55), ('head/head-round.target', .4), ('nose/nose-scale-vert-incr.target', .45), ('nose/nose-volume-incr.target', .4), ('nose/nose-hump-incr.target', .4), ('head/head-fat-incr.target', .35), ('eyebrows/eyebrows-angle-down.target', .3)], skin=('old', 'male'), hair=('ponytail01', '#8a8680'), grey=1, brow=('eyebrow001', '#8a847c')),
    12: dict(m=[(M + 'caucasian-female-young.target', .7), (M + 'caucasian-female-old.target', .3), ('head/head-oval.target', .45), ('nose/nose-scale-vert-incr.target', .25), ('mouth/mouth-scale-horiz-decr.target', .3), ('chin/chin-height-incr.target', .3), ('eyes-scale', .15)], skin=('middleage', 'female'), hair=None, brow=('eyebrow010', '#3a2c24')),
    13: dict(m=[(M + 'caucasian-female-young.target', .25), (M + 'caucasian-female-old.target', .75), ('head/head-round.target', .35), ('head/head-fat-incr.target', .3), ('nose/nose-volume-incr.target', .35), ('nose/nose-point-down.target', .3), ('mouth/mouth-angles-down.target', .5), ('neck/neck-double-incr.target', .4)], skin=('old', 'female'), hair=None, brow=('eyebrow010', '#9a9088')),
    14: dict(m=[(M + 'caucasian-male-young.target', 1), ('head/head-rectangular.target', .5), ('nose/nose-flaring-incr.target', .45), ('nose/nose-scale-horiz-incr.target', .3), ('mouth/mouth-lowerlip-volume-incr.target', .3), ('chin/chin-cleft-incr.target', .4), ('eyebrows/eyebrows-trans-down.target', .3)], skin=('young', 'male'), hair=None, brow=('eyebrow001', '#2a2018')),
    15: dict(m=[(M + 'caucasian-male-young.target', .9), ('head/head-invertedtriangular.target', .55), ('nose/nose-scale-depth-incr.target', .3), ('nose/nose-curve-convex.target', .4), ('chin/chin-width-decr.target', .3), ('cheeks', -.25), ('head/head-fat-decr.target', .4)], skin=('young', 'male'), hair=('short03', '#6a4a32'), brow=('eyebrow001', '#4a3424')),
    16: dict(m=[(M + 'caucasian-male-young.target', .65), (M + 'caucasian-male-old.target', .35), ('head/head-square.target', .5), ('head/head-fat-incr.target', .55), ('nose/nose-scale-horiz-incr.target', .45), ('nose/nose-volume-incr.target', .35), ('neck/neck-scale-horiz-incr.target', .6), ('chin/chin-jaw-drop-incr.target', .3)], skin=('middleage', 'male'), hair=('short02', '#3a2c22'), brow=('eyebrow001', '#3a2c22')),
}
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
q3 = lambda P: np.round(P * SCALE * 1000).astype('<i2')
quv = lambda U: np.round(np.clip(U, 0, 1) * 65535).astype('<u2')

def webp(src, name, size=512, alpha=False, q=82):
    if (OUT / name).exists(): return name
    im = Image.open(src).convert('RGBA' if alpha else 'RGB')
    if im.size[0] > size: im = im.resize((size, size), Image.LANCZOS)
    im.save(OUT / name, 'WEBP', quality=q, method=6); return name

# голова: грани тела выше среза, вершины расщеплены по UV-швам
head = [f for f in faces if min(V[v][1] * SCALE for v, _ in f) > CUT]
key = {}; hv, huv, tris = [], [], []
for f in head:
    ids = []
    for v, t in f:
        if (v, t) not in key: key[(v, t)] = len(hv); hv.append(v); huv.append(VT[t])
        ids.append(key[(v, t)])
    for k in range(1, len(f) - 1): tris += [ids[0], ids[k], ids[k + 1]]
hv = np.array(hv); huv = np.array(huv)

def proxy(kind, name):
    d = json.loads((MJ / 'proxies' / kind / name / f'{name}.json').read_text())
    r, w, o = np.array(d['ref_vIdxs']), np.array(d['weights']), np.array(d['offsets'])
    uvs = np.array(d['uvs'][0]).reshape(-1, 2); F = d['faces']; tri, tv, tuv, i = [], [], [], 0; key = {}
    while i < len(F):
        t = F[i]; i += 1; quad = t & 1; n = 4 if quad else 3; vs = F[i:i + n]; i += n
        if t & 2: i += 1
        if t & 4: i += 1
        us = None
        if t & 8: us = F[i:i + n]; i += n
        if t & 16: i += 1
        if t & 32: i += n
        if t & 64: i += 1
        if t & 128: i += n
        ids = []
        for k in range(n):
            kk = (vs[k], us[k] if us else 0)
            if kk not in key: key[kk] = len(tv); tv.append(vs[k]); tuv.append(uvs[us[k]] if us else (0, 0))
            ids.append(key[kk])
        for k in range(1, n - 1): tri += [ids[0], ids[k], ids[k + 1]]
    tex = (MJ / 'proxies' / kind / name / d['materials'][0]['mapDiffuse'])
    return dict(r=r[tv], w=w[tv], o=o[tv], uv=np.array(tuv), idx=np.array(tri), tex=tex)

EYES = proxy('eyes', 'HighPolyEyes'); LASH = proxy('eyelashes', 'Eyelashes01')
webp(EYES['tex'].parent / 'brown_eye.png', 'eye.webp', 256); webp(LASH['tex'], 'lash.webp', 256, True)
for hid, h in HEROES.items():
    P = V.copy()
    for n, wgt in h['m']: P = P + wgt * T(n)
    fit = lambda p: (P[p['r']] * p['w'][:, :, None]).sum(1) + p['o']
    fit0 = lambda p: (V[p['r']] * p['w'][:, :, None]).sum(1) + p['o']
    age, sex = h['skin']; skin = webp(MJ / SK.format(age, sex), f'skin_{age}_{sex}.webp', 512, False, 80)
    # средний цвет кожи на шее — им красится остальное тело
    im = np.array(Image.open(MJ / SK.format(age, sex)).convert('RGB')); sel = (V[hv][:, 1] * SCALE > 17.1) & (V[hv][:, 1] * SCALE < 17.9)  # цвет кожи по шее
    px = [im[min(511, int((1 - v) * 512)), min(511, int(u * 512))] for u, v in huv[sel]]; neck = np.median(np.array(px), 0) / 255
    res = {'skin': skin, 'skinRGB': [round(float(x), 3) for x in neck], 'head': {'pos': b64(q3(P[hv])), 'orig': b64(q3(V[hv])), 'uv': b64(quv(huv)), 'idx': b64(np.array(tris, '<u2'))}, 'parts': []}
    def part(p, kind, tex, tint=None, alpha=False):
        res['parts'].append({'k': kind, 'tex': tex, 'tint': tint, 'pos': b64(q3(fit(p))), 'orig': b64(q3(fit0(p))), 'uv': b64(quv(p['uv'])), 'idx': b64(np.array(p['idx'], '<u2'))})
    part(EYES, 'eye', 'eye.webp'); part(LASH, 'lash', 'lash.webp')
    bn, bc = h['brow']; br = proxy('eyebrows', bn); part(br, 'brow', webp(br['tex'], f'{bn}.webp', 256, True), bc)
    if h['hair']:
        hn, hc = h['hair']; hp = proxy('hair', hn); grey = h.get('grey')
        if grey and not (OUT / f'{hn}_grey.webp').exists():  # седые волосы: та же прядь, обесцвеченная и светлее
            im = Image.open(hp['tex']).convert('RGBA'); r, g, b, a = im.split(); L = Image.merge('RGB', (r, g, b)).convert('L').point(lambda x: min(255, int(x * 1.9 + 40)))
            Image.merge('RGBA', (L, L, L, a)).save(OUT / f'{hn}_grey.webp', 'WEBP', quality=85, method=6)
        part(hp, 'hair', f'{hn}_grey.webp' if grey else webp(hp['tex'], f'{hn}.webp', 512, True, 85), hc)
    (OUT / f'{hid}.json').write_text(json.dumps(res, separators=(',', ':')))
    print(hid, len(hv), 'head verts', (OUT / f'{hid}.json').stat().st_size // 1024, 'KB')
print('textures', sum(f.stat().st_size for f in OUT.glob('*.webp')) // 1024, 'KB')
