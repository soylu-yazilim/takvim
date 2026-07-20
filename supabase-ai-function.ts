// ============================================================
// "ai" Edge Function — Supabase panelinde dagitilan kodun kopyasi
// Gemini anahtari sunucuda GEMINI_API_KEY gizli degiskeninde durur;
// yalnizca girisli ve durumu "aktif" olan uyeler cagirabilir.
// ============================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(veri: unknown, durum = 200) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const yetki = req.headers.get("Authorization") ?? "";
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: yetki } } },
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "giris gerekli" }, 401);

    const { data: uye } = await sb.from("uyeler").select("durum").eq("id", user.id).single();
    if (!uye || uye.durum !== "aktif") return json({ error: "hesap aktif degil" }, 403);

    const { sistem, mesaj } = await req.json();
    if (!mesaj) return json({ error: "mesaj gerekli" }, 400);

    const anahtar = Deno.env.get("GEMINI_API_KEY");
    if (!anahtar) return json({ error: "GEMINI_API_KEY tanimli degil" }, 500);

    const cevap = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + anahtar,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: (sistem ? sistem + "\n\nKullanici mesaji: " : "") + mesaj }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
      },
    );

    const j = await cevap.json();
    const yanit = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return json({ yanit });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
