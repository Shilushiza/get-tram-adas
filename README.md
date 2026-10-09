# Разбор эпизодов АБПВ (хакатон ГЭТ, Сириус)

MVP для аналитика бортовой системы помощи водителю трамвая: находит срабатывания, собирает проверяемый разбор
эпизода, показывает дашборд с единым временным курсором и 2D-реконструкцию.

## Данные

`data/raw/new_data/hakathon_new_data/<вагон>/` содержит пары `*.jsonseq` и `*.csv` за одну поездку.

- CSV: флаги срабатываний (`dangObjAct/RealAct`, `trafLightAct/RealAct`, `speedLimitAct/RealAct`), тормоза,
  рукоятки водителя и ассистента, остановки. Около событий пишется чаще (шаг 0-2 с вместо 5 с).
- JSON: тип объекта, задающего скорость (`goal_obj_type`), уровень предупреждения, режим автомата, юз, датчики.
  Поля `m_*_act` в JSON почти всегда `No`, поэтому срабатывания берём из CSV.

## Конвейер

```bash
python backend/ingest.py     # jsonseq -> data/processed/<trip>.parquet
python backend/prepare.py    # CSV + JSON -> data/processed/trips/<trip>.parquet, episodes.json
```

`backend/events.py` выделяет эпизоды и факты. Каждый факт хранит время и поле-источник; причина указывается,
только если её подтверждает поле, иначе пишем, что она не установлена. Ограничение скорости срабатывает часто,
поэтому оно становится отдельным эпизодом, только если рядом нет более важного срабатывания.

## Запуск

```bash
python -m uvicorn api:app --app-dir backend --port 8000
```

```bash
node frontend/node_modules/vite/bin/vite.js frontend --port 5173
```

Дашборд: http://127.0.0.1:5173

## ИИ-разбор

Ключ OpenRouter берётся из переменной окружения `OPENROUTER_API_KEY` или из `.env` (см. `.env.example`).
Модель задаётся `OPENROUTER_MODEL`, по умолчанию `deepseek/deepseek-v4.1-flash`: Anthropic, Google и OpenAI
через этот аккаунт отвечают 403. Модель получает только проверенные факты и пересказывает их по четырём разделам;
ответы кешируются в `data/processed/narratives/`.
