import React, { useState, useEffect } from 'react';
import { studioApi, posterUrl, copyText } from './api-client.js';
import { track } from '../lib/analytics.js';

// /p/:id — one poster, large, with LIKE and REMIX. This is where a shared link
// lands after the OG redirect, so it has to stand on its own.

export default function PosterView({ id, onRemix, onBack }) {
  const [p, setP] = useState(null);
  const [state, setState] = useState('loading');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    studioApi.poster(id).then((d) => { if (alive) { setP(d.poster); setState('ok'); track('studio_poster_view'); } })
      .catch((e) => { if (alive) setState(e.status === 404 ? 'missing' : 'error'); });
    return () => { alive = false; };
  }, [id]);

  const like = async () => {
    if (!p || busy) return;
    setBusy(true);
    setP((x) => ({ ...x, likes: x.liked ? x.likes - 1 : x.likes + 1, liked: !x.liked }));
    try { const r = await studioApi.like(p.id); setP((x) => ({ ...x, likes: r.likes, liked: r.liked })); track('studio_like', { liked: r.liked, from: 'poster' }); }
    catch { setP((x) => ({ ...x, likes: x.liked ? x.likes - 1 : x.likes + 1, liked: !x.liked })); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="st-poster-view"><div className="mono st-dim st-wall-msg"><i className="st-blink" /> FETCHING POSTER…</div></div>;
  if (state !== 'ok') {
    return (
      <div className="st-poster-view">
        <div className="st-card st-wall-msg">
          <div className="display" style={{ fontSize: 22 }}>{state === 'missing' ? 'NO SUCH POSTER.' : 'THE WALL DID NOT ANSWER.'}</div>
          <p>{state === 'missing' ? 'It may have been taken down, or the link is off by a letter.' : 'Try again in a moment.'}</p>
          <button type="button" className="st-btn st-btn-ink clickable" onClick={onBack} data-magnet>SEE THE WALL →</button>
        </div>
      </div>
    );
  }

  const url = posterUrl(p.id);
  return (
    <div className="st-poster-view">
      <div className="st-poster-sheet">
        <img src={p.png} alt={`Poster № ${p.number}`} width="480" height="640" />
      </div>
      <div className="st-poster-copy">
        <div className="label" style={{ color: 'var(--red)' }}>MADE IN THE STUDIO</div>
        <h2 className="display st-poster-title">POSTER<br /><span className="serif-display">№ {p.number}</span><span style={{ color: 'var(--red)' }}>.</span></h2>
        <div className="mono st-dim st-poster-meta">
          SEED {p.seed} · {p.layers} LAYERS{p.photos ? ` · ${p.photos} PHOTO${p.photos > 1 ? 'S' : ''}` : ''} · <span className="st-red">● {p.likes} LIKES</span>{p.rank ? ` · № ${p.rank} THIS WEEK` : ''}
          {p.status === 'held' && ' · HELD — SCREENED TONIGHT'}
        </div>
        <p className="st-poster-blurb">A visitor composed this in the site's own language — four inks, an 80 px grid, springs on every drag.{p.rank && p.rank > 10 && p.toTen != null ? ` ${p.toTen} more like${p.toTen === 1 ? '' : 's'} and it hangs among the ten.` : ''}</p>
        <div className="st-row st-wrap st-poster-actions">
          <button type="button" className={`st-btn st-btn-red clickable ${p.liked ? 'is-on' : ''}`} onClick={like} disabled={busy || p.status !== 'live'} aria-pressed={p.liked} data-magnet>{p.liked ? '● LIKED' : '● LIKE IT'}</button>
          <button type="button" className="st-btn st-btn-ink clickable" onClick={() => onRemix(p.id)} data-magnet>REMIX IT →</button>
          <button type="button" className="st-btn clickable" onClick={async () => { setCopied(await copyText(url)); setTimeout(() => setCopied(false), 1800); }} data-magnet>{copied ? 'COPIED' : 'COPY LINK'}</button>
        </div>
        <div className="mono st-dim" style={{ marginTop: 14, fontSize: 11 }}>{url.replace(/^https?:\/\//, '')}</div>
        <button type="button" className="st-link mono" style={{ marginTop: 22 }} onClick={onBack}>← SEE THE WALL</button>
      </div>
    </div>
  );
}
