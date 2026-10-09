import { useStore } from '../store'
import type { Lang } from '../i18n'

/** «Как пользоваться»: тексты из docs/GUIDE.md (их пишет агент «Описатель», правила STAR, Diátaxis, пирамида Минто). */
type Scenario = { title: string; situation: string; task: string; steps: string[]; result: string; go?: 'overview' | 'upload' }
type Content = {
  h: Record<'what' | 'why' | 'values' | 'pipeline' | 'scenarios' | 'metrics' | 'trust' | 'ai' | 'before' | 'after' | 'situation' | 'task' | 'click' | 'get' | 'open', string>
  what: string; before: string; after: string
  values: [string, string][]; pipeline: [string, string][]; scenarios: Scenario[]
  metrics: [string, string][]; trust: [string, string][]; ai: [string, string][]
}

const RU: Content = {
  h: {
    what: 'Что это', why: 'Зачем', values: 'Что вы получаете', pipeline: 'Как это устроено', scenarios: 'Сценарии',
    metrics: 'Что значат метрики', trust: 'Чему верить и ограничения', ai: 'Роль ИИ', before: 'Раньше', after: 'Теперь',
    situation: 'Ситуация', task: 'Задача', click: 'Что нажать', get: 'Что получите', open: 'Открыть',
  },
  what: 'Сервис для аналитика бортовой системы помощи водителю трамвая (АБПВ): он находит в телеметрии каждое срабатывание системы и показывает, что произошло, по шагам и со ссылкой на данные.',
  before: 'Одна поездка это CSV на десятки тысяч строк (до 106 тыс. у вагона 7752) и отдельный JSON. Чтобы понять одно торможение, аналитик ищет строку вручную, сверяет два файла по времени и сам решает, что было причиной. Видео с камер под рукой нет.',
  after: 'Сервис уже разобрал 510 тыс. строк и нашёл 13 357 срабатываний на 4 234 км, 3 602 из них помечены как важные. Каждое открывается в один клик: графики, реконструкция, ролик и разбор из четырёх разделов, где у каждого факта есть время и поле-источник.',
  values: [
    ['Все срабатывания в одном списке', 'Препятствие, светофор, ограничение скорости, экстренное торможение, юз. Ничего не нужно искать в CSV.'],
    ['Разбор, который можно проверить', 'Обстоятельства, реакция системы, результат, ограничения. Нажмите время у факта, и курсор перейдёт к этому моменту.'],
    ['Общая картина парка', 'Где, когда и на каком вагоне система срабатывает чаще, с пересчётом на 100 км.'],
    ['Один курсор времени', 'Графики, карточка состояния, 2D, 3D и ролик эпизода показывают один и тот же момент.'],
    ['Свои данные', 'Загрузите CSV поездки, и эпизоды появятся на экране по мере нахождения.'],
  ],
  pipeline: [
    ['Телеметрия', 'CSV и JSON поездки склеиваются в одну таблицу по времени.'],
    ['Эпизоды', 'Срабатывания ближе 8 секунд объединяются в один эпизод.'],
    ['Разбор', 'Факты раскладываются на четыре раздела, у каждого время и поле.'],
    ['Дашборд', 'Графики, карта и списки показывают, где и когда срабатывает чаще.'],
    ['Реконструкция', '2D, 3D и ролик проигрывают эпизод по скорости, тормозам и сигналам.'],
  ],
  scenarios: [
    { title: 'Разобрать конкретное торможение', situation: 'Водитель вагона 3139 сообщил о резком торможении 17.09.', task: 'Понять, что сработало и кто тормозил.',
      steps: ['В шапке выберите поездку вагона 3139 за 17.09.', 'В блоке «С чего начать разбор» или на карте нажмите нужный эпизод.', 'На вкладке «Эпизод» прочитайте разделы «Реакция системы» и «Наблюдаемый результат».'],
      result: 'Время запроса и применения торможения, кто управлял (водитель или ассистент), какие тормоза включались, с какой скорости и до какой тормозили.', go: 'overview' },
    { title: 'Найти, с чего начать проверку', situation: 'За неделю накопились сотни срабатываний.', task: 'Выбрать самые серьёзные.',
      steps: ['Откройте «Обзор».', 'Пролистайте до блока «С чего начать разбор».', 'Нажмите верхнюю строку.'],
      result: 'Эпизоды отсортированы по важности, затем по необычности для своего типа. Полоса справа показывает пиковое замедление.', go: 'overview' },
    { title: 'Сравнить вагоны', situation: 'Нужно понять, не срабатывает ли один вагон чаще остальных.', task: 'Сравнить частоту с учётом пробега.',
      steps: ['На «Обзоре» найдите график «Какие вагоны срабатывают чаще парка?».', 'Нажмите столбец вагона.'],
      result: 'Частота на 100 км против средней по парку (черта). Клик по столбцу переключит обзор на этот вагон.', go: 'overview' },
    { title: 'Проверить место и время', situation: 'Есть подозрение, что у какой-то остановки система срабатывает слишком часто.', task: 'Найти такие места и часы.',
      steps: ['Оставьте в фильтре типов только «Препятствие».', 'Посмотрите «Где это происходит?» и «У каких остановок чаще всего?».', 'Нажмите точку на карте.'],
      result: 'Остановки с числом срабатываний и долей важных, график по часам суток, переход к эпизоду из точки.', go: 'overview' },
    { title: 'Посмотреть эпизод в движении и сохранить ролик', situation: 'По тексту непонятно, в каком порядке всё происходило.', task: 'Увидеть эпизод как ролик и приложить его к отчёту.',
      steps: ['На вкладке «Эпизод» выберите 2D, 3D или «Ролик эпизода».', 'Нажмите «К срабатыванию», затем воспроизведение. Скорость меняется кнопками 1× 2× 4× 8×.', 'Во вкладке «Ролик эпизода» нажмите «Скачать ролик эпизода».'],
      result: 'Трамвай едет по записанной скорости, загораются тормоза, появляются объект и светофор, внизу подписи из фактов разбора. Скачивается файл .webm именно этого эпизода.' },
    { title: 'Разобрать свою поездку', situation: 'Пришла новая выгрузка с вагона.', task: 'Найти в ней срабатывания.',
      steps: ['Откройте вкладку «Загрузка».', 'Перетащите CSV поездки. JSON той же поездки можно добавить по желанию.', 'Нажмите «Начать разбор», по окончании нажмите «Открыть в обзоре».'],
      result: 'Этапы обработки на экране и список эпизодов, который растёт по мере нахождения. Без JSON тип объекта и уровень предупреждения будут неизвестны.', go: 'upload' },
  ],
  metrics: [
    ['Срабатываний на 100 км', 'Число эпизодов, делённое на пробег. Точки под числом это вагоны, черта это парк.'],
    ['Важных и критичных', 'Эпизоды с торможением по препятствию, рельсовым тормозом или юзом (важные) и с аварийным или экстренным тормозом (критичные).'],
    ['Вёл ассистент', 'Доля эпизодов, в начале которых трамваем управлял ассистент, а не водитель.'],
    ['Закончились остановкой', 'Доля эпизодов, после которых трамвай остановился (скорость ниже 0,5 км/ч).'],
    ['Км пробега', 'Пробег по скорости и времени из CSV, с числом поездок и вагонов.'],
    ['Макс. замедление, м/с²', 'Самое быстрое падение скорости между соседними записями.'],
    ['От запроса до торможения', 'Секунды между запросом подсистемы (или предупреждением) и применённым торможением.'],
    ['Уровень предупреждения', 'Значение m_warn_level из JSON: что было выведено водителю (0-255).'],
  ],
  trust: [
    ['Факты взяты из данных', 'У каждого факта в разборе есть время и поле-источник. Причина указана, только если её подтверждает поле, иначе написано «причина не установлена».'],
    ['Расстояния до объекта нет', 'Данные говорят, по какому объекту система задавала скорость, но не как далеко он был.'],
    ['Время с точностью до секунды', 'CSV пишет время до секунды, шаг записи до 5-7 секунд. Порядок событий внутри одной секунды неизвестен.'],
    ['Детальный JSON есть не везде', 'В части поездок он покрывает только первый день. Там тип объекта и уровень предупреждения не записаны, и раздел «Ограничения» это показывает.'],
    ['Важность считается правилом', 'Она зависит от типа срабатывания и тормозов, а не от падения скорости. Проверяйте по графику.'],
    ['Реконструкция условная, где нет данных', 'Скорость, тормоза и сигналы взяты из записи. Положение объекта и светофора на сцене примерное.'],
    ['Видео', 'Ролики камер ГЭТ это примеры из материалов хакатона: к этим данным они не относятся и показаны отдельно на обзоре. «Ролик эпизода» на странице эпизода собирается из его телеметрии.'],
  ],
  ai: [
    ['ИИ-разбор', 'По кнопке «Составить разбор» языковая модель пересказывает проверенные факты эпизода связным текстом. Новых фактов она не добавляет, у каждого утверждения стоит время.'],
    ['Быстрые вердикты (Джеф)', 'По кнопке «Спросить Джефа» лёгкая модель отвечает «да», «нет» или «не знаю» на три вопроса: был ли риск вреда людям, похоже ли на ложное срабатывание, нужен ли ручной разбор. Это подсказка для очереди, а не вывод.'],
    ['Решение за вами', 'Если текст модели расходится с фактами, верьте фактам: они под ним, со ссылкой на поле.'],
  ],
}

