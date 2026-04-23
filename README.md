# Env Loader Extension

**Русский** | [English](#english)

## Описание

Расширение `env-loader` добавляет в pi команду `/env` для загрузки переменных окружения из `.env` файла в проект.

## Установка

1. Скопируйте файл `env-loader.ts` в папку `.pi/extensions/` или `~/.pi/agent/extensions/`
2. Перезапустите pi или используйте `/reload`
3. Используйте команду `/env`

## Использование

### Основные команды

| Команда | Описание |
|---------|----------|
| `/env` | Загрузить переменные из `.env` |
| `/env reload` | Перезагрузить все переменные (перезаписывает существующие) |
| `/env list` | Показать все переменные из `.env` |
| `/env get KEY` | Получить значение конкретной переменной |
| `/env set KEY VALUE` | Установить переменную напрямую |
| `/env from PATH` | Загрузить из другого файла |
| `/env help` | Показать справку |

### Примеры

```bash
/env                    # Загрузить все переменные
/env list               # Посмотреть список
/env get DATABASE_URL   # Получить конкретную переменную
/env reload             # Перезагрузить
```

## Синтаксис .env файла

### Стандартный синтаксис

```bash
# Комментарий
KEY=value
KEY="значение с пробелами"
```

### Расширенный синтаксис

```bash
export KEY=value        # Экспорт переменной
KEY?=value              # Установить только если не существует
KEY+=value              # Добавить к существующему (через :)
KEY-=value              # Добавить в начало (через :)
```

### Интерполяция переменных

```bash
DATABASE_URL=postgres://$USER:pass@localhost/db
API_URL=${BASE_URL}/api
```

### Multiline значения

```bash
MULTI_LINE=строка1\
строка2
```

### Escape-последовательности

```bash
NEWLINE="строка1\nстрока2"
TAB="кол1\tкол2"
```

## Защищённые переменные

Следующие переменные не будут перезаписаны:

```
PATH, PATHEXT, HOME, USER, USERNAME, SHELL, TERM, PWD,
LD_LIBRARY_PATH, DYLD_LIBRARY_PATH, SYSTEMROOT, WINDIR,
TEMP, TMP, OS, PROCESSOR_ARCHITECTURE, COMPUTERNAME
```

## Маскирование секретов

Переменные содержащие следующие паттерны автоматически маскируются при выводе:

- `*_KEY` (например: `API_KEY`)
- `*_SECRET`, `*_SECRETS`
- `*_PASSWORD`
- `*_TOKEN`
- `*_AUTH`
- `*_CREDENTIALS`
- `*_PRIVATE`
- `PASSWORD`, `TOKEN`, `SECRET` (в начале)

## Функции (для разработчиков)

Расширение экспортирует следующие функции для использования в других модулях:

- `parseEnvFile(content)` - парсинг .env файла
- `interpolateValue(value)` - интерполяция переменных
- `collectEnvChanges(vars)` - сбор изменений окружения
- `applyEnvChanges(changes)` - применение изменений
- `isSecretKey(key)` - проверка на секретный ключ
- `isProtectedKey(key)` - проверка на защищённый ключ

## Тестирование

Тесты находятся в папке `.tests/`:

```bash
npx tsx .pi/extensions/.tests/test.ts
```

> **Внимание:** Тесты нужны только для разработки. Для работы расширения они не требуются.

---

## English

### Description

The `env-loader` extension adds the `/env` command to pi for loading environment variables from a `.env` file in the project.

### Installation

1. Copy `env-loader.ts` to `.pi/extensions/` or `~/.pi/agent/extensions/`
2. Restart pi or use `/reload` command
3. Use the `/env` command

### Usage

| Command | Description |
|---------|-------------|
| `/env` | Load variables from `.env` |
| `/env reload` | Reload all variables (overwrites existing) |
| `/env list` | List all variables in `.env` |
| `/env get KEY` | Get a specific variable |
| `/env set KEY VALUE` | Set a variable directly |
| `/env from PATH` | Load from custom file path |
| `/env help` | Show help |

### .env File Syntax

#### Standard

```bash
KEY=value
KEY="value with spaces"
```

#### Extended Syntax

```bash
export KEY=value        # Export variable
KEY?=value              # Set only if doesn't exist
KEY+=value              # Append to existing (colon-separated)
KEY-=value              # Prepend to existing
```

#### Variable Interpolation

```bash
DATABASE_URL=postgres://$USER:pass@localhost/db
API_URL=${BASE_URL}/api
```

#### Multiline Values

```bash
MULTI_LINE=line1\
line2
```

#### Escape Sequences

```bash
NEWLINE="line1\nline2"
TAB="col1\tcol2"
```

### Protected Variables

The following variables will never be overwritten:

```
PATH, PATHEXT, HOME, USER, USERNAME, SHELL, TERM, PWD,
LD_LIBRARY_PATH, DYLD_LIBRARY_PATH, SYSTEMROOT, WINDIR,
TEMP, TMP, OS, PROCESSOR_ARCHITECTURE, COMPUTERNAME
```

### Secret Masking

Variables containing these patterns are automatically masked in output:

- `*_KEY` (e.g., `API_KEY`)
- `*_SECRET`, `*_SECRETS`
- `*_PASSWORD`
- `*_TOKEN`
- `*_AUTH`
- `*_CREDENTIALS`
- `*_PRIVATE`
- `PASSWORD`, `TOKEN`, `SECRET` (at start)

### API (for developers)

The extension exports these functions:

- `parseEnvFile(content)` - Parse .env file content
- `interpolateValue(value)` - Interpolate variables in a value
- `collectEnvChanges(vars)` - Collect environment changes
- `applyEnvChanges(changes)` - Apply collected changes
- `isSecretKey(key)` - Check if key is secret
- `isProtectedKey(key)` - Check if key is protected

### Testing

Tests are located in the `.tests/` folder:

```bash
npx tsx .pi/extensions/.tests/test.ts
```


> **Note:** Tests are for development only. They are not required for the extension to work.

---

## Vibecode

Этот проект на 100% является **vibecode** — написан с помощью AI-ассистента (pi).

This project is 100% **vibecode** — written by an AI assistant (pi).