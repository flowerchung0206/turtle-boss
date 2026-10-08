'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Category,
  PublicTurtle,
  fetchCategories,
  fetchPublicTurtles,
  recordTurtleView,
  supabase,
} from '../lib/supabaseClient';

type View = 'home' | 'collection' | 'detail';

const FADE_MS = 260;

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [turtles, setTurtles] = useState<PublicTurtle[]>([]);
  const [activeCat, setActiveCat] = useState<string>('全部分類');
  const [activeTurtle, setActiveTurtle] = useState<PublicTurtle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [fading, setFading] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2100);
    return () => clearTimeout(t);
  }, []);

  // 線上人數：用 Supabase Realtime Presence，每個開著這個網站的分頁都會
  // 「報到」一次，channel 裡目前有幾個不重複的訪客，就是線上人數。
  useEffect(() => {
    const sessionKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const channel = supabase.channel('site-presence', {
      config: { presence: { key: sessionKey } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 切換畫面時先淡出、換內容、再淡入，不管是從側邊欄點進去還是頁面裡的按鈕。
  function withFade(run: () => void) {
    setFading(true);
    setTimeout(() => {
      run();
      requestAnimationFrame(() => setFading(false));
    }, FADE_MS);
  }

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

  // 精品網站常見的「滾動到才淡入」效果：段落、卡片進到畫面裡才輕輕浮現，
  // 不是一次把整頁丟給使用者。畫面切換、資料載入完成後都要重新掃一次。
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [view, fading, loading, filtered.length]);

  function goCollection(cat: string) {
    setDrawerOpen(false);
    withFade(() => {
      setActiveCat(cat);
      setView('collection');
      window.scrollTo(0, 0);
    });
  }

  function goHome(anchor?: string) {
    setDrawerOpen(false);
    withFade(() => {
      setView('home');
      if (anchor) {
        requestAnimationFrame(() =>
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
        );
      } else {
        window.scrollTo(0, 0);
      }
    });
  }

  async function openDetail(p: PublicTurtle) {
    withFade(() => {
      setActiveTurtle(p);
      setView('detail');
      window.scrollTo(0, 0);
    });
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
            <span className="live-dot" title="目前線上人數">⦿ {onlineCount} 人在線</span>
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
        <button className="link">購物車</button>
      </div>

      {view === 'home' && (
        <main className={`page-fade ${fading ? 'fade-out' : 'fade-in'}`}>
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

          <section className="intro reveal">
            <div className="intro-grid">
              <div><h2>關於花紋</h2></div>
              <div className="body">
                從好照顧的「新手入門款」開始，一路到「卡羅萊納鑽紋」「德州鑽紋」的經典紋路、「華麗鑽紋」的繁複花樣，再到「✨金光閃閃」「大麥町系列」「青花瓷系列」等特色花紋，以及只留給有緣人的「老闆珍藏」——每個分類都是依花紋特徵與稀有程度親自整理。我們記錄每一隻的來源、個性與飼養狀態，挑選前歡迎詳細詢問，交到你手上後也持續提供照護建議。
              </div>
            </div>
          </section>

          <section className="story reveal" id="story">
            <div className="story-inner">
              <blockquote>「玩，可以隨興；<span className="pop">顧</span>，我們很講究。」</blockquote>
              <p className="by">— 頑龜爬蟲 STReptile</p>
            </div>
          </section>

          <div className="browseall reveal">
            <button className="btn-gold" onClick={() => goCollection('全部分類')}>瀏覽全部館藏 →</button>
          </div>
        </main>
      )}

      {view === 'collection' && (
        <main className={`page-fade ${fading ? 'fade-out' : 'fade-in'}`}>
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
              {filtered.map((p, i) => (
                <button
                  className="piece reveal"
                  key={p.id}
                  style={{ transitionDelay: `${Math.min(i, 8) * 60}ms` }}
                  onClick={() => openDetail(p)}
                >
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
        <main className={`page-fade ${fading ? 'fade-out' : 'fade-in'}`}>
          <div className="detail">
            <button className="back" onClick={() => withFade(() => setView('collection'))}>← 返回館藏</button>
            <div
              className="photo reveal in"
              style={activeTurtle.cover_url ? { backgroundImage: `url(${activeTurtle.cover_url})` } : undefined}
            />
            <div className="code">{activeTurtle.code}</div>
            <h1>{activeTurtle.name}</h1>
            <div className="price">{activeTurtle.price != null ? `$${Number(activeTurtle.price).toLocaleString()}` : '洽詢'}</div>
            <div className="view-count">已有 {activeTurtle.view_count ?? 0} 次瀏覽</div>
            <div className="meta reveal in">
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
