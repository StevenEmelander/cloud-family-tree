# Web Package

Next.js 14 static export frontend for Cloud Family Tree.

## Key Files

- `src/lib/api.ts` — Typed API client. All calls go through `apiFetch<T>()` which attaches the Cognito token and unwraps the `{ data }` envelope.
- `src/lib/auth.ts` — Cognito auth using `amazon-cognito-identity-js` directly (not Amplify). Exports `signIn`, `signUp`, `signOut`, `getCurrentUser`, `getIdToken`, etc.
- `src/lib/site-config.ts` — Imports from root `config.ts`. Provides `siteConfig` object and `displayRole()` helper.
- `src/app/globals.css` — CSS variable definitions (`--color-*`, `--radius`).
- `src/app/providers.tsx` — Auth context provider, role-based access, pending-approval banner.

## Conventions

### Pages

- All pages are `'use client'` (static export, no SSR)
- Each page has a co-located `.module.css` file for styles
- Use `siteConfig` from `site-config.ts` for any display text that varies by deployment
- Use typed API client methods — no `as` casts needed

### Styling

- **CSS Modules only** — no inline styles, no CSS-in-JS
- Reference global variables: `var(--color-primary)`, `var(--color-border)`, etc.
- Color palette defined in `globals.css`: primary (green), secondary (stone), warning (amber)
- Use `var(--radius)` for border-radius consistency

### Auth

- `useAuth()` hook from `providers.tsx` gives `{ user, loading, signOut }`
- `user.role` is the raw Cognito group name (`'admins'` | `'editors'` | `null`)
- Use `displayRole(user.role)` to show human-readable labels
- Use `canEditPeople(user)` from `src/lib/auth-utils.ts` for write-access checks — prefer this over inline role comparisons
- Direct role checks: `user.role === 'admins'` for admin-only gating

### Environment variables

Required in `.env.local` (see `.env.example`):
```
NEXT_PUBLIC_API_URL=https://...
NEXT_PUBLIC_COGNITO_USER_POOL_ID=...
NEXT_PUBLIC_COGNITO_CLIENT_ID=...
```
