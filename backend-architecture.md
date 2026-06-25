# Raho MVP — Backend Architecture
**Stack:** NestJS · TypeScript · PostgreSQL · Redis · AWS

---

## Overview

The backend is a monolithic NestJS API with clearly bounded modules. It serves two clients: the React Native mobile app (REST + WebSocket) and the Angular admin dashboard (REST). The monolith is the right call for MVP — you ship faster, debug easier, and split into services later only if you actually need to.

---

## Technology Decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | NestJS | Opinionated structure, decorators, DI — teaches enterprise patterns |
| Language | TypeScript (strict mode) | Catch bugs at compile time, not in production |
| ORM | TypeORM | Native NestJS integration, decorator-based entities |
| Primary DB | PostgreSQL (AWS RDS) | Relational data, ACID transactions critical for bookings/payments |
| Cache / locks | Redis (AWS ElastiCache) | Availability locking, sessions, rate limiting |
| File storage | AWS S3 + CloudFront | Property photos, CNIC docs — presigned URLs, never proxy through API |
| Email | AWS SES | Cheap, reliable, already in AWS ecosystem |
| Push notifications | Firebase FCM | React Native standard, free tier is generous |
| Auth | JWT (access + refresh tokens) | Stateless, works across mobile and web |
| Validation | class-validator + class-transformer | NestJS native, pipe-based, type-safe DTOs |
| Payments | JazzCash · EasyPaisa · Safepay | All three behind a single abstraction interface |
| Process manager | PM2 (EC2) or ECS task (containers) | ECS preferred for zero-downtime deploys |

---

## Folder Structure

```
src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── local.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   └── dto/
│       ├── register.dto.ts
│       └── login.dto.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── entities/
│   │   └── user.entity.ts
│   └── dto/
│       └── update-profile.dto.ts
│
├── listings/
│   ├── listings.module.ts
│   ├── listings.controller.ts
│   ├── listings.service.ts
│   ├── entities/
│   │   ├── listing.entity.ts
│   │   ├── listing-photo.entity.ts
│   │   └── availability.entity.ts
│   └── dto/
│       ├── create-listing.dto.ts
│       ├── update-listing.dto.ts
│       └── search-listings.dto.ts
│
├── bookings/
│   ├── bookings.module.ts
│   ├── bookings.controller.ts
│   ├── bookings.service.ts
│   ├── entities/
│   │   └── booking.entity.ts
│   └── dto/
│       ├── create-booking.dto.ts
│       └── update-booking-status.dto.ts
│
├── payments/
│   ├── payments.module.ts
│   ├── payments.service.ts          ← orchestrator, calls correct gateway
│   ├── gateways/
│   │   ├── payment-gateway.interface.ts
│   │   ├── jazzcash.service.ts
│   │   ├── easypaisa.service.ts
│   │   └── safepay.service.ts
│   ├── entities/
│   │   └── payment.entity.ts
│   └── dto/
│       └── initiate-payment.dto.ts
│
├── messaging/
│   ├── messaging.module.ts
│   ├── messaging.gateway.ts         ← @WebSocketGateway()
│   ├── messaging.service.ts
│   └── entities/
│       └── message.entity.ts
│
├── reviews/
│   ├── reviews.module.ts
│   ├── reviews.controller.ts
│   ├── reviews.service.ts
│   └── entities/
│       └── review.entity.ts
│
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.service.ts
│   └── providers/
│       ├── fcm.service.ts
│       └── ses-email.service.ts
│
├── storage/
│   ├── storage.module.ts
│   └── s3.service.ts                ← presigned URL generation only
│
└── common/
    ├── decorators/
    │   ├── current-user.decorator.ts
    │   └── roles.decorator.ts
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    │   ├── transform.interceptor.ts  ← wraps all responses in { data, meta }
    │   └── logging.interceptor.ts
    └── pipes/
        └── validation.pipe.ts
```

---

