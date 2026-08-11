import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";
import { createSession } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { clientIp, ipAllowed } from "@/lib/ratelimit";
import { SIGNUP_IP_MAX } from "@/lib/constants";
import { genId, nowMs, parseArr, PHOTO_PATH_RE, genInviteCode } from "@/lib/utils";
import { publicUserWithPhotos } from "@/lib/serialize";
import { cleanKeywords } from "@/lib/keywords";
import { cleanValues, cleanValuePrefs } from "@/lib/values";
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
    .select("id")
    .eq("invite_code", String(code).trim().toUpperCase())
    .maybeSingle();
  if (!inviter) return fail("유효하지 않은 초대코드입니다.", 400); // R1

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
    const cleanKw = cleanKeywords(keywords);
    if (cleanKw.length < 1)
      return fail("나를 나타내는 키워드를 1개 이상 골라주세요.", 400);
    // 사진은 가입 시 받지 않는다 — 매칭 성사 후 상호 동의 교환으로 이동.
    // 값이 넘어오는 경우(프로필에서 미리 등록 등)만 형식 검증한다.
    if (photos.length > 3) return fail("사진은 최대 3장까지 가능합니다.", 400);
    if (!photos.every((p) => PHOTO_PATH_RE.test(p)))
      return fail("사진 경로가 올바르지 않습니다.", 400);
    // 가치관 설문(술/담배/문신/종교)은 근무지 폐지로 빈 workplace 컬럼에 JSON으로 저장(DDL 회피).
    const values = cleanValues(body.values);
    cols = {
      gender: String(body.gender),
      age,
      job: String(body.job ?? "").trim() || null,
      workplace: Object.keys(values).length ? JSON.stringify(values) : null,
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
      workplace: null,
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
    created_at: nowMs(),
  });
  if (error) {
    if (error.code === "23505" || String(error.message).includes("idx_users_member_name"))
      return fail("이미 사용 중인 이름입니다.", 409);
    return fail(error.message, 400);
  }

  // 약관·개인정보처리방침 동의 기록(개정 시 LEGAL_VERSION을 올려 재동의 판별).
  // 스키마 변경 없이 point_events에 이벤트로 남긴다.
  await sb.from("point_events").insert({
    id: genId(),
    user_id: id,
    type: `consent|${LEGAL_VERSION}`,
    points: 0,
    created_at: nowMs(),
  });

  // 가입 시 선호 조건 (선택, R24) — 성별/나이/직업/지역 하드 필터 + 바라는 가치관.
  if (role === "member") {
    const genders = parseArr(body.pref_genders).filter((g) => ["남성", "여성"].includes(g));
    const jobs = parseArr(body.pref_jobs);
    const regions = parseArr(body.pref_regions);
    const valuePrefs = cleanValuePrefs(body.value_prefs); // 바라는 가치관 → workplaces 재사용
    const ageMin = body.pref_age_min ? Number(body.pref_age_min) : null;
    const ageMax = body.pref_age_max ? Number(body.pref_age_max) : null;
    if (genders.length || ageMin || ageMax || jobs.length || regions.length || Object.keys(valuePrefs).length) {
      await sb.from("preferences").insert({
        user_id: id,
        genders: JSON.stringify(genders),
        age_min: ageMin,
        age_max: ageMax,
        jobs: JSON.stringify(jobs),
        workplaces: JSON.stringify(valuePrefs), // 바라는 가치관
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
