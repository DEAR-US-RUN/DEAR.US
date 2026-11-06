import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  Flame,
  Heart,
  KeyRound,
  LockKeyhole,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, post } from '../api';
import { unlockDiaryKey } from '../crypto';
import type { Diary, PasswordEnvelope } from '../types';
import { useAuth } from '../AuthContext';
import { sampleDiaries } from '../sample';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { Editor } from '../components/Editor';
import { EntryList } from '../components/EntryList';
import { DiaryEntryExplorer, type ReadableEntryItem } from '../components/DiaryBookView';
import {
  PromptSlip,
  StationeryToolbar,
  useStationeryPrefs,
} from '../components/StationeryControls';
import { ThemedImage } from '../components/ThemedImage';
import { useToast } from '../components/Toast';
import { dateLabel, reminder } from '../format';
import { runViewTransition, staggerStyle, useParallaxRef } from '../motion';

type Tab = 'entries' | 'write' | 'vault';

export function DiaryPage() {
  const { id = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const { preview } = useAuth();
  const { notify } = useToast();
  const [diary, setDiary] = useState<Diary | null>(null);
  const [envelope, setEnvelope] = useState<PasswordEnvelope | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unlock, setUnlock] = useState(false);
  const [invite, setInvite] = useState(false);
  const [approval, setApproval] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [afterUnlock, setAfterUnlock] = useState<Tab | null>(null);
  const heroParallax = useParallaxRef<HTMLDivElement>(18);

  const tab = (
    ['entries', 'write', 'vault'].includes(search.get('tab') || '')
      ? search.get('tab')
      : 'entries'
  ) as Tab;

  const setTab = (value: Tab) => {
    if (value === tab) return;
    runViewTransition(() => setSearch(value === 'entries' ? {} : { tab: value }), {
      kind: 'tab',
    });
  };

  const refresh = useCallback(async () => {
    if (preview) {
      setDiary(sampleDiaries.find(d => d.id === id) || null);
      setLoading(false);
      return;
    }
    try {
      const r = await api<{ diary: Diary; passwordEnvelope: PasswordEnvelope }>(`/diaries/${id}`);
      setDiary(r.diary);
      setEnvelope(r.passwordEnvelope);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this diary.');
    } finally {
      setLoading(false);
    }
  }, [id, preview]);

  useEffect(() => {
    setKey(null);
    setLoading(true);
    void refresh();
  }, [refresh]);

  if (loading)
    return (
      <div className="page">
        <div className="loading-block">Opening your space…</div>
      </div>
    );

  if (error || !diary)
    return (
      <div className="page">
        <Link viewTransition className="back-link" to="/">
          <ArrowLeft size={15} /> Back to your diaries
        </Link>
        <div className="empty-card">
          <h2>We couldn’t open this diary.</h2>
          <p>{error || 'This resource is unavailable.'}</p>
          <button className="button button-outline" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    );

  const connected = diary.kind === 'connected';
  const joined = diary.members.length === 2;
  const navigateTab = (value: Tab) => {
    if (value === 'write' && !preview && !key) {
      setAfterUnlock('write');
      setUnlock(true);
      return;
    }
    setTab(value);
  };

  return (
    <div className="page diary-page">
      <Link viewTransition className="back-link stagger-in" style={staggerStyle(0)} to="/">
        <ArrowLeft size={15} /> Back to your diaries
      </Link>

      <section className="diary-hero-cover stagger-in" style={staggerStyle(1)}>
        <span className="journal-banner-spine" aria-hidden="true" />
        <span
          className={`journal-banner-ribbon ${connected ? 'ribbon-rose' : 'ribbon-sage'}`}
          aria-hidden="true"
        />
        <div className="diary-hero-copy">
          <div className="diary-kind">
            <span>
              {connected ? <UsersRound size={13} /> : <LockKeyhole size={13} />}{' '}
              {connected ? 'CONNECTED DIARY' : 'PERSONAL DIARY'}
            </span>
            <em className="diary-folio-tag">
              {connected ? 'CLOTHBOUND SHARED EDITION' : 'LINEN PERSONAL FOLIO'}
            </em>
          </div>
          <h1>
            {diary.title}
            <span className="heading-period">.</span>
          </h1>
          <p>
            {connected
              ? joined
                ? `A little space for ${diary.members.map(m => m.name.split(' ')[0]).join(' & ')}`
                : `A little space for you and ${diary.otherName}`
              : 'A little space that’s entirely yours.'}
          </p>
          <div className="diary-head-actions">
            {connected &&
              !joined &&
              diary.members.find(m => m.id === diary.myId)?.role === 'owner' && (
                <button className="button button-outline" onClick={() => setInvite(true)}>
                  <Plus size={15} /> Invite {diary.otherName}
                </button>
              )}
            {!preview && !key && (
              <button className="button button-outline" onClick={() => setUnlock(true)}>
                <KeyRound size={15} /> Unlock diary
              </button>
            )}
            <button className="button button-primary" onClick={() => navigateTab('write')}>
              <PenLine size={15} /> Write an entry
            </button>
          </div>
        </div>

        <div ref={heroParallax} className="diary-hero-art parallax-frame">
          <ThemedImage
            art={connected ? 'connected' : 'personal'}
            alt={
              connected
                ? 'Two linen-bound journals tied with a dusty-rose silk ribbon'
                : 'An open handmade cotton-paper diary with pressed botanicals and fountain pen'
            }
          />
        </div>
      </section>

      {!connected && diary.targetMode !== 'none' && (
        <div className="personal-reminder stagger-in" style={staggerStyle(2)}>
          <CalendarDays size={17} />
          <span>
            <strong>Target reminder</strong> ·{' '}
            {diary.targetDate ? dateLabel(diary.targetDate) : 'Not set'} · {reminder(diary)}. Your
            diary is always open before the target.
          </span>
        </div>
      )}

      {connected && (
        <div className="connection-bar stagger-in" style={staggerStyle(2)}>
          <div className="bar-people">
            <div className="mini-avatars">
              {diary.members.map((m, i) => (
                <Avatar
                  key={m.id}
                  name={m.name}
                  avatar={m.avatar}
                  size="small"
                  tone={i ? 'rose' : 'sage'}
                />
              ))}
              {!joined && <span className="avatar avatar-small avatar-outline">?</span>}
            </div>
            <div>
              <strong>
                {joined
                  ? diary.members.map(m => m.name.split(' ')[0]).join(' & ')
                  : `Waiting for ${diary.otherName}`}
              </strong>
              <small>
                {diary.relationshipLabel}{' '}
                {diary.connectedAt
                  ? `· Connected ${dateLabel(diary.connectedAt, { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
              </small>
            </div>
          </div>
          <div className="bar-item">
            <Heart size={17} />
            <span>
              <strong>{diary.daysConnected ?? '—'} days</strong>
              <small>connected</small>
            </span>
          </div>
          <div className="bar-item">
            <Flame size={17} />
            <span>
              <strong>{diary.streak} days</strong>
              <small>writing-day streak</small>
            </span>
            <button className="subtle-link" onClick={() => setBreaking(true)}>
              Break
            </button>
          </div>
          <div className="bar-item">
            <CalendarDays size={17} />
            <span>
              <strong>
                {diary.targetDate
                  ? dateLabel(diary.targetDate, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'No date yet'}
              </strong>
              <small>{reminder(diary)}</small>
            </span>
          </div>
          <div className="bar-item bar-vault">
            <LockKeyhole size={17} />
            <span>
              <strong>{diary.unlockedAt ? 'Revealed' : 'Still private'}</strong>
              <small>feelings vault</small>
            </span>
          </div>
        </div>
      )}

      {connected && (
        <p className="connection-explainer stagger-in" style={staggerStyle(2)}>
          A writing day is any UTC day either member publishes. Activity timing is shared, never the
          private entry itself. No expectations, ever.
        </p>
      )}

      <div
        className="diary-tabs stagger-in"
        style={staggerStyle(3)}
        role="tablist"
        aria-label="Diary sections"
      >
        <button
          role="tab"
          aria-selected={tab === 'entries'}
          className={tab === 'entries' ? 'active' : ''}
          onClick={() => navigateTab('entries')}
        >
          {tab === 'entries' && <span className="diary-tab-pill" aria-hidden="true" />}
          <BookOpen size={16} />
          <span>My entries</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'write'}
          className={tab === 'write' ? 'active' : ''}
          onClick={() => navigateTab('write')}
        >
          {tab === 'write' && <span className="diary-tab-pill" aria-hidden="true" />}
          <PenLine size={16} />
          <span>Write</span>
        </button>
        {connected && (
          <button
            role="tab"
            aria-selected={tab === 'vault'}
            className={tab === 'vault' ? 'active' : ''}
            onClick={() => navigateTab('vault')}
          >
            {tab === 'vault' && <span className="diary-tab-pill" aria-hidden="true" />}
            <LockKeyhole size={16} />
            <span>Feelings vault</span>
          </button>
        )}
      </div>

      <div key={tab} className="diary-content tab-stage">
        {tab === 'entries' && (
          <>
            <div className="content-heading">
              <div>
                <span className="eyebrow">YOUR WORDS, YOUR SPACE</span>
                <h2>Your pages</h2>
                <p>Private by default, even in a connected diary.</p>
              </div>
              <button className="text-action" onClick={() => navigateTab('write')}>
                <Plus size={15} /> Write a page
              </button>
            </div>
            {preview ? (
              <SampleEntries diary={diary} />
            ) : key ? (
              <EntryList diary={diary} diaryKey={key} view="mine" />
            ) : (
              <LockedContent onUnlock={() => setUnlock(true)} />
            )}
          </>
        )}

        {tab === 'write' &&
          (preview ? (
            <SampleWritingStudio diary={diary} onBack={() => setTab('entries')} />
          ) : key ? (
            <Editor
              diary={diary}
              diaryKey={key}
              onClose={() => setTab('entries')}
              onPublished={() => {
                setTab('entries');
                void refresh();
              }}
            />
          ) : (
            <LockedContent onUnlock={() => setUnlock(true)} />
          ))}

        {tab === 'vault' && connected && (
          <VaultPanel
            diary={diary}
            diaryKey={key}
            preview={preview}
            onUnlock={() => setUnlock(true)}
            onApprove={() => setApproval(true)}
          />
        )}
      </div>

      {unlock && envelope && (
        <UnlockModal
          id={diary.id}
          envelope={envelope}
          onClose={() => {
            setUnlock(false);
            setAfterUnlock(null);
          }}
          onUnlocked={k => {
            setKey(k);
            setUnlock(false);
            if (afterUnlock) {
              setTab(afterUnlock);
              setAfterUnlock(null);
            }
            notify('Diary unlocked on this device.', 'success');
          }}
        />
      )}

      {invite && <InviteModal diary={diary} preview={preview} onClose={() => setInvite(false)} />}

      {approval && (
        <Modal
          title="Open your hearts together?"
          subtitle="This approval is personal, permanent, and only takes effect when both of you approve."
          onClose={() => setApproval(false)}
        >
          <div className="confirmation-copy">
            <p>
              When both members approve,{' '}
              <strong>
                all entries deliberately designated for this vault are revealed together
              </strong>
              . Other private entries stay private.
            </p>
            <p>
              The other person can copy or save what is revealed. The target date does not unlock
              the vault.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button button-ghost" onClick={() => setApproval(false)}>
              Not yet
            </button>
            <button
              className="button button-primary"
              onClick={async () => {
                if (preview) {
                  notify('This is a sample preview; no approval was recorded.', 'info');
                  setApproval(false);
                  return;
                }
                try {
                  const r = await post<{ unlocked: boolean }>(
                    `/diaries/${diary.id}/vault/approve`,
                    { confirm: true },
                  );
                  setApproval(false);
                  await refresh();
                  notify(
                    r.unlocked
                      ? 'The Feelings Vault has been revealed together.'
                      : 'Your approval has been recorded. Waiting for the other person.',
                    'success',
                  );
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Could not record approval.', 'error');
                }
              }}
            >
              I understand, approve
            </button>
          </div>
        </Modal>
      )}

      {breaking && (
        <Modal
          title="Reset the writing streak?"
          subtitle="There’s never any expectation to write or share."
          onClose={() => setBreaking(false)}
        >
          <div className="confirmation-copy">
            <p>
              This resets the shared count of consecutive UTC days on which either member published.
              It does not change or delete entries, your connection, or the vault. A reset event is
              recorded.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button button-ghost" onClick={() => setBreaking(false)}>
              Keep it
            </button>
            <button
              className="button button-primary"
              onClick={async () => {
                if (preview) {
                  setBreaking(false);
                  notify('Sample preview only. No streak was changed.', 'info');
                  return;
                }
                try {
                  await post(`/diaries/${diary.id}/streak/break`, { confirm: true });
                  setBreaking(false);
                  await refresh();
                  notify('Writing streak reset.', 'success');
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Could not reset the streak.', 'error');
                }
              }}
            >
              Reset streak
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LockedContent({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="entries-empty">
      <div className="empty-icon">
        <LockKeyhole size={22} />
      </div>
      <h3>A little privacy, just for you.</h3>
      <p>Enter your diary password to decrypt your pages on this device.</p>
      <button className="button button-primary" onClick={onUnlock}>
        <KeyRound size={15} /> Unlock diary
      </button>
    </div>
  );
}

function UnlockModal({
  id,
  envelope,
  onClose,
  onUnlocked,
}: {
  id: string;
  envelope: PasswordEnvelope;
  onClose: () => void;
  onUnlocked: (k: CryptoKey) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const k = await unlockDiaryKey(id, password, envelope);
      setPassword('');
      onUnlocked(k);
    } catch {
      setError('Couldn’t unlock this diary. Check your diary password and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Welcome back to your space."
      subtitle="Your diary password stays on this device."
      onClose={onClose}
    >
      <form onSubmit={submit} className="single-form">
        <label className="field">
          <span>Diary password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your diary password"
          />
        </label>
        <p className="field-help">
          <ShieldCheck size={14} /> Your key stays in memory until this tab is closed or refreshed.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? 'Unlocking…' : 'Unlock diary'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({
  diary,
  preview,
  onClose,
}: {
  diary: Diary;
  preview: boolean;
  onClose: () => void;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const { notify } = useToast();

  async function create() {
    if (preview) {
      notify('Sample preview only. No invitation was created.', 'info');
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ token: string; expiresInHours: number }>(
        `/diaries/${diary.id}/invitations`,
        {},
      );
      setLink(`${window.location.origin}/join#${r.token}`);
      notify('Invitation created.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create an invitation.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      notify('Invitation link copied.', 'success');
    } catch {
      notify('Select and copy the link manually.', 'warning');
    }
  }

  return (
    <Modal
      title={`Invite ${diary.otherName}`}
      subtitle="A connected diary is a space for exactly two people."
      onClose={onClose}
    >
      <div className="confirmation-copy">
        <p>
          Create a one-use invitation link, valid for 72 hours. Anyone with the link can join, so
          send it privately to the intended person.
        </p>
        <p>
          Share the diary password separately through a trusted channel. It is never included in the
          link.
        </p>
      </div>
      {link ? (
        <div className="copy-field">
          <input readOnly aria-label="Invitation link" value={link} />
          <button onClick={() => void copy()}>
            <Copy size={16} /> Copy
          </button>
        </div>
      ) : (
        <button className="button button-primary" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create invitation link'}
        </button>
      )}
      <p className="field-help">Creating another link invalidates the previous unused link.</p>
    </Modal>
  );
}

function VaultPanel({
  diary,
  diaryKey,
  preview,
  onUnlock,
  onApprove,
}: {
  diary: Diary;
  diaryKey: CryptoKey | null;
  preview: boolean;
  onUnlock: () => void;
  onApprove: () => void;
}) {
  const approved = diary.approvals.includes(diary.myId);
  const joined = diary.members.length === 2;
  const vaultParallax = useParallaxRef<HTMLDivElement>(14);

  return (
    <div className="vault-panel">
      <div className="vault-hero-card">
        <div className="vault-intro">
          <span className="vault-wax-emblem" aria-hidden="true">
            <Heart size={20} fill="currentColor" />
          </span>
          <span className="eyebrow">A SPACE FOR HONEST FEELINGS</span>
          <h2>
            The Feelings Vault<span className="heading-period">.</span>
          </h2>
          <p>A place for the words you choose to share, when you both feel ready.</p>
        </div>
        <div ref={vaultParallax} className="vault-hero-art parallax-frame">
          <ThemedImage
            art="vault"
            alt="Twine-tied keepsake letters sealed with a crimson heart wax stamp"
          />
        </div>
      </div>

      {diary.unlockedAt ? (
        <>
          <div className="vault-revealed">
            <Check size={18} />
            <div>
              <strong>Revealed together</strong>
              <p>
                Both approvals were recorded. Only vault-designated entries are shown; all other
                entries remain private.
              </p>
            </div>
          </div>
          {diaryKey ? (
            <EntryList diary={diary} diaryKey={diaryKey} view="vault" />
          ) : (
            <LockedContent onUnlock={onUnlock} />
          )}
        </>
      ) : (
        <>
          <div className="vault-explanation">
            <div>
              <span>01</span>
              <strong>Write, privately</strong>
              <p>Choose “for the vault” while writing an entry.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Both say yes</strong>
              <p>Each person approves independently, in their own time.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Reveal together</strong>
              <p>All designated entries appear at once. The other person can copy or save them.</p>
            </div>
          </div>

          <div className="approval-card">
            <div className="approval-people">
              {diary.members.map((m, i) => (
                <div key={m.id} className={diary.approvals.includes(m.id) ? 'is-approved' : ''}>
                  <Avatar name={m.name} avatar={m.avatar} tone={i ? 'rose' : 'sage'} />
                  <span>
                    <strong>{m.id === diary.myId ? 'You' : m.name}</strong>
                    <small>
                      {diary.approvals.includes(m.id) ? 'Approval recorded' : 'Not approved yet'}
                    </small>
                  </span>
                  {diary.approvals.includes(m.id) && <Check size={16} />}
                </div>
              ))}
              {!joined && (
                <div>
                  <span className="avatar avatar-normal avatar-outline">?</span>
                  <span>
                    <strong>{diary.otherName}</strong>
                    <small>Waiting to join</small>
                  </span>
                </div>
              )}
            </div>
            <p className="vault-note">
              No pressure, no deadline. Your target date is only a reminder and never unlocks the
              vault.
            </p>
            <button
              className="button button-primary"
              disabled={!joined || approved}
              onClick={onApprove}
            >
              {approved ? 'Your approval is recorded' : 'Review and approve'}{' '}
              <ArrowRight size={15} />
            </button>
            {preview && (
              <small className="sample-caption">
                Illustrative sample; approvals are not recorded.
              </small>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SampleWritingStudio({ diary, onBack }: { diary: Diary; onBack: () => void }) {
  const stationery = useStationeryPrefs();
  const { notify } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [forVault, setForVault] = useState(false);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const readMins = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 180)) : 0;

  return (
    <div className={`editor-shell ${stationery.focusDesk ? 'editor-focus-desk' : ''}`}>
      <div className="sample-studio-callout">
        <div>
          <span className="eyebrow">INTERACTIVE SAMPLE DESK</span>
          <h3>Your words belong here.</h3>
          <p>
            Try the paper textures, fountain inks, and writing prompts below. Sign in to encrypt and
            save real pages.
          </p>
        </div>
        <Link viewTransition className="button button-primary" to="/sign-in">
          Get started <ArrowRight size={15} />
        </Link>
      </div>

      <StationeryToolbar
        paper={stationery.paper}
        ink={stationery.ink}
        onPaper={stationery.setPaper}
        onInk={stationery.setInk}
        focusDesk={stationery.focusDesk}
        onToggleFocus={() => stationery.setFocusDesk(f => !f)}
        onSparkPrompt={stationery.cyclePrompt}
      />

      <PromptSlip
        prompt={stationery.activePrompt}
        onApply={text => {
          setTitle(text.replace(/…$/, ''));
          stationery.clearPrompt();
        }}
        onDismiss={stationery.clearPrompt}
      />

      <div className={`editor-paper paper-${stationery.paper} ink-${stationery.ink}`}>
        <span className="paper-binder-holes" aria-hidden="true" />
        <label className="sr-only" htmlFor="sample-entry-title">
          Sample entry title
        </label>
        <input
          id="sample-entry-title"
          className="editor-title"
          placeholder="Give this moment a title…"
          value={title}
          maxLength={160}
          onChange={e => setTitle(e.target.value)}
        />
        <div className="paper-date">
          {new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date())}
        </div>
        <label className="sr-only" htmlFor="sample-entry-body">
          Sample entry body
        </label>
        <textarea
          id="sample-entry-body"
          className="editor-body"
          placeholder="Test how writing feels on lined, dotted, or linen paper…"
          value={body}
          maxLength={8000}
          onChange={e => setBody(e.target.value)}
        />
        <div className="editor-tools">
          <div>
            <button
              type="button"
              onClick={() => stationery.cyclePrompt()}
            >
              <Sparkles size={16} /> Inspire me
            </button>
          </div>
          <span>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
            {readMins > 0 ? ` · ~${readMins} min read` : ''}
          </span>
        </div>
      </div>

      {diary.kind === 'connected' && (
        <label className="vault-toggle">
          <input
            type="checkbox"
            checked={forVault}
            onChange={e => setForVault(e.target.checked)}
          />
          <span className="vault-toggle-icon">
            <LockKeyhole size={15} />
          </span>
          <span>
            <strong>Save this entry for the Feelings Vault</strong>
            <small>It remains private until both of you approve the shared reveal.</small>
          </span>
        </label>
      )}

      <div className="editor-footer">
        <p>
          <ShieldCheck size={15} /> Sample preview scratchpad — nothing typed here leaves this tab.
        </p>
        <div>
          <button type="button" className="button button-ghost" onClick={onBack}>
            Back to pages
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() =>
              notify('Sample preview only — sign in to encrypt and save real entries.', 'info')
            }
          >
            Preview publish <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SampleEntries({ diary }: { diary: Diary }) {
  const connected = diary.kind === 'connected';
  const items = useMemo<ReadableEntryItem[]>(
    () =>
      connected
        ? [
            {
              id: 'sample-1',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-10-12T08:30:00.000Z',
              dateSubtitle: 'Example entry · October 12',
              forVault: false,
              moodTag: 'Quiet morning',
              title: 'A moment worth keeping',
              body: 'A little reminder to slow down, notice the good, and make room for the stories that matter. We walked home the long way past the bakery just because the evening air finally turned cool.',
            },
            {
              id: 'sample-2',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-10-19T20:15:00.000Z',
              dateSubtitle: 'Sample folio · October 19',
              forVault: true,
              moodTag: 'Kept for later',
              title: 'Rain on the kitchen window',
              body: 'You fell asleep on the sofa with your book still open on your chest. I didn’t say anything tonight, so I’m tucking this into the vault for whenever we decide to read these together: thank you for making ordinary Tuesdays feel so steady.',
            },
            {
              id: 'sample-3',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-10-26T18:05:00.000Z',
              dateSubtitle: 'Sample folio · October 26',
              forVault: false,
              moodTag: 'Honest note',
              title: 'Sorting out a noisy week',
              body: 'I’ve been carrying too much work stress into dinner lately. Writing it down here first always helps me figure out what I actually need before I try to explain it out loud.',
            },
            {
              id: 'sample-4',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-11-02T10:40:00.000Z',
              dateSubtitle: 'Sample folio · November 2',
              forVault: true,
              moodTag: 'Gratitude',
              title: 'Two mugs on the windowsill',
              body: 'Pressed a tiny sprig of chamomile between the back pages today. Years from now, I hope we still take twenty slow minutes before the rest of the world wakes up.',
            },
          ]
        : [
            {
              id: 'sample-p1',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-10-14T07:45:00.000Z',
              dateSubtitle: 'Example entry · October 14',
              forVault: false,
              moodTag: 'Morning sun',
              title: 'A moment worth keeping',
              body: 'A little reminder to slow down, notice the good, and make room for the stories that matter. Left my phone in the hallway for an hour and drank tea by the open window.',
            },
            {
              id: 'sample-p2',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-10-22T21:20:00.000Z',
              dateSubtitle: 'Sample folio · October 22',
              forVault: false,
              moodTag: 'Unwinding',
              title: 'Things that felt lighter this week',
              body: 'Saying no without over-explaining. Taking the train without headphones and just watching the trees blur past. Letting unfinished things rest until tomorrow.',
            },
            {
              id: 'sample-p3',
              authorId: diary.myId,
              authorName: 'Alex',
              createdAt: '2026-11-01T09:10:00.000Z',
              dateSubtitle: 'Sample folio · November 1',
              forVault: false,
              moodTag: 'First frost',
              title: 'November intentions, softly held',
              body: 'Not a checklist—just an anchor. More handwritten pages, warmer evenings, and patience with seasons that move at their own pace.',
            },
          ],
    [connected, diary.myId],
  );

  return (
    <DiaryEntryExplorer
      diary={diary}
      items={items}
      view="mine"
      footerSlot={
        <div className="sample-explorer-footer">
          <div className="sample-caption">
            Example content for the preview. No entry has been saved.
          </div>
          {connected && (
            <p className="privacy-caption">
              <ShieldCheck size={15} /> A connected diary doesn’t make your private entries visible
              to the other person.
            </p>
          )}
        </div>
      }
    />
  );
}
