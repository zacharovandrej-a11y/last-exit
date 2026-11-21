// ===== ЗОМБИ-КООП: общее для сервера и клиента =====
const ZA = 820;            // полуразмер арены
const ZTICK = 20, ZDT = 1 / ZTICK;
const ZPR = 10;            // радиус игрока
const ZSPEED = 170;        // скорость игрока
const ZMAXP = 4;           // игроков в комнате
const ZWAVES = 30;         // волн в круге
const ZBREAK = 10;         // перерыв между волнами, с
const ZDOWN = 15;          // сколько секунд упавший может ползти к напарнику
const ZREV = 1.6;          // сколько секунд лечить
// оружие: открывается по волнам; m — модель, gore — сила расчленёнки
const ZW = [
  { n: 'Пистолет', dmg: 26, rate: 4, mag: 12, rel: 1.0, spread: .035, pel: 1, range: 520, wave: 1, m: 1, gore: 1, oneh: 1 },
  { n: 'Узи', dmg: 13, rate: 12, mag: 32, rel: 1.2, spread: .11, pel: 1, range: 420, wave: 2, m: 5, gore: 1, oneh: 1 },
  { n: 'Дробовик', dmg: 15, rate: 1.4, mag: 8, rel: 2.0, spread: .3, pel: 9, range: 300, wave: 3, m: 3, gore: 3 },
  { n: 'Автомат', dmg: 22, rate: 9, mag: 30, rel: 1.8, spread: .05, pel: 1, range: 620, wave: 5, m: 2, gore: 2 },
  { n: 'Обрез', dmg: 19, rate: 2.6, mag: 2, rel: 1.1, spread: .45, pel: 12, range: 220, wave: 7, m: 8, gore: 4 },
  { n: 'Пулемёт', dmg: 20, rate: 13, mag: 100, rel: 3.2, spread: .09, pel: 1, range: 640, wave: 9, m: 7, gore: 2 },
  { n: 'Снайперка', dmg: 170, rate: 1.3, mag: 6, rel: 2.0, spread: .004, pel: 1, range: 1300, wave: 11, m: 4, gore: 4, pierce: 6 },
  { n: 'Гранатомёт', dmg: 150, rate: 1.2, mag: 6, rel: 2.4, spread: .02, pel: 1, range: 700, wave: 13, m: 6, gore: 5, boom: 95 },
  { n: 'Огнемёт', dmg: 7, rate: 20, mag: 150, rel: 2.4, spread: .22, pel: 1, range: 210, wave: 15, m: 9, gore: 1, fire: 1, pierce: 3 },
  { n: 'Миниган', dmg: 19, rate: 26, mag: 300, rel: 4.5, spread: .12, pel: 1, range: 620, wave: 18, m: 7, gore: 3 },
];
// зомби: hp, скорость, радиус, урон, масштаб, цвет кожи, с какой волны
const ZT = [
  { n: 'ходок', hp: 42, sp: 44, r: 10, dmg: 10, sc: 1, skin: 0x7f9a5c, cloth: 0x4a4f5a, wave: 1, xp: 1 },
  { n: 'бегун', hp: 30, sp: 98, r: 9, dmg: 8, sc: .92, skin: 0x9aa76a, cloth: 0x6b3a3a, wave: 3, xp: 1 },
  { n: 'толстяк', hp: 200, sp: 30, r: 17, dmg: 22, sc: 1.5, skin: 0x6f8a52, cloth: 0x5a5040, wave: 5, xp: 4 },
  { n: 'громила', hp: 600, sp: 52, r: 22, dmg: 30, sc: 2, skin: 0x5a7044, cloth: 0x2f2f36, wave: 8, xp: 10 },
  { n: 'босс', hp: 3500, sp: 40, r: 34, dmg: 40, sc: 3, skin: 0x8a5a5a, cloth: 0x201818, wave: 99, xp: 60, boss: 1 },
];
// перки: выбор 1 из 3 при новом уровне
const ZPERK = [
  { n: 'Урон +15%', d: 'всё оружие бьёт сильнее', k: 'dmg' },
  { n: 'Скорострельность +12%', d: 'стреляешь чаще', k: 'rate' },
  { n: 'Быстрая перезарядка', d: 'перезарядка на 25% быстрее', k: 'rel' },
  { n: 'Здоровье +25', d: 'и сразу лечит', k: 'hp' },
  { n: 'Быстрые ноги', d: 'скорость бега +8%', k: 'spd' },
  { n: 'Прокачать оружие', d: 'текущее оружие: урон +25%, +1 уровень', k: 'wlvl' },
  { n: 'Регенерация', d: '+1 здоровья в секунду', k: 'regen' },
  { n: 'Пробивание', d: 'пули прошивают ещё одного', k: 'pierce' },
  { n: 'Вампир', d: 'убийство лечит на 1', k: 'vamp' },
  { n: 'Большой магазин', d: 'патронов в магазине +30%', k: 'mag' },
];
const zXpNeed = lv => Math.round(12 * Math.pow(lv, 1.45));
// волна: сколько зомби (зависит от числа игроков) и каких
function zWaveCount(w, players, cyc = 0) { return Math.round((6 + w * 4 + w * w * .22) * (1 + .6 * (players - 1)) * (1 + cyc * .5)); }
function zHpMul(w, players, cyc = 0) { return (1 + (w - 1) * .06 + .15 * (players - 1)) * (1 + cyc * .8); }
function zPickType(w, rnd) {
  const r = rnd();
  if (w >= 8 && r < .04 + w * .002) return 3;
  if (w >= 5 && r < .16) return 2;
  if (w >= 3 && r < .45) return 1;
  return 0;
}
const zUnlocked = w => ZW.map((x, i) => x.wave <= w ? i : -1).filter(i => i >= 0);
// снапшот: игрок 12 байт, зомби 9 байт
const ZSN_P = 12, ZSN_Z = 9;
