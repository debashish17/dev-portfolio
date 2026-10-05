import React, { useEffect, useState, useRef, useCallback } from 'react';

// CONTRIBUTION CALENDAR
//
// A year of GitHub activity, recoloured out of GitHub green and into the site
// palette. Sequential data, so the ramp is a single hue light-to-dark with
// monotonically falling luminance (0.51 / 0.30 / 0.16 / 0.05) — never a
// multi-hue scale. "No contributions" is a neutral, deliberately outside the
// ramp, so absence never reads as a low value.
//
// The two lightest steps sit under 3:1 against the page, which is inherent to
// a heatmap; the relief is the hover tooltip, the legend, and the text
// summary carried for screen readers.

const RAMP = ['#EAB0A0', '#E1766C', '#D62828', '#78201E'];
const EMPTY = '#E8DEC2';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GitHub's own thresholds are quartiles of the year's non-zero days, which
// keeps the graph readable whether someone commits twice a week or forty
// times a day.
function bucketer(weeks) {
  const counts = [];
  for (const w of weeks) for (const c of w) if (c > 0) counts.push(c);
  if (!counts.length) return () => 0;
  counts.sort((a, b) => a - b);
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(counts.length * p))];
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  return (c) => (c <= 0 ? 0 : c <= t1 ? 1 : c <= t2 ? 2 : c <= t3 ? 3 : 4);
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Contributions() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState(null);
  const gridRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/github')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const onPointer = useCallback((e) => {
    const cell = e.target.closest?.('[data-day]');
    if (!cell || !gridRef.current) { setTip(null); return; }
    const g = gridRef.current.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    setTip({
      text: cell.getAttribute('data-day'),
      x: c.left - g.left + c.width / 2,
      y: c.top - g.top,
    });
  }, []);

  // The year runs oldest-left, so a narrow screen opens on last October and
  // the recent weeks — the part worth seeing — sit off the right edge with
  // nothing to say so: scrollbars are hidden site-wide. So it opens scrolled
  // to the newest week, and whichever side still has weeks behind it wears a
  // fade. tabIndex makes the region reachable for anyone scrolling by key,
  // which with no scrollbar is otherwise impossible.
  //
  // ABOVE the `failed` gate below, and deliberately: hooks after an early
  // return change the hook count between renders, so the first render that
  // bails would take the whole app down with it — the opposite of hiding
  // the section cleanly.
  const scrollRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data) return undefined;
    el.scrollLeft = el.scrollWidth;          // newest week first
    syncEdges();
    const onResize = () => syncEdges();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [data, syncEdges]);

  // An empty calendar reads as "inactive", which is the opposite of the point.
  // If the endpoint is unreachable or unconfigured, the section is not shown.
  if (failed) return null;

  const loading = !data;
  const weeks = data?.weeks || [];
  const bucket = loading ? () => 0 : bucketer(weeks);

  // Month ticks: label a column when its week starts a new month.
  const monthTicks = [];
  if (data?.from) {
    let prev = -1;
    weeks.forEach((_, w) => {
      const d = addDays(data.from, w * 7);
      const m = d.getUTCMonth();
      if (m !== prev && d.getUTCDate() <= 7) { monthTicks.push({ w, label: MONTHS[m] }); prev = m; }
    });
  }

  return (
    <section className="contrib" aria-labelledby="contrib-heading">
      <div className="contrib-inner">
        <div className="contrib-head">
          <div>
            <h2 id="contrib-heading" className="contrib-title">
              {loading ? <span className="contrib-skeleton-num" /> : data.total.toLocaleString()}
              <span className="contrib-title-tail">contributions in the last year</span>
            </h2>
          </div>
          <a
            className="contrib-link"
            href="https://github.com/debashish17"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/debashish17 →
          </a>
        </div>

        {!loading && (
          <p className="sr-only">
            {data.total.toLocaleString()} contributions between {data.from} and {data.to}.
          </p>
        )}

        <div className={`contrib-scroller${edges.left ? ' has-left' : ''}${edges.right ? ' has-right' : ''}`}>
        <div
          className="contrib-scroll"
          ref={scrollRef}
          onScroll={syncEdges}
          tabIndex={0}
          role="group"
          aria-label="Contribution calendar, scrolls sideways"
        >
          <div
            className="contrib-grid-wrap"
            ref={gridRef}
            onPointerMove={onPointer}
            onPointerLeave={() => setTip(null)}
          >
            <div className="contrib-months" aria-hidden="true">
              {monthTicks.map((t) => (
                <span key={t.w} className="contrib-month" style={{ gridColumnStart: t.w + 1 }}>
                  {t.label}
                </span>
              ))}
            </div>

            <div className="contrib-body">
              <div className="contrib-days" aria-hidden="true">
                <span>Mon</span><span>Wed</span><span>Fri</span>
              </div>

              <div
                className="contrib-grid"
                role="img"
                aria-label={
                  loading
                    ? 'Loading contribution calendar'
                    : `Contribution calendar: ${data.total.toLocaleString()} contributions in the last year`
                }
                style={{ gridTemplateColumns: `repeat(${loading ? 53 : weeks.length}, var(--cell))` }}
              >
                {(loading ? Array.from({ length: 53 }, () => new Array(7).fill(null)) : weeks).map((week, w) =>
                  week.map((count, d) => {
                    if (count === null || count === undefined) {
                      return <span key={`${w}-${d}`} className="contrib-cell is-void" />;
                    }
                    const lv = bucket(count);
                    const date = fmtDate(addDays(data.from, w * 7 + d));
                    return (
                      <span
                        key={`${w}-${d}`}
                        className="contrib-cell"
                        style={{ background: lv === 0 ? EMPTY : RAMP[lv - 1] }}
                        data-day={`${count === 0 ? 'No' : count} contribution${count === 1 ? '' : 's'} · ${date}`}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {tip && (
              <div className="contrib-tip" style={{ left: tip.x, top: tip.y }} role="status">
                {tip.text}
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="contrib-legend" aria-hidden="true">
          <span>Less</span>
          <span className="contrib-cell" style={{ background: EMPTY }} />
          {RAMP.map((c) => (
            <span key={c} className="contrib-cell" style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  );
}
