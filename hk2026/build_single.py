#!/usr/bin/env python3
"""
build_single.py
index.html / css / js / data を1枚のHTMLに束ねる（完全オフライン版）

会場のWi-Fiが不安定でも確実に開けるよう、当日はこのファイルを
スマホ・iPadに保存して使う。

使用方法: python3 build_single.py
出力: ../MC台本リーダー_香港2026_オフライン.html
"""
from pathlib import Path

HERE = Path(__file__).parent
OUT  = HERE.parent / "MC台本リーダー_香港2026_オフライン.html"


def main():
    html = (HERE / "index.html").read_text(encoding="utf-8")
    css  = (HERE / "css" / "style.css").read_text(encoding="utf-8")
    data = (HERE / "data" / "hk2026.js").read_text(encoding="utf-8")
    app  = (HERE / "js" / "app.js").read_text(encoding="utf-8")

    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace(
        '<script src="data/hk2026.js"></script>\n<script src="js/app.js"></script>',
        f"<script>\n{data}\n</script>\n<script>\n{app}\n</script>",
    )

    if "css/style.css" in html or 'src="js/app.js"' in html:
        raise SystemExit("[ERROR] インライン化に失敗しました（index.html の記述を確認）")

    OUT.write_text(html, encoding="utf-8")
    print(f"OK → {OUT}  ({len(html.encode('utf-8')) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
