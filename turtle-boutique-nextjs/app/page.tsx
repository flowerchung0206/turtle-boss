'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Category,
  PublicTurtle,
  fetchCategories,
  fetchPublicTurtle,
  fetchPublicTurtles,
  holdTurtlePublic,
  recordTurtleView,
  releaseTurtlePublic,
  supabase,
} from '../lib/supabaseClient';

type View = 'home' | 'collection' | 'detail';

type HomeSettings = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  ctaHint: string;
  coverUrl: string;
};

const DEFAULT_HOME: HomeSettings = {
  eyebrow: 'STReptile · REPTILE COLLECTION',
  title: '用心挑一隻，養出一份默契。',
  subtitle:
    '每一隻都是獨一無二的生命，從挑選、飼養到陪伴，找到真正適合你的那一隻。',
  cta: '探索館藏',
  ctaHint: '查看目前可預訂個體',
  coverUrl: '',
};

const FIXED_CATEGORIES = [
  '全部分類',
  '新手入門款',
  '卡羅萊納鑽紋',
  '華麗鑽紋',
  '德州鑽紋',
  '金光閃閃',
  '大麥町系列',
  '青花瓷系列',
  '老闆珍藏',
];

const CART_KEY = 'st_reptile_cart_v2';
const HOLDER_KEY = 'st_reptile_holder_v1';
const HOLD_MINUTES = 30;
const POLL_MS = 20000;
const LINE_URL = 'https://lin.ee/qKJGC3WS';

