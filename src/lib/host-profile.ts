import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Kept apart from sessions, which anyone holding a table link can read.
const HOST_PROFILES = "hostProfiles";

export type HostProfile = {
  name: string;
  phone: string;
  playerCode: string;
};

export async function getHostProfile(uid: string): Promise<HostProfile | null> {
  const snap = await getDoc(doc(db, HOST_PROFILES, uid));
  return snap.exists() ? (snap.data() as HostProfile) : null;
}

export async function saveHostProfile(uid: string, profile: HostProfile): Promise<void> {
  await setDoc(doc(db, HOST_PROFILES, uid), { ...profile, updatedAt: serverTimestamp() });
}

export async function linkPlayerCode(uid: string, playerCode: string): Promise<void> {
  await setDoc(
    doc(db, HOST_PROFILES, uid),
    { playerCode, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
