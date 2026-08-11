import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { PRIVACY } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "개인정보처리방침 · 인연" };

export default function PrivacyPage() {
  return <LegalDoc title="개인정보처리방침" sections={PRIVACY} />;
}
