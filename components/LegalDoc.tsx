import Link from "next/link";
import type { LegalSection } from "@/lib/legal";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

// 약관·개인정보처리방침 공통 렌더러.
export function LegalDoc({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-ink-faint underline-offset-4 hover:underline">
        ← 홈으로
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-xs text-ink-faint">시행일: {LEGAL_EFFECTIVE_DATE}</p>

      <div className="mt-8 space-y-7">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display font-semibold text-ink">{s.heading}</h2>
            {s.paragraphs?.map((p, i) => (
              <p key={i} className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-1.5 space-y-1">
                {s.bullets.map((b, i) => (
                  <li key={i} className="text-sm leading-relaxed text-ink-soft">
                    · {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-10 flex gap-4 border-t border-line pt-5 text-sm">
        <Link href="/terms" className="text-wine-700 underline-offset-4 hover:underline">
          이용약관
        </Link>
        <Link href="/privacy" className="text-wine-700 underline-offset-4 hover:underline">
          개인정보처리방침
        </Link>
      </div>
    </div>
  );
}
