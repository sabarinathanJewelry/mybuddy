// ═══════════════════════════════════════════════════════════════
// Vercel API Route: /api/config.js
// Returns Supabase credentials from environment variables.
// Put this file at: api/config.js in your project root.
//
// Set these in Vercel Dashboard → Project → Settings → Env Variables:
//   SUPABASE_URL  = https://xnrrdmckxfdpeeemuphh.supabase.co
//   SUPABASE_KEY  = sb_publishable_cLduMsrh35...
// ═══════════════════════════════════════════════════════════════

export default function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ 
      error: 'Supabase credentials not configured in Vercel environment variables' 
    });
  }

  // Return credentials — safe because this runs server-side on Vercel
  // The anon/publishable key is safe to expose (it's designed for client use)
  res.setHeader('Cache-Control', 'no-store'); // never cache credentials
  return res.status(200).json({
    supabaseUrl,
    supabaseKey
  });
}
