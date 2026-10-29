import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
const config={apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,appId:import.meta.env.VITE_FIREBASE_APP_ID,messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID};
export const firebaseConfigured=Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
export const auth=firebaseConfigured ? getAuth(initializeApp(config)) : null;
// The local emulator is compiled out of production builds. Never point a deployed build at it.
if (auth && import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
 const url=new URL(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL);
 if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Auth emulator must be local.');
 connectAuthEmulator(auth,url.origin,{disableWarnings:true});
}
export const googleProvider=new GoogleAuthProvider();
googleProvider.setCustomParameters({prompt:'select_account'});
