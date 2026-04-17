# MT-Банк — Развёртывание

## Требования

- Docker и Docker Compose
- Node.js 20+ (для локальной разработки)
- npx/npm

---

## 1. Запуск бэкенда (Docker)

```bash
cd backend

# Запустить все сервисы
docker-compose up -d

# Проверить что всё работает
curl http://localhost:3000/api/health

# Применить миграции
docker-compose exec api npx prisma migrate dev --name init

# Заполнить тестовыми данными
docker-compose exec api node src/seed/index.js
```

### Тестовые пользователи
| Роль | Телефон | ПИН |
|------|---------|-----|
| Клиент (Gold) | +79001234567 | 1234 |
| Клиент (Silver) | +79009876543 | 1234 |
| Администратор | +79000000000 | 0000 |

---

## 2. Запуск мобильного приложения (Expo)

```bash
cd mobile

# Установить зависимости (если ещё не установлены)
npm install

# Запустить Expo
npx expo start

# Или напрямую:
npx expo start --ios    # iOS симулятор
npx expo start --android # Android эмулятор
npx expo start --web     # Веб-версия
```

> **Важно:** При запуске на реальном устройстве через Expo Go, измените `API_BASE` в `mobile/services/api.ts` на IP вашего компьютера:
> ```typescript
> const API_BASE = 'http://192.168.x.x:3000/api';
> ```

---

## 3. Запуск админ-панели

```bash
cd admin

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

Админ-панель откроется на `http://localhost:5173`.
API проксируется через Vite на `localhost:3000`.

---

## 4. Сборка Android APK

```bash
cd mobile

# Установить EAS CLI
npm install -g eas-cli

# Авторизация (нужен аккаунт Expo)
eas login

# Сборка APK для тестирования
eas build -p android --profile preview

# Сборка AAB для Google Play
eas build -p android --profile production
```

### Конфигурация для EAS Build

Создайте `eas.json` в папке `mobile/`:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "android": { "buildType": "apk" }
    },
    "production": {}
  }
}
```

---

## 5. Переменные окружения

### Backend (.env)
```
DATABASE_URL=postgresql://mtbbank:mtbbank_secret_2024@postgres:5432/mtbbank
REDIS_URL=redis://redis:6379
JWT_SECRET=<случайная строка 32+ символов>
PORT=3000
NODE_ENV=production
```

### Для продакшена:
- Измените `JWT_SECRET` на криптографически стойкий ключ
- Измените пароль PostgreSQL
- Добавьте HTTPS (nginx reverse proxy)
- Настройте CORS в `backend/src/index.js`

---

## 6. Обновление базы данных

```bash
# Создать миграцию после изменения schema.prisma
docker-compose exec api npx prisma migrate dev --name описание_изменений

# Применить миграции на продакшене (без потери данных)
docker-compose exec api npx prisma migrate deploy

# Перезаполнить данные (ОСТОРОЖНО: удалит все данные!)
docker-compose exec api node src/seed/index.js
```

---

## Структура проекта

```
mtbbank-app/
├── backend/           → Node.js API (Docker)
│   ├── prisma/        → Схема БД и миграции
│   ├── src/
│   │   ├── routes/    → REST API маршруты
│   │   ├── services/  → Бизнес-логика (cardEngine)
│   │   ├── middleware/ → JWT, проверки
│   │   └── seed/      → Тестовые данные
│   ├── Dockerfile
│   └── docker-compose.yml
├── mobile/            → React Native (Expo)
│   ├── app/(tabs)/    → Экраны (5 вкладок)
│   ├── services/      → API клиент
│   ├── stores/        → Zustand хранилище
│   └── constants/     → Тема, цвета
├── admin/             → React админ-панель (Vite)
│   └── src/           → App, стили
└── docs/              → Документация
```
