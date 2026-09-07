import React, { useState, useEffect, useCallback } from 'react';
import { studioApi } from './api-client.js';
import { track } from '../lib/analytics.js';

// THE TEN — the wall. Only the ten most-liked posters of the week hang here,
// plus the latest six contenders so new work can gather likes. Thumbnails are
// the PNG each poster rendered at publish time; the JSON is fetched only on remix.

const PERIODS = [
  { id: 'week', label: 'THIS WEEK' },
  { id: 'all', label: 'ALL-TIME' },
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'mine', label: 'MINE' },
];
const RANKED = new Set(['week', 'all']);

function timeLeft(iso) {
  if (!iso) return '';
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'RESETTING';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return `${d ? `${d} D ` : ''}${h} H LEFT`;
}

export default function Wall({ onOpenPoster, onRemix, onMakeYours, focusId }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | off | error
  const [busy, setBusy] = useState(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (p = period) => {
    setState('loading');
    try {
      const d = await studioApi.wall(p, 0);
      setData(d);
      setState(d.configured ? 'ok' : 'off');
    } catch (e) {
      setState(e.status === 404 || e.status === 503 ? 'off' : 'error');
    }
  }, [period]);

  // ARCHIVE pages through every poster ever hung, 24 at a time
  const loadMore = async () => {
    if (!data || more) return;
    setMore(true);
    try {
      const next = await studioApi.wall(period, (data.page || 0) + 1);
      setData((d) => d && { ...d, top: [...d.top, ...next.top], page: next.page, hasMore: next.hasMore });
    } catch { /* keep what we have */ } finally { setMore(false); }
  };

  useEffect(() => { load(period); }, [period, load]);

  const like = async (p) => {
    if (busy) return;
    setBusy(p.id);
    // optimistic
    const bump = (x) => (x.id === p.id ? { ...x, likes: x.liked ? x.likes - 1 : x.likes + 1, liked: !x.liked } : x);
    setData((d) => d && { ...d, top: d.top.map(bump), latest: d.latest.map(bump) });
    try {
      const r = await studioApi.like(p.id);
      const fix = (x) => (x.id === p.id ? { ...x, likes: r.likes, liked: r.liked } : x);
      setData((d) => d && { ...d, top: d.top.map(fix), latest: d.latest.map(fix) });
      track('studio_like', { liked: r.liked });
    } catch (e) {
      setData((d) => d && { ...d, top: d.top.map(bump), latest: d.latest.map(bump) }); // revert
    } finally { setBusy(null); }
  };

  const report = async (p) => {
    if (!window.confirm('Report this poster as inappropriate? Two reports hide it until I look.')) return;
    try { const r = await studioApi.report(p.id); if (r.hidden) load(); } catch { /* ignore */ }
  };

  const top = data?.top || [];
  const latest = data?.latest || [];
  // contenders are the latest posters NOT already hanging among the ten
  const topIds = new Set(top.map((p) => p.id));
  const contenders = latest.filter((p) => !topIds.has(p.id));
  const free = Math.max(0, 10 - top.length);
  const threshold = top.length >= 10 ? top[9].likes : 0;
  const climbNote = free > 0 ? `${free} SPOT${free === 1 ? '' : 'S'} FREE · PUBLISH TO TAKE ONE` : `${threshold + 1} LIKES TAKES SPOT TEN · SHARE YOURS TO CLIMB`;

  return (
    <div className="st-wall">
      <div className="st-wall-head">
        <div>
          <div className="label" style={{ color: 'var(--red)' }}>FOLIO № VI · THE WALL</div>
          <h2 className="display st-wall-title">THE WALL<span style={{ color: 'var(--red)' }}>.</span></h2>
          <div className="mono st-dim st-wall-sub">{period === 'archive' ? 'EVERY POSTER EVER HUNG, NEWEST FIRST. LIKES COUNT TOWARDS ITS WEEK AND ALL-TIME.' : period === 'mine' ? 'POSTERS PUBLISHED FROM THIS BROWSER.' : 'ONLY THE TEN MOST-LIKED POSTERS HANG HERE. LIKE ONE TO KEEP IT UP; MAKE ONE TO TAKE A SPOT.'}</div>
        </div>
        <div className="st-wall-stats">
          {data?.configured && (
            <div className="mono st-dim" style={{ textAlign: 'right' }}>
              <div>{period === 'archive'
                ? <><span className="serif-display st-red" style={{ fontSize: 22 }}>{data.counts?.all ?? 0}</span> POSTER{(data.counts?.all ?? 0) === 1 ? '' : 'S'} EVER HUNG</>
                : <><span className="serif-display st-red" style={{ fontSize: 22 }}>{data.counts?.likes ?? 0}</span> LIKES · {data.counts?.posters ?? 0} POSTERS THIS WEEK</>}</div>
              <div style={{ marginTop: 6 }}>WEEK {data.week?.split('W')[1] ?? ''} · RESETS MON 00:00 UTC · {timeLeft(data.resetsAt)}</div>
            </div>
          )}
          <button type="button" className="st-btn st-btn-ink clickable" onClick={onMakeYours} data-magnet>MAKE YOURS →</button>
        </div>
      </div>

      <div className="st-tabs">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={`st-chip st-chip-lg ${period === p.id ? 'is-on' : ''}`} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}>{p.label}</button>
        ))}
        <span className="mono st-dim st-tabs-note">ONE LIKE PER POSTER PER VISITOR · EVERY POSTER SCREENED IN SECONDS · ANYONE CAN REPORT ONE</span>
      </div>

      {state === 'loading' && <div className="mono st-dim st-wall-msg"><i className="st-blink" /> FETCHING THE WALL…</div>}
      {state === 'off' && (
        <div className="st-card st-wall-msg">
          <div className="display" style={{ fontSize: 20 }}>THE WALL IS NOT HUNG YET.</div>
          <p>Publishing and likes need the poster store connected. The studio still works — compose and export a PNG.</p>
        </div>
      )}
      {state === 'error' && <div className="st-card st-wall-msg"><div className="display" style={{ fontSize: 20 }}>THE WALL DID NOT ANSWER.</div><p>Try again in a moment.</p></div>}

      {state === 'ok' && (
        <>
          {top.length === 0 ? (
            <div className="st-card st-wall-msg">
              <div className="display" style={{ fontSize: 20 }}>{period === 'mine' ? 'NOTHING OF YOURS YET.' : period === 'archive' ? 'NOTHING HANGS YET.' : 'THE WALL IS EMPTY.'}</div>
              <p>{period === 'mine' ? 'Posters you publish from this browser show up here.' : period === 'archive' ? 'Every poster ever published will be kept here.' : 'The first poster published this week takes spot one. Make yours.'}</p>
            </div>
          ) : (
            <ol className="st-ten">
              {top.map((p, i) => (
                <li key={p.id} className={`st-ten-item ${i === 0 && RANKED.has(period) ? 'is-first' : ''} ${p.id === focusId ? 'is-focus' : ''}`}>
                  <button type="button" className="st-card-poster clickable" onClick={() => onOpenPoster(p.id)} data-magnet>
                    <img src={p.png} alt={`Poster № ${p.number}`} loading="lazy" width="480" height="640" />
                    {RANKED.has(period) && <span className={`st-rank serif-display ${i === 0 ? 'is-red' : ''}`}>{i + 1}</span>}
                    {i === 0 && period === 'week' && <span className="st-ribbon mono">POSTER OF THE WEEK</span>}
                    {p.status === 'held' && <span className="st-badge mono">HELD · SCREENED TONIGHT</span>}
                  </button>
                  <div className="st-cap mono">
                    <span>№ {p.number} · S{p.seed}{p.photos ? ` · PHOTO${p.photos > 1 ? 'S' : ''}` : ''}</span>
                    <span className="st-likes">
                      <i /> {p.likes}
                      <button type="button" className={`st-like ${p.liked ? 'is-on' : ''}`} onClick={() => like(p)} disabled={busy === p.id || p.status !== 'live'} aria-pressed={p.liked}>{p.liked ? 'LIKED' : 'LIKE +'}</button>
                    </span>
                  </div>
                  <div className="st-cap-actions mono">
                    <button type="button" className="st-link" onClick={() => onRemix(p.id)}>REMIX →</button>
                    <button type="button" className="st-link st-dim" onClick={() => report(p)}>REPORT</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {period === 'archive' && data?.hasMore && (
            <div className="st-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="st-btn clickable" onClick={loadMore} disabled={more} data-magnet>{more ? 'FETCHING…' : 'LOAD MORE →'}</button>
            </div>
          )}

          {period === 'week' && contenders.length > 0 && (
            <div className="st-contenders">
              <div className="st-mk"><span className="st-mk-n st-mk-red">VI.F</span><span className="label">CONTENDERS</span><span className="st-mk-r" /><span className="mono st-dim st-mk-note">THE LATEST · {climbNote}</span></div>
              <div className="st-minis">
                {contenders.map((p) => (
                  <div key={p.id} className={`st-mini ${p.id === focusId ? 'is-focus' : ''}`}>
                    <button type="button" className="st-card-poster clickable" onClick={() => onOpenPoster(p.id)} data-magnet>
                      <img src={p.png} alt={`Poster № ${p.number}`} loading="lazy" width="480" height="640" />
                      {p.status === 'held' && <span className="st-badge mono">HELD</span>}
                    </button>
                    <div className="st-cap mono"><span>№ {p.number}</span><span className="st-likes"><i /> {p.likes}</span></div>
                  </div>
                ))}
                <p className="mono st-dim st-contenders-note">A poster enters THE TEN the moment its likes pass № 10. When the week resets, the ten move to ALL-TIME and the wall starts empty — Monday's first likes decide the new order.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
