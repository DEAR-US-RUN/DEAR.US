import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, Sparkles, X } from 'lucide-react';

export type PaperStyle = 'ruled' | 'dotted' | 'linen';
export type InkTone = 'walnut' | 'botanical' | 'midnight' | 'bordeaux';

export interface StationeryPrefs {
  paper: PaperStyle;
  ink: InkTone;
}

const STORAGE_KEY = 'dear-us:stationery';

export const JOURNAL_PROMPTS = [
  'A quiet detail from today I don’t want to forget…',
  'Something I wanted to tell you, even if I held back…',
  'Where did I feel most like myself this week?',
  'A small kindness that softened my afternoon…',
  'What I hope we remember when we read this years from now…',
  'Three sounds, scents, or colors around me right now…',
];

function loadPrefs(): StationeryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { paper: 'ruled', ink: 'walnut' };
    const parsed = JSON.parse(raw);
    const paper: PaperStyle =
      parsed?.paper === 'dotted' || parsed?.paper === 'linen' ? parsed.paper : 'ruled';
    const ink: InkTone =
      parsed?.ink === 'botanical' || parsed?.ink === 'midnight' || parsed?.ink === 'bordeaux'
        ? parsed.ink
        : 'walnut';
    return { paper, ink };
  } catch {
    return { paper: 'ruled', ink: 'walnut' };
  }
}

export function useStationeryPrefs() {
  const [prefs, setPrefs] = useState<StationeryPrefs>(loadPrefs);
  const [focusDesk, setFocusDesk] = useState(false);
  const [promptIndex, setPromptIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* Ignore storage quota errors */
    }
  }, [prefs]);

  const cyclePrompt = () => {
    setPromptIndex(prev => (prev === null ? 0 : (prev + 1) % JOURNAL_PROMPTS.length));
  };

  const activePrompt = promptIndex !== null ? JOURNAL_PROMPTS[promptIndex] : null;

  return {
    paper: prefs.paper,
    ink: prefs.ink,
    setPaper: (paper: PaperStyle) => setPrefs(p => ({ ...p, paper })),
    setInk: (ink: InkTone) => setPrefs(p => ({ ...p, ink })),
    focusDesk,
    setFocusDesk,
    activePrompt,
    cyclePrompt,
    clearPrompt: () => setPromptIndex(null),
  };
}

export function StationeryToolbar({
  paper,
  ink,
  onPaper,
  onInk,
  focusDesk,
  onToggleFocus,
  onSparkPrompt,
}: {
  paper: PaperStyle;
  ink: InkTone;
  onPaper: (p: PaperStyle) => void;
  onInk: (i: InkTone) => void;
  focusDesk: boolean;
  onToggleFocus: () => void;
  onSparkPrompt: () => void;
}) {
  return (
    <div className="stationery-bar" role="region" aria-label="Notebook stationery options">
      <div className="stationery-group" role="group" aria-label="Paper texture">
        <span className="stationery-label">Paper</span>
        {(['ruled', 'dotted', 'linen'] as const).map(p => (
          <button
            key={p}
            type="button"
            className={paper === p ? 'active' : ''}
            aria-pressed={paper === p}
            onClick={() => onPaper(p)}
          >
            {p === 'ruled' ? 'Ruled' : p === 'dotted' ? 'Dot grid' : 'Linen'}
          </button>
        ))}
      </div>

      <div className="stationery-group" role="group" aria-label="Fountain ink color">
        <span className="stationery-label">Ink</span>
        {(
          [
            { id: 'walnut', label: 'Walnut' },
            { id: 'botanical', label: 'Forest' },
            { id: 'midnight', label: 'Midnight' },
            { id: 'bordeaux', label: 'Bordeaux' },
          ] as const
        ).map(item => (
          <button
            key={item.id}
            type="button"
            className={`ink-swatch ink-swatch-${item.id} ${ink === item.id ? 'active' : ''}`}
            aria-label={`${item.label} ink`}
            aria-pressed={ink === item.id}
            title={`${item.label} ink`}
            onClick={() => onInk(item.id)}
          />
        ))}
      </div>

      <div className="stationery-actions">
        <button type="button" className="stationery-action-btn" onClick={onSparkPrompt}>
          <Sparkles size={13} /> Prompt spark
        </button>
        <button
          type="button"
          className={`stationery-action-btn ${focusDesk ? 'active' : ''}`}
          aria-pressed={focusDesk}
          onClick={onToggleFocus}
        >
          {focusDesk ? <Minimize2 size={13} /> : <Maximize2 size={13} />} Desk focus
        </button>
      </div>
    </div>
  );
}

export function PromptSlip({
  prompt,
  onApply,
  onDismiss,
}: {
  prompt: string | null;
  onApply: (text: string) => void;
  onDismiss: () => void;
}) {
  if (!prompt) return null;
  return (
    <div className="prompt-slip">
      <div>
        <span className="eyebrow">WRITING SPARK</span>
        <p>“{prompt}”</p>
      </div>
      <div className="prompt-slip-actions">
        <button type="button" className="button button-outline" onClick={() => onApply(prompt)}>
          Use as title
        </button>
        <button
          type="button"
          className="prompt-slip-close"
          aria-label="Dismiss prompt"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
