import { lazy,Suspense } from 'react';
import { createBrowserRouter,RouterProvider,Outlet,Navigate,useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { AuthProvider,useAuth } from './AuthContext';
import { ThemeProvider } from './theme';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
const DiaryPage=lazy(()=>import('./pages/DiaryPage').then(m=>({default:m.DiaryPage})));
const Vaults=lazy(()=>import('./pages/Vaults').then(m=>({default:m.Vaults})));
const Settings=lazy(()=>import('./pages/Settings').then(m=>({default:m.Settings})));
const Owner=lazy(()=>import('./pages/Owner').then(m=>({default:m.Owner})));
const Join=lazy(()=>import('./pages/Join').then(m=>({default:m.Join})));
const SignIn=lazy(()=>import('./pages/SignIn').then(m=>({default:m.SignIn})));
function AuthGate(){const {loading,user,preview}=useAuth();const location=useLocation();if(loading)return <div className="boot-screen"><span>dear, us<span>.</span></span><p>Making a little space for you…</p></div>;
 if(location.pathname==='/sign-in'&&user&&!preview)return <Navigate to="/" replace/>;
 if(location.pathname!=='/sign-in'&&!user&&!preview)return <Suspense fallback={<div className="loading-block">Opening your space…</div>}><SignIn/></Suspense>;
 return <Suspense fallback={<div className="loading-block">Opening your space…</div>}><Outlet/></Suspense>;
}
const router=createBrowserRouter([{element:<AuthGate/>,children:[
 {path:'/sign-in',element:<SignIn/>},
 {element:<Layout/>,children:[
  {path:'/',element:<Dashboard/>},{path:'/diaries',element:<Dashboard/>},{path:'/diaries/:id',element:<DiaryPage/>},
  {path:'/vault',element:<Vaults/>},{path:'/settings',element:<Settings/>},{path:'/join',element:<Join/>},
  {path:'/owner',element:<Owner/>},{path:'*',element:<Navigate to="/" replace/>},
 ]},
]}]);
export default function App(){return <ThemeProvider><ToastProvider><AuthProvider><RouterProvider router={router}/></AuthProvider></ToastProvider></ThemeProvider>;}
