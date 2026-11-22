# Чёрный костюм · просмотр модели

Запустите `python3 -m http.server 8795` из корня репозитория и откройте
`http://localhost:8795/docs/graphics-rig/` в браузере с WebGL 2. Кнопки меняют ракурс.
«Камера игры» использует направление игровой камеры, с приближением для просмотра модели.

Скелет рассчитывается на CPU, одна DataTexture передаёт позы вершинному шейдеру.
Сетка костюма состоит из 1446 вершин и 2888 треугольников. Вместе с глазами 2984 треугольника в одном InstancedMesh. Для прототипа используется 16 костей.

## Исходная модель и лицензия

Анатомия, исходный скелет и веса взяты из MakeHuman и адаптированы для костюма.
Использованы только ассеты под [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/):
[сетка](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj),
[скелет](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/rigs/default.mhskel)
и [веса](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/rigs/default_weights.mhw).
[Лицензия ассетов MakeHuman](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md).

Чтобы пересобрать модель, сохраните три исходных файла из указанных ссылок в одну папку и выполните:

```sh
blender -b --factory-startup --python docs/graphics-rig/build_mesh.py -- /path/to/source "$PWD/docs/graphics-rig/model.json"
```
