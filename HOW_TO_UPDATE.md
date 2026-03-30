# 台本データ更新手順

## 通常の更新（.docxを差し替えた場合）

1. `構成台本/` フォルダの `.docx` ファイルを最新版に置き換える
2. `ScriptReader/update.command` をダブルクリック
3. 「完了！」と表示されたら Enterキーで閉じる
4. 1〜2分後にWebアプリに反映される

---

## 初回セットアップ（初めて使うMacの場合）

### 1. 設定ファイルを作成する

```bash
cd ScriptReader/
cp config.local.sh.example config.local.sh
```

### 2. GitHub PAT（トークン）を取得する

1. GitHub にログイン（naohoro アカウント）
2. 右上アイコン → Settings → Developer settings
3. Personal access tokens → Tokens (classic)
4. Generate new token (classic)
5. Note: 任意の名前（例: JWWA2026）
6. Expiration: 任意（イベント後まで有効な日付を設定）
7. Scope: `repo` にチェック
8. Generate token → 表示されたトークン（`ghp_...`）をコピー

### 3. トークンを設定ファイルに貼り付ける

`config.local.sh` をテキストエディタで開き、以下の行を編集：

```
GITHUB_PAT="ghp_ここに貼り付け"
```

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `config.local.sh が見つかりません` | 上記セットアップ手順を実行する |
| `GitHub PAT が設定されていません` | config.local.sh を開いてトークンを確認する |
| `送信に失敗しました` | PATの有効期限切れ → GitHubで再発行してconfig.local.shを更新 |
| 台本に変更はありませんでした | .docxファイルが実際に上書き保存されているか確認 |
| Webアプリに反映されない | Netlifyの管理画面でdeployのステータスを確認 |
