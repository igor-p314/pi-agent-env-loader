# pi-env-loader

Расширение для [pi](https://github.com/mariozechner/pi) — загружает переменные окружения из `.env` файла.

## Установка | Installation

```bash
npm install @htwdev/pi-env-loader
```

## Быстрый старт | Quick Start

```bash
/env                       # Загрузить из .env в корне проекта
/env .env.local            # Загрузить из конкретного файла
/env ./config/dev.env      # Загрузить из подпапки
/env list                  # Посмотреть список переменных
/env get DATABASE_URL      # Получить конкретную переменную
/env reload                # Перезагрузить переменные
```

## Команды | Commands

| Команда | Описание | Description |
|---------|----------|-------------|
| `/env` | Загрузить переменные из `.env` | Load variables from `.env` |
| `/env <PATH_TO_FILE>` | Загрузить из указанного файла (поддержка Unicode и Windows путей) | Load from custom file path (Unicode and Windows paths supported) |
| `/env reload` | Перезагрузить все переменные (`set` перезаписывает, `?=` никогда) | Reload all variables (`set` overwrites, `?=` never overwrites) |
| `/env list` | Показать все переменные | List all variables |
| `/env get KEY` | Получить значение переменной | Get a specific variable |
| `/env set KEY VALUE` | Установить переменную в process.env | Set variable in process.env only |
| `/env help` | Показать справку | Show help |

## Имена переменных | Variable Names

Только ASCII символы: `A-Z`, `a-z`, `0-9`, `_`

Variable names only support ASCII: `A-Z`, `a-z`, `0-9`, `_`

Кириллица и другие Unicode символы поддерживаются только в путях к файлам.
Cyrillic and other Unicode characters are supported only in file paths.

## Синтаксис .env | .env Syntax

```bash
# Стандартный | Standard
KEY=value
KEY="значение с пробелами"

# Расширенный | Extended
export KEY=value
KEY?=value              # установить если не существует (никогда не перезаписывает) | set only if not exists (never overwrites)
KEY+=value              # добавить к существующему (через : или ;) | append to existing (with : or ;)
KEY-=value              # добавить в начало | prepend to existing

# Интерполяция | Interpolation
DATABASE_URL=postgres://$USER:pass@localhost/db
API_URL=${BASE_URL}/api

# Multiline
MULTI_LINE=строка1\
строка2

# Escape-последовательности | Escape sequences
NEWLINE="строка1\nстрока2"
TAB="кол1\tкол2"
```

## Пути | Paths

Поддерживаются Unix и Windows пути, включая кириллицу в путях:

```bash
/env .env                    # Unix стиль
/env C:\\Projects\.env      # Windows стиль
/env C:/Projects/.env        # Windows (Unix-style separators)
/env проекты/настройки.env   # Кириллица в путях (только в путях к файлам)
```

В переменных поддерживаются смешанные разделители (Git Bash на Windows):
```bash
PATH=/c/Users/user/bin:$PATH  # Unix-style в Git Bash
```

## Защищённые переменные | Protected Variables

Не перезаписываются: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `TEMP`, `TMP`, `WINDIR` и др.

Never overwritten: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `TEMP`, `TMP`, `WINDIR` etc.

## Маскирование | Masking

Автоматически маскируются: `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `*_AUTH`, `*_PRIVATE`.

Automatically masked: `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `*_AUTH`, `*_PRIVATE`.

## Лицензия | License

MIT