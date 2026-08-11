import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { TERMS } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "이용약관 · 인연" };

export default function TermsPage() {
  return <LegalDoc title="이용약관" sections={TERMS} />;
}
