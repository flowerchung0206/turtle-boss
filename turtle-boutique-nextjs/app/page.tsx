'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Category,
  PublicTurtle,
  fetchCategories,
  fetchPublicTurtles,
  recordTurtleView,
} from '../lib/supabaseClient';

type View = 'home' | 'collection' | 'detail';

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [turtles, setTurtles] = useState<PublicTurtle[]>([]);
  const [activeCat, setActiveCat] = useState<string>('全部分類');
  const [activeTurtle, setActiveTurtle] = useState<PublicTurtle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cats, pieces] = await Promise.all([fetchCategories(), fetchPublicTurtles()]);
      setCategories(cats);
      setTurtles(pieces);
      setLoading(false);
    })();
  }, []);

  const catNameById = useMemo(() => {
    const m = new Map<number, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const chips = ['全部分類', ...categories.map((c) => c.name)];

  const filtered = turtles.filter(
    (p) => activeCat === '全部分類' || p.category_name === activeCat || catNameById.get(p.category_id ?? -1) === activeCat
  );

  function goCollection(cat: string) {
    setActiveCat(cat);
    setView('collection');
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }

  function goHome(anchor?: string) {
    setView('home');
    setDrawerOpen(false);
    if (anchor) {
      requestAnimationFrame(() =>
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
      );
    } else {
      window.scrollTo(0, 0);
    }
  }

  async function openDetail(p: PublicTurtle) {
    setActiveTurtle(p);
    setView('detail');
    window.scrollTo(0, 0);
    recordTurtleView(p.id);
  }

  return (
    <>
      {showSplash && (
        <div className="splash" aria-hidden="true">
          <img src="/logo.png" alt="" />
          <div className="mk">頑龜爬蟲 STReptile</div>
        </div>
      )}

      <nav>
        <div className="navrow">
          <button className="hamburger" aria-label="開啟選單" onClick={() => setDrawerOpen(true)}>
            <span></span><span></span><span></span>
          </button>
          <button className="brandwrap" aria-label="回首頁" onClick={() => goHome()}>
            <img src="/logo.png" alt="頑龜爬蟲 STReptile" />
            <span className="brandname">
              <span className="zh">頑龜爬蟲</span>
              <span className="en">STReptile</span>
            </span>
          </button>
          <div className="navicons">
            <span>♡ 收藏</span>
            <span>購物車 0</span>
          </div>
        </div>
      </nav>

      <div className={`overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <button className="close" aria-label="關閉選單" onClick={() => setDrawerOpen(false)}>✕</button>
        <button className="link" onClick={() => goCollection('全部分類')}>全部館藏</button>
        <button className="link" onClick={() => goHome('story')}>品牌故事</button>
        <button className="link" onClick={() => goHome('contact')}>聯繫我們</button>
        <button className="link">我的收藏</button>
        <button className="link">購物袋</button>
      </div>

      {view === 'home' && (
        <main>
          <div className="hero-cover">
            <section className="hero">
              <p className="kicker">2026 新品系列</p>
              <h1>用心挑一隻，<br />養出一份<span className="pop">默契</span>。</h1>
              <p className="sub">
                頑龜爬蟲 STReptile，專營鑽紋龜與各式爬寵。每一隻的來源、花紋與狀態都清楚記錄，陪你找到真正對眼的那一隻。
              </p>
              <button className="btn-gold" onClick={() => goCollection('全部分類')}>逛逛館藏 →</button>
            </section>
          </div>

          <section className="intro">
            <div className="intro-grid">
              <div><h2>關於花紋</h2></div>
              <div className="body">
                從小花到鑽圖、從華麗到地圖，命名源自每一隻甲殼上獨有的紋理。我們記錄來源、個性與飼養狀態，挑選前歡迎詳細詢問，交到你手上後也持續提供照護建議。
              </div>
            </div>
          </section>

          <section className="story" id="story">
            <div className="story-inner">
              <blockquote>「玩，可以隨興；<span className="pop">顧</span>，我們很講究。」</blockquote>
              <p className="by">— 頑龜爬蟲 STReptile</p>
            </div>
          </section>

          <div className="browseall">
            <button className="btn-gold" onClick={() => goCollection('全部分類')}>瀏覽全部館藏 →</button>
          </div>
        </main>
      )}

      {view === 'collection' && (
        <main>
          <section className="section">
            <div className="section-head">
              <h2>館藏系列</h2>
              <span className="count">{loading ? '載入中…' : `${filtered.length} 件個體`}</span>
            </div>
            <div className="chips">
              {chips.map((c) => (
                <button
                  key={c}
                  className={`chip ${activeCat === c ? 'active' : ''}`}
                  onClick={() => setActiveCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid">
              {!loading && filtered.length === 0 && (
                <p className="empty-state" style={{ gridColumn: '1/-1' }}>目前這個分類還沒有上架的個體，之後會陸續更新。</p>
              )}
              {filtered.map((p) => (
                <button className="piece" key={p.id} onClick={() => openDetail(p)}>
                  <div
                    className="ph"
                    style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined}
                  />
                  <div className="cap">
                    <div className="code">{p.code}</div>
                    <div className="name">{p.name}</div>
                    <div className="price">{p.price != null ? `$${Number(p.price).toLocaleString()}` : '洽詢'}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>
      )}

      {view === 'detail' && activeTurtle && (
        <main>
          <div className="detail">
            <button className="back" onClick={() => setView('collection')}>← 返回館藏</button>
            <div
              className="photo"
              style={activeTurtle.cover_url ? { backgroundImage: `url(${activeTurtle.cover_url})` } : undefined}
            />
            <div className="code">{activeTurtle.code}</div>
            <h1>{activeTurtle.name}</h1>
            <div className="price">{activeTurtle.price != null ? `$${Number(activeTurtle.price).toLocaleString()}` : '洽詢'}</div>
            <div className="meta">
              {activeTurtle.breed && <div><b>品種：</b>{activeTurtle.breed}</div>}
              {activeTurtle.sex && <div><b>性別：</b>{activeTurtle.sex}</div>}
              {activeTurtle.age_months != null && <div><b>年齡：</b>{activeTurtle.age_months} 個月</div>}
              {activeTurtle.weight_g != null && <div><b>體重：</b>{activeTurtle.weight_g} g</div>}
              {activeTurtle.source && <div><b>來源：</b>{activeTurtle.source}</div>}
              {activeTurtle.pattern && <div><b>花紋：</b>{activeTurtle.pattern}</div>}
              {activeTurtle.personality && <div><b>個性：</b>{activeTurtle.personality}</div>}
              {activeTurtle.husbandry_status && <div><b>飼養狀態：</b>{activeTurtle.husbandry_status}</div>}
            </div>
            {activeTurtle.note && <p className="note">{activeTurtle.note}</p>}
            <a className="line-btn" href="https://lin.ee/qKJGC3WS" target="_blank" rel="noopener" style={{ marginTop: 24 }}>
              加 LINE 詢問這隻
            </a>
          </div>
        </main>
      )}

      <footer id="contact">
        <div className="foot-inner">
          <div className="foot-brand">
            <img src="/logo.png" alt="頑龜爬蟲 STReptile" />
            <div>
              <div className="foot-mark">頑龜爬蟲</div>
              <div className="foot-en display">STReptile</div>
              <p className="foot-sub">專營鑽紋龜與各式爬蟲寵物，提供完整來源與飼養紀錄。如對館藏有興趣，歡迎透過官方 LINE 與我們洽詢。</p>
            </div>
          </div>
          <a className="line-btn" href="https://lin.ee/qKJGC3WS" target="_blank" rel="noopener">加 LINE 聊聊</a>
        </div>
        <p className="fine">© 2026 頑龜爬蟲 STReptile。頁面展示內容為實際個體，實際狀態以現場為準。</p>
      </footer>
    </>
  );
}
