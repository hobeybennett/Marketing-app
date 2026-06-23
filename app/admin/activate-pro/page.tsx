'use client';

import { useState } from 'react';

export default function ActivateProPage() {
  const [status, setStatus] = useState('');

  async function activate() {
    setStatus('Working…');
    const res = await fetch('/api/admin/activate-pro', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      setStatus(`Done! ${data.email} is now Pro. You can close this page.`);
    } else {
      setStatus(`Error: ${data.error}`);
    }
  }

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h1 style={{ marginBottom: 24 }}>Activate Pro</h1>
      <button onClick={activate} style={{
        background: '#7c3aed', color: '#fff', border: 'none',
        padding: '16px 32px', borderRadius: 12, fontSize: 18, cursor: 'pointer',
      }}>
        Activate Pro
      </button>
      {status && <p style={{ marginTop: 24, fontSize: 16 }}>{status}</p>}
    </div>
  );
}
