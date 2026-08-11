"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { KeywordPicker } from "@/components/KeywordPicker";
import type { User } from "@/lib/types";

type Tab = "login" | "signup";

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-wine-500 focus:ring-2 focus:ring-wine-100";
const labelCls = "block text-sm font-medium text-ink-soft";
const btnCls =
  "mt-3 w-full rounded-xl bg-wine-600 px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-wine-700 disabled:opacity-40";

export function AuthPage() {
  const [manualTab, setManualTab] = useState<Tab>("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();

  const codeParam = searchParams.get("code");
  const tab: Tab = codeParam ? "signup" : manualTab;

  const onLogin = (token: string, user: User) => {
    login(token, user);
    router.replace(user.role === "member" ? "/home" : "/bridge");
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ name: f.get("name"), pin: f.get("pin") }),
      });
      onLogin(data.token, data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const role = String(f.get("role"));
    try {
      const body: Record<string, unknown> = {
        code: f.get("code"),
        role,
        name: f.get("name"),
        pin: f.get("pin"),
      };
      if (role === "member") {
        // 사진은 가입 시 받지 않는다 — 매칭 성사 후 상호 동의로 교환(004).
        // 근무지·연락처도 가입 단계에서는 수집하지 않는다(연락처는 매칭 수락 시 입력).
        Object.assign(body, {
          gender: f.get("gender"),
          age: f.get("age"),
          job: f.get("job"),
          region: f.get("region"),
          mbti: f.get("mbti"),
          keywords: f.getAll("kw"),
          pref_genders: f.getAll("pref_genders"),
          pref_age_min: f.get("pref_age_min"),
          pref_age_max: f.get("pref_age_max"),
          pref_keywords: f.getAll("pref_kw"),
        });
      }
      const data = await api<{ token: string; user: User }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("가입을 환영합니다.");
      onLogin(data.token, data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-14 pb-20">
      <div className="rise-in mb-10 text-center">
        <p className="text-xs font-semibold tracking-[0.35em] text-gold-600">MEMBERS ONLY</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink">인연</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          아는 사람의 소개로 만나는,
          <br />
          신뢰할 수 있는 만남
        </p>
        <div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 text-xs text-ink-faint">
          <span>초대제</span>
          <span className="text-line">·</span>
          <span>닉네임으로 활동</span>
          <span className="text-line">·</span>
          <span>사진은 상호 동의 교환</span>
        </div>
      </div>

      <div className="mb-6 flex rounded-full border border-line bg-cream p-1">
        {(["login", "signup"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setManualTab(t);
              setError("");
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t === "login" ? "로그인" : "가입"}
          </button>
        ))}
      </div>

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="rise-in rounded-2xl border border-line bg-white p-7 shadow-sm">
          <label className={labelCls}>
            닉네임
            <input name="name" required className={inputCls} autoComplete="username" />
          </label>
          <label className={`${labelCls} mt-3`}>
            PIN (숫자 6자리)
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              className={inputCls}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="mt-3 text-sm text-wine-600">{error}</p>}
          <button disabled={busy} className={btnCls}>
            {busy ? "로그인 중..." : "로그인"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="rise-in rounded-2xl border border-line bg-white p-7 shadow-sm">
          <label className={labelCls}>
            초대코드
            <input
              name="code"
              required
              placeholder="8자리 코드"
              defaultValue={codeParam?.toUpperCase() ?? ""}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            계정 유형
            <select name="role" className={inputCls} defaultValue="member">
              <option value="member">일반 (매칭 받을래요)</option>
              <option value="bridge">주선자 (소개만 시켜줄래요 — 커플/기혼)</option>
            </select>
          </label>
          <label className={labelCls}>
            닉네임
            <input
              name="name"
              required
              placeholder="본명 대신 사용할 이름"
              className={inputCls}
              autoComplete="off"
            />
          </label>
          <p className="mt-1 text-xs text-ink-faint">
            ※ 본명은 쓰지 않아도 돼요. 상대에게는 닉네임만 보입니다.
          </p>
          <label className={`${labelCls} mt-3`}>
            PIN (숫자 6자리)
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              className={inputCls}
              autoComplete="new-password"
            />
          </label>

          <div className="mt-5 space-y-3 border-t border-line pt-5" data-member>
            <label className={labelCls}>
              성별
              <select name="gender" className={inputCls} defaultValue="남성">
                <option>남성</option>
                <option>여성</option>
              </select>
            </label>
            <label className={labelCls}>
              나이
              <input name="age" type="number" min={19} max={99} className={inputCls} />
            </label>
            <label className={labelCls}>
              직업 (선택)
              <input name="job" placeholder="예: 디자이너 — 대략적으로만" className={inputCls} />
            </label>
            <label className={labelCls}>
              사는 곳 (선택)
              <input name="region" placeholder="예: 서울 — 시/구 단위면 충분해요" className={inputCls} />
            </label>
            <label className={labelCls}>
              MBTI (선택)
              <input name="mbti" maxLength={4} placeholder="예: ENFP" className={inputCls} />
            </label>
            <KeywordPicker
              name="kw"
              label="나를 나타내는 키워드 (1~5개)"
              hint="관심사·성향을 골라주세요. 추천에 활용돼요."
            />
            <div className="rounded-xl border border-line bg-cream/50 p-4">
              <p className="text-sm font-medium text-ink-soft">상대방 선호 조건 (선택)</p>
              <div className="mt-2 flex gap-4 text-sm text-ink-soft">
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="pref_genders" value="남성" /> 남성
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="pref_genders" value="여성" /> 여성
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input name="pref_age_min" type="number" placeholder="최소 나이" className={inputCls} />
                <input name="pref_age_max" type="number" placeholder="최대 나이" className={inputCls} />
              </div>
              <div className="mt-3">
                <KeywordPicker
                  name="pref_kw"
                  label="선호 키워드 (최대 5개)"
                  hint="상대에게 바라는 키워드. 추천 순위에 유사도로 반영돼요(유의어도 연결)."
                />
              </div>
              <p className="mt-2 text-xs text-ink-faint">※ 비워두면 조건 제한 없이 추천돼요.</p>
            </div>

            <div className="rounded-xl border border-gold-100 bg-gold-100/30 p-4 text-xs leading-relaxed text-ink-soft">
              <p className="font-medium text-ink">개인정보는 이렇게 다뤄요</p>
              <p className="mt-1">
                · 사진은 가입 때 받지 않아요 — 매칭 성사 후 서로 동의하면 그때 교환됩니다.
                <br />
                · 연락처는 매칭을 수락할 때만 입력하고, 성사된 상대에게만 공개됩니다.
                <br />· 직장·상세 주소 등은 아예 수집하지 않아요.
              </p>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-wine-600">{error}</p>}
          <button disabled={busy} className={btnCls}>
            {busy ? "가입 중..." : "가입하기"}
          </button>
        </form>
      )}
    </div>
  );
}
