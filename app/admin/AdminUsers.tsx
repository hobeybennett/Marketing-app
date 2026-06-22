'use client';

import { useState } from 'react';

type User = {
  id: string;
  email: string;
  createdAt: string;
  subscriptionStatus: string | null;
  campaignCredits: number;
  subscriptionId: string | null;
  _count: { campaigns: number };
};

export default function AdminUsers({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [toasts, setToasts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function action(userId: string, act: 'set-pro' | 'set-free' | 'add-credit') {
    setLoading(l => ({ ...l, [userId + act]: true }));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(u => u.map(user => user.id === userId
          ? { ...user, subscriptionStatus: data.subscriptionStatus, campaignCredits: data.campaignCredits }
          : user
        ));
        const msg = act === 'set-pro' ? 'Set to Pro' : act === 'set-free' ? 'Set to Free' : 'Credit added';
        setToasts(t => ({ ...t, [userId]: msg }));
        setTimeout(() => setToasts(t => { const n = { ...t }; delete n[userId]; return n; }), 2500);
      }
    } finally {
      setLoading(l => ({ ...l, [userId + act]: false }));
    }
  }

  return (
    <div className="space-y-2">
      {users.map(user => {
        const isPro = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
        const joined = new Date(user.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        return (
          <div key={user.id}
            className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">

            {/* Left: user info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white truncate">{user.email}</p>
                {isPro ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-900/60 border border-violet-700/50 text-violet-300">Pro</span>
                ) : (
                  <span className="text-xs text-gray-600">Free</span>
                )}
                {toasts[user.id] && (
                  <span className="text-xs text-green-400 font-medium">✓ {toasts[user.id]}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                <span>Joined {joined}</span>
                <span>·</span>
                <span>{user._count.campaigns} campaign{user._count.campaigns !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{user.campaignCredits} credit{user.campaignCredits !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isPro && (
                <button
                  onClick={() => action(user.id, 'set-pro')}
                  disabled={loading[user.id + 'set-pro']}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-900/40 border border-violet-700/60 text-violet-300 hover:bg-violet-800/50 transition disabled:opacity-40"
                >
                  Set Pro
                </button>
              )}
              {isPro && (
                <button
                  onClick={() => action(user.id, 'set-free')}
                  disabled={loading[user.id + 'set-free']}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 transition disabled:opacity-40"
                >
                  Set Free
                </button>
              )}
              <button
                onClick={() => action(user.id, 'add-credit')}
                disabled={loading[user.id + 'add-credit']}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-900/40 border border-blue-700/60 text-blue-300 hover:bg-blue-800/50 transition disabled:opacity-40"
              >
                +1 Credit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
