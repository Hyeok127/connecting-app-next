import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";
import { createSession } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { clientIp, ipAllowed } from "@/lib/ratelimit";
import { SIGNUP_IP_MAX, INVITE_MAX } from "@/lib/constants";
import { genId, nowMs, parseArr, PHOTO_PATH_RE, genInviteCode } from "@/lib/utils";
import { publicUserWithPhotos } from "@/lib/serialize";
import { cleanKeywords } from "@/lib/keywords";
import { cleanValues, cleanValuePrefs } from "@/lib/values";
import { JOB_TYPES, JOB_ROLES } from "@/lib/profileOptions";
import { LEGAL_VERSION } from "@/lib/legal";
import type { UserRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await ipAllowed("signup", ip, SIGNUP_IP_MAX)))
    return fail("가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const { code, role, name, pin } = body;
  if (!code || !name || !pin)
    return fail("초대코드, 이름, PIN은 필수입니다.", 400);
  if (!/^\d{6}$/.test(String(pin)))
    return fail("PIN은 숫자 6자리여야 합니다.", 400);
  if (!["member", "bridge"].includes(String(role)))
    return fail("계정 유형이 올바르지 않습니다.", 400);
  if (body.agree !== true)
    return fail("이용약관과 개인정보처리방침에 동의해주세요.", 400);

  const sb = getSupabase();

  const { data: inviter } = await sb
    .from("users")
    .select("id, is_admin, status")
    .eq("invite_code", String(code).trim().toUpperCase())
    .maybeSingle();
  if (!inviter) return fail("유효하지 않은 초대코드입니다.", 400); // R1

  // 정지된 계정의 초대코드는 무효 (P1-3)
  if (inviter.status === "suspended")
    return fail("사용할 수 없는 초대코드입니다.", 400);

  // 인당 초대 상한 (P1-3). 별도 컬럼 없이 invited_by 카운트로 센다.
  // 상한이 없으면 한 사람이 다수 계정을 만들어 추천 풀을 채울 수 있고,
  // 초대자 포인트도 무한히 누적된다. 관리자는 예외(운영상 시드 계정 생성 필요).
  if (!inviter.is_admin) {
    const { count: invitedCount } = await sb
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", inviter.id);
    if ((invitedCount ?? 0) >= INVITE_MAX)
      return fail(`이 초대코드는 최대 ${INVITE_MAX}명까지 사용할 수 있어요.`, 400);
  }

  const id = genId();
  let cols: Record<string, unknown>;
  if (role === "member") {
    const keywords = parseArr(body.keywords);
    const photos = parseArr(body.photos);
    const age = body.age ? Number(body.age) : null;
    if (!["남성", "여성"].includes(String(body.gender)))
      return fail("성별을 선택해주세요.", 400);
    if (!age || age < 19 || age > 99)
      return fail("나이를 확인해주세요.", 400);
    // 만나고 싶은 성별은 필수 — 유저 행을 만들기 전에 검증해 고아 계정을 남기지 않는다.
    if (parseArr(body.pref_genders).filter((g) => ["남성", "여성"].includes(g)).length === 0)
      return fail("만나고 싶은 성별을 선택해주세요.", 400);
    const cleanKw = cleanKeywords(keywords);
    if (cleanKw.length < 1)
      return fail("나를 나타내는 키워드를 1개 이상 골라주세요.", 400);
    // 사진은 가입 시 받지 않는다 — 매칭 성사 후 상호 동의 교환으로 이동.
    // 값이 넘어오는 경우(프로필에서 미리 등록 등)만 형식 검증한다.
    if (photos.length > 3) return fail("사진은 최대 3장까지 가능합니다.", 400);
    if (!photos.every((p) => PHOTO_PATH_RE.test(p)))
      return fail("사진 경로가 올바르지 않습니다.", 400);
    // 가치관 설문(술/담배/문신/종교) — users.life_values(jsonb)
    const values = cleanValues(body.values);
    cols = {
      gender: String(body.gender),
      age,
      job_type: JOB_TYPES.includes(String(body.job_type) as never) ? String(body.job_type) : null,
      job_role: JOB_ROLES.includes(String(body.job_role) as never) ? String(body.job_role) : null,
      life_values: Object.keys(values).length ? values : null,
      region: String(body.region ?? "").trim() || null,
      mbti: String(body.mbti ?? "").trim().toUpperCase() || null,
      keywords: JSON.stringify(cleanKw),
      photos: JSON.stringify(photos),
      contact: String(body.contact ?? "").trim() || null,
    };
  } else {
    cols = {
      gender: null,
      age: null,
      job: null,
      life_values: null,
      region: null,
      mbti: null,
      keywords: "[]",
      photos: "[]",
      contact: null,
    };
  }

  const invite_code = await genInviteCode(async (c) => {
    const { data } = await sb.from("users").select("id").eq("invite_code", c).maybeSingle();
    return !!data;
  });

  const { error } = await sb.from("users").insert({
    id,
    role,
    name: String(name).trim(),
    pin_hash: bcrypt.hashSync(String(pin), 10), // R3
    ...cols,
    status: "active",
    invited_by: inviter.id,
    invite_code,
    is_admin: 0,
    // 약관·개인정보처리방침 동의(개정 시 LEGAL_VERSION을 올려 재동의 판별)
    consent_version: LEGAL_VERSION,
    consent_at: nowMs(),
    created_at: nowMs(),
  });
  if (error) {
    if (error.code === "23505" || String(error.message).includes("idx_users_member_name"))
      return fail("이미 사용 중인 이름입니다.", 409);
    return fail(error.message, 400);
  }

  // 가입 시 선호 조건 — 성별만 필수(R24의 예외), 나머지는 선택.
  // 성별을 선택으로 두면 preferences 행 자체가 안 생기고, 그러면 fits()가 성별을
  // 이성으로 폴백할 뿐 사용자가 원하는 값을 알 수 없다. 한 번은 반드시 받는다.
  if (role === "member") {
    const genders = parseArr(body.pref_genders).filter((g) => ["남성", "여성"].includes(g));
    const jobTypes = parseArr(body.pref_job_types).filter((x) => JOB_TYPES.includes(x as never));
    const jobRoles = parseArr(body.pref_job_roles).filter((x) => JOB_ROLES.includes(x as never));
    const regions = parseArr(body.pref_regions);
    const valuePrefs = cleanValuePrefs(body.value_prefs); // 바라는 가치관
    // 범위가 뒤집힌 설정(min > max)은 후보를 0으로 만들고, 사용자는 "추천이 없다"만 보게 된다.
    // 잘못된 값은 거절하지 않고 무시한다 — 가입 마지막 단계에서 튕기는 것보다 낫다.
    const prefAge = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Math.trunc(Number(v));
      return Number.isFinite(n) && n >= 19 && n <= 99 ? n : null;
    };
    let ageMin = prefAge(body.pref_age_min);
    let ageMax = prefAge(body.pref_age_max);
    if (ageMin != null && ageMax != null && ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
    // genders는 위에서 필수 검증했으므로 preferences 행은 항상 만든다.
    {
      await sb.from("preferences").insert({
        user_id: id,
        genders: JSON.stringify(genders),
        age_min: ageMin,
        age_max: ageMax,
        job_types: jobTypes,
        job_roles: jobRoles,
        value_prefs: valuePrefs, // 바라는 가치관
        regions: JSON.stringify(regions),
        mbtis: "[]",
        updated_at: nowMs(),
      });
    }
  }

  const token = await createSession(id);
  const { data: user } = await sb.from("users").select("*").eq("id", id).single();
  const me = await publicUserWithPhotos(user as UserRow);
  (me as unknown as Record<string, unknown>).contact = (user as UserRow).contact;
  return ok({ token, user: me });
}
