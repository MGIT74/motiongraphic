"use client";
import { useEffect, useState } from "react";
import type { AnimationComponentProps } from "@/types/animation";

export default function MinimalSaaSUIShowcase01({config}: AnimationComponentProps) {
  const [period,setPeriod]=useState<"Day"|"Week"|"Month">("Week");
  const [playing,setPlaying]=useState(true);
  const [volume,setVolume]=useState(65);
  const [search,setSearch]=useState("");
  const [tick,setTick]=useState(0);
  useEffect(()=>{ const id=window.setInterval(()=>setTick(v=>v+1),Math.max(600,1800/config.speed)); return ()=>window.clearInterval(id);},[config.speed]);
  const stats={Day:[32,47,40,63,58,74,69],Week:[28,38,55,46,70,65,86],Month:[22,36,42,60,54,78,94]};
  const points=stats[period].map((v,i)=>`${i*48},${100-v}`).join(" ");
  return <div className="absolute inset-0 overflow-auto p-5 sm:p-7" style={{background:config.backgroundColor,color:config.primaryColor,fontFamily:"Inter,system-ui,sans-serif"}}>
    <style>{`@keyframes mg-ui-rise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}} .mg-ui-card{animation:mg-ui-rise .65s both; border:1px solid #dfe2e7; background:#fff; border-radius:16px; padding:16px; box-shadow:0 6px 20px #00000008;} .mg-ui-control{cursor:pointer;border-radius:8px;padding:5px 10px;font-size:11px;transition:background .2s} .mg-ui-control:hover{background:#e9edf2}`}</style>
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-[.24em] opacity-50">MotionGraphic · UI Motion</div><h2 className="mt-1 text-xl font-bold">{config.text||"Minimal SaaS UI"}</h2></div><span className="rounded-full px-3 py-1 text-xs" style={{background:config.accentColor,color:"#fff"}}>Live UI</span></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="mg-ui-card" style={{animationDelay:".05s"}}><div className="mb-3 text-xs font-semibold">Audio player</div><div className="flex items-center gap-3"><button aria-label={playing?"Pause":"Play"} onClick={()=>setPlaying(v=>!v)} className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{background:config.accentColor}}>{playing?"Ⅱ":"▶"}</button><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">Product launch soundtrack</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full transition-all duration-700" style={{width:playing?`${20+(tick%7)*10}%`:"35%",background:config.accentColor}}/></div></div></div><div className="mt-4 flex items-center gap-2 text-xs"><span>Volume</span><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))} className="w-full" style={{accentColor:config.accentColor}}/><span>{volume}%</span></div></section>
        <section className="mg-ui-card" style={{animationDelay:".15s"}}><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Analytics</span><span className="text-xs opacity-50">+24.8%</span></div><div className="mb-2 text-2xl font-bold">{period==="Day"?"12,480":period==="Week"?"48,260":"84,320"}</div><svg viewBox="0 0 300 105" className="h-20 w-full" role="img" aria-label="Analytics trend"><polyline key={period} points={points} fill="none" stroke={config.accentColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="mt-2 flex gap-1 rounded-lg bg-gray-100 p-1">{(["Day","Week","Month"] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className="mg-ui-control flex-1" style={period===p?{background:"#fff",fontWeight:700}:undefined}>{p}</button>)}</div></section>
        <section className="mg-ui-card" style={{animationDelay:".25s"}}><div className="mb-3 text-xs font-semibold">Quick search</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search features..." className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-gray-400"/><div className="mt-3 space-y-1">{["Dashboard","Analytics","Automations"].filter(x=>x.toLowerCase().includes(search.toLowerCase())).map(x=><div key={x} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">{x}</div>)}</div></section>
        <section className="mg-ui-card" style={{animationDelay:".35s"}}><div className="mb-3 text-xs font-semibold">Quick actions</div><div className="mb-4 text-xs opacity-60">A minimal interactive SaaS interface.</div><button onClick={()=>setTick(v=>v+1)} className="w-full rounded-xl px-4 py-3 text-xs font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95" style={{background:config.accentColor}}>Generate report ↗</button><div className="mt-3 text-center text-[10px] opacity-40">Interactions: {tick}</div></section>
      </div>
    </div>
  </div>;
}
