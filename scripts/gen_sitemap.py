#!/usr/bin/env python3
"""LP本体の sitemap.xml を作る。

  python3 scripts/gen_sitemap.py

かけこみ辞典（/wiki/）は自前の sitemap.xml を持っているので、ここには入れない。
robots.txt に2本とも並べてあるので、クローラは両方たどれる。

⚠️ Cloudflare Pages は `/apply.html` を `/apply` へ 307 で飛ばす。
   sitemap に .html 付きで書くとリダイレクト扱いになり、インデックスが1段遠くなる。
   なので拡張子は落として書く。
"""
import re, subprocess, sys
from pathlib import Path

SITE = "https://ai-kakekomi.com"
ROOT = Path(__file__).resolve().parent.parent

# 出さないもの。検索結果に出ても誰も得しない
SKIP = {"404.html", "blocked.html"}

def has_noindex(path):
    """noindex を書いてあるページは sitemap に載せない。

    載せると「インデックスするな」と「インデックスしろ」を同時に送ることになる。
    Search Console では「除外」として警告に出る。
    cfj/ 配下（サミット来場者向けデモ）が全部これ。
    """
    try:
        head = path.read_text(encoding="utf-8", errors="ignore")[:8000]
    except OSError:
        return False
    # 本文に「noindex」の文字があるだけで落とさないよう、metaタグだけ見る
    for m in re.finditer(r'<meta\s+[^>]*name=["\']robots["\'][^>]*>', head, re.I):
        if "noindex" in m.group(0).lower():
            return True
    return False

def is_verification(name):
    # Search Console の所有権確認ファイル（google….html）
    return name.startswith("google") and name.endswith(".html")

def lastmod(path):
    """そのファイルの最終コミット日。取れなければ空"""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(path.relative_to(ROOT))],
            cwd=ROOT, capture_output=True, text=True, timeout=10)
        return out.stdout.strip()
    except Exception:
        return ""

def url_for(path):
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return f"{SITE}/"
    if rel.endswith("/index.html"):
        return f"{SITE}/{rel[:-len('index.html')]}"
    return f"{SITE}/{rel[:-len('.html')]}"   # 拡張子は落とす

def main():
    pages = []
    # 直下
    for p in sorted(ROOT.glob("*.html")):
        if p.name in SKIP or is_verification(p.name) or has_noindex(p):
            continue
        pages.append(p)
    # apps/ と cfj/ は中まで潜る。apps/ の各ツールは submodule だが、
    # ツール側に sitemap は無いので LP がまとめて面倒を見る
    for d in ("apps", "cfj"):
        for p in sorted((ROOT / d).rglob("*.html")):
            if p.name in SKIP or "node_modules" in p.parts or has_noindex(p):
                continue
            pages.append(p)

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p in pages:
        loc = url_for(p)
        pri = "1.0" if loc == f"{SITE}/" else "0.7"
        m = lastmod(p)
        mod = f"<lastmod>{m}</lastmod>" if m else ""
        lines.append(f"  <url><loc>{loc}</loc>{mod}"
                     f"<changefreq>monthly</changefreq><priority>{pri}</priority></url>")
    lines.append("</urlset>")

    out = ROOT / "sitemap.xml"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out} : {len(pages)}件")
    for p in pages:
        print("  ", url_for(p))

if __name__ == "__main__":
    sys.exit(main())
