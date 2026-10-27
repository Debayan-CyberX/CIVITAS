import { useEffect } from 'react';
import { startFoundationProbe } from '../bridge/probe';
import { useFoundationStore } from '../state/foundation';

const messages = {
  checking: 'Checking local worker connection…',
  verified: 'Local worker connection verified.',
  unavailable: 'Local worker unavailable. Check browser support and reload to retry.',
} as const;

export function App() {
  const status = useFoundationStore((state) => state.status);
  const setStatus = useFoundationStore((state) => state.setStatus);
  useEffect(
    () =>
      startFoundationProbe((verified) => {
        setStatus(verified ? 'verified' : 'unavailable');
      }),
    [setStatus],
  );
  return (
    <main>
      <p className="eyebrow">The Living City</p>
      <h1>CIVITAS</h1>
      <h2>Stage 01 · B01 foundation</h2>
      <p>The workspace and validation contracts are ready for city and demand fixtures.</p>
      <p role="status">{messages[status]}</p>
      <p>Simulation behavior and city visuals are not implemented in this work package.</p>
    </main>
  );
}
