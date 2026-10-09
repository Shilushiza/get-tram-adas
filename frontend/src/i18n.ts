import { useStore } from './store'

export type Lang = 'ru' | 'en'

const dict = {
  appTitle: { ru: 'Разбор срабатываний АБПВ', en: 'ADAS episode review' },
  appSub: { ru: 'трамваи ГЭТ, Санкт-Петербург', en: 'GET trams, Saint Petersburg' },
  navOverview: { ru: 'Обзор', en: 'Overview' },
  navEpisode: { ru: 'Эпизод', en: 'Episode' },
  navUpload: { ru: 'Загрузка', en: 'Upload' },
  navGuide: { ru: 'Как пользоваться', en: 'How to use' },
  allTrips: { ru: 'Все вагоны и дни', en: 'All wagons and days' },
  wagon: { ru: 'Вагон', en: 'Wagon' },
  introTitle: { ru: 'Что делала система помощи водителю и почему', en: 'What the driver-assistance system did, and why' },
  introLead: {
    ru: 'Рабочее место аналитика бортовой системы. Сервис находит в телеметрии трамваев каждое срабатывание АБПВ (препятствие, светофор, экстренное торможение, юз), раскладывает его на факты со временем и полем-источником и показывает, где и когда система срабатывает чаще.',
    en: 'A workbench for the onboard-system analyst. The service finds every ADAS trigger in tram telemetry (obstacle, traffic light, emergency braking, wheel slip), splits it into facts with a time and a source field, and shows where and when the system triggers more often.',
  },
  step1: { ru: 'Выберите эпизод в списке «С чего начать разбор» или точку на карте', en: 'Pick an episode in "Where to start reviewing" or a dot on the map' },
  step2: { ru: 'Сверьте разбор с данными: нажмите время у факта, и курсор перейдёт к этому моменту', en: 'Check the review against the data: click a fact time and the cursor jumps there' },
  step3: { ru: 'Загрузите свою поездку: CSV, по желанию JSON', en: 'Upload your own trip: CSV, JSON optional' },
  ctaFirst: { ru: 'Разобрать первый эпизод', en: 'Review the first episode' },
  dsDemo: { ru: 'Сейчас: данные ГЭТ, 6 вагонов, 15 поездок, сентябрь-октябрь 2026', en: 'Now showing: GET data, 6 wagons, 15 trips, Sep-Oct 2026' },
  dsOne: { ru: 'Сейчас: одна выбранная поездка', en: 'Now showing: one selected trip' },
  dsUpload: { ru: 'Загрузить свою поездку', en: 'Upload your trip' },
  // KPI
  kpiEpisodes: { ru: 'срабатываний', en: 'episodes' },
  kpiCritical: { ru: 'важные и критичные', en: 'important or critical' },
  kpiKm: { ru: 'км пробега', en: 'km driven' },
  kpiPer100: { ru: 'на 100 км', en: 'per 100 km' },
  kpiAssist: { ru: 'вёл ассистент', en: 'assistant in control' },
  km: { ru: 'км', en: 'km' },
  kpiTrips: { ru: 'поездок', en: 'trips' },
  kpiWagons: { ru: 'вагонов', en: 'wagons' },
  kpiSpread: { ru: 'по вагонам от', en: 'by wagon from' },
  to: { ru: 'до', en: 'to' },
  decelShort: { ru: 'замедление, м/с²', en: 'decel, m/s²' },
  when: { ru: 'когда', en: 'when' }, what: { ru: 'что', en: 'what' }, where: { ru: 'где', en: 'where' },
  sec: { ru: 'с', en: 's' },
  kpiFleet: { ru: 'черта: весь парк', en: 'line: whole fleet' },
  kpiFleetShort: { ru: 'парк', en: 'fleet' },
  kpiStopped: { ru: 'закончились остановкой', en: 'ended in a stop' },
  kindShown: { ru: 'Показано срабатываний:', en: 'Episodes shown:' },
  of: { ru: 'из', en: 'of' },
  kindSlHidden: {
    ru: '«Ограничение скорости» выключено по умолчанию: почти все такие эпизоды имеют уровень «фон». Нажмите фильтр, чтобы добавить их.',
    en: '"Speed limit" is off by default: almost all such episodes are rated "background". Click the filter to add them.',
  },
  // charts
  chKinds: { ru: 'На что реагирует система?', en: 'What does the system react to?' },
  chHours: { ru: 'В какое время суток?', en: 'At what time of day?' },
  chMap: { ru: 'Где это происходит?', en: 'Where does it happen?' },
  chWagons: { ru: 'Какие вагоны срабатывают чаще парка? (на 100 км)', en: 'Which wagons trigger more than the fleet? (per 100 km)' },
  chObjects: { ru: 'Перед чем тормозили?', en: 'What did it brake for?' },
  chObjectsHint: { ru: 'по полю goal_obj_type; остальное не записано', en: 'from goal_obj_type; the rest is not recorded' },
  chSpeed: { ru: 'На какой скорости?', en: 'At what speed?' },
  chControl: { ru: 'Кто вёл трамвай?', en: 'Who was driving?' },
  chStops: { ru: 'У каких остановок чаще всего?', en: 'Near which stops most often?' },
  chTop: { ru: 'С чего начать разбор', en: 'Where to start reviewing' },
  chTopHint: { ru: 'нажмите строку, чтобы открыть разбор', en: 'click a row to open the review' },
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
  view3d: { ru: '3D', en: '3D' }, view2d: { ru: '2D', en: '2D' }, viewVideo: { ru: 'Ролик эпизода', en: 'Episode reel' },
  viewReel: { ru: 'Ролик эпизода', en: 'Episode reel' },
  reelDownload: { ru: 'Скачать ролик', en: 'Download clip' },
  reelRecording: { ru: 'Записываю ролик…', en: 'Recording clip…' },
  reelNote: { ru: 'Файл .webm для отчёта: 2D-реконструкция, состояние системы, графики и подписи из фактов разбора этого эпизода. Скорость как у плеера.', en: 'A .webm for your report: 2D replay, system state, charts and captions from the verified facts of this episode. Plays at the player speed.' },
  gtVideosTitle: { ru: 'Как выглядит работа АБПВ', en: 'What the ADAS looks like' },
  gtVideosLead: { ru: 'Записи бортовых камер и визуализатора ГЭТ из материалов хакатона. Это примеры: они сняты в другие дни и не относятся к эпизодам в этих данных.', en: 'Onboard camera and GET visualiser recordings from the hackathon pack. These are examples from other days, not from the episodes in this data.' },
  play: { ru: 'Воспроизвести', en: 'Play' }, pause: { ru: 'Пауза', en: 'Pause' },
  toTrigger: { ru: 'К срабатыванию', en: 'Jump to trigger' },
  speedDrop: { ru: 'падение скорости', en: 'speed drop' },
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
  aiHint: { ru: 'Модель перескажет факты ниже связным текстом по четырём разделам и не добавит новых. Готовый разбор сохраняется и открывается сразу.', en: 'The model retells the facts below as prose in four sections and adds nothing new. A finished review is saved and opens instantly.' },
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
  no3d: {
    ru: '3D не запустилась: браузер не дал WebGL. Данные и разбор работают, реконструкция есть во вкладке 2D.',
    en: '3D could not start: the browser has no WebGL. Data and review still work; the replay is on the 2D tab.',
  },
  no3dShowcase: {
    ru: '3D-модель не запустилась: браузер не дал WebGL. Обзор, эпизоды и разбор работают без неё.',
    en: 'The 3D model could not start: the browser has no WebGL. Overview, episodes and reviews work without it.',
  },
  open2d: { ru: 'Открыть 2D', en: 'Open 2D' },
  epLoading: { ru: 'Загружаю эпизод…', en: 'Loading the episode…' },
  hoverHint: { ru: 'Вращайте мышью, наведите на узел, кликните, чтобы узнать, что он делает', en: 'Drag to rotate, hover a module, click to see what it does' },
  touchHint: { ru: 'Крутите пальцем, коснитесь узла, чтобы узнать, что он делает', en: 'Drag to rotate, tap a module to see what it does' },
  ss_circumstances: { ru: 'Обстановка', en: 'Context' }, ss_reaction: { ru: 'Реакция', en: 'Response' },
  ss_result: { ru: 'Результат', en: 'Outcome' }, ss_limits: { ru: 'Ограничения', en: 'Limits' },
  timeline: { ru: 'Хронология эпизода', en: 'Episode timeline' },
  status: { ru: 'Сейчас', en: 'Now' },
  // upload
  upTitle: { ru: 'Разбор своих данных', en: 'Analyse your own data' },
  upLead: {
    ru: 'CSV одной поездки, JSON той же поездки по желанию. Файлы проходят тот же конвейер, что и данные ГЭТ на обзоре; эпизоды появляются на экране по мере нахождения.',
    en: 'One trip CSV, plus the JSON of the same trip if you have it. Files go through the same pipeline as the GET data on the overview; episodes appear on screen as they are found.',
  },
  upDrop: { ru: 'Перетащите файлы сюда или нажмите, чтобы выбрать', en: 'Drop files here or click to choose' },
  upPlan: { ru: 'Что произойдёт после загрузки', en: 'What happens after upload' },
  upCsvNeed: { ru: 'телеметрия поездки, обязательно', en: 'trip telemetry, required' },
  upJsonOpt: { ru: 'события той же поездки, по желанию', en: 'events of the same trip, optional' },
  upStart: { ru: 'Начать разбор', en: 'Start analysis' },
  upSending: { ru: 'Отправляю файлы', en: 'Uploading' },
  st_parse_json: { ru: 'Читаю JSON', en: 'Reading JSON' }, st_parse_csv: { ru: 'Читаю CSV', en: 'Reading CSV' },
  st_merge: { ru: 'Склеиваю CSV и JSON', en: 'Merging CSV and JSON' }, st_detect: { ru: 'Ищу срабатывания', en: 'Detecting episodes' },
  st_done: { ru: 'Готово', en: 'Done' },
  upFound: { ru: 'найдено эпизодов', en: 'episodes found' },
  upRows: { ru: 'строк телеметрии', en: 'telemetry rows' },
  upOpen: { ru: 'Открыть в обзоре', en: 'Open in overview' },
  upAgain: { ru: 'Загрузить ещё', en: 'Upload another' },
  upNeedCsv: { ru: 'Добавьте CSV поездки: без него срабатывания не найти. JSON только дополняет его.', en: 'Add the trip CSV: triggers are found in it. JSON only adds detail.' },
  upFail: { ru: 'Не получилось разобрать файлы', en: 'Could not analyse the files' },
  upNoJson: { ru: 'Без JSON тип объекта и уровень предупреждения останутся неизвестны', en: 'Without JSON, object type and warning level stay unknown' },
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
