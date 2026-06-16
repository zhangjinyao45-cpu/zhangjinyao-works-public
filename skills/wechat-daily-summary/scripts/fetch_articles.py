"""
公众号文章抓取 + 读后卡推送
通过 WeWe RSS 获取公众号文章，生成读后卡并推送到飞书群。
"""

import json
import time
import re
from datetime import datetime
from urllib.request import urlopen, Request

WEWE_RSS_URL = "http://localhost:4000"
# 飞书群ID
FEISHU_CHAT_ID = "oc_3a814b3e15aecb94717f56c3492d5fc1"
# 每个公众号取最新N篇
MAX_ARTICLES = 3


def fetch_url(url, max_chars=15000):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="ignore")[:max_chars]
    except Exception as e:
        print(f"[ERROR] fetch failed: {url} - {e}")
        return ""


def parse_rss(xml_text):
    """简单的RSS XML解析，提取文章信息"""
    articles = []
    # 提取item块
    items = re.findall(r"<item>(.*?)</item>", xml_text, re.DOTALL)
    for item in items:
        title = re.search(r"<title><!\[CDATA\[(.*?)\]\]></title>", item)
        link = re.search(r"<link>(.*?)</link>", item)
        pubdate = re.search(r"<pubDate>(.*?)</pubDate>", item)
        source = re.search(r"<source>(.*?)</source>", item)
        if title and link:
            articles.append({
                "title": title.group(1).strip(),
                "url": link.group(1).strip(),
                "pubdate": pubdate.group(1).strip() if pubdate else "",
                "source": source.group(1).strip() if source else "",
            })
    return articles


def get_articles_from_rss():
    """从 WeWe RSS 获取文章列表"""
    rss_url = f"{WEWE_RSS_URL}/feeds/all.rss"
    xml_text = fetch_url(rss_url, max_chars=50000)
    if not xml_text:
        return []
    return parse_rss(xml_text)


def main():
    print(f"[INFO] {datetime.now().isoformat()} - 开始抓取")
    articles = get_articles_from_rss()
    print(f"[INFO] 获取到 {len(articles)} 篇文章")
    for a in articles[:MAX_ARTICLES * 2]:
        print(f"  - {a['title']}")
    return articles


if __name__ == "__main__":
    main()
