
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config'

let adminApp: App;

if (getApps().length === 0) {
    adminApp = initializeApp();
} else {
    adminApp = getApps()[0]!;
}

export const adminDb = getFirestore(adminApp);
