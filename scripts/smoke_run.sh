#!/bin/bash
# 서버 시작 → 스모크 테스트 → 종료 (단일 세션에서 수행)
cd "$(dirname "$0")/.." || exit 1
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
export SUPABASE_SERVICE_ROLE_KEY=dummy
export PORT=3111

npx next start > /tmp/next-smoke.log 2>&1 &
SRV=$!
sleep 5

echo "== GET / =="
curl -s -o /tmp/root.html -w "root HTTP %{http_code}\n" "http://localhost:3111/"
grep -c "인연" /tmp/root.html || true

echo "== GET /api/me (no token) =="
curl -s -w "\nme HTTP %{http_code}\n" "http://localhost:3111/api/me"

echo "== POST /api/auth/login (dummy supabase) =="
curl -s -w "\nlogin HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"name":"test","pin":"123456"}' "http://localhost:3111/api/auth/login"

echo "== GET /home (prerendered) =="
curl -s -o /dev/null -w "home HTTP %{http_code}\n" "http://localhost:3111/home"

echo "== GET /api/photos/upload-url (no token) =="
curl -s -w "\nupload HTTP %{http_code}\n" "http://localhost:3111/api/photos/upload-url"

kill "$SRV" 2>/dev/null || true
sleep 1
echo "=== server log tail ==="
tail -6 /tmp/next-smoke.log
