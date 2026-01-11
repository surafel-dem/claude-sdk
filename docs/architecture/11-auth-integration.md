# Auth Integration: Better Auth + Convex + Hono

## Overview

Authentication is handled by **Better Auth** with **Convex** as the database. The Hono backend verifies sessions against Convex to protect API endpoints.

```text
┌──────────────┐     ┌────────────────────────────┐     ┌─────────────────────┐
│   Frontend   │────►│  Convex Cloud              │     │  Hono Backend       │
│  (React/Vite)│     │  • Better Auth (auth DB)   │     │  (localhost:3001)   │
│              │     │  • User/Thread storage     │◄────│  Verifies sessions  │
│              │────────────────────────────────────────►│  via cookie         │
│              │     │  Sessions stored here      │     │                     │
└──────────────┘     └────────────────────────────┘     └─────────────────────┘
```

---

## Components

### 1. Convex Auth (`convex/auth.ts`)

Better Auth instance with Convex adapter:

```typescript
import { betterAuth } from "better-auth/minimal";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  });
};
```

### 2. Frontend Client (`frontend/src/lib/auth-client.ts`)

```typescript
import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

### 3. Hono Auth Middleware (`backend/src/middleware/auth.ts`)

```typescript
// Verify session with Convex Better Auth
async function verifySession(token: string): Promise<AuthUser | null> {
  const response = await fetch(`${CONVEX_SITE_URL}/api/auth/session`, {
    headers: { 'Cookie': `better-auth.session_token=${token}` },
  });
  const session = await response.json();
  return session?.user || null;
}

// Middleware: extracts user from cookie
export const authMiddleware = createMiddleware(async (c, next) => {
  const token = /* extract from Authorization or Cookie */;
  c.set('user', token ? await verifySession(token) : null);
  await next();
});

// Middleware: blocks unauthenticated requests
export const requireAuth = createMiddleware(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
```

---

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/auth/me` | GET | Get current user (null if not auth'd) |
| `/api/chat` | POST | Start chat (tracks user if auth'd) |
| `/api/stream/:runId` | GET | Stream results |

### Protected Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/protected` | GET | Example protected route |

---

## Environment Variables

### Convex Environment (set via `npx convex env set`)

```bash
BETTER_AUTH_SECRET=<random-32-char-secret>
SITE_URL=http://localhost:5173
GOOGLE_CLIENT_ID=<your-google-client-id>      # Optional
GOOGLE_CLIENT_SECRET=<your-google-client-secret>  # Optional
```

### Backend `.env`

```bash
CONVEX_SITE_URL=https://necessary-hippopotamus-184.convex.site
```

### Frontend `.env.local`

```bash
VITE_CONVEX_URL=https://necessary-hippopotamus-184.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-hippopotamus-184.convex.site
VITE_SITE_URL=http://localhost:5173
```

---

## Usage in Hono Routes

### Access User (Optional Auth)

```typescript
app.get('/api/some-route', (c) => {
  const user = getAuthUser(c); // null if not authenticated
  if (user) {
    console.log(`Request from: ${user.email}`);
  }
  return c.json({ data: 'works for everyone' });
});
```

### Require Authentication

```typescript
app.get('/api/private', requireAuth, (c) => {
  const user = getAuthUser(c)!; // guaranteed non-null
  return c.json({ message: `Hello ${user.name}!` });
});
```

---

## Auth Flow

1. **Sign In**: User signs in via Better Auth UI → session stored in Convex
2. **Cookie Set**: `better-auth.session_token` cookie set on browser
3. **API Requests**: Frontend sends requests with `credentials: 'include'`
4. **Verification**: Hono middleware reads cookie, verifies with Convex
5. **User Context**: Authenticated user available via `c.get('user')`

---

## Testing

```bash
# Test public endpoint
curl http://localhost:3001/health

# Test auth endpoint (will show null user without cookie)
curl http://localhost:3001/api/auth/me

# Test protected endpoint (will return 401)
curl http://localhost:3001/api/protected
```

---

## Google OAuth Setup (Optional)

1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create OAuth 2.0 Client ID → Web application
3. Add redirect URI: `https://necessary-hippopotamus-184.convex.site/api/auth/callback/google`
4. Set credentials:

```bash
npx convex env set GOOGLE_CLIENT_ID <your-client-id>
npx convex env set GOOGLE_CLIENT_SECRET <your-client-secret>
```
