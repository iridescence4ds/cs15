import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import Footer from '../components/layout/Footer';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import Avatar from '../components/ui/Avatar';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  reputation: number;
  tier: string;
  badges: number;
  acceptedAnswers: number;
  faqContributions: number;
  trustScore: number;
  joinedAt: string;
  periodPoints?: number;
}

type Period = 'monthly' | 'quarterly' | 'all';

const TIER_COLORS: Record<string, string> = {
  newcomer:       'bg-card border border-border text-ink-soft',
  contributor:   'bg-warning-light text-warning border border-warning/20',
  helper:        'bg-card border border-border text-ink-soft',
  expert:        'bg-warning-light text-warning border border-warning/20',
  champion:      'bg-accent-light text-accent border border-accent/20',
  knowledge_master: 'bg-accent-light text-accent border border-accent/20',
};

// Trust score bar segments renderer
function TrustBar({ score }: { score: number }) {
  const segments = 4;
  const filled = Math.round((score / 100) * segments);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-4 rounded-sm ${
            i < filled ? 'bg-success' : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}

// Rank movement arrow
function RankArrow({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-warning">&#x25B2;</span>;
  if (rank <= 3) return <span className="text-accent">&#x2726;</span>;
  return <span className="text-ink-faint">&#x203A;</span>;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>('all');

  // Stable fetcher used by both initial load and the 30s polling loop
  const fetchLeaderboard = useCallback((isInitial: boolean) => {
    if (isInitial) setLoading(true);
    api.get<{ leaderboard: LeaderboardEntry[] }>(`/reputation/leaderboard?period=${period}&limit=50`)
      .then(r => {
        setEntries(r.data.leaderboard);
        setLastUpdated(new Date());
      })
      .catch(() => {})
      .finally(() => { if (isInitial) setLoading(false); });
  }, [period]);

  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  // Real-time polling: refresh every 30s so ranks/trust/points stay current.
  // Pauses when the tab is hidden (browser cuts setInterval) and resumes
  // immediately on focus.
  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) fetchLeaderboard(false); };
    const id = setInterval(tick, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchLeaderboard]);

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12 relative z-10">
        {/* Header + period tabs */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">Community Leaderboard</h1>
          <p className="text-sm text-ink-soft mt-1.5">Top contributors in the Yaksha community</p>
          {lastUpdated && (
            <p className="text-[10px] text-warning mt-1 flex items-center justify-center gap-1.5">
              <span>Last updated: {(() => {
                const diff = Math.round((Date.now() - lastUpdated.getTime()) / 1000);
                if (diff < 60) return `${diff}s ago`;
                const mins = Math.round(diff / 60);
                if (mins < 60) return `${mins}m ago`;
                return `${Math.round(mins / 60)}h ago`;
              })()} &middot; Refreshes every 24h</span>
            </p>
          )}
          <div className="flex justify-center gap-1 mt-3">
            {(['monthly', 'quarterly', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`toggle-segment ${period === p ? 'active' : ''}`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 Contributors podium — per spec: avatar, badge, reputation, FAQs, accepted answers */}
        {!loading && entries.length >= 3 && (
          <div className="px-1 pt-2 mb-8">
            <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end">
              {/* Reorder: 2nd (idx 0), 1st (idx 1, taller), 3rd (idx 2) for classic podium look */}
              {[1, 0, 2].map((order) => {
                const e = entries[order];
                if (!e) return null;
                const isFirst = e.rank === 1;
                return (
                  <div
                    key={e.userId}
                    className={`relative rounded-2xl border-2 p-4 sm:p-5 text-center bg-card shadow-subtle transition-all ${
                      isFirst ? 'border-yellow-500/70 border-dashed sm:scale-105 pb-6 sm:pb-7' : 'border-border'
                    }`}
                  >
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full text-xs font-bold shadow-sm flex items-center justify-center ${
                      isFirst ? 'bg-yellow-500 text-yellow-950' : e.rank === 2 ? 'bg-slate-400 text-slate-950' : 'bg-orange-500 text-orange-950'
                    }`}>
                      {e.rank}
                    </div>
                    <div className="flex justify-center mt-2 mb-2">
                      <Avatar name={e.name} size={isFirst ? 'lg' : 'md'} />
                    </div>
                    <p className="text-sm font-semibold text-ink truncate">{e.name}</p>
                    <div className="flex justify-center gap-1 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${TIER_COLORS[e.tier] || 'bg-card border border-border text-ink-soft'}`}>
                        {e.tier}
                      </span>
                    </div>
                    <p className={`text-xl sm:text-2xl font-bold mt-2 ${isFirst ? 'text-warning' : 'text-ink'}`}>{e.points.toLocaleString()}</p>
                    <p className={`text-[10px] -mt-0.5 ${isFirst ? 'text-warning' : 'text-ink-faint'}`}>points</p>
                    <div className="flex justify-around mt-2 pt-2 border-t border-border/40 text-[10px] text-ink-soft">
                      <button className="flex items-center gap-1 text-ink-faint hover:text-accent transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                          <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        answers
                      </button>
                      <button className="flex items-center gap-1 text-ink-faint hover:text-accent transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        FAQs
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="pb-12">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-subtle">
            {loading ? (
              <div className="p-8 text-center text-sm text-ink-faint">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-faint">No users yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-mist border-b border-border/70">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-ink-soft uppercase tracking-wide w-12">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-ink-soft uppercase tracking-wide">User</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Points</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden sm:table-cell">Answers</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden sm:table-cell">FAQs</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden md:table-cell">Trust</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.userId} className="border-b border-border/40 last:border-0 hover:bg-mist/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {e.rank <= 3 ? (
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              e.rank === 1 ? 'bg-yellow-500 text-yellow-950' : e.rank === 2 ? 'bg-slate-400 text-slate-950' : 'bg-orange-500 text-orange-950'
                            }`}>
                              {e.rank}
                            </span>
                          ) : (
                            <span className="text-sm text-ink-faint w-6 text-center">{e.rank}</span>
                          )}
                          <RankArrow rank={e.rank} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-accent">{e.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-ink">{e.points.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-ink">{e.acceptedAnswers}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-ink">{e.faqContributions}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <TrustBar score={e.trustScore} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${TIER_COLORS[e.tier] || 'bg-card border border-border text-ink-soft'}`}>
                          {e.tier}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}