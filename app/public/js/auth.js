import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-analytics.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect
} from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA7bgu7if0_0IzIWkbBr0lKFiClyu09mfA',
  authDomain: 'temporaryprojectdmii.firebaseapp.com',
  projectId: 'temporaryprojectdmii',
  storageBucket: 'temporaryprojectdmii.appspot.com',
  messagingSenderId: '414973090394',
  appId: '1:414973090394:web:288cbd655aa9521e291663'
};

const firebase = initializeApp(firebaseConfig);

const auth = getAuth();
const provider = new GoogleAuthProvider();

document.getElementById('loginButton').addEventListener('click', function() {
  signInWithRedirect(auth, provider);
});

auth.onAuthStateChanged(user => {
  if (user) {
    console.log('User signed in:', user);
    window.localStorage.setItem('username', user.displayName || 'Unknown');
    window.location.href = '/';
  } else {
    console.log('User signed out');
    window.localStorage.removeItem('username');
  }
});
