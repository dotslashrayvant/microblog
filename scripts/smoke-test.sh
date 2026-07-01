#!/usr/bin/env bash
#
# Smoke test for the posts + users/me endpoints.
#
# Usage:
#   1. Start the server:  bun run dev
#      (if port 3000 is taken: BUN_PORT=3737 bun run dev)
#   2. Run this script:   ./scripts/smoke-test.sh [BASE_URL]
#
#   BASE_URL defaults to http://localhost:3000; pass an arg or set BASE_URL
#   to point elsewhere, e.g. ./scripts/smoke-test.sh http://localhost:3737
#
# Requires: curl, jq. Creates throwaway users/posts (unique per run).

set -uo pipefail

BASE="${1:-${BASE_URL:-http://localhost:3000}}"

# --- deps ---
MISSING=0
for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing required tool: $tool"; MISSING=1; }
done
[[ "$MISSING" == 1 ]] && { echo "install jq with: brew install jq"; exit 1; }

# --- colors (only when writing to a terminal) ---
if [[ -t 1 ]]; then G=$'\033[32m'; R=$'\033[31m'; DIM=$'\033[2m'; Z=$'\033[0m'; else G= R= DIM= Z=; fi

PASS=0
FAIL=0
CODE=""
BODY=""

# http METHOD PATH [JAR|none] [JSON_BODY]  -> sets globals CODE, BODY
http() {
  local method="$1" path="$2" jar="${3:-none}" body="${4:-}"
  local args=(-s -w $'\n%{http_code}' -X "$method" "$BASE$path")
  [[ "$jar" != "none" ]] && args+=(-b "$jar" -c "$jar")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-raw "$body")
  local out; out="$(curl "${args[@]}")"
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

json() { printf '%s' "$BODY" | jq -r "$1" 2>/dev/null; }

# expect_code NAME WANT_CODE
expect_code() {
  if [[ "$CODE" == "$2" ]]; then
    PASS=$((PASS + 1)); printf '  %s✓%s %s %s(%s)%s\n' "$G" "$Z" "$1" "$DIM" "$CODE" "$Z"
  else
    FAIL=$((FAIL + 1)); printf '  %s✗%s %s (want %s, got %s)\n     %s%s%s\n' "$R" "$Z" "$1" "$2" "$CODE" "$DIM" "$BODY" "$Z"
  fi
}

# expect_json NAME JQ_FILTER WANT
expect_json() {
  local got; got="$(json "$2")"
  if [[ "$got" == "$3" ]]; then
    PASS=$((PASS + 1)); printf '  %s✓%s %s\n' "$G" "$Z" "$1"
  else
    FAIL=$((FAIL + 1)); printf '  %s✗%s %s (want %s, got %s)\n' "$R" "$Z" "$1" "$3" "$got"
  fi
}

# --- cookie jars ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
JAR_A="$TMP/a.txt"; JAR_B="$TMP/b.txt"; touch "$JAR_A" "$JAR_B"

# --- preflight ---
http GET /health none
if [[ "$CODE" != "200" ]]; then
  echo "server not reachable at $BASE (GET /health -> ${CODE:-no response})"
  echo "start it first:  bun run dev   (then re-run, passing the URL if not :3000)"
  exit 1
fi
echo "testing against $BASE"

TS="$(date +%s)"
EMAIL_A="a_${TS}@example.com"; USER_A="alice_${TS}"
EMAIL_B="b_${TS}@example.com"; USER_B="bob_${TS}"
if command -v uuidgen >/dev/null 2>&1; then
  BAD_ID="$(uuidgen | tr 'A-Z' 'a-z')"
else
  BAD_ID="00000000-0000-4000-8000-000000000000"
fi
LONG="$(printf 'x%.0s' {1..281})"

echo; echo "# auth / users/me"
http POST /auth/register "$JAR_A" "{\"email\":\"$EMAIL_A\",\"password\":\"password123\",\"username\":\"$USER_A\",\"displayName\":\"Alice\"}"
expect_code "register A -> 201" 201
http GET /users/me "$JAR_A"
expect_code "GET /users/me -> 200" 200
expect_json "  me includes email" '.user.email' "$EMAIL_A"
AID="$(json '.user.id')"
http GET /users/me none
expect_code "GET /users/me no cookie -> 401" 401
http GET /auth/me "$JAR_A"
expect_code "GET /auth/me removed -> 404" 404

echo; echo "# create / read posts"
http POST /posts "$JAR_A" '{"content":"first post"}'
expect_code "POST /posts -> 201" 201
expect_json "  embeds author username" '.post.username' "$USER_A"
expect_json "  authorId matches" '.post.authorId' "$AID"
expect_json "  top-level parentId null" '.post.parentId' 'null'
P1="$(json '.post.id')"
http POST /posts "$JAR_A" '{"content":"second post"}'
expect_code "POST /posts (2nd) -> 201" 201
P2="$(json '.post.id')"
http GET "/posts/$P1" none
expect_code "GET /posts/:id public -> 200" 200
expect_json "  returns content" '.post.content' 'first post'

echo; echo "# replies"
http POST "/posts/$P1/reply" "$JAR_A" '{"content":"a reply"}'
expect_code "POST /posts/:id/reply -> 201" 201
expect_json "  reply parentId = P1" '.post.parentId' "$P1"
R="$(json '.post.id')"
http POST /posts "$JAR_A" "{\"content\":\"child via parentId\",\"parentId\":\"$P1\"}"
expect_code "POST /posts with parentId -> 201" 201
C="$(json '.post.id')"
http POST /posts "$JAR_A" "{\"content\":\"orphan\",\"parentId\":\"$BAD_ID\"}"
expect_code "POST /posts bad parentId -> 404" 404

