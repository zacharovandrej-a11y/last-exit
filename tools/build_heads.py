"""Головы героев из CC0-ассетов MakeHuman: базовая сетка + морф-таргеты (возраст, пол, форма лица).

Запуск: python3 tools/build_heads.py /путь/к/makehuman/data assets/hero-heads.json
Нужны data/3dobjs/base.obj и data/targets/** из https://github.com/makehumancommunity/makehuman (ассеты CC0 1.0).
Координаты — как у assets/raider-suit.json (база ×3), голова отрезается по шее; глаза — из helper-*-eye.
"""
import base64, json, sys
from pathlib import Path
import numpy as np

data, out = Path(sys.argv[1]), Path(sys.argv[2])
SCALE, CUT = 3.0, 16.9
verts, faces, grp = [], [], None
for line in (data / '3dobjs/base.obj').read_text().splitlines():
    if line.startswith('v '): verts.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): grp = line.split()[1]
    elif line.startswith('f ') and grp in ('body', 'helper-l-eye', 'helper-r-eye', 'helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2'):
        faces.append((grp, [int(w.split('/')[0]) - 1 for w in line.split()[1:]]))
V = np.array(verts)

def target(name):
    d = np.zeros_like(V)
    for line in (data / 'targets' / name).read_text().splitlines():
        if not line or line[0] == '#': continue
        i, x, y, z = line.split(); d[int(i)] = (float(x), float(y), float(z))
    return d

# вид героев: макро (пол/возраст) + форма лица; веса как у ползунков MakeHuman
M = 'macrodetails/'
HEROES = {
    0: [(M + 'caucasian-male-young.target', 1), ('head/head-square.target', .55), ('chin/chin-width-incr.target', .5), ('chin/chin-prominent-incr.target', .4), ('eyebrows/eyebrows-trans-down.target', .4), ('nose/nose-hump-incr.target', .35), ('neck/neck-scale-horiz-incr.target', .5)],
    10: [(M + 'caucasian-female-young.target', 1), ('head/head-oval.target', .6), ('nose/nose-scale-horiz-decr.target', .35), ('nose/nose-point-up.target', .3), ('mouth/mouth-upperlip-volume-incr.target', .4), ('mouth/mouth-lowerlip-volume-incr.target', .45), ('l-cheek', .35), ('chin/chin-width-decr.target', .3), ('eyes-scale', .25)],
    11: [(M + 'caucasian-male-young.target', .45), (M + 'caucasian-male-old.target', .55), ('head/head-round.target', .4), ('nose/nose-scale-vert-incr.target', .45), ('nose/nose-volume-incr.target', .4), ('nose/nose-hump-incr.target', .4), ('head/head-fat-incr.target', .35), ('eyebrows/eyebrows-angle-down.target', .3)],
    12: [(M + 'caucasian-female-young.target', .7), (M + 'caucasian-female-old.target', .3), ('head/head-oval.target', .45), ('nose/nose-scale-vert-incr.target', .25), ('mouth/mouth-scale-horiz-decr.target', .3), ('chin/chin-height-incr.target', .3), ('eyes-scale', .15)],
    13: [(M + 'caucasian-female-young.target', .25), (M + 'caucasian-female-old.target', .75), ('head/head-round.target', .35), ('head/head-fat-incr.target', .3), ('nose/nose-volume-incr.target', .35), ('nose/nose-point-down.target', .3), ('mouth/mouth-angles-down.target', .5), ('neck/neck-double-incr.target', .4)],
    14: [(M + 'caucasian-male-young.target', 1), ('head/head-rectangular.target', .5), ('nose/nose-flaring-incr.target', .45), ('nose/nose-scale-horiz-incr.target', .3), ('mouth/mouth-lowerlip-volume-incr.target', .3), ('chin/chin-cleft-incr.target', .4), ('eyebrows/eyebrows-trans-down.target', .3)],
    15: [(M + 'caucasian-male-young.target', .9), ('head/head-invertedtriangular.target', .55), ('nose/nose-scale-depth-incr.target', .3), ('nose/nose-curve-convex.target', .4), ('chin/chin-width-decr.target', .3), ('l-cheek', -.25), ('head/head-fat-decr.target', .4)],
    16: [(M + 'caucasian-male-young.target', .65), (M + 'caucasian-male-old.target', .35), ('head/head-square.target', .5), ('head/head-fat-incr.target', .55), ('nose/nose-scale-horiz-incr.target', .45), ('nose/nose-volume-incr.target', .35), ('neck/neck-scale-horiz-incr.target', .6), ('chin/chin-jaw-drop-incr.target', .3)],
}
cache = {}
def T(name):
    if name not in cache:
        if name == 'l-cheek': cache[name] = target('cheek/l-cheek-bones-incr.target') + target('cheek/r-cheek-bones-incr.target')
        elif name == 'eyes-scale': cache[name] = target('eyes/l-eye-scale-incr.target') + target('eyes/r-eye-scale-incr.target')
        else: cache[name] = target(name)
    return cache[name]

# голова: грани тела выше среза + глаза и ресницы
keep = [(g, f) for g, f in faces if g != 'body' or min(V[i][1] * SCALE for i in f) > CUT]
ids = sorted({i for _, f in keep for i in f}); remap = {i: n for n, i in enumerate(ids)}
tris, part = [], np.zeros(len(ids), np.uint8)
for g, f in keep:
    p = 1 if g.endswith('-eye') else 2 if 'eyelashes' in g else 0
    for i in f: part[remap[i]] = p
    for k in range(1, len(f) - 1): tris += [remap[f[0]], remap[f[k]], remap[f[k + 1]]]
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
q = lambda P: np.round(P[ids] * SCALE * 1000).astype('<i2')
res = {'n': len(ids), 'orig': b64(q(V)), 'part': b64(part), 'idx': b64(np.array(tris, '<u2')), 'heroes': {}}
for hid, lst in HEROES.items():
    P = V.copy()
    for name, w in lst: P = P + w * T(name)
    res['heroes'][hid] = b64(q(P))
out.write_text(json.dumps(res, separators=(',', ':')))
print(len(ids), 'verts', len(tris) // 3, 'tris', out.stat().st_size // 1024, 'KB')