const EN: Content = {
  h: {
    what: 'What it is', why: 'Why', values: 'What you get', pipeline: 'How it works', scenarios: 'Scenarios',
    metrics: 'What the metrics mean', trust: 'What to trust, and data limits', ai: 'The role of AI', before: 'Before', after: 'Now',
    situation: 'Situation', task: 'Task', click: 'What to click', get: 'What you get', open: 'Open',
  },
  what: 'A tool for analysts of the tram driver-assistance system (ADAS): it finds every system trigger in the telemetry and explains what happened, step by step, with links to the data.',
  before: 'One trip is a CSV with tens of thousands of rows (up to 106k for wagon 7752) plus a separate JSON. To understand one braking event, an analyst finds the row by hand, lines up two files by time and guesses the cause. Camera video is not at hand.',
  after: 'The tool has already processed 510k rows and found 13,357 triggers over 4,234 km, 3,602 of them marked important. Each one opens in one click: charts, a replay, a reel and a four-part review where every fact has a time and a source field.',
  values: [
    ['Every trigger in one list', 'Obstacle, traffic light, speed limit, emergency braking, wheel slip. No digging through CSV.'],
    ['A review you can check', 'Circumstances, system response, outcome, limits. Click the time next to a fact and the cursor jumps there.'],
    ['The fleet at a glance', 'Where, when and on which wagon the system triggers more, per 100 km.'],
    ['One time cursor', 'Charts, state card, 2D, 3D and the episode reel all show the same moment.'],
    ['Your own data', 'Upload a trip CSV and episodes appear on screen as they are found.'],
  ],
  pipeline: [
    ['Telemetry', 'Trip CSV and JSON are merged into one table by time.'],
    ['Episodes', 'Triggers less than 8 seconds apart become one episode.'],
    ['Review', 'Facts go into four sections, each with a time and field.'],
    ['Dashboard', 'Charts, map and lists show where and when triggers cluster.'],
    ['Replay', '2D, 3D and the reel play the episode from speed, brakes and signals.'],
  ],
  scenarios: [
    { title: 'Review a specific braking event', situation: 'The driver of wagon 3139 reported hard braking on 17 Sep.', task: 'Find out what triggered and who braked.',
      steps: ['In the header, choose the wagon 3139 trip for 17 Sep.', 'In "Where to start reviewing" or on the map, click the episode.', 'On the Episode tab, read "System response" and "Observed outcome".'],
      result: 'When braking was requested and applied, who was in control (driver or assistant), which brakes engaged, and the speed before and after.', go: 'overview' },
    { title: 'Decide what to check first', situation: 'Hundreds of triggers piled up over a week.', task: 'Pick the most serious ones.',
      steps: ['Open Overview.', 'Scroll to "Where to start reviewing".', 'Click the top row.'],
      result: 'Episodes sorted by importance, then by how unusual they are for their type. The bar on the right shows peak deceleration.', go: 'overview' },
    { title: 'Compare wagons', situation: 'You suspect one wagon triggers more often than the rest.', task: 'Compare rates adjusted for distance.',
      steps: ['On Overview, find "Which wagons trigger more than the fleet?".', "Click a wagon's bar."],
      result: 'Triggers per 100 km against the fleet average (the line). Clicking a bar switches the overview to that wagon.', go: 'overview' },
    { title: 'Check a place and time', situation: 'The system may trigger too often near some stop.', task: 'Find those places and hours.',
      steps: ['In the type filter, keep only Obstacle.', 'Look at "Where does it happen?" and "Near which stops most often?".', 'Click a dot on the map.'],
      result: 'Stops with trigger counts and the share of important ones, a time-of-day chart, and a jump to the episode from the dot.', go: 'overview' },
    { title: 'Watch an episode and save a reel', situation: 'The text does not make the order of events clear.', task: 'See the episode as a clip and attach it to a report.',
      steps: ['On the Episode tab, choose 2D, 3D or Episode reel.', 'Click "Jump to trigger", then play. Change speed with 1× 2× 4× 8×.', 'In Episode reel, click "Download episode reel".'],
      result: 'The tram moves at the recorded speed, brakes light up, the object and traffic light appear, captions come from the verified facts. A .webm of this exact episode downloads.' },
    { title: 'Analyse your own trip', situation: 'A new export arrived from a wagon.', task: 'Find its triggers.',
      steps: ['Open the Upload tab.', 'Drop the trip CSV. The JSON of the same trip is optional.', 'Click "Start analysis", then "Open in overview" when it finishes.'],
      result: 'Processing stages on screen and an episode list that grows as episodes are found. Without JSON, object type and warning level stay unknown.', go: 'upload' },
  ],
  metrics: [
    ['Episodes per 100 km', 'Episodes divided by distance. Dots under the number are wagons, the line is the fleet.'],
    ['Important or critical', 'Episodes with obstacle braking, rail brake or wheel slip (important) and with crash or emergency brake (critical).'],
    ['Assistant in control', 'Share of episodes where the assistant, not the driver, was in control at the start.'],
    ['Ended in a stop', 'Share of episodes after which the tram stopped (speed below 0.5 km/h).'],
    ['Km driven', 'Distance from CSV speed and time, with the number of trips and wagons.'],
    ['Peak decel, m/s²', 'The fastest speed drop between two neighbouring records.'],
    ['Request to braking', 'Seconds between a subsystem request (or warning) and applied braking.'],
    ['Warning level', 'The m_warn_level value from JSON: what was shown to the driver (0-255).'],
  ],
  trust: [
    ['Facts come from the data', 'Every fact in the review has a time and a source field. A cause is named only when a field confirms it; otherwise the review says the cause is not established.'],
    ['No distance to the object', 'The data says which object the system used to set speed, not how far away it was.'],
    ['One-second time resolution', 'CSV time is rounded to the second and records can be 5-7 seconds apart. The order of events within one second is unknown.'],
    ['Detailed JSON is not everywhere', 'In some trips it covers only the first day. There, object type and warning level are missing, and the Limits section says so.'],
    ['Importance is a rule', 'It depends on the trigger type and brakes, not on how much the speed dropped. Check the chart.'],
    ['The replay is schematic where data is missing', 'Speed, brakes and signals come from the record. The positions of the object and traffic light are approximate.'],
    ['Video', 'The GET camera clips are samples from the hackathon pack: they are not from this data and are shown separately on the overview. The Episode reel is built from that episode\'s telemetry.'],
  ],
  ai: [
    ['AI review', 'Click "Write review" and a language model retells the episode\'s verified facts as prose. It adds no new facts, and every statement carries a time.'],
    ['Quick verdicts (Jev)', 'Click "Ask Jev" and a light model answers yes, no or unsure to three questions: risk of harm to people, false alarm, need for manual review. Treat it as a queue hint, not a conclusion.'],
    ['You decide', 'If the model\'s text disagrees with the facts, trust the facts. They sit right below it, with source fields.'],
  ],
}

