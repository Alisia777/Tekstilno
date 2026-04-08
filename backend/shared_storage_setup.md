1. Create a Supabase project.
2. Open SQL Editor and run `portal_shared_storage_supabase.sql`.
3. Open `config.js` and set:
   - `backend.provider = "supabase"`
   - `backend.supabaseUrl = "https://YOUR_PROJECT.supabase.co"`
   - `backend.supabaseAnonKey = "YOUR_ANON_KEY"`
4. Redeploy the site.

Until these fields are filled, the portal works in `session-preview` mode without `localStorage` and without shared saving.

Note:
The SQL in this folder keeps policies intentionally open for quick launch and team visibility. Tighten access rules later when auth is connected.
