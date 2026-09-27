export const dynamic = "force-static";

const HTML = `<!DOCTYPE html>
<html lang="ta">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#030d06">
<title>Sabarinathan Jewellers</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@400;500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;}
body{background:#030d06;font-family:'DM Sans',system-ui,sans-serif;display:flex;justify-content:center;-webkit-text-size-adjust:100%;}
.page{width:100%;max-width:430px;background:#030d06;}

.bg-wrap{position:relative;width:100%;}
.bg-img{width:100%;display:block;max-height:95vh;object-fit:cover;object-position:top;}
.bg-fade{
  position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(to bottom,
    transparent 46%,
    rgba(3,13,6,0.5) 58%,
    rgba(3,13,6,0.88) 72%,
    #030d06 82%
  );
}

.links{
  position:relative;z-index:2;
  margin-top:-67.5vw;
  padding:0 12px 8px;
  display:flex;flex-direction:column;gap:8px;
}
@media(min-width:430px){.links{margin-top:-290px;}}

.btn{
  display:flex;align-items:center;border-radius:14px;
  text-decoration:none;overflow:hidden;border:1px solid;min-height:70px;
  -webkit-tap-highlight-color:transparent;
  transition:transform .12s,filter .12s;
}
.btn:active{transform:scale(0.982);filter:brightness(0.88);}

.bi{width:68px;min-height:70px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.bi-c{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(255,255,255,0.13);}

.bt{flex:1;padding:12px 6px 12px 0;min-width:0;}
.bt-top{font-size:0.6rem;color:rgba(205,188,150,0.48);display:block;margin-bottom:1px;letter-spacing:.02em;}
.bt-main{font-size:1rem;font-weight:600;color:#ede5d0;display:block;line-height:1.2;}
.bt-tam{font-family:'Hind Madurai',sans-serif;font-size:0.7rem;font-weight:500;color:rgba(205,188,150,0.55);display:block;}
.bt-sub{font-size:0.65rem;color:rgba(205,188,150,0.4);display:block;margin-top:2px;}
.bt-stars{color:#f5c518;font-size:0.85rem;letter-spacing:-0.5px;display:block;margin-top:3px;}

.br{width:54px;min-height:70px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.br-a{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;line-height:1;font-weight:300;}

.btn-wa{background:linear-gradient(135deg,rgba(6,58,18,.97),rgba(12,90,28,.97));border-color:rgba(37,211,102,.28);}
.btn-wa .bi-c{background:#25D366;border-color:#1da851;}
.btn-wa .br-a{background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);color:#25D366;}

.btn-call{background:linear-gradient(135deg,rgba(26,14,0,.97),rgba(44,26,0,.97));border-color:rgba(201,149,58,.28);}
.btn-call .bi-c{background:rgba(201,149,58,.12);border-color:rgba(201,149,58,.28);}
.btn-call .br-a{background:rgba(201,149,58,.1);border:1px solid rgba(201,149,58,.3);color:#c9953a;}

.btn-map{background:linear-gradient(135deg,rgba(4,22,16,.97),rgba(7,42,26,.97));border-color:rgba(52,168,83,.24);}
.btn-map .bi-c{background:rgba(52,168,83,.1);border-color:rgba(52,168,83,.22);}
.btn-map .br-a{background:rgba(52,168,83,.1);border:1px solid rgba(52,168,83,.28);color:#34A853;}

.btn-rev{background:linear-gradient(135deg,rgba(12,8,0,.97),rgba(26,18,0,.97));border-color:rgba(251,188,5,.22);}
.btn-rev .bi-c{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);}
.btn-rev .br-a{background:rgba(251,188,5,.1);border:1px solid rgba(251,188,5,.28);color:#fbbc05;}

.btn-chit{background:linear-gradient(135deg,rgba(26,0,8,.97),rgba(46,0,16,.97));border-color:rgba(201,149,58,.24);}
.btn-chit .bi-c{background:rgba(201,149,58,.08);border-color:rgba(201,149,58,.22);}
.btn-chit .br-a{background:rgba(201,149,58,.1);border:1px solid rgba(201,149,58,.28);color:#c9953a;}

.btn-ig{background:linear-gradient(135deg,rgba(18,0,28,.97),rgba(36,0,53,.97));border-color:rgba(200,55,171,.24);}
.btn-ig .bi-c{background:linear-gradient(135deg,#405DE6,#5B51D8,#833AB4,#C13584,#E1306C,#FD1D1D);border-color:transparent;}
.btn-ig .br-a{background:rgba(200,55,171,.1);border:1px solid rgba(200,55,171,.28);color:#c837ab;}

.btn-yt{background:linear-gradient(135deg,rgba(26,0,0,.97),rgba(46,0,0,.97));border-color:rgba(255,0,0,.2);}
.btn-yt .bi-c{background:#FF0000;border-color:#cc0000;}
.btn-yt .br-a{background:rgba(255,0,0,.1);border:1px solid rgba(255,0,0,.28);color:#FF0000;}

.btn-web{background:linear-gradient(135deg,rgba(4,12,8,.97),rgba(7,24,14,.97));border-color:rgba(201,149,58,.18);}
.btn-web .bi-c{background:rgba(201,149,58,.06);border-color:rgba(201,149,58,.18);}
.btn-web .br-a{background:rgba(201,149,58,.08);border:1px solid rgba(201,149,58,.22);color:#c9953a;}

.addr-bar{
  margin:4px 12px 16px;
  border:1px solid rgba(201,149,58,.18);border-radius:12px;
  background:rgba(9,21,8,.95);
  padding:11px 14px;display:flex;align-items:center;gap:10px;
}
.addr-text{font-family:'Hind Madurai',sans-serif;font-size:.76rem;color:rgba(185,168,128,.8);line-height:1.55;}
</style>
</head>
<body>
<div class="page">
  <div class="bg-wrap">
    <img class="bg-img" src="/qrbc.png" alt="Sabarinathan Jewellers">
    <div class="bg-fade"></div>
  </div>

  <nav class="links">
    <a href="https://wa.me/917305393916" class="btn btn-wa">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345z"/><path d="M20.52 3.449C12.831-3.984.106 1.407.101 9.893c-.001 1.75.459 3.458 1.331 4.956L0 20l5.306-1.395c6.545 3.477 14.942-.871 14.942-8.588 0-3.177-1.24-6.165-3.496-8.416l-.232-.152zM12 18.547c-1.44 0-2.852-.386-4.086-1.117l-.292-.174-3.051.803.815-2.981-.191-.305c-2.543-4.057-.779-9.437 3.694-11.305 4.468-1.867 9.517.667 10.913 5.316 1.395 4.643-1.487 9.459-5.988 10.725-.605.167-1.222.252-1.814.038z"/></svg></span></span>
      <span class="bt"><span class="bt-top">Online Ordersக்கு</span><span class="bt-main">WhatsApp</span><span class="bt-tam">பண்ணுங்கள்</span><span class="bt-sub">Product details, price &amp; orders</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="tel:7305393916" class="btn btn-call">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#c9953a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.18a2 2 0 012-.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.08a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></span></span>
      <span class="bt"><span class="bt-main">Call Us</span><span class="bt-sub">+91 73053 93916</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://maps.app.goo.gl/oaco5526XZ9dGbwi8?g_st=ac" class="btn btn-map">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#34A853" fill-opacity=".25" stroke="#34A853" stroke-width="1.5"/><circle cx="12" cy="9" r="2.5" fill="#34A853"/></svg></span></span>
      <span class="bt"><span class="bt-main">Find Our Store</span><span class="bt-sub">Get directions on Google Maps</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://search.google.com/local/writereview?placeid=ChIJUyQ_QoPFADsRRPTnoKaaeRA" class="btn btn-rev">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg></span></span>
      <span class="bt"><span class="bt-main">Write a Google Review</span><span class="bt-sub">Share your experience with us</span><span class="bt-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://app.jewelgrow.com/app-download/42" class="btn btn-chit">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#c9953a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="7" x2="12" y2="14"/><polyline points="9.5 11.5 12 14 14.5 11.5"/><line x1="9" y1="18" x2="15" y2="18"/></svg></span></span>
      <span class="bt"><span class="bt-main">Chit App</span><span class="bt-sub">Download for Android &amp; iPhone</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://www.instagram.com/sabarinathan_jewellers_madurai" class="btn btn-ig">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#fd5"/><stop offset="30%" stop-color="#ff543e"/><stop offset="100%" stop-color="#c837ab"/></linearGradient></defs><path fill="url(#ig)" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 01-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 017.8 2zm-.2 2A3.6 3.6 0 004 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 003.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 010 2.5 1.25 1.25 0 010-2.5zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 2a3 3 0 100 6 3 3 0 000-6z"/></svg></span></span>
      <span class="bt"><span class="bt-main">Follow on Instagram</span><span class="bt-sub">New collections, offers &amp; updates</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://youtube.com/@sabarinathanjewellers" class="btn btn-yt">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 00.5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81c.28 1.04 1.1 1.83 2.12 2.12C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.57a3.02 3.02 0 002.12-2.12C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.5v-7l6.25 3.5-6.25 3.5z" fill="#fff"/></svg></span></span>
      <span class="bt"><span class="bt-main">YouTube</span><span class="bt-sub">@sabarinathanjewellers</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>

    <a href="https://www.sabarinathan.com" class="btn btn-web">
      <span class="bi"><span class="bi-c"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c9953a" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></span></span>
      <span class="bt"><span class="bt-main">Website</span><span class="bt-sub">sabarinathan.com</span></span>
      <span class="br"><span class="br-a">›</span></span>
    </a>
  </nav>

  <div class="addr-bar">
    <svg viewBox="0 0 20 20" width="16" height="16" fill="#c9953a" style="flex-shrink:0"><path d="M10 2C6.69 2 4 4.69 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
    <p class="addr-text">166, &#2984;&#3015;&#2980;&#3006;&#2972;&#3007; &#2992;&#3019;&#2975;&#3009;, &#2992;&#3006;&#2972;&#3006;&#2986;&#3006;&#2992;&#3021;&#2994;&#3007; &#3015;&#2980;&#3007;&#2992;&#3007;&#2994;&#3021;, &#2990;&#2980;&#3009;&#2992;&#3016;-1.</p>
  </div>
</div>
</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
