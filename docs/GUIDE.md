# Как пользоваться / How to use

Тексты для вкладки «Как пользоваться». Каждый блок можно верстать отдельной карточкой. Числа взяты из демо-данных ГЭТ (15 поездок, 6 вагонов, 14.09-07.10.2026).

---

## RU

### Что это

Сервис для аналитика бортовой системы помощи водителю трамвая (АБПВ): он находит в телеметрии каждое срабатывание системы и показывает, что произошло, по шагам и со ссылкой на данные.

### Зачем

**Раньше.** Одна поездка это CSV на десятки тысяч строк (до 106 тыс. у вагона 7752) и отдельный JSON. Чтобы понять одно торможение, аналитик ищет строку вручную, сверяет два файла по времени и сам решает, что было причиной. Видео с камер под рукой нет.

**Теперь.** Сервис уже разобрал 510 тыс. строк и нашёл 13 357 срабатываний на 4 234 км. 3 602 из них помечены как важные. Каждое открывается в один клик: графики, реконструкция и разбор из четырёх разделов, где у каждого факта есть время и поле-источник.

### Что вы получаете

1. **Все срабатывания в одном списке.** Препятствие, светофор, ограничение скорости, экстренное торможение, юз. Ничего не нужно искать в CSV.
2. **Разбор, который можно проверить.** Обстоятельства, реакция системы, результат, ограничения. Нажмите время у факта, и курсор перейдёт к этому моменту.
3. **Общая картина парка.** Где, когда и на каком вагоне система срабатывает чаще, с пересчётом на 100 км.
4. **Один курсор времени.** Графики, карточка состояния, 2D и 3D показывают один и тот же момент.
5. **Свои данные.** Загрузите CSV поездки, и эпизоды появятся на экране по мере нахождения.

### Как это устроено

| Узел | Что происходит |
|---|---|
| **Телеметрия** | CSV и JSON поездки склеиваются в одну таблицу по времени. |
| **Эпизоды** | Срабатывания ближе 8 секунд объединяются в один эпизод. |
| **Разбор** | Факты раскладываются на четыре раздела, у каждого время и поле. |
| **Дашборд** | Графики, карта и списки показывают, где и когда срабатывает чаще. |
| **Реконструкция** | 2D и 3D проигрывают эпизод по скорости, тормозам и сигналам. |

### Сценарии

**1. Разобрать конкретное торможение**
- *Ситуация:* водитель вагона 3139 сообщил о резком торможении 17.09 утром.
- *Задача:* понять, что сработало и кто тормозил.
- *Что нажать:*
  1. В шапке выберите поездку вагона 3139 за 17.09.
  2. В блоке **С чего начать разбор** или на карте нажмите нужный эпизод.
  3. На вкладке **Эпизод** прочитайте разделы **Реакция системы** и **Наблюдаемый результат**.
- *Что получите:* время запроса и применения торможения, кто управлял (водитель или ассистент), какие тормоза включались, с какой скорости и до какой тормозили.

**2. Найти, с чего начать проверку**
- *Ситуация:* за неделю накопились сотни срабатываний.
- *Задача:* выбрать самые серьёзные.
- *Что нажать:*
  1. Откройте **Обзор**.
  2. Пролистайте до блока **С чего начать разбор**.
  3. Нажмите верхнюю строку.
- *Что получите:* эпизоды отсортированы по важности, затем по необычности для своего типа. Полоса справа показывает пиковое замедление.

**3. Сравнить вагоны**
- *Ситуация:* нужно понять, не срабатывает ли один вагон чаще остальных.
- *Задача:* сравнить частоту с учётом пробега.
- *Что нажать:*
  1. На **Обзоре** найдите график **Какие вагоны срабатывают чаще парка?**
  2. Нажмите столбец вагона.
- *Что получите:* частоту на 100 км против средней по парку (черта). Сейчас разброс от 162 до 477 на 100 км. Клик по столбцу переключит обзор на этот вагон.

**4. Проверить место и время**
- *Ситуация:* есть подозрение, что у какой-то остановки система срабатывает слишком часто.
- *Задача:* найти такие места и часы.
- *Что нажать:*
  1. Оставьте в фильтре типов только **Препятствие**.
  2. Посмотрите **Где это происходит?** и **У каких остановок чаще всего?**
  3. Нажмите точку на карте.
- *Что получите:* остановки с числом срабатываний и долей важных, график по часам суток, переход к эпизоду из точки.

**5. Посмотреть эпизод в движении**
- *Ситуация:* по тексту непонятно, в каком порядке всё происходило.
- *Задача:* увидеть эпизод как ролик.
- *Что нажать:*
  1. На вкладке **Эпизод** выберите **2D** или **3D**.
  2. Нажмите **К срабатыванию**, затем **Воспроизвести**. Скорость меняется кнопками **1× 2× 4× 8×**.
- *Что получите:* трамвай едет по записанной скорости, загораются тормоза, появляются объект и светофор. Карточка состояния и графики следуют за тем же курсором.

