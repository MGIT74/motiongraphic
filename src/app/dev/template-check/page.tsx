import { notFound } from "next/navigation";
import TemplateCheck from "@/components/studio/TemplateCheck";

// Lu à chaque requête : la page n'existe que si TEMPLATE_CHECK=1 (CI).
export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

/** Contrôle automatique des templates (tests/templates/check.cjs) — jamais en production. */
export default function TemplateCheckPage() {
  if (process.env.TEMPLATE_CHECK !== "1") notFound();
  return <TemplateCheck />;
}
