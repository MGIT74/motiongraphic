import MinimalSaaSUIShowcase01 from "@/components/animations/MinimalSaaSUIShowcase01";
export default function PreviewMinimalSaaSUIPage(){
 return <main className="min-h-screen bg-[#10121a] p-5 sm:p-10">
  <div className="mx-auto max-w-5xl"><h1 className="mb-2 text-2xl font-bold text-white">Minimal SaaS UI Showcase</h1><p className="mb-6 text-sm text-gray-400">Prévisualisation du template — branche bêta</p>
  <div className="relative h-[750px] overflow-hidden rounded-2xl border border-white/10 sm:h-[550px]">
  <MinimalSaaSUIShowcase01 config={{text:"Minimal SaaS UI",primaryColor:"#171923",accentColor:"#f45a83",backgroundColor:"#f7f8fa",duration:5,speed:1}}/>
  </div></div>
 </main>;
}