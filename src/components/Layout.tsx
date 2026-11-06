import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  BookHeart,
  ChevronDown,
  Heart,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { sampleUser } from '../sample';
import { useScrollProgressBar, useScrollTopButton } from '../motion';
import { Avatar } from './Avatar';
import { ThemePicker } from './ThemePicker';

function Brand() {
  return (
    <Link viewTransition to="/" className="brand" aria-label="dear, us. home">
      <span className="brand-mark">
        <Heart size={20} strokeWidth={1.35} />
      </span>
      <span>
        dear, us<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}

export function Layout() {
  const { user, preview, leavePreview, signOut } = useAuth();
  const current = preview ? sampleUser : user!;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const progressRef = useScrollProgressBar();
  const { visible: showScrollTop, scrollToTop } = useScrollTopButton(340);

  const nav = [
    { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/diaries', label: 'My diaries', icon: BookHeart },
    { to: '/vault', label: 'Feelings vault', icon: LockKeyhole },
    { to: '/settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div className="app-shell">
      {open && (
        <button className="mobile-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <span className="sidebar-stitch-seam" aria-hidden="true" />
        <div className="sidebar-top">
          <Brand />
          <button
            className="mobile-close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-label">THE JOURNAL</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              viewTransition
              key={to}
              end={end}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>
              {to === '/vault' && <span className="nav-sparkle">✦</span>}
            </NavLink>
          ))}
          {current.isOwner && !preview && (
            <NavLink
              viewTransition
              to="/owner"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <ShieldCheck size={18} />
              <span>Owner panel</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Heart size={17} strokeWidth={1.4} />
          </div>
          <p>
            Let your little moments
            <br />
            <em>take root here.</em>
          </p>
          <span>GROW AT YOUR OWN PACE</span>
        </div>
        <div className="sidebar-bottom">
          <Avatar name={current.name} avatar={current.avatar} tone="cream" />
          <div className="sidebar-user">
            <strong>{preview ? 'Sample account' : current.name}</strong>
            <span>{preview ? 'Just looking around' : 'Your private space'}</span>
          </div>
          <button
            aria-label={preview ? 'Sign in' : 'Sign out'}
            title={preview ? 'Sign in' : 'Sign out'}
            onClick={() => {
              if (preview) {
                leavePreview();
                navigate('/sign-in', { viewTransition: true });
              } else {
                void signOut();
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>YOUR SPACE</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {location.pathname === '/vault'
                ? 'FEELINGS VAULT'
                : location.pathname === '/settings'
                  ? 'SETTINGS'
                  : location.pathname.startsWith('/diaries/')
                    ? 'DIARY'
                    : 'OVERVIEW'}
            </strong>
          </div>
          <div className="top-actions">
            <ThemePicker />
            <div className="top-security">
              <ShieldCheck size={15} />{' '}
              <span>{preview ? 'A thoughtful space' : 'Your private space'}</span>
            </div>
            <span className="top-divider" />
            <Link viewTransition to="/settings" className="profile-link">
              <Avatar
                name={current.name}
                avatar={current.avatar}
                size="small"
                tone="rose"
              />
              <span>{preview ? 'Sample' : current.name.split(' ')[0]}</span>
              <ChevronDown size={14} />
            </Link>
          </div>
          <div ref={progressRef} className="reading-progress" aria-hidden="true" />
        </header>

        {preview && (
          <div className="preview-strip">
            <span className="preview-pill">SAMPLE PREVIEW</span>
            <span>Explore example diaries. No diary data is saved or connected.</span>
            <button
              onClick={() => {
                leavePreview();
                navigate('/sign-in', { viewTransition: true });
              }}
            >
              Set up & sign in <span>→</span>
            </button>
          </div>
        )}

        <main id="main-content">
          <div key={location.pathname} className="route-stage">
            <Outlet />
          </div>
        </main>

        <button
          type="button"
          className={`scroll-top-pill ${showScrollTop ? 'is-visible' : ''}`}
          aria-label="Return to top of journal"
          tabIndex={showScrollTop ? 0 : -1}
          onClick={scrollToTop}
        >
          <ArrowUp size={15} />
          <span>Top of journal</span>
        </button>
      </div>
    </div>
  );
}
