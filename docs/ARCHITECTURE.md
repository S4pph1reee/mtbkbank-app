# MT-Банк — Архитектура

## Обзор системы

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Mobile App │────▶│  Backend API │◀───▶│  PostgreSQL DB  │
│  (Expo RN)  │     │  (Express)   │     │  (Docker)       │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
┌─────────────┐            │             ┌─────────────────┐
│ Admin Panel │────────────┘             │     Redis       │
│ (Vite React)│                          │  (Cache/Session) │
└─────────────┘                          └─────────────────┘
```

## Слои архитектуры

### 1. Presentation Layer
- **Mobile App**: React Native (Expo) — 5 вкладок + модальные окна
- **Admin Panel**: React (Vite) — SPA для управления системой

### 2. API Layer
- **Express.js** REST API
- JWT авторизация
- Rate limiting (будущее)
- CORS middleware

### 3. Business Logic Layer
- **Card Engine** (`cardEngine.js`) — центральный модуль:
  - Розыгрыш карт при покупке
  - Расчёт кэшбэка колоды
  - Ежедневное уменьшение HP
  - Жертвоприношение и исцеление
  - Конвертация в MB баллы

### 4. Data Layer
- **Prisma ORM** — типизированные модели
- **PostgreSQL** — основная БД
- **Redis** — кэш и сессии (будущее)

---

## Модели данных

```
User ──────────┬──── BankAccount ──── BankCard
               ├──── UserCard ─────── CollectionCard
               ├──── Deck ──────────── DeckCard
               ├──── CardTrade
               ├──── UserQuest ────── Quest
               ├──── Subscription
               ├──── SpendingLimit
               ├──── Notification
               └──── Transaction
```

### Ключевые связи
- **User** имеет множество **BankAccount** → каждый имеет **BankCard**
- **User** собирает **UserCard** (экземпляры **CollectionCard**)
- **UserCard** размещается в **DeckCard** внутри **Deck**
- **CardTrade** связывает двух User через обмен карт

---

## Cron Jobs

| Задача | Расписание | Действие |
|--------|-----------|----------|
| Health Decay | 00:00 ежедневно | Уменьшить HP всех карт по редкости |
| Cleanup Dead | 00:00 ежедневно | Удалить карты с HP ≤ 0, уведомить |

---

## Безопасность

- ПИН-коды хранятся как bcrypt хэши
- JWT токены с 30-дневным сроком
- Admin middleware проверяет `isAdmin` flag
- Все операции с картами проверяют принадлежность пользователю

---

## Масштабирование (будущее)

1. **Redis cache** — кэшировать расчёт кэшбэка, статистику
2. **WebSocket** — реальное время для уведомлений и обменов
3. **S3/CloudStorage** — хранение изображений карт
4. **Push Notifications** — Expo Push API
5. **Analytics** — отдельный сервис для аналитики покупок
