// lib/notify.ts — 이메일 알림. 주소는 users.email 컬럼에 저장하고 Resend로 발송한다.
//   발송: RESEND_API_KEY 환경변수가 있으면 Resend API로, 없으면 no-op(로그만).
import { getSupabase } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}

// 사용자 알림 이메일 조회(없으면 null)
export async function getEmail(userId: string): Promise<string | null> {
  const { data } = await getSupabase().from("users").select("email").eq("id", userId).maybeSingle();
  return data?.email ?? null;
}

// 여러 사용자 이메일 일괄 조회
export async function getEmails(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const { data } = await getSupabase().from("users").select("id, email").in("id", userIds);
  for (const u of data ?? []) if (u.email) out.set(u.id, u.email);
  return out;
}

// 알림 이메일 설정(빈 문자열이면 해제).
export async function setEmail(userId: string, email: string): Promise<void> {
  const clean = email.trim();
  await getSupabase()
    .from("users")
    .update({ email: clean || null })
    .eq("id", userId);
}

// 실제 발송(Resend). 키 없으면 조용히 스킵(개발/미설정 환경).
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL || "Connecting <onboarding@resend.dev>";
  if (!key) {
    console.log(`[notify] (미발송: RESEND_API_KEY 없음) to=${to} subject=${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[notify] 발송 실패 ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify] 발송 예외:", e);
    return false;
  }
}

// 공통 레이아웃(간단 인라인 스타일)
function wrap(title: string, body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2b2b2b">
    <h2 style="color:#7c2d3e;margin:0 0 12px">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
    <p style="font-size:12px;color:#999">Connecting · 이 메일은 알림 설정에 따라 발송됐어요. 원치 않으면 프로필에서 이메일을 지워주세요.</p>
  </div>`;
}

// 사용자 1명에게 알림(이메일 미설정/키 없음이면 조용히 무시).
export async function notifyUser(userId: string, subject: string, title: string, bodyHtml: string): Promise<void> {
  const email = await getEmail(userId);
  if (!email) return;
  await sendEmail(email, subject, wrap(title, bodyHtml));
}

// 배치로 생성된 이번 사이클의 pending 매칭 당사자 전원에게 "새 매칭 도착" 알림.
// sb는 supabase 클라이언트(순환참조 방지 위해 느슨한 타입).
export async function notifyMatchesForCycle(sb: ReturnType<typeof getSupabase>, cycle: string): Promise<void> {
  const { data: rows } = await sb
    .from("matches")
    .select("user_a, user_b")
    .eq("cycle_date", cycle)
    .eq("state", "pending");
  const matches = (rows as { user_a: string; user_b: string }[] | null) ?? [];
  if (!matches.length) return;
  const ids = [...new Set(matches.flatMap((m) => [m.user_a, m.user_b]))];
  const emails = await getEmails(ids);
  const subject = "새 매칭이 도착했어요 · Connecting";
  const title = "새 매칭 도착 💌";
  const bodyHtml = `<p>오늘의 매칭이 도착했어요. 앱에서 매칭함을 열어 <strong>수락 여부</strong>를 정해주세요.</p>
    <p>응답 시간이 지나면 매칭이 자동 종료되니 잊지 마세요.</p>`;
  await Promise.all(
    ids.map((id) => {
      const email = emails.get(id);
      return email ? sendEmail(email, subject, wrap(title, bodyHtml)).catch(() => false) : Promise.resolve(false);
    })
  );
}
