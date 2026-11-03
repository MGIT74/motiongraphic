-- Two self-contained HTML/CSS/JS Template Lab entries; draft only.
-- Requires 0005_custom_templates.sql. Safe to rerun; never overwrites admin edits.
-- Owner applies this migration after PR review. No direct production writes.

insert into public.custom_templates
(id,slug,name,category,description,source_kind,code,default_config,prompt_web,prompt_after_effects,version,status)
values (
'b0000000-0000-4000-8000-000000000031','letter-reveal-gradient','Letter Reveal — Gradient','text-motion','Révélation typographique lettre par lettre avec montée, flou et dégradé rose/violet.','code',
$mgsi_reveal$<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f2;color:#15121a}
.stage{height:100%;width:100%;display:grid;place-items:center;overflow:hidden;position:relative;isolation:isolate}
.stage:before{content:"";position:absolute;inset:-30%;z-index:-2;background:radial-gradient(ellipse at 20% 25%,#e4edb9,transparent 35%),radial-gradient(ellipse at 80% 20%,#e2d3f7,transparent 35%),radial-gradient(ellipse at 75% 85%,#bcebd5,transparent 35%);filter:blur(60px);animation:drift 15s ease-in-out infinite alternate}
.stage:after{content:"";position:absolute;inset:0;background:#ffffff70;z-index:-1}
.title{font-size:clamp(30px,7vw,110px);font-weight:700;letter-spacing:-.065em;line-height:1.15;text-align:center;max-width:92%;overflow-wrap:anywhere}
@keyframes drift{to{transform:translate(4%,4%) rotate(7deg)}}
.letter{display:inline-block;opacity:0;transform:translateY(70%);filter:blur(8px);animation:enter .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(var(--i)*60ms)}@keyframes enter{to{opacity:1;transform:translateY(0);filter:blur(0)}}.accent{background:linear-gradient(100deg,#e22c6c,#6214e8);background-clip:text;-webkit-background-clip:text;color:transparent}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}.letter{opacity:1;transform:none;filter:none}}
</style></head><body><main class="stage"><div class="title" id="title"></div></main><script>
(()=>{const target=document.getElementById('title');const text="Motion Design";let timer;
function play(){clearTimeout(timer);target.replaceChildren();let i=0;for(const word of text.split(/(\s+)/)){if(/^\s+$/.test(word)){target.append(document.createTextNode(word));continue;}const span=document.createElement('span');if(word===text.trim().split(/\s+/).at(-1))span.className='accent';for(const ch of word){const letter=document.createElement('span');letter.className='letter';letter.style.setProperty('--i',String(i++));letter.textContent=ch;span.append(letter)}target.append(span)}timer=setTimeout(play,Math.max(2400,1800+i*60))}play();
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else play()});
})();</script></body></html>$mgsi_reveal$,
'{"text":"Motion Design","primaryColor":"#15121a","accentColor":"#e22c6c","backgroundColor":"#f4f4f2","duration":4.5,"speed":1}'::jsonb,
'Recrée cette animation typographique en HTML/CSS/JavaScript sans ressources externes, avec boucle et respect de prefers-reduced-motion.',
'Crée une composition After Effects 1920x1080 à 30 fps reproduisant cette animation typographique, sans plugin externe.',
1,'draft')
on conflict (id) do nothing;

insert into public.custom_templates
(id,slug,name,category,description,source_kind,code,default_config,prompt_web,prompt_after_effects,version,status)
values (
'b0000000-0000-4000-8000-000000000032','typewriter-minimal','Typewriter — Minimal','text-motion','Écriture progressive avec curseur clignotant, ambiance pastel et boucle automatique.','code',
$mgsi_type$<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f2;color:#15121a}
.stage{height:100%;width:100%;display:grid;place-items:center;overflow:hidden;position:relative;isolation:isolate}
.stage:before{content:"";position:absolute;inset:-30%;z-index:-2;background:radial-gradient(ellipse at 20% 25%,#e4edb9,transparent 35%),radial-gradient(ellipse at 80% 20%,#e2d3f7,transparent 35%),radial-gradient(ellipse at 75% 85%,#bcebd5,transparent 35%);filter:blur(60px);animation:drift 15s ease-in-out infinite alternate}
.stage:after{content:"";position:absolute;inset:0;background:#ffffff70;z-index:-1}
.title{font-size:clamp(30px,7vw,110px);font-weight:700;letter-spacing:-.065em;line-height:1.15;text-align:center;max-width:92%;overflow-wrap:anywhere}
@keyframes drift{to{transform:translate(4%,4%) rotate(7deg)}}
.cursor{display:inline-block;width:3px;height:.85em;margin-left:5px;background:#e22c6c;animation:blink .75s steps(1) infinite}@keyframes blink{50%{opacity:0}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}.letter{opacity:1;transform:none;filter:none}}
</style></head><body><main class="stage"><div class="title" id="title"></div></main><script>
(()=>{const target=document.getElementById('title');const text="motiongraphic.si";let timer;
let i=0;function play(){clearTimeout(timer);target.replaceChildren();const letters=document.createElement('span');const cursor=document.createElement('span');cursor.className='cursor';cursor.setAttribute('aria-hidden','true');target.append(letters,cursor);i=0;function tick(){if(i<text.length){letters.textContent=text.slice(0,++i);timer=setTimeout(tick,90)}else{timer=setTimeout(play,1200)}}timer=setTimeout(tick,300)}play();
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else play()});
})();</script></body></html>$mgsi_type$,
'{"text":"motiongraphic.si","primaryColor":"#15121a","accentColor":"#e22c6c","backgroundColor":"#f4f4f2","duration":4.5,"speed":1}'::jsonb,
'Recrée cette animation typographique en HTML/CSS/JavaScript sans ressources externes, avec boucle et respect de prefers-reduced-motion.',
'Crée une composition After Effects 1920x1080 à 30 fps reproduisant cette animation typographique, sans plugin externe.',
1,'draft')
on conflict (id) do nothing;
