import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Category } from '@/types';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'dairy', name: 'Dairy', icon: '🥛' },
  { id: 'loose', name: 'Loose', icon: '⚖️' },
  { id: 'grains', name: 'Grains', icon: '🌾' },
  { id: 'oil', name: 'Oil', icon: '🫙' },
  { id: 'snacks', name: 'Snacks', icon: '🍟' },
  { id: 'beverages', name: 'Beverages', icon: '🥤' },
  { id: 'biscuits', name: 'Biscuits', icon: '🍪' },
  { id: 'household', name: 'Household', icon: '🏠' },
  { id: 'personal-care', name: 'Personal Care', icon: '🪥' },
  { id: 'essentials', name: 'Essentials', icon: '🧂' },
  { id: 'instant-food', name: 'Instant Food', icon: '🍜' },
  { id: 'fruits', name: 'Fruits', icon: '🍌' },
];

export async function getCategories(): Promise<Category[]> {
  try {
    const snap = await getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')));
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

export async function createCategory(data: Omit<Category, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'categories'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<void> {
  await updateDoc(doc(db, 'categories', id), data);
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, 'categories', id));
}

/** Seed defaults into Firestore if collection is empty */
export async function seedDefaultCategories(): Promise<void> {
  const snap = await getDocs(collection(db, 'categories'));
  if (!snap.empty) return;
  for (const cat of DEFAULT_CATEGORIES) {
    await addDoc(collection(db, 'categories'), { name: cat.name, icon: cat.icon ?? '', createdAt: serverTimestamp() });
  }
}
