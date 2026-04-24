'use client';
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Check, Tag } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Category } from '@/types';
import { getCategories, createCategory, updateCategory, deleteCategory, seedDefaultCategories } from '@/lib/categories-firestore';

const EMPTY_FORM = { name: '', icon: '' };
const COMMON_EMOJIS = ['🏷️', '🥛', '⚖️', '🌾', '🫙', '🍟', '🥤', '🍪', '🏠', '🪥', '🧂', '🍜', '🍌', '🥩', '🧹', '🍫', '🧴', '🫧', '📦', '🥚'];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Try fetching; if empty, seed defaults first
      const data = await getCategories();
      if (data.length === 0) {
        await seedDefaultCategories();
        const seeded = await getCategories();
        setCategories(seeded);
      } else {
        setCategories(data);
      }
    } catch {
      toast.error('Failed to load categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, icon: c.icon ?? '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Category name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, { name: form.name, icon: form.icon || undefined });
        toast.success('Category updated');
      } else {
        await createCategory({ name: form.name, icon: form.icon || undefined });
        toast.success('Category added');
      }
      setShowModal(false);
      load();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Category) {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await deleteCategory(c.id);
      toast.success('Category deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Categories</h1>
          <p className="text-xs text-gray-500">{categories.length} categories</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> Add Category
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Tag size={40} className="text-gray-200" />
            <p className="text-gray-400 text-sm">No categories yet. Add your first one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {categories.map(c => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-3 group hover:border-saffron-200 hover:shadow-md transition-all">
                <div className="text-4xl leading-none">{c.icon || '🏷️'}</div>
                <p className="text-sm font-semibold text-gray-800 text-center leading-tight">{c.name}</p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {/* Add new card */}
            <button onClick={openAdd} className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-4 flex flex-col items-center justify-center gap-2 hover:border-saffron-300 hover:bg-saffron-50 transition-all min-h-[120px]">
              <Plus size={24} className="text-gray-300" />
              <span className="text-xs text-gray-400 font-medium">Add Category</span>
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="label">Category Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                  placeholder="e.g. Dairy, Snacks, Beverages"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Icon (Emoji)</label>
                <input
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  className="input"
                  placeholder="🏷️"
                  maxLength={4}
                />
                <p className="text-xs text-gray-400 mt-1.5">Pick one below or type your own emoji</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {COMMON_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setForm(f => ({ ...f, icon: emoji }))}
                      className={`text-xl p-1.5 rounded-lg border transition-all ${form.icon === emoji ? 'border-saffron-400 bg-saffron-50' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              {form.icon && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <span className="text-3xl">{form.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-800">{form.name || 'Category Name'}</p>
                    <p className="text-xs text-gray-400">Preview</p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.label{display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.input{width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;transition:border-color .15s}.input:focus{border-color:#ff9933}`}</style>
    </div>
  );
}
