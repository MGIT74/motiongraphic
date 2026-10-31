"use client";
import { useEffect, useState } from "react";
import type { AnimationComponentProps } from "@/types/animation";

const stages = ["Audio player", "Analytics", "Quick search", "Quick actions"] as const;
const chartData = {Day:[32,47,40,63,58,74,69],Week:[28,38,55,46,70,65,86],Month:[22,36,42,60,54,78,94]};
export default function MinimalSaaSUIShowcase01({config}: AnimationComponentProps) {
  const [stage,setStage]=useState(0);
  const [cycle,setCycle]=useState(0);
  const [period,setPeriod]=useState<"Day"|"Week"|"Month">("Week");
  const [playing,setPlaying]=useState(true);
  const [volume,setVolume]=useState(65);
  const [search,setSearch]=useState("");
  const [progress,setProgress]=useState(0);
  const [generated,setGenerated]=useState(false);
  const speed=Math.max(.25,Math.min(3,config.speed||1));
  const duration=Math.max(1,config.duration||5);
  const stageMs=Math.max(1100,duration*1000/speed);
  useEffect(()=>{
    const interval=window.setInterval(()=>{
      setStage(v=>{if(v===stages.length-1){setCycle(c=>c+1);return 0;}return v+1;});
      setProgress(0);setGenerated(false);setSearch("");
    },stageMs);
    return ()=>window.clearInterval(interval);
  },[stageMs]);
  useEffect(()=>{
    if(stage!==0||!playing)return;
    const id=window.setInterval(()=>setProgress(v=>(v+2)%101),100/speed);
    return ()=>window.clearInterval(id);
  },[stage,playing,speed]);
  useEffect(()=>{
    if(stage!==1)return;
    const id=window.setTimeout(()=>setPeriod(v=>v==="Week"?"Month":v==="Month"?"Day":"Week"),stageMs*.45);
    return ()=>window.clearTimeout(id);
  },[stage,cycle,stageMs]);
  useEffect(()=>{
    if(stage!==2)return;
    const word="Analytics";let i=0;
    const id=window.setInterval(()=>{i++;setSearch(word.slice(0,i));if(i>=word.length)window.clearInterval(id);},Math.max(90,stageMs/14));
    return ()=>window.clearInterval(id);
  },[stage,cycle,stageMs]);
  useEffect(()=>{
    if(stage!==3)return;
    const id=window.setTimeout(()=>setGenerated(true),stageMs*.45);
    return ()=>window.clearTimeout(id);
  },[stage,cycle,stageMs]);
  const points=chartData[period].map((v,i)=>`${i*48},${100-v}`).join(" ");
  return <div className="absolute inset-0 flex flex-col overflow-hidden p-4 sm:p-7" style={{background:config.backgroundColor,color:config.primaryColor,fontFamily:"Inter,system-ui,sans-serif"}}>
    <style>{`
      @keyframes mg-showcase-enter{0%{opacity:0;transform:translateY(32px) scale(.92);filter:blur(9px)}65%{filter:blur(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
      @keyframes mg-showcase-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
      @keyframes mg-showcase-draw{from{stroke-dashoffset:500}to{stroke-dashoffset:0}}
      @keyframes mg-showcase-bounce{0%{transform:scale(.92)}65%{transform:scale(1.05)}100%{transform:scale(1)}}
      .mg-showcase-card{animation:mg-showcase-enter .8s cubic-bezier(.16,1,.3,1) both;background:#fff;border:1px solid #e3e6ec;border-radius:22px;padding:24px;box-shadow:0 18px 55px #0000000b;width:min(100%,440px)}
      .mg-showcase-draw{stroke-dasharray:500;animation:mg-showcase-draw 1.4s cubic-bezier(.2,.8,.2,1) both}
      .mg-showcase-action{transition:transform .2s,box-shadow .2s;cursor:pointer}.mg-showcase-action:hover{transform:translateY(-2px);box-shadow:0 8px 24px #0002}
      @media(prefers-reduced-motion:reduce){.mg-showcase-card,.mg-showcase-draw{animation:none!important}}
    `}</style>
    <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.2em] opacity-50">MotionGraphic · UI Motion</p><h2 className="mt-1 text-base font-bold sm:text-xl">{config.text||"Minimal SaaS UI"}</h2></div><span className="rounded-full px-3 py-1 text-[10px] font-semibold text-white" style={{background:config.accentColor}}>Live UI</span></div>
    <div className="flex min-h-0 flex-1 items-center justify-center py-3">
      <div key={cycle+"-"+stage} className="mg-showcase-card">
        {stage===0&&<><p className="mb-6 text-xs font-semibold uppercase tracking-widest opacity-50">01 / Audio player</p><div className="flex items-center gap-4"><button aria-label={playing?"Pause":"Play"} onClick={()=>setPlaying(v=>!v)} className="mg-showcase-action flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg text-white" style={{background:config.accentColor}}>{playing?"Ⅱ":"▶"}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">Product launch soundtrack</p><p className="mb-3 mt-1 text-xs opacity-50">Now playing</p><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full transition-[width] duration-100" style={{width:`${progress}%`,background:config.accentColor}}/></div></div></div><div className="mt-8 flex items-center gap-3 text-xs"><span>Volume</span><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))} className="w-full" style={{accentColor:config.accentColor}}/><span>{volume}%</span></div></>}
        {stage===1&&<><p className="mb-4 text-xs font-semibold uppercase tracking-widest opacity-50">02 / Analytics</p><div className="flex items-center justify-between"><p className="text-3xl font-bold">{period==="Day"?"12,480":period==="Week"?"48,260":"84,320"}</p><span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-600">↗ +24.8%</span></div><svg viewBox="0 0 300 105" className="my-5 h-28 w-full" role="img" aria-label="Analytics trend"><polyline key={period} className="mg-showcase-draw" points={points} fill="none" stroke={config.accentColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="flex gap-1 rounded-xl bg-gray-100 p-1">{(["Day","Week","Month"] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className="flex-1 rounded-lg px-3 py-2 text-xs transition-all duration-300" style={period===p?{background:"#fff",fontWeight:700,boxShadow:"0 2px 8px #0001"}:undefined}>{p}</button>)}</div></>}
        {stage===2&&<><p className="mb-5 text-xs font-semibold uppercase tracking-widest opacity-50">03 / Quick search</p><div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"><span className="opacity-50">⌕</span><input aria-label="Search features" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search features..." className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></div><div className="mt-5 space-y-2">{["Dashboard","Analytics","Automations"].filter(x=>x.toLowerCase().includes(search.toLowerCase())).map((x,i)=><div key={x} className="rounded-xl bg-gray-50 px-4 py-3 text-sm" style={{animation:`mg-showcase-enter .4s ${i*.08}s both`}}>{x} <span className="float-right opacity-40">↗</span></div>)}</div></>}
        {stage===3&&<><p className="mb-5 text-xs font-semibold uppercase tracking-widest opacity-50">04 / Quick actions</p><p className="mb-2 text-2xl font-bold">Ready to launch?</p><p className="mb-7 text-sm opacity-50">One click. Beautiful results.</p><button onClick={()=>setGenerated(v=>!v)} className="mg-showcase-action w-full rounded-xl px-5 py-4 text-sm font-bold text-white" style={{background:config.accentColor,animation:generated?"mg-showcase-bounce .5s both":undefined}}>{generated?"✓ Report generated":"Generate report ↗"}</button></>}
      </div>
    </div>
    <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-2">{stages.map((label,i)=><button key={label} onClick={()=>{setStage(i);setProgress(0);setSearch("");setGenerated(false)}} aria-label={`Show ${label}`} title={label} className="h-1.5 rounded-full transition-all duration-500" style={{width:i===stage?32:12,background:i===stage?config.accentColor:"#cfd3db"}}/>)}</div>
  </div>;
}
