import { redirect } from "next/navigation";

/** Les anciennes fiches de prompts ne sont plus accessibles. */
export default function TemplateDetailPage() {
  redirect("/studio");
}
