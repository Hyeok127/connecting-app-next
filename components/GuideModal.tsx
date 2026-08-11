"use client";
import { useState } from "react";

// 매칭 방식·이용법 안내 모달. 로그인/가입 화면 하단 링크로 진입.
export function GuideModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-6 block text-sm font-medium text-wine-700 underline-offset-4 hover:underline"
      >
        인연은 어떻게 매칭하나요? · 이용 안내 보기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-8 h-fit w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.3em] text-gold-600">HOW IT WORKS</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-ink">인연 이용 안내</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:bg-cream"
              >
                닫기
              </button>
            </div>

            <p className="text-[15px] leading-relaxed text-ink-soft">
              아는 사람의 초대로만 모인 사람들 사이에서, <b className="text-ink">하루 한 번</b> 서로의
              선택이 맞을 때만 이어주는 소개팅이에요.
            </p>

            {/* 이용 순서 — 번호 타임라인 */}
            <h3 className="mt-6 mb-3 font-display font-semibold text-ink">이용 순서</h3>
            <ol className="space-y-3">
              {[
                ["초대코드로 가입", "닉네임·PIN과 나를 나타내는 키워드·가치관을 골라요. 본명·사진·연락처는 받지 않아요."],
                ["오늘의 추천 담기", "매일 추천되는 사람 중 마음에 드는 이를 순위에 담아요. 키워드가 비슷하고 가치관이 맞을수록 위로 추천돼요."],
                ["밤 8시 전 순위 확정", "최대 10명까지, 위에 둘수록 우선순위가 높아요."],
                ["밤 8시 매칭", "서로의 3순위 안에 들면 그날 매칭이 성사돼요."],
                ["12시간 내 응답", "매칭함에서 수락/거절해요. 수락할 때 연락처를 입력해요."],
                ["연락처 공개 · 사진 교환", "둘 다 수락하면 연락처가 열리고, 양쪽이 동의하면 사진도 교환해요."],
                ["만남 후 선택", "만나고 나서 ‘교제 시작’ 또는 ‘종료’를 골라요. 노쇼는 신고할 수 있어요."],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wine-600 text-xs font-bold text-paper">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="text-xs leading-relaxed text-ink-soft">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* 매칭 성립 조건 — 벤 다이어그램 */}
            <h3 className="mt-6 mb-2 font-display font-semibold text-ink">매칭이 성립하는 조건</h3>
            <div className="rounded-xl border border-line bg-white p-3">
              <svg viewBox="0 0 260 130" className="mx-auto w-full max-w-[280px]" role="img" aria-label="상호 3순위 교집합">
                <ellipse cx="95" cy="65" rx="78" ry="48" fill="#f9f0f1" stroke="#a23c50" strokeWidth="1.5" />
                <ellipse cx="165" cy="65" rx="78" ry="48" fill="#eee3cf" fillOpacity="0.5" stroke="#a8834e" strokeWidth="1.5" />
                <text x="55" y="45" textAnchor="middle" fontSize="11" fill="#772335" fontWeight="600">내 순위</text>
                <text x="55" y="60" textAnchor="middle" fontSize="11" fill="#772335" fontWeight="600">TOP 3</text>
                <text x="205" y="45" textAnchor="middle" fontSize="11" fill="#8a6a35" fontWeight="600">상대 순위</text>
                <text x="205" y="60" textAnchor="middle" fontSize="11" fill="#8a6a35" fontWeight="600">TOP 3</text>
                <text x="130" y="62" textAnchor="middle" fontSize="12" fill="#4f1a25" fontWeight="700">매칭</text>
                <text x="130" y="78" textAnchor="middle" fontSize="9" fill="#6f645a">서로 3순위 안</text>
              </svg>
              <p className="mt-1 text-center text-xs text-ink-soft">
                내가 상대를 3순위 안에 넣고, <b className="text-ink">상대도 나를</b> 3순위 안에 넣어야 이어져요.
              </p>
            </div>

            {/* 추천 기준 */}
            <h3 className="mt-6 mb-2 font-display font-semibold text-ink">추천은 이렇게 정해져요</h3>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              <li>· <b className="text-ink">관심사 키워드</b>는 비슷할수록 위로 — 유의어(등산~캠핑)도 연결돼요.</li>
              <li>· <b className="text-ink">가치관</b>(흡연·음주·문신·종교)은 같을수록 가산점이 붙어요.</li>
              <li>· 성별·나이 등 <b className="text-ink">선호 조건</b>에 맞지 않으면 추천에서 빠져요.</li>
            </ul>

            <div className="mt-6 rounded-xl border border-gold-100 bg-gold-100/30 p-4 text-xs leading-relaxed text-ink-soft">
              <p className="font-medium text-ink">안심 포인트</p>
              <p className="mt-1">
                본명 대신 닉네임 · 사진은 매칭 후 양쪽 동의했을 때만 · 연락처는 성사된 상대에게만 공개돼요.
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              ※ 주선자로 가입하면 매칭은 받지 않고, 내 초대코드로 사람들을 이어줄 수 있어요.
            </p>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl bg-wine-600 py-2.5 text-sm font-semibold text-paper transition hover:bg-wine-700"
            >
              이해했어요
            </button>
          </div>
        </div>
      )}
    </>
  );
}
