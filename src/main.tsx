import { createRoot } from 'react-dom/client';
import App from './App';
import { initializeTheme } from './theme';
import './styles.css';
import './theme.css';
initializeTheme();
createRoot(document.getElementById('root')!).render(<App/>);
