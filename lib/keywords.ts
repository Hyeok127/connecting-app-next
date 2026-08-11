// lib/keywords.ts — 고정 키워드 세트(칩 선택용) + 상수.
// 자유 입력 대신 이 세트에서 고른다. 유의어는 임베딩 코사인 유사도(keyword_vectors.json)가
// 연결하므로 세트에는 대표어만 둔다. 항목을 추가/수정하면 scripts/embed_keywords.mjs로
// keyword_vectors.json을 재생성할 것.

export interface KeywordCategory {
  key: string;
  label: string;
  items: string[];
}

export const KEYWORD_CATALOG: KeywordCategory[] = [
  {
    key: "sports",
    label: "운동·액티비티",
    items: ["헬스", "홈트", "러닝", "등산", "클라이밍", "요가", "필라테스", "자전거", "수영", "서핑", "골프", "테니스", "배드민턴", "풋살", "야구", "볼링", "복싱", "크로스핏", "스키보드", "스쿠버다이빙"],
  },
  {
    key: "travel",
    label: "여행·아웃도어",
    items: ["해외여행", "국내여행", "캠핑", "차박", "백패킹", "트레킹", "호캉스", "즉흥여행", "기차여행", "드라이브", "낚시"],
  },
  {
    key: "food",
    label: "음식·카페",
    items: ["맛집탐방", "요리", "베이킹", "카페투어", "브런치", "디저트", "오마카세", "매운맛", "야식", "비건", "미식", "세계음식"],
  },
  {
    key: "drink",
    label: "술",
    items: ["와인", "수제맥주", "위스키", "하이볼", "전통주", "혼술", "칵테일바", "포장마차"],
  },
  {
    key: "music",
    label: "음악·공연",
    items: ["힙합", "알앤비", "인디음악", "K팝", "시티팝", "발라드", "트로트", "재즈", "클래식", "록음악", "밴드음악", "EDM", "노래방", "버스킹", "페스티벌"],
  },
  {
    key: "screen",
    label: "영화·콘텐츠",
    items: ["영화", "독립영화", "드라마", "미드", "애니메이션", "웹툰", "다큐멘터리", "예능", "공포물", "넷플릭스", "유튜브"],
  },
  {
    key: "play",
    label: "게임·놀이",
    items: ["콘솔게임", "온라인게임", "보드게임", "방탈출", "스포츠관람", "덕질"],
  },
  {
    key: "culture",
    label: "문화·자기계발",
    items: ["독서", "전시관람", "뮤지컬", "공연관람", "사진", "글쓰기", "캘리그라피", "외국어공부", "팟캐스트", "재테크", "주식투자", "세미나", "자기계발", "악기연주"],
  },
  {
    key: "craft",
    label: "손재주·취미",
    items: ["드로잉", "공예", "뜨개질", "도예", "캔들만들기", "식물가꾸기", "인테리어", "향수"],
  },
  {
    key: "pet",
    label: "반려동물",
    items: ["강아지", "고양이", "반려동물"],
  },
  {
    key: "lifestyle",
    label: "라이프스타일 성향",
    items: ["집순이", "밖순이", "활동적", "아침형", "올빼미", "계획형", "즉흥형", "규칙적", "느긋함", "미니멀리즘", "부지런함", "도전적"],
  },
  {
    key: "personality",
    label: "성격·감성",
    items: ["내향적", "외향적", "유머러스", "감성적", "차분함", "사교적", "솔직함", "배려심", "긍정적"],
  },
  {
    key: "relationship",
    label: "연애·관계 가치관",
    items: ["진지한연애", "다정한표현", "대화중시", "잦은연락", "취미공유", "함께성장", "독립적관계", "안정지향", "자연스러운만남", "신뢰중시", "서로존중"],
  },
  {
    key: "values",
    label: "삶의 방향",
    items: ["자기관리", "워라밸", "가정적", "커리어지향", "여유로운삶", "미래계획", "봉사활동", "환경보호"],
  },
];

export const ALL_KEYWORDS: string[] = KEYWORD_CATALOG.flatMap((c) => c.items);
export const KEYWORD_SET: Set<string> = new Set(ALL_KEYWORDS);
export const MAX_KEYWORDS = 5;

// 입력을 고정 세트 안의 값으로만 정제(중복 제거, 최대 MAX_KEYWORDS개).
export function cleanKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = String(raw).trim();
    if (KEYWORD_SET.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
      if (out.length >= MAX_KEYWORDS) break;
    }
  }
  return out;
}
