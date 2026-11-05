"use client";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildChatConversationReveal } from "@/lib/animations/builders";

/** Original chat conversation UI, with deterministic GSAP bounce entrances. */
export function ChatConversationReveal01Frame({ config }: AnimationComponentProps) {
  const [question = "How can I simplify my workflow?", answer = "Start with one clear idea, then bring it to life."] = config.text.split("\n").filter(Boolean);
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ backgroundColor: config.backgroundColor, color: config.primaryColor, containerType: "size" }}>
      <div data-chat-stage style={{ width: "min(85cqw, 105cqmin)", display: "flex", flexDirection: "column", gap: "3cqmin" }}>
        <div data-chat-header style={{ display: "flex", alignItems: "center", gap: "2cqmin", fontSize: "3cqmin", fontWeight: 650 }}>
          <span style={{ width: "5cqmin", height: "5cqmin", borderRadius: "1.4cqmin", background: config.accentColor, display: "grid", placeItems: "center", color: "#fff" }}><svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z"/></svg></span>
          Creative Assistant
          <span style={{ marginLeft: "auto", fontSize: "1.8cqmin", opacity: 0.5 }}>Online</span>
        </div>
        <div data-chat-question style={{ alignSelf: "flex-end", maxWidth: "85%", borderRadius: "3cqmin 3cqmin 0.8cqmin 3cqmin", padding: "2.5cqmin 3cqmin", background: config.accentColor, color: "#fff", fontSize: "2.7cqmin", overflowWrap: "anywhere" }}>
          <span data-chat-question-text data-full-text={question.slice(0, 100)}>{question.slice(0, 100)}</span>

        </div>
        <div data-chat-answer style={{ alignSelf: "flex-start", maxWidth: "85%", borderRadius: "3cqmin 3cqmin 3cqmin 0.8cqmin", padding: "2.5cqmin 3cqmin", border: "1px solid currentColor", background: "color-mix(in srgb, currentColor 6%, transparent)", fontSize: "2.7cqmin", overflowWrap: "anywhere" }}>
          <span data-chat-answer-text data-full-text={answer.slice(0, 130)}>{answer.slice(0, 130)}</span>

        </div>
        <div data-chat-input style={{ border: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderRadius: "2.5cqmin", padding: "2.5cqmin 3cqmin", fontSize: "2.3cqmin", opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
          <span>Ask a follow-up...</span>
          <span style={{ color: config.accentColor }}><svg viewBox="0 0 24 24" width="2.6cqmin" height="2.6cqmin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 19 19 5M8 5h11v11"/></svg></span>
        </div>
      </div>
    </div>
  );
}
export default function ChatConversationReveal01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed],
    speed: config.speed,
    build: (root) => buildChatConversationReveal(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><ChatConversationReveal01Frame config={config} /></div>;
}