// 購物車保留用的「身分」：只是存在這台瀏覽器的一組亂碼，不是真實帳號，
// 單純用來讓資料庫知道「這個保留是誰按的」，才能判斷能不能續約、放開。
function getOrCreateHolderId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(HOLDER_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(HOLDER_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function cleanCategoryName(value?: string | null) {
  return (value ?? '').replace(/^✨\s*/, '').trim();
}

function money(value: number | null) {
  return value == null ? '洽詢' : `$${Number(value).toLocaleString('zh-TW')}`;
}

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartIds, setCartIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [turtles, setTurtles] = useState<PublicTurtle[]>([]);
  const [activeCat, setActiveCat] = useState('全部分類');
  const [activeTurtle, setActiveTurtle] = useState<PublicTurtle | null>(null);
  const [home, setHome] = useState<HomeSettings>(DEFAULT_HOME);
  const [loading, setLoading] = useState(true);
  const [homeLoading, setHomeLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(1);
  const [holderId] = useState(getOrCreateHolderId);
  const [deliveryMethod, setDeliveryMethod] = useState<'自取' | '宅配'>('自取');
  const [copyHint, setCopyHint] = useState(false);
  const [holdNotice, setHoldNotice] = useState<string | null>(null);
  const cartIdsRef = useRef<number[]>([]);

  useEffect(() => {
    cartIdsRef.current = cartIds;
  }, [cartIds]);

  useEffect(() => {
    if (!holdNotice) return;
    const t = setTimeout(() => setHoldNotice(null), 6000);
    return () => clearTimeout(t);
  }, [holdNotice]);

  // 購物車存在 localStorage，但「保留」這件事是資料庫說了算：重新整理頁面、
  // 回來繼續逛的時候，要先跟資料庫確認這些個體還保留得住（沒被別人搶走、
  // 保留也還沒過期），確認不了的就從購物車移除。
  useEffect(() => {
    if (!holderId) return;
    let saved: number[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(raw)) saved = raw.map(Number).filter(Number.isFinite);
    } catch {
      saved = [];
    }
    if (saved.length === 0) return;

    (async () => {
      const kept: number[] = [];
      for (const id of saved) {
        const ok = await holdTurtlePublic(id, holderId, HOLD_MINUTES);
        if (ok) kept.push(id);
      }
      setCartIds(kept);
      if (kept.length < saved.length) {
        setHoldNotice('購物車裡有個體的保留已經過期或被其他客人選走，已自動從清單移除。');
      }
    })();
  }, [holderId]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartIds));
  }, [cartIds]);

  // 每隔一段時間：重新整理館藏列表（讓「被保留中」的標示更新），
  // 同時幫自己購物車裡的個體續約保留時間，避免逛比較久就被釋放。
  useEffect(() => {
    if (!holderId) return;
    const t = setInterval(async () => {
      const fresh = await fetchPublicTurtles();
      setTurtles(fresh);

      const current = cartIdsRef.current;
      if (current.length === 0) return;

      const stillMine: number[] = [];
      for (const id of current) {
        const ok = await holdTurtlePublic(id, holderId, HOLD_MINUTES);
        if (ok) stillMine.push(id);
      }
      if (stillMine.length < current.length) {
        setCartIds(stillMine);
        setHoldNotice('有個體的保留時間到了、被其他客人選走了，已從購物車移除。');
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [holderId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [cats, pieces] = await Promise.all([
        fetchCategories(),
        fetchPublicTurtles(),
      ]);
      if (!cancelled) {
        setCategories(cats);
        setTurtles(pieces);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHome() {
      setHomeLoading(true);

      const [homepage, cover] = await Promise.all([
        supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'homepage')
          .maybeSingle(),
        supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'cover_image_url')
          .maybeSingle(),
      ]);

      let data: Partial<HomeSettings> = {};
      try {
        data = homepage.data?.value ? JSON.parse(homepage.data.value) : {};
      } catch {
        data = {};
      }

      const next: HomeSettings = {
        eyebrow: String(data.eyebrow || DEFAULT_HOME.eyebrow),
        title: String(data.title || DEFAULT_HOME.title),
        subtitle: String(data.subtitle || DEFAULT_HOME.subtitle),
        cta: String(data.cta || DEFAULT_HOME.cta),
        ctaHint: String(data.ctaHint || data.cta_hint || DEFAULT_HOME.ctaHint),
        coverUrl: String(
          data.coverUrl ||
            data.cover_url ||
            cover.data?.value ||
            DEFAULT_HOME.coverUrl
        ),
      };

      if (!cancelled) {
        setHome(next);
        setHomeLoading(false);
      }
    }

    loadHome();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const channel = supabase.channel('st-reptile-live', {
      config: { presence: { key } },
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

  const categoryMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((c) => map.set(c.id, cleanCategoryName(c.name)));
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    if (activeCat === '全部分類') return turtles;
    return turtles.filter((t) => {
      const name = cleanCategoryName(
        t.category_name || categoryMap.get(t.category_id ?? -1)
      );
      return name === activeCat;
    });
  }, [activeCat, categoryMap, turtles]);

  const cartItems = useMemo(
    () => cartIds.map((id) => turtles.find((t) => t.id === id)).filter(Boolean) as PublicTurtle[],
    [cartIds, turtles]
  );

  const cartTotal = cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

  function goHome(anchor?: string) {
    setDrawerOpen(false);
    setCartOpen(false);
    setView('home');

    requestAnimationFrame(() => {
      if (anchor) {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function goCollection(category = '全部分類') {
    setDrawerOpen(false);
    setCartOpen(false);
    setActiveCat(category);
    setView('collection');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openDetail(turtle: PublicTurtle) {
    setDrawerOpen(false);
    setCartOpen(false);

    const fresh = await fetchPublicTurtle(turtle.id);
    const detail = fresh || turtle;

    setActiveTurtle(detail);
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    await recordTurtleView(turtle.id);

    setTurtles((prev) =>
      prev.map((item) =>
        item.id === turtle.id
          ? { ...item, view_count: Number(item.view_count || 0) + 1 }
          : item
      )
    );
  }

  async function addToCart(turtle: PublicTurtle) {
    if (turtle.status !== '在架') return;
    if (cartIds.includes(turtle.id)) {
      setCartOpen(true);
      return;
    }

    const ok = await holdTurtlePublic(turtle.id, holderId, HOLD_MINUTES);
    if (!ok) {
      setHoldNotice(`${turtle.name} 剛好被其他客人保留中，晚點再回來看看，或先選別隻喔。`);
      const fresh = await fetchPublicTurtles();
      setTurtles(fresh);
      return;
    }

    setCartIds((prev) => (prev.includes(turtle.id) ? prev : [...prev, turtle.id]));
    setCartOpen(true);
  }

  async function removeFromCart(id: number) {
    setCartIds((prev) => prev.filter((item) => item !== id));
    await releaseTurtlePublic(id, holderId);
  }

  async function sendCartToLine() {
    if (cartItems.length === 0) return;
    const lines = [
      '您好，我想詢問／預訂以下個體：',
      ...cartItems.map((item) => `・${item.code} ${item.name}　${money(item.price)}`),
      '',
      `取貨方式：${deliveryMethod}`,
      `小計：$${cartTotal.toLocaleString('zh-TW')}${
        cartItems.some((item) => item.price == null) ? '（部分個體價格需另洽詢）' : ''
      }`,
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(true);
      setTimeout(() => setCopyHint(false), 5000);
    } catch {
      // 複製失敗（例如權限被擋）就略過提示，客人仍可自己在 LINE 打字
    }
    window.open(LINE_URL, '_blank', 'noopener');
  }

  return (
    <div className="site">
      {holdNotice && <div className="hold-toast">{holdNotice}</div>}

      <div className="topbar">
        <button className="brand" onClick={() => goHome()}>
          <img src="/logo.png" alt="頑龜爬蟲 STReptile" />
          <span>
            <b>頑龜爬蟲</b>
            <small>STReptile</small>
          </span>
        </button>

        <div className="live">
          <i />
          現在有 <strong>{onlineCount}</strong> 人在線
        </div>

        <div className="top-actions">
          <button onClick={() => setDrawerOpen(true)}>選單</button>
          <button onClick={() => setCartOpen(true)}>
            購物車 <em>{cartIds.length}</em>
          </button>
        </div>
      </div>

      <div className="mainnav">
        <button onClick={() => goHome()}>首頁</button>
        <button onClick={() => goCollection()}>全部館藏</button>
        <button onClick={() => goHome('story')}>品牌故事</button>
        <button onClick={() => goHome('contact')}>聯繫我們</button>
        <button className="nav-cart" onClick={() => setCartOpen(true)}>
          購物車（{cartIds.length}）
        </button>
      </div>

      <div
        className={`overlay ${drawerOpen || cartOpen ? 'show' : ''}`}
        onClick={() => {
          setDrawerOpen(false);
          setCartOpen(false);
        }}
      />

      <aside className={`side-panel ${drawerOpen ? 'show' : ''}`}>
        <div className="side-head">
          <span>選單</span>
          <button onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <button onClick={() => goHome()}>首頁</button>
        <button onClick={() => goCollection()}>全部館藏</button>
        <button onClick={() => goHome('story')}>品牌故事</button>
        <button onClick={() => goHome('contact')}>聯繫我們</button>
        <button onClick={() => { setDrawerOpen(false); setCartOpen(true); }}>購物車（{cartIds.length}）</button>
      </aside>

      <aside className={`side-panel cart-panel ${cartOpen ? 'show' : ''}`}>
        <div className="side-head">
          <span>購物車</span>
          <button onClick={() => setCartOpen(false)}>×</button>
        </div>

        {cartItems.length === 0 ? (
          <div className="cart-empty">
            <span>○</span>
            <p>目前還沒有選擇個體</p>
            <button className="dark-btn" onClick={() => goCollection()}>
              瀏覽館藏
            </button>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cartItems.map((item) => (
                <div className="cart-item" key={item.id}>
                  <div
                    className="cart-thumb"
                    style={
                      item.cover_url
                        ? { backgroundImage: `url("${item.cover_url}")` }
                        : undefined
                    }
                  />
                  <div className="cart-info">
                    <small>{item.code}</small>
                    <b>{item.name}</b>
                    <span>{money(item.price)}</span>
                  </div>
                  <button onClick={() => removeFromCart(item.id)}>移除</button>
                </div>
              ))}
            </div>

            <div className="delivery-choice">
              <span className="delivery-label">取貨方式</span>
              <div className="delivery-pills">
                <button
                  className={deliveryMethod === '自取' ? 'active' : ''}
                  onClick={() => setDeliveryMethod('自取')}
                >
                  自取
                </button>
                <button
                  className={deliveryMethod === '宅配' ? 'active' : ''}
                  onClick={() => setDeliveryMethod('宅配')}
                >
                  宅配
                </button>
              </div>
              {deliveryMethod === '宅配' && (
                <p className="delivery-hint">運費依地區另計，實際金額以 LINE 對話確認為準。</p>
              )}
            </div>

            <div className="cart-total">
              <span>小計</span>
              <strong>
                ${cartTotal.toLocaleString('zh-TW')}
                {cartItems.some((item) => item.price == null) && (
                  <small className="unpriced-note">（含待洽詢個體）</small>
                )}
              </strong>
            </div>

            <button className="dark-btn full" onClick={sendCartToLine}>
              加 LINE 送出清單 →
            </button>
            {copyHint && <p className="copy-hint">清單已複製，貼到 LINE 對話框送出即可。</p>}
            <p className="cart-hold-note">保留時間 {HOLD_MINUTES} 分鐘，逛越久自動幫你續約。</p>
          </>
        )}
      </aside>

      {view === 'home' && (
        <main>
          <section
            className="hero"
            style={
              home.coverUrl
                ? { backgroundImage: `url("${home.coverUrl}")` }
                : undefined
            }
          >
            <div className="hero-shade" />
            <div className="hero-content">
              <p className="eyebrow">{home.eyebrow}</p>
              <h1>{home.title}</h1>
              <p>{home.subtitle}</p>
              <button className="gold-btn" onClick={() => goCollection()}>
                {home.cta} <span>→</span>
              </button>
              <small>{home.ctaHint}</small>
            </div>
          </section>

          <section className="intro">
            <div className="intro-title">
              <span>01</span>
              <h2>關於花紋</h2>
            </div>
            <div className="intro-copy">
              <p>
                從好照顧的「新手入門款」開始，一路到卡羅萊納鑽紋、
                德州鑽紋、華麗鑽紋，再到金光閃閃、大麥町系列、
                青花瓷系列，以及只留給有緣人的老闆珍藏。
              </p>
              <p>
                每一隻都有自己的花紋、狀態與故事。我們希望讓你在
                找到喜歡的個體之前，先看見牠真正的樣子。
              </p>
            </div>
          </section>

          <section className="story" id="story">
            <div>
              <span>STReptile</span>
              <h2>玩，可以隨興；<i>顧</i>，我們很講究。</h2>
              <p>
                用心整理每一隻個體的資料，讓喜歡爬蟲的人，可以更安心地找到適合自己的夥伴。
              </p>
            </div>
          </section>

          <section className="home-collection">
            <div className="section-title">
              <div>
                <span>COLLECTION</span>
                <h2>目前館藏</h2>
              </div>
              <button onClick={() => goCollection()}>查看全部 →</button>
            </div>

            {loading ? (
              <div className="loading">正在整理館藏……</div>
            ) : (
              <div className="mini-grid">
                {turtles.slice(0, 4).map((turtle) => (
                  <button className="mini-card" key={turtle.id} onClick={() => openDetail(turtle)}>
                    <div
                      className="card-photo"
                      style={
                        turtle.cover_url
                          ? { backgroundImage: `url("${turtle.cover_url}")` }
                          : undefined
                      }
                    >
                      {!turtle.cover_url && <span>尚未上傳照片</span>}
                    </div>
                    <div className="card-meta">
                      <small>{turtle.code}</small>
                      <b>{turtle.name}</b>
                      <span>{money(turtle.price)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {view === 'collection' && (
        <main className="collection-page">
          <section className="collection-head">
            <span>REPTILE COLLECTION</span>
            <h1>館藏個體</h1>
            <p>每一隻都只有一隻。喜歡的個體，可以直接加入購物車。</p>
          </section>

          <section className="collection-section">
            <div className="category-frame">
              <div className="category-label">分類</div>
              <div className="chips">
                {FIXED_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    className={activeCat === category ? 'active' : ''}
                    onClick={() => setActiveCat(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="collection-result">
              <span>{loading ? '載入中…' : `${filtered.length} 件個體`}</span>
            </div>

            {loading ? (
              <div className="loading">正在載入館藏……</div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <span>○</span>
                <h3>目前沒有上架個體</h3>
                <p>這個分類之後有新增個體時，會在這裡出現。</p>
              </div>
            ) : (
              <div className="turtle-grid">
                {filtered.map((turtle) => {
                  const inCart = cartIds.includes(turtle.id);
                  const lockedByOther = Boolean(turtle.is_held) && !inCart;

                  return (
                    <article className="turtle-card" key={turtle.id}>
                      <button className="photo-button" onClick={() => openDetail(turtle)}>
                        <div
                          className="turtle-photo"
                          style={
                            turtle.cover_url
                              ? { backgroundImage: `url("${turtle.cover_url}")` }
                              : undefined
                          }
                        >
                          {!turtle.cover_url && <span>尚未上傳照片</span>}
                          <div className="photo-status">
                            {turtle.status === '預定中' ? '預定中' : '在架'}
                          </div>
                        </div>
                      </button>

                      <div className="turtle-card-body">
                        <small>{turtle.code}</small>
                        <h2>{turtle.name}</h2>
                        <div className="card-bottom">
                          <strong>{money(turtle.price)}</strong>
                          <span>{turtle.view_count || 0} 次瀏覽</span>
                        </div>
                        <button
                          className={`cart-add ${inCart ? 'added' : ''} ${lockedByOther ? 'locked' : ''}`}
                          onClick={() => addToCart(turtle)}
                          disabled={lockedByOther}
                        >
                          {inCart ? '已在購物車' : lockedByOther ? '其他客人保留中' : '＋ 加入購物車'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {view === 'detail' && activeTurtle && (
        <main className="detail-page">
          <button className="back-button" onClick={() => setView('collection')}>
            ← 返回館藏
          </button>

          <section className="detail-hero">
            <div
              className="detail-main-photo"
              style={
                (activeTurtle.cover_url || activeTurtle.photos?.[0])
                  ? {
                      backgroundImage: `url("${
                        activeTurtle.cover_url || activeTurtle.photos?.[0]
                      }")`,
                    }
                  : undefined
              }
            >
              {!activeTurtle.cover_url && !activeTurtle.photos?.length && (
                <span>尚未上傳照片</span>
              )}
            </div>

            <div className="detail-info">
              <span className="detail-code">{activeTurtle.code}</span>
              <h1>{activeTurtle.name}</h1>
              <strong className="detail-price">{money(activeTurtle.price)}</strong>
              <span className="detail-status">{activeTurtle.status}</span>

              <div className="detail-view">
                已有 {activeTurtle.view_count || 0} 次瀏覽
              </div>

              <div className="detail-data">
                {[
                  ['品種', activeTurtle.breed],
                  ['性別', activeTurtle.sex],
                  ['年齡', activeTurtle.age_months != null ? `${activeTurtle.age_months} 個月` : undefined],
                  ['體重', activeTurtle.weight_g != null ? `${activeTurtle.weight_g} g` : undefined],
                  ['來源', activeTurtle.source],
                  ['花紋', activeTurtle.pattern],
                  ['個性', activeTurtle.personality],
                  ['飼養狀態', activeTurtle.husbandry_status],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))}
              </div>

              <button
                className={`detail-cart ${cartIds.includes(activeTurtle.id) ? 'added' : ''} ${
                  activeTurtle.is_held && !cartIds.includes(activeTurtle.id) ? 'locked' : ''
                }`}
                onClick={() => addToCart(activeTurtle)}
                disabled={Boolean(activeTurtle.is_held) && !cartIds.includes(activeTurtle.id)}
              >
                {cartIds.includes(activeTurtle.id)
                  ? '已在購物車'
                  : activeTurtle.is_held
                  ? '其他客人保留中'
                  : '加入購物車'}
              </button>

              <a
                className="line-button"
                href="https://lin.ee/qKJGC3WS"
                target="_blank"
                rel="noopener noreferrer"
              >
                加 LINE 詢問這隻
              </a>
            </div>
          </section>

          {(activeTurtle.photos?.length || activeTurtle.videos?.length) ? (
            <section className="media-section">
              <div className="section-title">
                <div>
                  <span>MEDIA</span>
                  <h2>更多照片與影片</h2>
                </div>
              </div>

              {activeTurtle.photos?.length > 0 && (
                <div className="photo-gallery">
                  {activeTurtle.photos.map((url, index) => (
                    <a href={url} target="_blank" rel="noreferrer" key={`${url}-${index}`}>
                      <img src={url} alt={`${activeTurtle.name} 照片 ${index + 1}`} />
                    </a>
                  ))}
                </div>
              )}

              {activeTurtle.videos?.length > 0 && (
                <div className="video-gallery">
                  {activeTurtle.videos.map((url, index) => (
                    <video controls playsInline preload="metadata" key={`${url}-${index}`}>
                      <source src={url} />
                      您的瀏覽器不支援影片播放。
                    </video>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeTurtle.note && (
            <section className="detail-note">
              <span>NOTE</span>
              <p>{activeTurtle.note}</p>
            </section>
          )}
        </main>
      )}

      <footer id="contact">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">
              <img src="/logo.png" alt="" />
              <span>
                <b>頑龜爬蟲</b>
                <small>STReptile</small>
              </span>
            </div>
            <p>用心挑一隻，養出一份默契。</p>
          </div>
          <a
            className="line-button"
            href="https://lin.ee/qKJGC3WS"
            target="_blank"
            rel="noopener noreferrer"
          >
            LINE 聯繫我們
          </a>
        </div>
      </footer>
    </div>
  );
}