## Module Responsibilities

### AuthModule
- `POST /auth/register` — create user, hash password (bcrypt), return tokens
- `POST /auth/login` — validate credentials, return access token (15min) + refresh token (7d)
- `POST /auth/refresh` — rotate refresh token
- `POST /auth/logout` — blacklist refresh token in Redis
- JWT strategy reads `userId` and `role` from payload, attaches to `request.user`
- `RolesGuard` checks `@Roles('host')` decorator on route handlers

### UsersModule
- `GET /users/me` — return own profile
- `PATCH /users/me` — update profile, avatar
- `POST /users/me/cnic` — upload CNIC photo to S3, set `cnic_status: pending`
- Host-specific: `GET /users/me/listings`, `GET /users/me/bookings` (as host)
- Guest-specific: `GET /users/me/bookings` (as guest)

### ListingsModule
- `POST /listings` — host creates listing (status: draft)
- `PATCH /listings/:id` — update listing details
- `POST /listings/:id/photos` — get S3 presigned URL for upload, then register photo record
- `DELETE /listings/:id/photos/:photoId`
- `GET /listings/:id/availability` — return blocked dates for date picker
- `PUT /listings/:id/availability` — host blocks/unblocks dates
- `PATCH /listings/:id/status` — host activates, pauses, or soft-deletes listing
- `GET /listings` — public search: filter by city, dates, guests, price range
- `GET /listings/:id` — public listing detail with photos and host info

### BookingsModule
- `POST /bookings` — guest initiates booking:
  1. Check availability (atomic Redis lock, 10min TTL)
  2. Calculate pricing (nights × price + service fee)
  3. Create booking record with `status: pending`, `payment_status: unpaid`
  4. Return `bookingId` for payment step
- `POST /bookings/:id/confirm` — host confirms (request-to-book flow)
- `POST /bookings/:id/cancel` — guest or host cancels, releases Redis lock
- `GET /bookings/:id` — booking detail (accessible by guest or host of that listing)
- `GET /bookings` — list own bookings (guest) or incoming bookings (host)

### PaymentsModule
- `POST /payments/initiate` — called after booking created:
  1. Determine gateway from `gateway` param
  2. Call correct gateway service
  3. Return redirect URL or payment token to client
- `POST /payments/jazzcash/webhook` — gateway calls this on success/fail
- `POST /payments/easypaisa/webhook`
- `POST /payments/safepay/webhook`
- Webhook handler: verify signature → update `payments` record → if success, update `booking.payment_status: paid`, update `booking.status: confirmed`, release Redis lock, fire notifications

### MessagingModule
- WebSocket gateway on `/messaging` namespace
- `@SubscribeMessage('join_booking')` — join room by bookingId
- `@SubscribeMessage('send_message')` — persist message, broadcast to room
- `GET /messages/:bookingId` — REST endpoint to load message history on screen open

### ReviewsModule
- `POST /reviews` — submit review (only allowed after booking status = completed)
- `GET /listings/:id/reviews` — public reviews for a listing
- Review submission triggers notification to reviewee

---

## Database Schema

### users
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'guest', -- guest | host | both
  full_name     VARCHAR(255) NOT NULL,
  cnic_number   VARCHAR(15),
  cnic_status   VARCHAR(10) DEFAULT 'pending',        -- pending | verified | rejected
  cnic_doc_url  VARCHAR(500),
  avatar_url    VARCHAR(500),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### listings
```sql
CREATE TABLE listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id        UUID NOT NULL REFERENCES users(id),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  property_type  VARCHAR(20) NOT NULL,               -- apartment | house | room | villa
  city           VARCHAR(100) NOT NULL,
  area           VARCHAR(100),
  address        TEXT,
  lat            DECIMAL(10,7),
  lng            DECIMAL(10,7),
  max_guests     INT NOT NULL DEFAULT 1,
  bedrooms       INT NOT NULL DEFAULT 1,
  bathrooms      INT NOT NULL DEFAULT 1,
  amenities      TEXT[],                              -- ['wifi','ac','parking',...]
  price_per_night DECIMAL(10,2) NOT NULL,
  instant_book   BOOLEAN DEFAULT false,
  status         VARCHAR(10) DEFAULT 'draft',         -- draft | active | paused | deleted
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listings_city ON listings(city);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_host ON listings(host_id);
```

