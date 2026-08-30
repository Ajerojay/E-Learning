# Mobile app and Supabase guide

Search the codebase for `SUPABASE DATABASE` to find active database code.

## Shared connection

`src/lib/supabase.ts` creates the Supabase client from:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The web and Android app use this same client, tables, storage, and RPC functions.

## Connected app flows

- `AppSignIn.tsx`: reads `parents_accounts` and `children_accounts`.
- `AppSignUp.tsx`: inserts into `parents_accounts` and `children_accounts`.
- `AppStudentAccess.tsx`: validates PIN through `linkChildSessionToSupabasePin`.
- `AppStudentPage.tsx`: reads the active child.
- `AppLessonPage.tsx`: reads `video_lessons` and Supabase Storage.
- `AppPhonicsQuestPage.tsx`: saves progress with `record_game_attempt`.
- `AppColorsQuestPage.tsx`: saves progress with `record_game_attempt`.
- `AppLogicQuestPage.tsx`: loads its game code and saves progress.
- `AppNumbersQuestPage.tsx`: saves through `gameProgressDb.ts`.
- `AppLetterQuestPage.tsx`: saves through `gameProgressDb.ts`.
- `AppShapesQuestPage.tsx`: saves through `gameProgressDb.ts`.
- App parent pages: read the same children/progress views used by the web.