**6. Разобрать свою поездку**
- *Ситуация:* пришла новая выгрузка с вагона.
- *Задача:* найти в ней срабатывания.
- *Что нажать:*
  1. Откройте вкладку **Загрузка**.
  2. Перетащите CSV поездки. JSON той же поездки можно добавить по желанию.
  3. Нажмите **Начать разбор**, по окончании нажмите **Открыть в обзоре**.
- *Что получите:* этапы обработки на экране и список эпизодов, который растёт по мере нахождения. Без JSON тип объекта и уровень предупреждения будут неизвестны.

### Что значат метрики на обзоре

| Метрика | Что значит |
|---|---|
| **Срабатываний на 100 км** | Число эпизодов, делённое на пробег. Точки под числом это вагоны, черта это парк. |
| **Важных и критичных** | Эпизоды с торможением по препятствию, рельсовым тормозом или юзом (важные) и с аварийным или экстренным тормозом (критичные). |
| **Вёл ассистент** | Доля эпизодов, в начале которых трамваем управлял ассистент, а не водитель. |
| **Закончились остановкой** | Доля эпизодов, после которых трамвай остановился (скорость ниже 0.5 км/ч). |
| **Км пробега** | Пробег по скорости и времени из CSV, с числом поездок и вагонов. |
| **Важность в карточке** | Фон: ограничение скорости. Внимание: светофор. Важно: препятствие, рельсовый тормоз, юз. Критично: аварийный или экстренный тормоз. |
| **Макс. замедление, м/с²** | Самое быстрое падение скорости между соседними записями. |
| **От запроса до торможения** | Секунды между запросом подсистемы (или предупреждением) и применённым торможением. |
| **Уровень предупреждения** | Значение `m_warn_level` из JSON: что было выведено водителю. |

### Чему верить и ограничения

- **Факты взяты из данных.** У каждого факта в разборе есть время и поле-источник. Причина указана, только если её подтверждает поле. Иначе написано «причина не установлена».
- **Расстояния до объекта нет.** Данные говорят, по какому объекту система задавала скорость, но не как далеко он был.
- **Время с точностью до секунды.** CSV пишет время до секунды, шаг записи до 5-7 секунд. Порядок событий внутри одной секунды неизвестен.
- **Детальный JSON есть не везде.** В части поездок он покрывает только первый день. Там тип объекта и уровень предупреждения не записаны, и раздел «Ограничения» это показывает.
- **Важность считается правилом.** Она зависит от типа срабатывания и тормозов, а не от падения скорости. Проверяйте по графику.
- **Реконструкция условная там, где нет данных.** Скорость, тормоза и сигналы взяты из записи. Положение объекта и светофора на сцене примерное.
- **Видео.** Ролики камер ГЭТ это примеры из материалов хакатона, к этим данным они не относятся и показаны отдельно на обзоре. «Ролик эпизода» на странице эпизода собирается из его телеметрии.

### Роль ИИ

- **ИИ-разбор.** По кнопке **Составить разбор** языковая модель пересказывает проверенные факты эпизода связным текстом. Новых фактов она не добавляет, у каждого утверждения стоит время.
- **Быстрые вердикты (Джеф).** Лёгкая модель отвечает «да», «нет» или «не знаю» на три вопроса: был ли риск вреда людям, похоже ли на ложное срабатывание, нужен ли ручной разбор. Это подсказка для очереди, а не вывод.
- **Решение за вами.** Если текст модели расходится с фактами, верьте фактам: они под ним, со ссылкой на поле.

---

## EN

### What it is

A tool for analysts of the tram driver-assistance system (ADAS): it finds every system trigger in the telemetry and explains what happened, step by step, with links to the data.

### Why

**Before.** One trip is a CSV with tens of thousands of rows (up to 106k for wagon 7752) plus a separate JSON. To understand one braking event, an analyst finds the row by hand, lines up two files by time and guesses the cause. Camera video is not at hand.

**Now.** The tool has already processed 510k rows and found 13,357 triggers over 4,234 km. 3,602 of them are marked important. Each one opens in one click: charts, a replay and a four-part review where every fact has a time and a source field.

### What you get

1. **Every trigger in one list.** Obstacle, traffic light, speed limit, emergency braking, wheel slip. No digging through CSV.
2. **A review you can check.** Circumstances, system response, outcome, limits. Click the time next to a fact and the cursor jumps there.
3. **The fleet at a glance.** Where, when and on which wagon the system triggers more, per 100 km.
4. **One time cursor.** Charts, state card, 2D and 3D all show the same moment.
5. **Your own data.** Upload a trip CSV and episodes appear on screen as they are found.

### How it works

| Step | What happens |
|---|---|
| **Telemetry** | Trip CSV and JSON are merged into one table by time. |
| **Episodes** | Triggers less than 8 seconds apart become one episode. |
| **Review** | Facts go into four sections, each with a time and field. |
| **Dashboard** | Charts, map and lists show where and when triggers cluster. |
| **Replay** | 2D and 3D play the episode from speed, brakes and signals. |

