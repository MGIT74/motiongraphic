import { notFound } from "next/navigation";
import SandboxCheck from "@/components/studio/SandboxCheck";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Contrôle automatique du runtime sandbox (tests/security) — jamais en production. */
export default function SandboxCheckPage() {
  if (process.env.TEMPLATE_CHECK !== "1") notFound();
  return <SandboxCheck />;
}