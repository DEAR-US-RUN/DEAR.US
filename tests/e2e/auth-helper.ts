// Test-only module served by Vite in development; it is never included in the production entry point.
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../../src/firebase';
export async function emulatorGoogleSignIn(uid:string,name:string) {
 if(!import.meta.env.DEV || !import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || !auth)throw new Error('Only for the local Firebase Auth emulator.');
 const fakeIdToken=JSON.stringify({sub:uid,email:`${uid}@example.test`,email_verified:true,name});
 await signInWithCredential(auth,GoogleAuthProvider.credential(fakeIdToken));
}
