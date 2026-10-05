import React, { useEffect, useRef } from 'react';
import { useRoute } from '../components/primitives.jsx';
import Folio from '../hero/Folio.jsx';
import Staircase from '../hero/Staircase.jsx';
import Contributions from '../components/contributions.jsx';

// LANDING (folio I)
//
//   1. Folio         — the two-act scroll: the name assembles, then the
//                      manifesto card rises. Restored from the original
//                      four-act page; acts 3 and 4 were replaced by the two
//                      sections below and are gone.
//   2. Staircase     — the toolbox as a scrubbed descent, twelve steps for
//                      twelve tools, live DOM type on the rendered card faces.
//   3. Contributions — a year of real activity, its own section by decision.
//   4. Exits         — Work and Studio. Contact stays in the nav.

// Every section here is measured in vh, so a change of viewport HEIGHT
// rescales the whole document while scrollTop stays in pixels — and the
// reader is silently moved. Rotating a phone is the loud case: the stair's
// travel goes from 2082 px to 992 px, so a mid-scrub offset lands past the
// end and the descent snaps to its last frame.
//
// So the anchor that survives a resize is the LOGICAL one: which section you
// were in and how far through it. Reads are suspended while restoring,
// because setting scrollTop fires scroll, which would otherwise record the
// wrong position over the right one before the restore lands.
function useLogicalScrollAnchor(ref) {
  useEffect(() => {
    const sc = ref.current;
    if (!sc) return undefined;

    let anchor = { i: 0, frac: 0 };
    let restoring = false;
    let raf = 0;

    // A pinned section's progress runs over its TRAVEL, not its height — the
    // last viewport of it is spent held still. Measuring against height would
    // land short, because the viewport shrinks on the same rotation the
    // section does. Short sections have no travel, so they use height.
    const span = (el) => Math.max(1, el.offsetHeight > sc.clientHeight
      ? el.offsetHeight - sc.clientHeight
      : el.offsetHeight);

    const read = () => {
      raf = 0;
      if (restoring) return;
      const kids = sc.children;
      const y = sc.scrollTop;
      for (let i = 0; i < kids.length; i++) {
        const el = kids[i];
        if (y < el.offsetTop + el.offsetHeight || i === kids.length - 1) {
          anchor = { i, frac: (y - el.offsetTop) / span(el) };
          return;
        }
      }
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };

    const restore = () => {
      const el = sc.children[anchor.i];
      if (!el) { restoring = false; return; }
      sc.scrollTop = el.offsetTop + anchor.frac * span(el);
      // one more frame: the staircase relays out on resize too, and its
      // section height is what we are measuring against
      requestAnimationFrame(() => {
        const e2 = sc.children[anchor.i];
        if (e2) sc.scrollTop = e2.offsetTop + anchor.frac * span(e2);
        restoring = false;
      });
    };

    const onResize = () => {
      restoring = true;
      requestAnimationFrame(restore);
    };

    read();
    sc.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [ref]);
}

export default function HomePage() {
  const { go } = useRoute();
  const homeRef = useRef(null);
  useLogicalScrollAnchor(homeRef);

  return (
    <div className="home" ref={homeRef}>
      <Folio />
      <Staircase />
      <Contributions />
      <Exits go={go} />
    </div>
  );
}

function Exits({ go }) {
  return (
    <section className="exits" aria-label="Where to next">
      <div className="exits-inner">
        <button type="button" className="exit-card is-red" onClick={() => go('work')}>
          <div className="exit-row">
            <span className="exit-name">Work</span>
            <span aria-hidden="true">→</span>
          </div>
          <p className="exit-note">Five projects, built alone.</p>
        </button>

        <button type="button" className="exit-card" onClick={() => go('studio')}>
          <div className="exit-row">
            <span className="exit-name">Studio</span>
            <span aria-hidden="true">→</span>
          </div>
          <p className="exit-note">Make a poster. Hang it on the wall.</p>
        </button>
      </div>
    </section>
  );
}
