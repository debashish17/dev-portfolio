import React from 'react';
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

export default function HomePage() {
  const { go } = useRoute();

  return (
    <div className="home">
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