### listing_photos
```sql
CREATE TABLE listing_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  s3_key      VARCHAR(500) NOT NULL,
  cdn_url     VARCHAR(500) NOT NULL,
  sort_order  INT DEFAULT 0,
  is_cover    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### availability
```sql
CREATE TABLE availability (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id     UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  is_blocked     BOOLEAN DEFAULT false,
  override_price DECIMAL(10,2),                      -- null = use listing base price
  UNIQUE(listing_id, date)
);

CREATE INDEX idx_availability_listing_date ON availability(listing_id, date);
```

### bookings
```sql
CREATE TABLE bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id     UUID NOT NULL REFERENCES listings(id),
  guest_id       UUID NOT NULL REFERENCES users(id),
  check_in       DATE NOT NULL,
  check_out      DATE NOT NULL,
  guests_count   INT NOT NULL,
  nights         INT NOT NULL,
  base_amount    DECIMAL(10,2) NOT NULL,             -- price_per_night × nights
  service_fee    DECIMAL(10,2) NOT NULL,             -- platform commission
  total_amount   DECIMAL(10,2) NOT NULL,
  status         VARCHAR(15) DEFAULT 'pending',       -- pending | confirmed | cancelled | completed
  payment_status VARCHAR(10) DEFAULT 'unpaid',        -- unpaid | paid | refunded
  cancel_reason  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_listing ON bookings(listing_id);
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_status ON bookings(status);
```

### payments
```sql
CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings(id),
  gateway          VARCHAR(15) NOT NULL,              -- jazzcash | easypaisa | safepay
  gateway_ref      VARCHAR(255),                      -- gateway's transaction ID
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(3) DEFAULT 'PKR',
  status           VARCHAR(10) DEFAULT 'initiated',   -- initiated | success | failed | refunded
  gateway_response JSONB,                             -- raw response, never normalize this
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### messages
```sql
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  sender_id  UUID NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT false,
  sent_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_booking ON messages(booking_id, sent_at);
```

### reviews
```sql
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  target      VARCHAR(10) NOT NULL,                   -- listing | host | guest
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, reviewer_id, target)             -- one review per role per booking
);
```

---

## Payment Gateway Abstraction

```typescript
// payments/gateways/payment-gateway.interface.ts
export interface InitiatePaymentDto {
  bookingId: string;
  amount: number;
  currency: string;
  customerPhone: string;
  customerName: string;
  description: string;
  callbackUrl: string;
}

export interface PaymentResult {
  gatewayRef: string;
  redirectUrl?: string;    // JazzCash / EasyPaisa redirect user here
  paymentToken?: string;   // Safepay returns a token for SDK
  status: 'initiated' | 'failed';
}

export interface PaymentGateway {
  initiate(dto: InitiatePaymentDto): Promise<PaymentResult>;
  verifyWebhook(payload: any, signature: string): boolean;
  parseWebhookStatus(payload: any): 'success' | 'failed' | 'pending';
}
```

```typescript
// payments/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(
    private jazzcash: JazzCashService,
    private easypaisa: EasyPaisaService,
    private safepay: SafepayService,
  ) {}

  private getGateway(name: string): PaymentGateway {
    const map = { jazzcash: this.jazzcash, easypaisa: this.easypaisa, safepay: this.safepay };
    if (!map[name]) throw new BadRequestException(`Unknown gateway: ${name}`);
    return map[name];
  }

  async initiate(gateway: string, dto: InitiatePaymentDto) {
    return this.getGateway(gateway).initiate(dto);
  }
}
```

