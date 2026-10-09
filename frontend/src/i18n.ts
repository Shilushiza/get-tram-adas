import { useStore } from './store'

export type Lang = 'ru' | 'en'

const dict = {
  appTitle: { ru: 'Разбор срабатываний АБПВ', en: 'ADAS episode review' },
  appSub: { ru: 'трамваи ГЭТ, Санкт-Петербург', en: 'GET trams, Saint Petersburg' },
  navOverview: { ru: 'Обзор', en: 'Overview' },
  navEpisode: { ru: 'Эпизод', en: 'Episode' },
  navUpload: { ru: 'Загрузить данные', en: 'Upload data' },
  allTrips: { ru: 'Все вагоны и дни', en: 'All wagons and days' },
  wagon: { ru: 'Вагон', en: 'Wagon' },
  // KPI
  kpiEpisodes: { ru: 'срабатываний', en: 'episodes' },
  kpiCritical: { ru: 'важных и критичных', en: 'important or critical' },
  kpiKm: { ru: 'км пробега', en: 'km driven' },
  kpiPer100: { ru: 'на 100 км', en: 'per 100 km' },
  kpiAssist: { ru: 'вёл ассистент', en: 'assistant in control' },
  kpiStopped: { ru: 'закончились остановкой', en: 'ended in a stop' },
  // charts
  chKinds: { ru: 'Что срабатывало', en: 'What triggered' },
  chHours: { ru: 'Когда: по часам суток', en: 'When: by hour of day' },
  chMap: { ru: 'Где: горячие точки', en: 'Where: hotspots' },
  chWagons: { ru: 'Вагоны: срабатываний на 100 км', en: 'Wagons: episodes per 100 km' },
  chObjects: { ru: 'Перед чем тормозили', en: 'What the system braked for' },
  chObjectsHint: { ru: 'по полю goal_obj_type; остальное не записано', en: 'from goal_obj_type; the rest is not recorded' },
  chSpeed: { ru: 'Скорость в момент срабатывания', en: 'Speed at trigger' },
  chControl: { ru: 'Кто управлял', en: 'Who was in control' },
  chStops: { ru: 'Остановки с наибольшим числом срабатываний', en: 'Stops with most episodes' },
  chTop: { ru: 'Разобрать в первую очередь', en: 'Review first' },
  chDays: { ru: 'По дням', en: 'By day' },
  unknown: { ru: 'не записано', en: 'not recorded' },
  open: { ru: 'Открыть', en: 'Open' },
  kmh: { ru: 'км/ч', en: 'km/h' },
  // kinds
  k_danger: { ru: 'Препятствие', en: 'Obstacle' },
  k_traffic_light: { ru: 'Светофор', en: 'Traffic light' },
  k_hard_brake: { ru: 'Экстренное торможение', en: 'Emergency braking' },
  k_skid: { ru: 'Юз', en: 'Wheel slip' },
  k_speed_limit: { ru: 'Ограничение скорости', en: 'Speed limit' },
  sev0: { ru: 'фон', en: 'background' }, sev1: { ru: 'внимание', en: 'notice' },
  sev2: { ru: 'важно', en: 'important' }, sev3: { ru: 'критично', en: 'critical' },
  // objects / controllers
  o_Ped: { ru: 'пешеход', en: 'pedestrian' }, o_Vehicle: { ru: 'автомобиль', en: 'car' },
  o_Tram: { ru: 'трамвай', en: 'tram' }, o_Obstacle: { ru: 'препятствие', en: 'obstacle' },
  o_TrafficLightSignal: { ru: 'светофор', en: 'traffic light' }, o_Unknown: { ru: 'не определён', en: 'unknown' },
  c_driver: { ru: 'водитель', en: 'driver' }, c_auto: { ru: 'ассистент', en: 'assistant' }, c_und: { ru: 'не определено', en: 'undetermined' },
  // episode page
  back: { ru: 'К обзору', en: 'Back to overview' },
  prev: { ru: 'Предыдущий', en: 'Previous' }, next: { ru: 'Следующий', en: 'Next' },
  view3d: { ru: '3D', en: '3D' }, view2d: { ru: '2D', en: '2D' }, viewVideo: { ru: 'Видео с камер', en: 'Camera video' },
  play: { ru: 'Воспроизвести', en: 'Play' }, pause: { ru: 'Пауза', en: 'Pause' },
  toTrigger: { ru: 'К срабатыванию', en: 'Jump to trigger' },
  speedDrop: { ru: 'скорость, км/ч', en: 'speed, km/h' },
  maxDecel: { ru: 'макс. замедление, м/с²', en: 'peak decel, m/s²' },
  reaction: { ru: 'от запроса до торможения', en: 'request to braking' },
  warnMax: { ru: 'уровень предупреждения', en: 'warning level' },
  none: { ru: 'нет', en: 'none' },
  stoppedShort: { ru: 'остановка', en: 'stopped' },
  route: { ru: 'маршрут', en: 'route' },
  nearStop: { ru: 'у остановки', en: 'near stop' },
  chartsTitle: { ru: 'Параметры вокруг эпизода', en: 'Signals around the episode' },
  chartsHint: { ru: 'клик по графику переносит курсор', en: 'click a chart to move the cursor' },
  sSpeed: { ru: 'Скорость', en: 'Speed' }, sGoal: { ru: 'Требуемая', en: 'Target' },
  sHDriver: { ru: 'Рукоятка водителя', en: 'Driver handle' }, sHAssist: { ru: 'Рукоятка ассистента', en: 'Assistant handle' },
  bands: { ru: 'Заливка: воздействие применено', en: 'Shading: intervention applied' },
  sec_circumstances: { ru: 'Обстоятельства и известная причина', en: 'Circumstances and known cause' },
  sec_reaction: { ru: 'Реакция системы', en: 'System response' },
  sec_result: { ru: 'Наблюдаемый результат', en: 'Observed outcome' },
  sec_limits: { ru: 'Ограничения анализа', en: 'Limits of the analysis' },
  field: { ru: 'поле', en: 'field' },
  aiTitle: { ru: 'ИИ-разбор', en: 'AI review' },
  aiRun: { ru: 'Составить разбор', en: 'Write review' }, aiRerun: { ru: 'Пересоставить', en: 'Rewrite' },
  aiBusy: { ru: 'Пишу разбор…', en: 'Writing…' },
  aiHint: { ru: 'Модель перескажет проверенные факты связным текстом, не добавляя новых.', en: 'The model retells the verified facts as prose, adding nothing new.' },
  aiOff: { ru: 'ИИ-разбор выключен: задайте OPENROUTER_API_KEY.', en: 'AI review is off: set OPENROUTER_API_KEY.' },
  aiModel: { ru: 'Модель', en: 'Model' },
  aiErr: { ru: 'Не удалось составить разбор', en: 'Could not write the review' },
  state: { ru: 'Состояние на', en: 'State at' },
  lampDanger: { ru: 'Препятствие', en: 'Obstacle' }, lampTl: { ru: 'Светофор', en: 'Traffic light' },
  lampSl: { ru: 'Огр. скорости', en: 'Speed limit' }, lampMech: { ru: 'Мех. тормоз', en: 'Mech. brake' },
  lampRail: { ru: 'Рельсовый', en: 'Rail brake' }, lampCrash: { ru: 'Аварийный', en: 'Crash brake' },
  lampEmerg: { ru: 'Экстренный', en: 'Emergency' }, lampSkid: { ru: 'Юз', en: 'Slip' },
  control: { ru: 'Управление', en: 'Control' }, target: { ru: 'требуемая', en: 'target' },
  object: { ru: 'Объект', en: 'Object' }, noData: { ru: 'нет данных', en: 'no data' },
  schematic: { ru: 'положение условно', en: 'position is schematic' },
  videoNote: {
    ru: 'Примеры записей бортовых камер и визуализатора ТБК-01 из материалов хакатона. Время в них не связано с телеметрией, поэтому синхронизации с эпизодом нет.',
    en: 'Sample onboard camera and TBK-01 visualiser recordings from the hackathon pack. They carry no telemetry timestamps, so they are not synced to the episode.',
  },
  hoverHint: { ru: 'Вращайте мышью, наведите на узел, кликните, чтобы узнать, что он делает', en: 'Drag to rotate, hover a module, click to see what it does' },
  status: { ru: 'Сейчас', en: 'Now' },
  // upload
  upTitle: { ru: 'Разбор своих данных', en: 'Analyse your own data' },
  upLead: {
    ru: 'Перетащите файлы одной поездки: обязательно CSV move_detailed_*.csv, по желанию JSON (*.jsonseq) той же поездки. Эпизоды появляются по мере нахождения.',
    en: 'Drop files of one trip: the CSV move_detailed_*.csv is required, the JSON (*.jsonseq) of the same trip is optional. Episodes appear as they are found.',
  },
  upDrop: { ru: 'Перетащите файлы сюда или нажмите, чтобы выбрать', en: 'Drop files here or click to choose' },
  upStart: { ru: 'Начать разбор', en: 'Start analysis' },
  upSending: { ru: 'Отправляю файлы', en: 'Uploading' },
  st_parse_json: { ru: 'Читаю JSON', en: 'Reading JSON' }, st_parse_csv: { ru: 'Читаю CSV', en: 'Reading CSV' },
  st_merge: { ru: 'Склеиваю CSV и JSON', en: 'Merging CSV and JSON' }, st_detect: { ru: 'Ищу срабатывания', en: 'Detecting episodes' },
  st_done: { ru: 'Готово', en: 'Done' },
  upFound: { ru: 'найдено эпизодов', en: 'episodes found' },
  upRows: { ru: 'строк телеметрии', en: 'telemetry rows' },
  upOpen: { ru: 'Открыть в обзоре', en: 'Open in overview' },
  upAgain: { ru: 'Загрузить ещё', en: 'Upload another' },
  upNeedCsv: { ru: 'Нужен хотя бы один CSV-файл', en: 'At least one CSV file is required' },
} satisfies Record<string, Record<Lang, string>>

export type Key = keyof typeof dict

export function tr(lang: Lang, k: Key): string {
  return dict[k][lang]
}

export function useT() {
  const lang = useStore((s) => s.lang)
  const t = (k: Key) => dict[k][lang]
  const kind = (k: string) => dict[`k_${k}` as Key]?.[lang] ?? k
  const obj = (k: string) => dict[`o_${k}` as Key]?.[lang] ?? k
  const ctrl = (k: string) => dict[`c_${k}` as Key]?.[lang] ?? k
  const sev = (n: number) => dict[`sev${n}` as Key]?.[lang] ?? String(n)
  return { t, kind, obj, ctrl, sev, lang }
}

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}
/** Названия остановок для английского интерфейса: транслитерация. */
export function place(name: string, lang: Lang) {
  if (lang === 'ru' || !name) return name
  return name.replace(/[а-яё]/gi, (ch) => {
    const l = TR[ch.toLowerCase()] ?? ch
    return ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1)
  })
}
