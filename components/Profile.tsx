"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { uploadPhotos } from "@/lib/upload";
import { Avatar, Badge, KeywordChips, ValueChips, Spinner, Empty, TrustBadge } from "@/components/ui";
import { KeywordPicker } from "@/components/KeywordPicker";
import { ValuesSurvey } from "@/components/ValuesSurvey";
import { ValuePrefSurvey } from "@/components/ValuePrefSurvey";
import { ProfileMeter } from "@/components/ProfileMeter";

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-wine-500 focus:ring-2 focus:ring-wine-100";
const labelCls = "block text-sm font-medium text-ink-soft";

interface Invitee {
  id: string;
  name: string;
  role: string;
  status: string;
  created_at: number;
}

export function Profile() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [invite, setInvite] = useState<{ code: string; link: string } | null>(null);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [stats, setStats] = useState<{ invited: number; matched: number }>({ invited: 0, matched: 0 });
  const [valuePrefs, setValuePrefs] = useState<Record<string, string[]>>({});
  const [pinBusy, setPinBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inv, invs, prefs, em] = await Promise.all([
        api<{ code: string; link: string }>("/invite"),
        api<{ invitees: Invitee[]; stats: { invited: number; matched: number } }>("/me/invitees"),
        api<{ valuePrefs: Record<string, string[]> }>("/me/preferences"),
        api<{ email: string | null }>("/me/email"),
      ]);
      setInvite(inv);
      setInvitees(invs.invitees);
      setStats(invs.stats);
      setValuePrefs(prefs.valuePrefs ?? {});
      setEmail(em.email ?? "");
    } finally {
      /* await Promise.all 이후 setState */
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const files = [...f.getAll("photos")].filter((x): x is File => x instanceof File && x.size > 0);
      const photos = files.length > 0 ? await uploadPhotos(files) : undefined;
      const body: Record<string, unknown> = {
        job: f.get("job"),
        region: f.get("region"),
        mbti: f.get("mbti"),
        keywords: f.getAll("kw"),
        values: JSON.parse(String(f.get("values") || "{}")),
        contact: f.get("contact"),
      };
      if (photos) body.photos = photos;
      await api("/me", { method: "PUT", body: JSON.stringify(body) });
      toast("프로필을 저장했어요.");
      await refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          genders: f.getAll("pgender"),
          age_min: f.get("age_min"),
          age_max: f.get("age_max"),
          jobs: f.get("jobs"),
          regions: f.get("regions"),
          value_prefs: JSON.parse(String(f.get("value_prefs") || "{}")),
        }),
      });
      toast("선호 조건을 저장했어요.");
      await load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const changePin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPinBusy(true);
    try {
      await api("/me/pin", { method: "POST", body: JSON.stringify({ current_pin: f.get("current_pin"), new_pin: f.get("new_pin") }) });
      toast("PIN을 변경했어요.");
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setPinBusy(false);
    }
  };

  const saveEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const r = await api<{ email: string | null }>("/me/email", { method: "POST", body: JSON.stringify({ email }) });
      setEmail(r.email ?? "");
      toast(r.email ? "알림 이메일을 저장했어요." : "알림 이메일을 해제했어요.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setEmailBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDelBusy(true);
    try {
      await api("/me", { method: "DELETE" });
      toast("탈퇴가 완료됐어요.");
      await logout();
      router.push("/");
    } catch (err) {
      toast((err as Error).message);
      setDelBusy(false);
    }
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      toast("링크를 복사했어요.");
    } catch {
      toast("복사에 실패했어요.");
    }
  };

  if (!user) return <Spinner />;
  const isMember = user.role === "member";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rise-in rounded-2xl border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold text-ink">{user.name}</span>
              <Badge status={user.status} />
              {isMember && <TrustBadge score={user.trust_score} showScore />}
            </div>
            <p className="text-sm text-ink-faint">
              {isMember ? "일반 회원" : "주선자"} · 포인트 {user.points}점
              {user.status === "dating" && " · 만남 중"}
            </p>
            {isMember && (
              <p className="text-sm text-ink-soft">
                {user.age ?? "?"}세 · {user.gender ?? ""} · {user.job ?? ""} · {user.region ?? ""}
              </p>
            )}
            {isMember && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                {user.mbti && <span className="text-xs font-medium text-gold-600">{user.mbti}</span>}
                <KeywordChips keywords={user.keywords || []} />
              </div>
            )}
            {isMember && user.values && Object.keys(user.values).length > 0 && (
              <div className="mt-1.5">
                <ValueChips values={user.values} />
              </div>
            )}
          </div>
        </div>
        {isMember && (user.photos || []).length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {(user.photos as string[]).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt="" className="h-24 w-24 rounded-xl border border-line object-cover" />
            ))}
          </div>
        )}
      </div>

      {isMember && (
        <div className="mt-6">
          <ProfileMeter user={user} email={email} hasValuePrefs={Object.values(valuePrefs).some((a) => a.length > 0)} />
        </div>
      )}

      {isMember && (
        <form onSubmit={saveProfile} className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-display font-semibold text-ink">프로필 수정</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              직업 및 직장 (선택) <input name="job" defaultValue={user.job ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              사는 곳 (선택) <input name="region" defaultValue={user.region ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              MBTI (선택) <input name="mbti" maxLength={4} defaultValue={user.mbti ?? ""} className={inputCls} />
            </label>
          </div>
          <div className="mt-3">
            <KeywordPicker
              name="kw"
              label="나를 나타내는 키워드 (1~5개)"
              defaultSelected={user.keywords || []}
            />
          </div>
          <div className="mt-4 rounded-xl border border-line bg-cream/40 p-4">
            <p className="mb-2 text-sm font-medium text-ink-soft">나의 가치관 (선택)</p>
            <ValuesSurvey defaultValues={user.values || {}} />
          </div>
          <label className={`${labelCls} mt-3`}>
            연락처 <input name="contact" defaultValue={user.contact ?? ""} placeholder="카톡ID 또는 전화번호" className={inputCls} />
          </label>
          <label className={`${labelCls} mt-3`}>
            사진 (선택, 1~3장 — 매칭 성사 후 서로 동의했을 때만 교환돼요)
            <input name="photos" type="file" accept="image/*" multiple className={inputCls} />
          </label>
          <button disabled={busy} className="mt-5 w-full rounded-xl bg-wine-600 py-2.5 text-sm font-semibold text-paper transition hover:bg-wine-700 disabled:opacity-40">
            {busy ? "저장 중..." : "저장"}
          </button>
        </form>
      )}

      {isMember && (
        <form onSubmit={savePrefs} className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-display font-semibold text-ink">상대방 선호 조건</h3>
          <div className="flex gap-4 text-sm text-ink-soft">
            <label className="flex items-center gap-1">
              <input type="checkbox" name="pgender" value="남성" /> 남성
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="pgender" value="여성" /> 여성
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input name="age_min" type="number" placeholder="최소 나이" className={inputCls} />
            <input name="age_max" type="number" placeholder="최대 나이" className={inputCls} />
          </div>
          <input name="jobs" placeholder="직업 (콤마 구분)" className={`mt-2 ${inputCls}`} />
          <input name="regions" placeholder="사는 곳 (콤마 구분)" className={`mt-2 ${inputCls}`} />
          <div className="mt-4">
            <p className="text-sm font-medium text-ink-soft">상대에게 바라는 가치관</p>
            <p className="mt-0.5 mb-2 text-xs text-ink-faint">허용할 값을 고르면 그런 상대가 추천 상위로 와요. 안 고르면 상관없음.</p>
            <ValuePrefSurvey defaultValue={valuePrefs} />
          </div>
          <button className="mt-5 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper transition hover:bg-ink/85">
            선호 조건 저장
          </button>
        </form>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h3 className="mb-2 font-display font-semibold text-ink">내 초대코드</h3>
        <p className="font-mono text-2xl font-bold tracking-[0.25em] text-wine-700">{invite?.code}</p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={invite?.link ?? ""} className="flex-1 rounded-lg border border-line bg-cream/50 px-3 py-2 text-sm text-ink-soft" />
          <button onClick={copy} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/85">
            복사
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">이 링크로 가입한 사람이 매칭되면 포인트가 쌓여요.</p>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h3 className="mb-2 font-display font-semibold text-ink">내가 초대한 사람들</h3>
        <p className="mb-3 text-sm text-ink-faint">
          초대 {stats.invited}명 · 매칭 성사 {stats.matched}건
        </p>
        {invitees.length === 0 ? (
          <Empty>아직 초대한 사람이 없어요.</Empty>
        ) : (
          <div className="space-y-1 text-sm text-ink-soft">
            {invitees.map((i) => (
              <p key={i.id}>
                · {i.name} ({i.role === "member" ? "일반" : "주선자"}) <Badge status={i.status} />
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 계정 관리 — PIN 변경 / 탈퇴 */}
      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h3 className="mb-3 font-display font-semibold text-ink">계정 관리</h3>
        <form onSubmit={saveEmail} className="mb-5 space-y-2 border-b border-line pb-4">
          <p className="text-sm font-medium text-ink-soft">알림 이메일 <span className="text-ink-faint">(준비 중)</span></p>
          <p className="text-xs text-ink-faint">지금은 앱 안에서 새 매칭을 알려드려요. 이메일을 남겨두면 이메일 알림이 켜질 때 바로 받아볼 수 있어요.</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            className={inputCls}
            autoComplete="email"
          />
          <button disabled={emailBusy} className="w-full rounded-xl bg-ink py-2 text-sm font-semibold text-paper transition hover:bg-ink/85 disabled:opacity-40">
            {emailBusy ? "저장 중..." : "이메일 저장"}
          </button>
        </form>

        <form onSubmit={changePin} className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">PIN 변경</p>
          <input name="current_pin" type="password" inputMode="numeric" maxLength={6} placeholder="현재 PIN" className={inputCls} autoComplete="current-password" />
          <input name="new_pin" type="password" inputMode="numeric" maxLength={6} placeholder="새 PIN (숫자 6자리)" className={inputCls} autoComplete="new-password" />
          <button disabled={pinBusy} className="w-full rounded-xl bg-ink py-2 text-sm font-semibold text-paper transition hover:bg-ink/85 disabled:opacity-40">
            {pinBusy ? "변경 중..." : "PIN 변경"}
          </button>
        </form>

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-medium text-wine-700">회원 탈퇴</p>
          <p className="mt-0.5 text-xs text-ink-faint">모든 정보가 삭제되며 되돌릴 수 없어요.</p>
          {confirmDelete ? (
            <div className="mt-2 flex gap-2">
              <button onClick={deleteAccount} disabled={delBusy} className="flex-1 rounded-xl bg-wine-600 py-2 text-sm font-semibold text-paper transition hover:bg-wine-700 disabled:opacity-40">
                {delBusy ? "탈퇴 중..." : "정말 탈퇴할게요"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink-soft">
                취소
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="mt-2 rounded-xl border border-wine-200 bg-wine-50 px-4 py-2 text-sm font-medium text-wine-700">
              탈퇴하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