### Scenarios

**1. Review a specific braking event**
- *Situation:* the driver of wagon 3139 reported hard braking on the morning of 17 Sep.
- *Task:* find out what triggered and who braked.
- *What to click:*
  1. In the header, choose the wagon 3139 trip for 17 Sep.
  2. In **Where to start reviewing** or on the map, click the episode.
  3. On the **Episode** tab, read **System response** and **Observed outcome**.
- *What you get:* when braking was requested and applied, who was in control (driver or assistant), which brakes engaged, and the speed before and after.

**2. Decide what to check first**
- *Situation:* hundreds of triggers piled up over a week.
- *Task:* pick the most serious ones.
- *What to click:*
  1. Open **Overview**.
  2. Scroll to **Where to start reviewing**.
  3. Click the top row.
- *What you get:* episodes sorted by importance, then by how unusual they are for their type. The bar on the right shows peak deceleration.

**3. Compare wagons**
- *Situation:* you suspect one wagon triggers more often than the rest.
- *Task:* compare rates adjusted for distance.
- *What to click:*
  1. On **Overview**, find **Which wagons trigger more than the fleet?**
  2. Click a wagon's bar.
- *What you get:* triggers per 100 km against the fleet average (the line). The current range is 162 to 477 per 100 km. Clicking a bar switches the overview to that wagon.

**4. Check a place and time**
- *Situation:* the system may trigger too often near some stop.
- *Task:* find those places and hours.
- *What to click:*
  1. In the type filter, keep only **Obstacle**.
  2. Look at **Where does it happen?** and **Near which stops most often?**
  3. Click a dot on the map.
- *What you get:* stops with trigger counts and the share of important ones, a time-of-day chart, and a jump to the episode from the dot.

**5. Watch an episode play out**
- *Situation:* the text does not make the order of events clear.
- *Task:* see the episode as a replay.
- *What to click:*
  1. On the **Episode** tab, choose **2D** or **3D**.
  2. Click **Jump to trigger**, then **Play**. Change speed with **1× 2× 4× 8×**.
- *What you get:* the tram moves at the recorded speed, brakes light up, the object and traffic light appear. The state card and charts follow the same cursor.

**6. Analyse your own trip**
- *Situation:* a new export arrived from a wagon.
- *Task:* find its triggers.
- *What to click:*
  1. Open the **Upload** tab.
  2. Drop the trip CSV. The JSON of the same trip is optional.
  3. Click **Start analysis**, then **Open in overview** when it finishes.
- *What you get:* processing stages on screen and an episode list that grows as episodes are found. Without JSON, object type and warning level stay unknown.

### What the overview metrics mean

| Metric | Meaning |
|---|---|
| **Episodes per 100 km** | Episodes divided by distance. Dots under the number are wagons, the line is the fleet. |
| **Important or critical** | Episodes with obstacle braking, rail brake or wheel slip (important) and with crash or emergency brake (critical). |
| **Assistant in control** | Share of episodes where the assistant, not the driver, was in control at the start. |
| **Ended in a stop** | Share of episodes after which the tram stopped (speed below 0.5 km/h). |
| **Km driven** | Distance from CSV speed and time, with the number of trips and wagons. |
| **Importance on the card** | Background: speed limit. Notice: traffic light. Important: obstacle, rail brake, wheel slip. Critical: crash or emergency brake. |
| **Peak decel, m/s²** | The fastest speed drop between two neighbouring records. |
| **Request to braking** | Seconds between a subsystem request (or warning) and applied braking. |
| **Warning level** | The `m_warn_level` value from JSON: what was shown to the driver. |

### What to trust, and data limits

- **Facts come from the data.** Every fact in the review has a time and a source field. A cause is named only when a field confirms it. Otherwise the review says the cause is not established.
- **No distance to the object.** The data says which object the system used to set speed, not how far away it was.
- **One-second time resolution.** CSV time is rounded to the second and records can be 5-7 seconds apart. The order of events within one second is unknown.
- **Detailed JSON is not everywhere.** In some trips it covers only the first day. There, object type and warning level are missing, and the Limits section says so.
- **Importance is a rule.** It depends on the trigger type and brakes, not on how much the speed dropped. Check the chart.
- **The replay is schematic where data is missing.** Speed, brakes and signals come from the record. The positions of the object and traffic light are approximate.
- **Video.** The GET camera clips are samples from the hackathon pack. They are not from this data and are shown separately on the overview. The "Episode clip" on the episode page is built from that episode's telemetry.

### The role of AI

- **AI review.** Click **Write review** and a language model retells the episode's verified facts as prose. It adds no new facts, and every statement carries a time.
- **Quick verdicts (Jev).** A light model answers yes, no or unsure to three questions: was there a risk of harm to people, does it look like a false alarm, does it need manual review. Treat it as a queue hint, not a conclusion.
- **You decide.** If the model's text disagrees with the facts, trust the facts. They sit right below it, with source fields.