const CONTENT: Record<Lang, Content> = { ru: RU, en: EN }

function Pairs({ items, numbered }: { items: [string, string][]; numbered?: boolean }) {
  return (
    <dl className={`g-pairs ${numbered ? 'numbered' : ''}`}>
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

export default function Guide() {
  const { lang, set } = useStore()
  const c = CONTENT[lang]
  return (
    <div className="guide">
      <header className="g-head">
        <h1>{c.h.what}</h1>
        <p className="g-lead">{c.what}</p>
      </header>

      <section className="g-why">
        <div><h3>{c.h.before}</h3><p>{c.before}</p></div>
        <div className="after"><h3>{c.h.after}</h3><p>{c.after}</p></div>
      </section>

      <section>
        <h2>{c.h.pipeline}</h2>
        <ol className="g-pipe">
          {c.pipeline.map(([k, v], i) => (
            <li key={k}><span className="n">{i + 1}</span><b>{k}</b><p>{v}</p></li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{c.h.values}</h2>
        <Pairs items={c.values} numbered />
      </section>

      <section>
        <h2>{c.h.scenarios}</h2>
        <div className="g-scen">
          {c.scenarios.map((s) => (
            <article key={s.title}>
              <h3>{s.title}</h3>
              <p><small>{c.h.situation}</small>{s.situation}</p>
              <p><small>{c.h.task}</small>{s.task}</p>
              <div><small>{c.h.click}</small><ol>{s.steps.map((x) => <li key={x}>{x}</li>)}</ol></div>
              <p><small>{c.h.get}</small>{s.result}</p>
              {s.go && <button className="btn" onClick={() => set({ page: s.go! })}>{c.h.open}</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="g-cols">
        <div><h2>{c.h.metrics}</h2><Pairs items={c.metrics} /></div>
        <div>
          <h2>{c.h.trust}</h2><Pairs items={c.trust} />
          <h2 className="g-ai">{c.h.ai}</h2><Pairs items={c.ai} />
        </div>
      </section>
    </div>
  )
}
