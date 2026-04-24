# pi-env-loader

Расширение для [pi](https://github.com/mariozechner/pi) — загружает переменные окружения из `.env` файла.

[English version](#english-version) | [Версия на русском](#pi-env-loader-1)

## Установка

```bash
npm install @htwdev/pi-env-loader
```

## Быстрый старт

```bash
/env                       # Загрузить из .env в корне проекта
/env .env.local            # Загрузить из конкретного файла
/env ./config/dev.env      # Загрузить из подпапки
/env list                  # Посмотреть список переменных
/env get DATABASE_URL      # Получить конкретную переменную
/env reload                # Перезагрузить переменные
```

## Команды

| Команда | Описание |
|---------|----------|
| `/env` | Загрузить переменные из `.env` |
| `/env <PATH_TO_FILE>` | Загрузить из указанного файла (поддержка Unicode и Windows путей) |
| `/env reload` | Перезагрузить все переменные (`set` перезаписывает, `?=` никогда) |
| `/env list` | Показать все переменные |
| `/env get KEY` | Получить значение переменной |
| `/env set KEY VALUE` | Установить переменную в process.env только |
| `/env help` | Показать справку |

## Имена переменных

Только ASCII символы: `A-Z`, `a-z`, `0-9`, `_`

Кириллица и другие Unicode символы поддерживаются только в путях к файлам.

## .env Синтаксис

```bash
# Стандартный
KEY=value
KEY="значение с пробелами"

# Расширенный
export KEY=value
KEY?=value              # установить если не существует (никогда не перезаписывает)
KEY+=value              # добавить к существующему (через : или ;)
KEY-=value              # добавить в начало

# Интерполяция
DATABASE_URL=postgres://$USER:pass@localhost/db
API_URL=${BASE_URL}/api

# Multiline
MULTI_LINE=строка1\
строка2

# Escape-последовательности
NEWLINE="строка1\nстрока2"
TAB="кол1\tкол2"
```

## Пути

Поддерживаются Unix и Windows пути, включая кириллицу:

```bash
/env .env                    # Unix стиль
/env C:\\Projects\\.env      # Windows стиль
/env C:/Projects/.env        # Windows (Unix-style separators)
/env проекты/настройки.env   # Кириллица в путях
```

Смешанные разделители (Git Bash на Windows):
```bash
PATH=/c/Users/user/bin:$PATH  # Unix-style в Git Bash
```

## Защищённые переменные

Не перезаписываются: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `TEMP`, `TMP`, `WINDIR` и др.

## Маскирование

Автоматически маскируются: `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `*_AUTH`, `*_PRIVATE`.

## Лицензия

MIT

---

# English version

[Версия на русском](#pi-env-loader)

pi extension for loading environment variables from `.env` files.

## Installation

```bash
npm install @htwdev/pi-env-loader
```

## Quick Start

```bash
/env                       # Load from .env in project root
/env .env.local            # Load from specific file
/env ./config/dev.env      # Load from subfolder
/env list                  # List all variables
/env get DATABASE_URL      # Get specific variable
/env reload                # Reload variables
```

## Commands

| Command | Description |
|---------|-------------|
| `/env` | Load variables from `.env` |
| `/env <PATH_TO_FILE>` | Load from custom file path (Unicode and Windows paths supported) |
| `/env reload` | Reload all variables (`set` overwrites, `?=` never overwrites) |
| `/env list` | List all variables |
| `/env get KEY` | Get specific variable value |
| `/env set KEY VALUE` | Set variable in process.env only |
| `/env help` | Show help |

## Variable Names

Only ASCII characters: `A-Z`, `a-z`, `0-9`, `_`

Unicode characters supported only in file paths.

## .env Syntax

```bash
# Standard
KEY=value
KEY="value with spaces"

# Extended
export KEY=value
KEY?=value              # set only if not exists (never overwrites)
KEY+=value              # append to existing (with : or ;)
KEY-=value              # prepend to existing

# Interpolation
DATABASE_URL=postgres://$USER:pass@localhost/db
API_URL=${BASE_URL}/api

# Multiline
MULTI_LINE=line1\
line2

# Escape sequences
NEWLINE="line1\nline2"
TAB="col1\tcol2"
```

## Paths

Unix and Windows paths supported, including Cyrillic in paths:

```bash
/env .env                    # Unix style
/env C:\\Projects\\.env      # Windows style
/env C:/Projects/.env        # Windows (Unix-style separators)
/env projects/settings.env   # Cyrillic in paths (only in file paths)
```

Mixed separators supported (Git Bash on Windows):
```bash
PATH=/c/Users/user/bin:$PATH  # Unix-style in Git Bash
```

## Protected Variables

Never overwritten: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `TEMP`, `TMP`, `WINDIR` etc.

## Masking

Automatically masked: `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `*_AUTH`, `*_PRIVATE`.

## License

MIT