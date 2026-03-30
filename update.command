#!/bin/bash
# =============================================
# update.command
# JWWA 2026 MC Script Reader — 台本データ更新スクリプト
# ダブルクリックで実行できます
# =============================================

# スクリプトが置かれているフォルダに移動
cd "$(dirname "$0")"

echo "========================================"
echo "  JWWA 2026 台本データ更新"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# ── 設定ファイルの確認 ──
if [ ! -f "config.local.sh" ]; then
  echo "[ERROR] config.local.sh が見つかりません。"
  echo ""
  echo "  cp config.local.sh.example config.local.sh"
  echo ""
  echo "  上記を実行してから、config.local.sh を開いて"
  echo "  GITHUB_PAT にトークンを貼り付けてください。"
  echo ""
  read -p "Enterキーで閉じます..."
  exit 1
fi

source config.local.sh

if [[ "$GITHUB_PAT" == "ghp_ここにトークンを貼り付ける" ]] || [ -z "$GITHUB_PAT" ]; then
  echo "[ERROR] config.local.sh に GitHub PAT が設定されていません。"
  echo "  config.local.sh を開いて GITHUB_PAT を設定してください。"
  echo ""
  read -p "Enterキーで閉じます..."
  exit 1
fi

# ── STEP 1: DOCXを読み込んでJSONを生成 ──
echo "[1/3] 台本ファイルを読み込み中..."
python3 parse_scripts.py
if [ $? -ne 0 ]; then
  echo ""
  echo "[ERROR] 台本ファイルの変換に失敗しました。"
  echo "  .docxファイルが所定の場所にあるか確認してください。"
  echo ""
  read -p "Enterキーで閉じます..."
  exit 1
fi

# ── STEP 2: 変更があるか確認 ──
echo ""
echo "[2/3] 変更内容を確認中..."

git add data/

if git diff --cached --quiet; then
  echo ""
  echo "  台本に変更はありませんでした。"
  echo "  （.docxファイルの更新日時を確認してください）"
  echo ""
  read -p "Enterキーで閉じます..."
  exit 0
fi

# 変更サマリーを表示
echo ""
git diff --cached --stat
echo ""

COMMIT_MSG="Update script data $(date '+%Y-%m-%d %H:%M')"
git commit -m "$COMMIT_MSG"

# ── STEP 3: GitHubにpush ──
echo ""
echo "[3/3] GitHubに送信中..."

REMOTE_URL="https://${GITHUB_USER}:${GITHUB_PAT}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
git push "$REMOTE_URL" main

if [ $? -eq 0 ]; then
  echo ""
  echo "========================================"
  echo "  完了！"
  echo "  Netlifyへの反映まで 1〜2分 お待ちください。"
  echo "  $(date '+%H:%M:%S') に更新しました。"
  echo "========================================"
else
  echo ""
  echo "[ERROR] GitHubへの送信に失敗しました。"
  echo "  - インターネット接続を確認してください"
  echo "  - config.local.sh の GITHUB_PAT が有効か確認してください"
  echo "    （PATの有効期限が切れている場合は再発行が必要です）"
fi

echo ""
read -p "Enterキーで閉じます..."
