import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlignJustify,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  LockKeyhole,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { Attachment, Diary } from '../types';
import { dateLabel } from '../format';
import { runViewTransition, useScrollRevealRef, useSpotlightHandlers } from '../motion';
import { Avatar } from './Avatar';

export interface ReadableEntryItem {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  dateSubtitle?: string;
  forVault: boolean;
  title?: string;
  body?: string;
  moodTag?: string;
  attachments?: Attachment[];
  error?: boolean;
}

type ReadingMode = 'stream' | 'book';
type EntryFilter = 'all' | 'private' | 'vault' | 'bookmarked';

const BOOKMARK_KEY_PREFIX = 'dear-us:bookmarks:';

function readStoredBookmarks(diaryId: string): string[] {
  try {
    const raw = localStorage.getItem(`${BOOKMARK_KEY_PREFIX}${diaryId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredBookmarks(diaryId: string, ids: string[]) {
  try {
    localStorage.setItem(`${BOOKMARK_KEY_PREFIX}${diaryId}`, JSON.stringify(ids));
  } catch {
    /* Session-only bookmarks still work when storage is unavailable. */
  }
}

function StreamPageCard({
  item,
  index,
  diary,
  view,
  bookmarked,
  onToggleBookmark,
  renderAttachments,
}: {
  item: ReadableEntryItem;
  index: number;
  diary: Diary;
  view: 'mine' | 'vault';
  bookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  renderAttachments?: (entryId: string, attachments: Attachment[]) => ReactNode;
}) {
  const revealRef = useScrollRevealRef<HTMLElement>();
  const spotlight = useSpotlightHandlers<HTMLElement>();
  const dateStr =
    item.dateSubtitle || dateLabel(item.createdAt, { month: 'long', day: 'numeric', year: 'numeric' });
  const shortDay = item.dateSubtitle
    ? `P.${String(index + 1).padStart(2, '0')}`
    : dateLabel(item.createdAt, { month: 'short', day: 'numeric' });

  return (
    <div className="timeline-entry-row">
      <div className="timeline-marker" aria-hidden="true">
        <span className="timeline-dot" />
        <span className="timeline-date-chip">{shortDay}</span>
      </div>
      <article
        ref={revealRef}
        className={`entry-card entry-card-lined spotlight-card ${bookmarked ? 'is-bookmarked' : ''}`}
        {...spotlight}
      >
        <button
          type="button"
          className={`page-ribbon-toggle ${bookmarked ? 'active' : ''}`}
          aria-label={bookmarked ? 'Remove page bookmark' : 'Bookmark this page'}
          aria-pressed={bookmarked}
          title={bookmarked ? 'Bookmarked on this device' : 'Bookmark this page'}
          onClick={() => onToggleBookmark(item.id)}
        >
          <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>

        <div className="entry-folio-strip">
          <span>FOLIO · PAGE {String(index + 1).padStart(2, '0')}</span>
          {item.moodTag && <span className="entry-mood-stamp">✦ {item.moodTag}</span>}
        </div>

        <div className="entry-heading">
          <div className="entry-author">
            <Avatar
              name={item.authorName}
              size="small"
              tone={item.authorId === diary.myId ? 'sage' : 'rose'}
            />
            <div>
              <strong>{item.authorId === diary.myId ? 'You' : item.authorName}</strong>
              <span>{dateStr}</span>
            </div>
          </div>
          <span className={`entry-badge ${item.forVault ? 'entry-badge-rose' : ''}`}>
            {item.forVault ? <Heart size={12} /> : <LockKeyhole size={12} />}{' '}
            {item.forVault ? (view === 'vault' ? 'REVEALED' : 'FOR THE VAULT') : 'PRIVATE'}
          </span>
        </div>

        {item.error ? (
          <p className="form-error">This entry could not be decrypted with this diary key.</p>
        ) : (
          <>
            <h3>{item.title || 'An untitled moment'}</h3>
            <p className="entry-text">{item.body}</p>
            {item.attachments?.length && renderAttachments
              ? renderAttachments(item.id, item.attachments)
              : null}
          </>
        )}
      </article>
    </div>
  );
}

export function DiaryEntryExplorer({
  diary,
  items,
  view,
  renderAttachments,
  footerSlot,
}: {
  diary: Diary;
  items: ReadableEntryItem[];
  view: 'mine' | 'vault';
  renderAttachments?: (entryId: string, attachments: Attachment[]) => ReactNode;
  footerSlot?: ReactNode;
}) {
  const [mode, setMode] = useState<ReadingMode>('stream');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EntryFilter>('all');
  const [bookmarks, setBookmarks] = useState<string[]>(() => readStoredBookmarks(diary.id));
  const [pageIndex, setPageIndex] = useState(0);
  const [turnDir, setTurnDir] = useState<'next' | 'prev'>('next');
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 760,
  );

  useEffect(() => {
    setBookmarks(readStoredBookmarks(diary.id));
  }, [diary.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsNarrow(window.innerWidth <= 760);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleBookmark = useCallback(
    (id: string) => {
      setBookmarks(prev => {
        const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
        writeStoredBookmarks(diary.id, next);
        return next;
      });
    },
    [diary.id],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (filter === 'private' && item.forVault) return false;
      if (filter === 'vault' && !item.forVault) return false;
      if (filter === 'bookmarked' && !bookmarks.includes(item.id)) return false;
      if (!q) return true;
      return (
        (item.title || '').toLowerCase().includes(q) ||
        (item.body || '').toLowerCase().includes(q) ||
        (item.moodTag || '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, query, bookmarks]);

  const pagesPerSpread = isNarrow ? 1 : 2;
  const totalSpreads = Math.max(1, Math.ceil(filtered.length / pagesPerSpread));
  const safeSpread = Math.min(pageIndex, totalSpreads - 1);

  useEffect(() => {
    setPageIndex(0);
  }, [filter, query, isNarrow]);

  const goSpread = useCallback(
    (nextSpread: number) => {
      const clamped = Math.max(0, Math.min(totalSpreads - 1, nextSpread));
      if (clamped === safeSpread) return;
      const direction = clamped > safeSpread ? 'next' : 'prev';
      runViewTransition(
        () => {
          setTurnDir(direction);
          setPageIndex(clamped);
        },
        { kind: 'book' },
      );
    },
    [safeSpread, totalSpreads],
  );

  useEffect(() => {
    if (mode !== 'book') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goSpread(safeSpread + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goSpread(safeSpread - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, safeSpread, goSpread]);

  const switchMode = (next: ReadingMode) => {
    if (next === mode) return;
    runViewTransition(() => setMode(next), { kind: 'tab' });
  };

  const spreadItems = filtered.slice(
    safeSpread * pagesPerSpread,
    safeSpread * pagesPerSpread + pagesPerSpread,
  );

  return (
    <div className="journal-explorer">
      <div className="journal-toolbar" role="region" aria-label="Journal reading controls">
        <div className="journal-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search pages in this diary"
            placeholder="Search moments, titles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="journal-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="journal-filter-pills" role="group" aria-label="Filter pages">
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All <span>{items.length}</span>
          </button>
          {view === 'mine' && diary.kind === 'connected' && (
            <>
              <button
                type="button"
                className={filter === 'private' ? 'active' : ''}
                onClick={() => setFilter('private')}
              >
                Private
              </button>
              <button
                type="button"
                className={filter === 'vault' ? 'active' : ''}
                onClick={() => setFilter('vault')}
              >
                Vault
              </button>
            </>
          )}
          <button
            type="button"
            className={filter === 'bookmarked' ? 'active' : ''}
            onClick={() => setFilter('bookmarked')}
          >
            <Bookmark size={12} /> Saved{' '}
            {bookmarks.length > 0 && <span>{bookmarks.length}</span>}
          </button>
        </div>

        <div className="journal-mode-switch" role="group" aria-label="Reading layout">
          <button
            type="button"
            className={mode === 'stream' ? 'active' : ''}
            aria-pressed={mode === 'stream'}
            onClick={() => switchMode('stream')}
          >
            <AlignJustify size={14} /> Stream
          </button>
          <button
            type="button"
            className={mode === 'book' ? 'active' : ''}
            aria-pressed={mode === 'book'}
            onClick={() => switchMode('book')}
          >
            <BookOpen size={14} /> Open book
          </button>
        </div>
      </div>

      {!filtered.length ? (
        <div className="entries-empty">
          <div className="empty-icon">
            <Sparkles size={20} />
          </div>
          <h3>No matching pages found.</h3>
          <p>Try clearing your search or switching back to all pages.</p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            Show all pages
          </button>
        </div>
      ) : mode === 'stream' ? (
        <div className="entry-list entry-timeline-stream">
          {filtered.map((item, idx) => (
            <StreamPageCard
              key={item.id}
              item={item}
              index={idx}
              diary={diary}
              view={view}
              bookmarked={bookmarks.includes(item.id)}
              onToggleBookmark={toggleBookmark}
              renderAttachments={renderAttachments}
            />
          ))}
        </div>
      ) : (
        <div className="open-book-stage">
          <div
            key={`${safeSpread}-${turnDir}`}
            className={`open-book-frame turn-${turnDir} ${isNarrow ? 'single-sheet' : 'two-sheet'}`}
          >
            <span className="book-center-ribbon" aria-hidden="true" />
            {spreadItems.map((page, slotIdx) => {
              const absoluteNum = safeSpread * pagesPerSpread + slotIdx + 1;
              const isPinned = bookmarks.includes(page.id);
              const dateStr =
                page.dateSubtitle ||
                dateLabel(page.createdAt, { month: 'long', day: 'numeric', year: 'numeric' });
              return (
                <article
                  key={page.id}
                  className={`book-leaf ${slotIdx === 0 ? 'book-leaf-left' : 'book-leaf-right'}`}
                >
                  <header className="book-leaf-header">
                    <span>
                      PAGE {String(absoluteNum).padStart(2, '0')} /{' '}
                      {String(filtered.length).padStart(2, '0')}
                    </span>
                    <div className="book-leaf-actions">
                      <span className={`entry-badge ${page.forVault ? 'entry-badge-rose' : ''}`}>
                        {page.forVault ? <Heart size={11} /> : <LockKeyhole size={11} />}{' '}
                        {page.forVault ? 'VAULT' : 'PRIVATE'}
                      </span>
                      <button
                        type="button"
                        className={`book-pin-btn ${isPinned ? 'active' : ''}`}
                        aria-label={isPinned ? 'Remove page bookmark' : 'Bookmark this page'}
                        aria-pressed={isPinned}
                        onClick={() => toggleBookmark(page.id)}
                      >
                        <Bookmark size={14} fill={isPinned ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </header>

                  <div className="book-leaf-meta">
                    <Avatar
                      name={page.authorName}
                      size="small"
                      tone={page.authorId === diary.myId ? 'sage' : 'rose'}
                    />
                    <div>
                      <strong>{page.authorId === diary.myId ? 'You' : page.authorName}</strong>
                      <span>{dateStr}</span>
                    </div>
                    {page.moodTag && <em className="book-mood-chip">✦ {page.moodTag}</em>}
                  </div>

                  {page.error ? (
                    <p className="form-error">
                      This entry could not be decrypted with this diary key.
                    </p>
                  ) : (
                    <div className="book-leaf-body">
                      <h3>{page.title || 'An untitled moment'}</h3>
                      <p className="entry-text">{page.body}</p>
                      {page.attachments?.length && renderAttachments
                        ? renderAttachments(page.id, page.attachments)
                        : null}
                    </div>
                  )}

                  <footer className="book-leaf-footer">
                    <span>{diary.title}</span>
                    <span>— {absoluteNum} —</span>
                  </footer>
                </article>
              );
            })}

            {!isNarrow && spreadItems.length === 1 && (
              <div className="book-leaf book-leaf-right book-leaf-blank" aria-hidden="true">
                <div className="blank-leaf-watermark">
                  <span>✳</span>
                  <p>
                    An unwritten page,
                    <br />
                    <em>waiting for your next moment.</em>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="book-controls">
            <button
              type="button"
              className="button button-outline book-turn-btn"
              disabled={safeSpread === 0}
              onClick={() => goSpread(safeSpread - 1)}
            >
              <ChevronLeft size={15} /> Previous page
            </button>

            <div className="book-spread-dots" role="tablist" aria-label="Diary spreads">
              {Array.from({ length: totalSpreads }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === safeSpread}
                  aria-label={`Spread ${idx + 1} of ${totalSpreads}`}
                  className={`spread-dot ${idx === safeSpread ? 'active' : ''}`}
                  onClick={() => goSpread(idx)}
                />
              ))}
            </div>

            <button
              type="button"
              className="button button-outline book-turn-btn"
              disabled={safeSpread >= totalSpreads - 1}
              onClick={() => goSpread(safeSpread + 1)}
            >
              Next page <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {footerSlot}
    </div>
  );
}
