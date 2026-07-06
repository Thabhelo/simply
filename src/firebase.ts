import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCyTAL65fgRCiXUHay-Crx4WzbfIYS36KI',
  authDomain: 'simply-def0f-e4e3f.firebaseapp.com',
  projectId: 'simply-def0f-e4e3f',
  storageBucket: 'simply-def0f-e4e3f.firebasestorage.app',
  messagingSenderId: '448198565907',
  appId: '1:448198565907:web:0f4b219d289c283afadfe6',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
