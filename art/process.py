# Нарезка картинок из art/ в assets/sprites/*.webp (запуск: python3 art/process.py)
from PIL import Image
import numpy as np, os
here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, '..', 'assets', 'sprites'); os.makedirs(out, exist_ok=True)
def unkey(im):  # убираем фон #FF00FF с мягкими краями
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]; m = np.array([255, 0, 255], np.float32)
    d = np.sqrt(((rgb - m) ** 2).sum(-1))
    al = np.clip((d - 40) / 110, 0, 1)
    k = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, 255) / 255  # «розовость»
    al = np.minimum(al, 1 - np.clip((k - .55) / .3, 0, 1) * (d < 200))
    sa = np.maximum(al, 1e-3)[..., None]
    rgb2 = np.clip((rgb - (1 - sa) * m) / sa, 0, 255)
    res = np.dstack([rgb2, al * a[..., 3] / 255 * 255]).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')
def trim(im):
    bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox(); return im.crop(bb)
def save(im, name, h=None, w=None):
    if h: im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    if w: im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=86, method=6); print(name, im.size, os.path.getsize(os.path.join(out, name + '.webp')))
src = lambda n: os.path.join(here, n)
save(trim(Image.open(src('char01.png')).convert('RGBA')), 'char01', h=160)
b = Image.open(src('batch1.png')).convert('RGB'); W, H = b.size
q = lambda x0, y0, x1, y1: b.crop((int(W * x0), int(H * y0), int(W * x1), int(H * y1)))
save(trim(unkey(q(0, 0, .5, .5))), 'tree1', h=200)
save(trim(unkey(q(.5, 0, 1, .5))), 'house1', w=300)
save(trim(unkey(q(0, .5, .5, 1))), 'crate', w=110)
g = trim(unkey(q(.5, .5, 1, 1))).convert('RGB'); g = g.crop((8, 8, g.width - 8, g.height - 8))
save(g, 'grass', w=320)
