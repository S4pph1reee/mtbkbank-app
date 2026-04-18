You are a senior full-stack mobile developer. I have an MVP of a gamified banking app called "MT-Банк" built with React Native (Expo), Node.js/Express/Prisma backend, PostgreSQL, Redis, and a React/Vite admin panel. I need you to help me complete this app into a fully production-ready product.

---

## 🏗 PROJECT CONTEXT

### Tech Stack
- **Mobile**: React Native (Expo), port :8081
- **Backend API**: Node.js + Express + Prisma ORM, port :3000
- **Database**: PostgreSQL 16 (Docker), port :5432
- **Cache**: Redis 7 (Docker), port :6379
- **Admin Panel**: React (Vite), port :5173
- **Auth**: JWT tokens (30-day), PIN-code login (bcrypt hashed)
- **Design System**: "Pristine Vault" — Manrope font, Electric Blue (#4F8EF7), Gold (#fdcf49), glassmorphism dark theme

### App Concept — Gamified Banking
A banking app with a unique collectible card system:
- Every purchase triggers a card drop (70% chance), with rarities: Common (60%), Rare (25%), Epic (12%), Legendary (3%)
- Each card gives cashback %: Common 0.5–1.5%, Rare 1.5–3%, Epic 3–5%, Legendary 5–10%
- Cards have HP (health). Each day HP decays: Common -2/day (~50 days), Rare -1.5/day (~67d), Epic -1/day (~100d), Legendary -0.5/day (~200d)
- At 0 HP the card is destroyed
- Cards can be placed in Decks (max 5 cards). Only the active deck applies cashback (sum of all cards' %)
- Cards can be sacrificed to restore HP of another card, converted to MB points, traded or gifted to friends
- MB points determine user status: Standard → Silver → Gold → Platinum

### Existing Screens (5 tabs)
1. **Home** — balance, bank card, quick actions (топополнить/перевести/оплатить), recent transactions
2. **Analytics** — spending charts by category, subscriptions, spending limits
3. **Payments** — payment categories, scheduled payments
4. **Cards** (game system) — active deck, card inventory, daily quests, convert to MB
5. **Profile** — settings, security, MB points balance

### Existing API Endpoints
- Auth: POST /auth/login
- Users: GET/PUT /users/me, GET /users/me/stats
- Accounts: GET /accounts, POST /accounts/:id/topup
- Transactions: GET /transactions, GET /transactions/analytics, POST /transactions/transfer
- Payments: GET /payments/categories, POST /payments, GET /payments/scheduled
- Cards: GET /cards/collection, GET /cards/inventory, GET /cards/:id, POST /cards/sacrifice, POST /cards/convert, GET /cards/stats/rarities
- Decks: GET/POST /decks, PUT /decks/:id, PUT /decks/:id/activate, GET /decks/:id/cashback
- Trades: POST /trades, PUT /trades/:id/accept|reject, POST /trades/send
- Quests: GET /quests/daily, POST /quests/:id/claim
- Subscriptions: GET/PUT /subscriptions/:id
- Limits: GET/PUT /limits/:id
- Notifications: GET /notifications, PUT /notifications/:id/read, PUT /notifications/read-all
- Admin: Full CRUD for users, cards, quests, config, dashboard stats

### Data Models
User → BankAccount → BankCard
User → UserCard (instances of CollectionCard)
UserCard → DeckCard → Deck
User → CardTrade, UserQuest, Subscription, SpendingLimit, Notification, Transaction

---

## 🎯 YOUR TASK

Complete this MVP into a fully production-ready mobile application. Work through the following areas **one by one**, generating complete, working code for each. After each section, wait for me to confirm before proceeding.

---

### PHASE 1 — MOBILE APP: Missing & Broken Screens

The `mobile/` directory exists but the actual React Native screen files are incomplete or missing. Generate full, production-quality screen components for each tab:

**1.1 HomeScreen (`screens/HomeScreen.tsx`)**
- Animated balance card with glassmorphism effect (match design: #131313 bg, #4F8EF7 primary, Manrope font)
- Bank card widget showing masked card number (•••• •••• •••• XXXX), holder name, expiry
- Quick action buttons: Пополнить, Перевести, Оплатить (round buttons, primary color)
- Recent transactions list with category icons and amounts (last 5, with "View All" link)
- Pull-to-refresh, skeleton loading states
- Connect to GET /accounts and GET /transactions APIs

**1.2 AnalyticsScreen (`screens/AnalyticsScreen.tsx`)**
- Pie/donut chart of spending by category (use react-native-chart-kit or victory-native)
- Period selector: Week / Month / Year tabs
- Category breakdown list with colored bars and percentages
- Subscriptions section with monthly total
- Spending limits with progress bars (used/limit)
- Connect to GET /transactions/analytics and GET /limits APIs

**1.3 PaymentsScreen (`screens/PaymentsScreen.tsx`)**
- Category grid (Коммунальные, Интернет, Телефон, Игры, etc.) with icons
- Payment modal with amount input, account selector, merchant name field
- Scheduled payments section with list and cancel option
- After successful payment — show card drop animation if card was received
- Connect to GET /payments/categories, POST /payments, GET /payments/scheduled

**1.4 CardsScreen (`screens/CardsScreen.tsx`)** — THE CORE FEATURE
- Active Deck display: 5 slots, each showing card rarity color + cashback %, total cashback at bottom
- Deck management: tap slot → open inventory picker, drag-to-reorder cards in deck
- Card Inventory: grid of owned cards with rarity badges (gray/blue/purple/gold), HP bar, cashback %
- Card Detail Modal: full card view, HP restoration via sacrifice, convert to MB button, trade button
- Daily Quests section: list of 3 quests with progress bars and "Claim" buttons
- Animated card drop reveal when a new card is received (cinematic reveal animation with rarity glow)
- Connect to all /cards, /decks, /quests endpoints

**1.5 ProfileScreen (`screens/ProfileScreen.tsx`)**
- User avatar, name, status badge (Standard/Silver/Gold/Platinum with color)
- MB points balance with animated counter
- Settings sections: Security (change PIN), Notifications toggle, App settings
- Statistics: total cards collected, active cashback %, quests completed
- Logout button
- Connect to GET /users/me, GET /users/me/stats

---

### PHASE 2 — NAVIGATION & STATE

**2.1 Navigation Setup (`navigation/`)**
- Bottom tab navigator with 5 tabs using correct icons (home, insights, credit_card, person + center FAB for payments)
- Stack navigators nested for each tab (e.g., Home → TransactionDetail, Cards → CardDetail → TradeScreen)
- Auth stack: PhoneInput → PinEntry → Main
- Deep linking configuration

**2.2 Global State (`store/` using Zustand or Redux Toolkit)**
- authStore: token, user, login/logout actions
- accountStore: accounts list, selected account, balance
- cardStore: inventory, active deck, quests
- notificationStore: unread count, list
- All stores should persist relevant data to AsyncStorage

**2.3 API Layer (`api/`)**
- Axios instance with base URL from environment variable, JWT interceptor, 401 auto-logout
- React Query (TanStack Query) setup for all API calls with proper stale times:
  - transactions: staleTime 60s
  - cards/inventory: staleTime 30s
  - quests: staleTime 5min
- Error boundary component for API failures
- Offline detection with toast notification

---

### PHASE 3 — CARD DROP ANIMATION

This is the signature feature. Create `components/CardDropReveal.tsx`:
- Full-screen modal overlay
- Stage 1 (0.5s): Dark overlay fades in, glowing orb rises from bottom
- Stage 2 (1s): Card flips from back to front (3D flip animation using Animated API or Reanimated)
- Stage 3 (0.5s): Rarity color burst — Common: white sparks, Rare: blue particles, Epic: purple glow + shake, Legendary: gold explosion + haptic feedback
- Stage 4: Card stats appear (rarity badge, cashback %, HP bar), "Add to Deck" and "Nice!" buttons
- Use react-native-reanimated 3 for smooth 60fps animations
- Use expo-haptics for Legendary/Epic drops

---

### PHASE 4 — BACKEND COMPLETIONS

**4.1 Redis Integration (`backend/src/cache/`)**
- Cache GET /cards/collection (TTL: 1 hour, invalidate on admin card update)
- Cache GET /transactions/analytics (TTL: 5 minutes per user)
- Cache GET /decks/:id/cashback (TTL: 30s, invalidate on deck update)
- Session storage via Redis (replace JWT in-memory validation)

**4.2 WebSocket Server (`backend/src/websocket/`)**
- Real-time notifications: card trade offers, card death warnings (HP < 20%), quest completions
- Use socket.io with JWT auth middleware
- Mobile client: use socket.io-client, connect on app foreground, disconnect on background

**4.3 Push Notifications (`backend/src/push/`)**
- Integrate Expo Push Notifications API
- Send push when: card HP < 20% (daily warning), trade offer received, quest reward available, card about to die (HP < 5%)
- Store Expo push tokens in User model (add field `expoPushToken`)
- Create `/api/notifications/register-push-token` endpoint

**4.4 Missing Validation & Error Handling**
- Add express-validator to all POST/PUT routes
- Proper HTTP status codes (400 validation, 401 unauth, 403 forbidden, 404 not found, 409 conflict)
- Global error handler middleware
- Rate limiting: 100 req/15min general, 5 req/min for /auth/login

---

### PHASE 5 — SECURITY & PRODUCTION HARDENING

**5.1 Mobile Security**
- Store JWT token in expo-secure-store (not AsyncStorage)
- PIN entry screen with biometric fallback (expo-local-authentication: FaceID/TouchID)
- Certificate pinning for API calls
- App state listener: blur screen content when app goes to background (prevent screenshots of sensitive data)

**5.2 Backend Security**
- Move .env secrets out of repo (the current backend/.env is committed — generate .env.example instead)
- Add Helmet.js for security headers
- SQL injection protection (already via Prisma, but add input sanitization)
- Implement refresh tokens alongside access tokens (access: 1h, refresh: 30d)

**5.3 Data Validation**
- Add Zod schemas for all API request bodies (both backend validation and mobile form validation)

---

### PHASE 6 — MISSING FEATURES (USER STORIES)

**6.1 Trade Flow (complete end-to-end)**
- TradeScreen: search users by phone/name, select card from your inventory, optionally request their specific card
- Incoming trades notification badge on Cards tab
- Trade notification push + real-time via WebSocket
- Accept/reject UI with card preview for both sides

**6.2 Card Collection Browser**
- Full collection screen showing ALL 60+ card templates (paginated grid)
- Filter by rarity, show which ones user owns (owned = full color, unowned = grayscale silhouette)
- Card lore/description field display

**6.3 Transaction Detail Screen**
- Full transaction details: merchant, category icon, amount, date/time, account used
- Show if a card was dropped during this transaction (with mini card preview)
- Share receipt as image (using react-native-view-shot)

**6.4 Onboarding Flow (new users)**
- 3-screen onboarding carousel explaining: card system, deck mechanics, cashback
- Skip option
- Show only on first launch (AsyncStorage flag)

---

### PHASE 7 — TESTING & CI/CD

**7.1 Unit Tests**
- Jest tests for cardEngine.js (drop logic, HP decay, sacrifice formula, MB conversion formula)
- Jest tests for all Zustand stores

**7.2 E2E Tests**
- Detox setup for critical flows: login → make payment → receive card → add to deck

**7.3 CI/CD**
- GitHub Actions workflow:
  - On PR: run lint (ESLint), Jest tests, TypeScript check
  - On merge to main: EAS Build for Android preview APK
  - Secrets: EAS_TOKEN, DATABASE_URL for test environment

---

## 📐 DESIGN CONSTRAINTS

For ALL mobile screens, strictly follow:
- **Colors**: Background #131313, Surface #1f1f1f, Primary #acc7ff (Material You blue), Gold #fdcf49 for Legendary, Error #ffb4ab
- **Typography**: Manrope font (400/500/600/700/800 weights)
- **Glassmorphism**: `background: rgba(42,42,42,0.4)`, `backdrop-filter: blur(32px)`, `border: 1px solid rgba(66,71,83,0.15)`
- **Border radius**: Cards/modals use rounded-2xl (16px), buttons rounded-full
- **Spacing**: 24px horizontal padding, 16px between sections
- **Animations**: All transitions 200-300ms, spring physics for card interactions
- **Dark mode only** (no light mode support needed)

---

## 📦 EXPECTED OUTPUT FORMAT

For each phase, provide:
1. Complete file content (no placeholders, no `// TODO` comments)
2. File path relative to project root
3. Any new npm package installations needed
4. Any database migration needed (Prisma schema changes)

Start with **PHASE 1.1 — HomeScreen**. Generate the complete `mobile/screens/HomeScreen.tsx` file.