echo; echo "# validation / auth guards"
http POST /posts none '{"content":"nope"}'
expect_code "POST /posts no cookie -> 401" 401
http POST /posts "$JAR_A" '{"content":""}'
expect_code "POST /posts empty content -> 400" 400
http POST /posts "$JAR_A" "{\"content\":\"$LONG\"}"
expect_code "POST /posts >280 chars -> 400" 400

echo; echo "# edit / ownership"
http PATCH "/posts/$P1" "$JAR_A" '{"content":"edited first"}'
expect_code "PATCH own post -> 200" 200
expect_json "  content updated" '.post.content' 'edited first'
http POST /auth/register "$JAR_B" "{\"email\":\"$EMAIL_B\",\"password\":\"password123\",\"username\":\"$USER_B\",\"displayName\":\"Bob\"}"
expect_code "register B -> 201" 201
http GET /users/me "$JAR_B"
BID="$(json '.user.id')"
http PATCH "/posts/$P1" "$JAR_B" '{"content":"hijack"}'
expect_code "PATCH other's post -> 403" 403
http DELETE "/posts/$P1" "$JAR_B"
expect_code "DELETE other's post -> 403" 403
http PATCH "/posts/$BAD_ID" "$JAR_A" '{"content":"x"}'
expect_code "PATCH unknown post -> 404" 404

echo; echo "# user post lists"
http GET "/users/$AID/posts" none
expect_code "GET /users/:id/posts -> 200" 200
expect_json "  A has 4 posts" '.posts | length' '4'
expect_json "  newest-first order" '[.posts[].createdAt] == ([.posts[].createdAt] | sort | reverse)' 'true'
http GET "/users/$AID/posts?limit=2" none
expect_json "  ?limit=2 returns 2" '.posts | length' '2'
http GET "/users/$AID/posts?offset=100" none
expect_json "  ?offset=100 returns 0" '.posts | length' '0'
http GET "/users/by/username/$USER_A/posts" none
expect_code "GET /users/by/username/:username/posts -> 200" 200
expect_json "  by-username has 4" '.posts | length' '4'
http GET "/users/$BAD_ID/posts" none
expect_code "posts for unknown user id -> 404" 404
http GET "/users/by/username/ghost_${TS}/posts" none
expect_code "posts for unknown username -> 404" 404

echo; echo "# likes"
http POST "/posts/$P2/like" "$JAR_B"
expect_code "POST /posts/:id/like -> 200" 200
http POST "/posts/$P2/like" "$JAR_B"
expect_code "  like again idempotent -> 200" 200
http GET "/posts/$P2/liking_users" none
expect_code "GET /posts/:id/liking_users -> 200" 200
expect_json "  exactly 1 liker (idempotent)" '.users | length' '1'
expect_json "  liker username = B" '.users[0].username' "$USER_B"
expect_json "  liker embeds displayName" '.users[0].displayName' 'Bob'
http GET "/users/$BID/liked_posts" none
expect_code "GET /users/:id/liked_posts -> 200" 200
expect_json "  B liked 1 post" '.posts | length' '1'
expect_json "  liked post is P2" '.posts[0].id' "$P2"
http GET "/users/by/username/$USER_B/liked_posts" none
expect_code "GET /users/by/username/:username/liked_posts -> 200" 200
expect_json "  by-username liked 1" '.posts | length' '1'
http POST "/posts/$P2/like" none
expect_code "like no cookie -> 401" 401
http POST "/posts/$BAD_ID/like" "$JAR_B"
expect_code "like unknown post -> 404" 404
http GET "/posts/$BAD_ID/liking_users" none
expect_code "liking_users unknown post -> 404" 404
http DELETE "/posts/$P2/like" "$JAR_B"
expect_code "DELETE /posts/:id/like -> 200" 200
http DELETE "/posts/$P2/like" "$JAR_B"
expect_code "  unlike again idempotent -> 200" 200
http GET "/posts/$P2/liking_users" none
expect_json "  no likers after unlike" '.users | length' '0'
http GET "/users/$BID/liked_posts" none
expect_json "  liked_posts empty after unlike" '.posts | length' '0'

echo; echo "# reposts"
http POST "/posts/$P2/repost" "$JAR_B"
expect_code "POST /posts/:id/repost -> 200" 200
http POST "/posts/$P2/repost" "$JAR_B"
expect_code "  repost again idempotent -> 200" 200
http DELETE "/posts/$P2/repost" "$JAR_B"
expect_code "DELETE /posts/:id/repost -> 200" 200
http DELETE "/posts/$P2/repost" "$JAR_B"
expect_code "  un-repost again idempotent -> 200" 200
http POST "/posts/$BAD_ID/repost" "$JAR_B"
expect_code "repost unknown post -> 404" 404
http POST "/posts/$P2/repost" none
expect_code "repost no cookie -> 401" 401

echo; echo "# delete + cascade"
# B likes P1 first, so we can confirm the like is cascade-removed with the post.
http POST "/posts/$P1/like" "$JAR_B"
expect_code "B likes P1 -> 200" 200
http DELETE "/posts/$P1" "$JAR_A"
expect_code "DELETE own post -> 200" 200
http GET "/posts/$P1" none
expect_code "GET deleted post -> 404" 404
http GET "/posts/$R" none
expect_code "reply cascade-deleted -> 404" 404
http GET "/posts/$C" none
expect_code "child cascade-deleted -> 404" 404
http GET "/posts/$P2" none
expect_code "unrelated post survives -> 200" 200
http GET "/users/$BID/liked_posts" none
expect_json "  like cascade-removed with post" '.posts | length' '0'

echo
echo "==== ${PASS} passed, ${FAIL} failed ===="
[[ "$FAIL" -eq 0 ]]