---

## Availability Locking (Redis)

```typescript
// bookings/bookings.service.ts
async createBooking(dto: CreateBookingDto, guestId: string) {
  const lockKey = `availability_lock:${dto.listingId}:${dto.checkIn}:${dto.checkOut}`;
  const lockTtl = 600; // 10 minutes in seconds

  // Attempt to set lock atomically (NX = only if not exists)
  const locked = await this.redis.set(lockKey, guestId, 'EX', lockTtl, 'NX');
  if (!locked) throw new ConflictException('Selected dates are no longer available');

  try {
    // Check DB-level availability (host blocks, existing bookings)
    const isAvailable = await this.checkDbAvailability(dto.listingId, dto.checkIn, dto.checkOut);
    if (!isAvailable) {
      await this.redis.del(lockKey);
      throw new ConflictException('Selected dates are not available');
    }

    // Create booking record
    const booking = await this.bookingRepo.save({ ...dto, guestId, status: 'pending', paymentStatus: 'unpaid' });
    return booking;
  } catch (err) {
    await this.redis.del(lockKey);
    throw err;
  }
  // Lock is released after payment webhook confirms success or on cancel
}
```

---

## API Response Shape

All responses are wrapped by a global `TransformInterceptor`:

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2025-06-25T10:00:00Z" }
}

// Paginated
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "Selected dates are no longer available"
  }
}
```

---

## AWS Infrastructure

```
                         ┌─────────────────────────────────────────┐
                         │            VPC (ap-south-1)             │
                         │                                         │
  Mobile / Web  ────────▶│  ALB (Application Load Balancer)        │
                         │         │                               │
                         │   ECS Fargate Task                      │
                         │   (NestJS container, 2 tasks min)       │
                         │         │            │                  │
                         │    RDS Postgres   ElastiCache Redis      │
                         │    (Multi-AZ)     (single node MVP)     │
                         │                                         │
                         └────────────┬────────────────────────────┘
                                      │
                            S3 Bucket (private)
                            CloudFront (CDN for photos)
                            SES (transactional email)
```

**Environment variables (via AWS Secrets Manager):**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
AWS_S3_BUCKET=raho-uploads
AWS_CLOUDFRONT_DOMAIN=cdn.raho.pk
JAZZCASH_MERCHANT_ID=...
JAZZCASH_PASSWORD=...
JAZZCASH_INTEGRITY_SALT=...
EASYPAISA_STORE_ID=...
EASYPAISA_HASH_KEY=...
SAFEPAY_API_KEY=...
FCM_SERVER_KEY=...
SES_FROM_EMAIL=noreply@raho.pk
```

---

## Security Checklist

- [ ] Helmet middleware on all routes
- [ ] Rate limiting: 10 req/min on auth endpoints, 100 req/min general (via `@nestjs/throttler`)
- [ ] CORS: whitelist only your app domains
- [ ] Input validation: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globally
- [ ] SQL injection: TypeORM parameterized queries (never raw string interpolation)
- [ ] Webhook signature verification on all payment callbacks before processing
- [ ] S3 presigned URLs expire in 15 minutes
- [ ] Refresh tokens stored as bcrypt hash in Redis, not plaintext
- [ ] CNIC documents in a separate private S3 bucket, never exposed via CDN

---

## Development Setup

```bash
# Install
npm install -g @nestjs/cli
nest new raho-api

# Key packages
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/jwt passport-jwt @nestjs/passport
npm install @nestjs/websockets socket.io
npm install ioredis @nestjs/config
npm install class-validator class-transformer
npm install bcrypt helmet @nestjs/throttler
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install firebase-admin

# Dev tools
npm install -D @types/bcrypt @types/passport-jwt
```

```bash
# Run locally
docker-compose up -d   # starts postgres + redis
npm run start:dev
```

```yaml
# docker-compose.yml (local dev only)
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: raho_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
```
