"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { uploadPhotos } from "@/lib/upload";
import type { User } from "@/lib/types";

type Tab = "login" | "signup";

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100";
const labelCls = "block text-sm font-medium text-slate-700";
const btnCls =
  "mt-2 w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40";

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
      let photos: string[] = [];
      if (role === "member") {
        const files = [...f.getAll("photos")].filter(
          (x): x is File => x instanceof File && x.size > 0
        );
        if (files.length < 1) throw new Error("사진을 1장 이상 올려주세요.");
        if (files.length > 3) throw new Error("사진은 최대 3장까지 가능합니다.");
        photos = await uploadPhotos(files);
      }
      const body: Record<string, unknown> = {
        code: f.get("code"),
        role,
        name: f.get("name"),
        pin: f.get("pin"),
      };
      if (role === "member") {
        Object.assign(body, {
          gender: f.get("gender"),
          age: f.get("age"),
          job: f.get("job"),
          workplace: f.get("workplace"),
          region: f.get("region"),
          mbti: f.get("mbti"),
          keywords: [f.get("kw1"), f.get("kw2"), f.get("kw3")],
          photos,
          contact: f.get("contact"),
          pref_genders: f.getAll("pref_genders"),
          pref_age_min: f.get("pref_age_min"),
          pref_age_max: f.get("pref_age_max"),
          pref_jobs: f.get("pref_jobs"),
          pref_workplaces: f.get("pref_workplaces"),
          pref_regions: f.get("pref_regions"),
        });
      }
      const data = await api<{ token: string; user: User }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("가입 완료! 환영해요 💝");
      onLogin(data.token, data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10 pb-20">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900">인연 💝</h1>
        <p className="mt-1 text-slate-500">사진 대신 맥락으로, 하루 한 번</p>
      </div>

      <div className="mb-6 flex rounded-full bg-slate-100 p-1">
        {(["login", "signup"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setManualTab(t);
              setError("");
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            {t === "login" ? "로그인" : "가입"}
          </button>
        ))}
      </div>

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className={labelCls}>
            이름
            <input name="name" required className={inputCls} autoComplete="name" />
          </label>
          <label className={labelCls}>
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
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <button disabled={busy} className={btnCls}>
            {busy ? "로그인 중..." : "로그인"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
            이름
            <input name="name" required className={inputCls} autoComplete="name" />
          </label>
          <label className={labelCls}>
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

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4" data-member>
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
              직업
              <input name="job" placeholder="예: 디자이너" className={inputCls} />
            </label>
            <label className={labelCls}>
              근무지
              <input name="workplace" placeholder="예: 서울 강남" className={inputCls} />
            </label>
            <label className={labelCls}>
              사는 곳
              <input name="region" placeholder="예: 서울 마포" className={inputCls} />
            </label>
            <label className={labelCls}>
              MBTI
              <input name="mbti" maxLength={4} placeholder="예: ENFP" className={inputCls} />
            </label>
            <div>
              <span className="text-sm font-medium text-slate-700">키워드 3개</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <input name="kw1" placeholder="키워드1" className={inputCls} />
                <input name="kw2" placeholder="키워드2" className={inputCls} />
                <input name="kw3" placeholder="키워드3" className={inputCls} />
              </div>
            </div>
            <label className={labelCls}>
              사진 (1~3장)
              <input name="photos" type="file" accept="image/*" multiple className={inputCls} />
            </label>
            <label className={labelCls}>
              연락처 (선택 — 카톡ID 또는 전화번호)
              <input name="contact" className={inputCls} />
            </label>
            <p className="text-xs text-slate-400">※ 사진은 매칭 성사 전까지 공개되지 않아요.</p>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-700">상대방 선호 조건 (선택)</p>
              <div className="mt-2 flex gap-4 text-sm text-slate-600">
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
              <input name="pref_jobs" placeholder="직업 (콤마 구분)" className={`mt-2 ${inputCls}`} />
              <input name="pref_workplaces" placeholder="근무지 (콤마 구분)" className={`mt-2 ${inputCls}`} />
              <input name="pref_regions" placeholder="사는 곳 (콤마 구분)" className={`mt-2 ${inputCls}`} />
              <p className="mt-2 text-xs text-slate-400">※ 비워두면 조건 제한 없이 추천돼요.</p>
            </div>
          </div>

          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <button disabled={busy} className={btnCls}>
            {busy ? "가입 중..." : "가입하기"}
          </button>
        </form>
      )}
    </div>
  );
}
