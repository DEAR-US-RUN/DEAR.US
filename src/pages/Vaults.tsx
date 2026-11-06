import { Heart, LockKeyhole, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemedImage } from '../components/ThemedImage';
import { useDiaries } from '../hooks';
import { staggerStyle, useParallaxRef, useSpotlightHandlers } from '../motion';
import type { Diary } from '../types';

function VaultItem({ diary, index }: { diary: Diary; index: number }) {
  const spotlight = useSpotlightHandlers<HTMLAnchorElement>({ tilt: true, maxTiltDeg: 1.8 });
  return (
    <Link
      viewTransition
      to={`/diaries/${diary.id}?tab=vault`}
      className="vault-list-item spotlight-card stagger-in"
      style={staggerStyle(index + 2)}
      {...spotlight}
    >
      <span className="small-icon rose-icon">
        <LockKeyhole size={17} />
      </span>
      <span>
        <strong>{diary.title}</strong>
        <small>
          {diary.unlockedAt
            ? 'Revealed together'
            : diary.members.length < 2
              ? 'Waiting for someone to join'
              : 'Waiting for both approvals'}
        </small>
      </span>
      <ArrowUpRight size={18} />
    </Link>
  );
}

export function Vaults() {
  const { diaries, loading, error } = useDiaries();
  const connected = diaries.filter(d => d.kind === 'connected');
  const bannerParallax = useParallaxRef<HTMLDivElement>(16);

  return (
    <div className="page simple-page">
      <span className="eyebrow stagger-in" style={staggerStyle(0)}>
        A LITTLE CLOSER
      </span>
      <h1 className="stagger-in" style={staggerStyle(0)}>
        Feelings vault<span className="heading-period">.</span>
      </h1>
      <p className="page-subtitle stagger-in" style={staggerStyle(1)}>
        For the feelings you choose to share, only when you both say yes.
      </p>

      <div className="vault-page-banner vault-illustrated-banner stagger-in" style={staggerStyle(1)}>
        <span className="journal-banner-spine" aria-hidden="true" />
        <div className="vault-banner-copy">
          <span className="vault-wax-emblem" aria-hidden="true">
            <Heart size={20} fill="currentColor" />
          </span>
          <div>
            <h2>Honesty, in your own time.</h2>
            <p>
              Each connected diary has its own vault. Only designated entries are revealed, and only
              after both members approve.
            </p>
          </div>
        </div>
        <div ref={bannerParallax} className="vault-banner-art parallax-frame">
          <ThemedImage
            art="vault"
            alt="Twine-tied cotton envelopes sealed with a crimson heart wax stamp"
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-block">Loading your spaces…</div>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : connected.length ? (
        <div className="vault-list">
          {connected.map((d, i) => (
            <VaultItem diary={d} index={i} key={d.id} />
          ))}
        </div>
      ) : (
        <div className="entries-empty stagger-in" style={staggerStyle(2)}>
          <div className="empty-icon">
            <LockKeyhole />
          </div>
          <h3>No connected diaries yet.</h3>
          <p>When you create a connected diary, its Feelings Vault will appear here.</p>
          <Link viewTransition className="button button-primary" to="/">
            Go to your diaries
          </Link>
        </div>
      )}
    </div>
  );
}
