import React, { useState } from 'react';
import { UserAccount, getStoredUsers, saveStoredUsers, SUPER_ADMIN_PASSWORD } from '../services/authService';
import { Users, UserPlus, Shield, Lock, Unlock, Trash2, X, Check, KeyRound, AlertTriangle } from 'lucide-react';

interface UserManagementModalProps {
  currentUser: UserAccount;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export function UserManagementModal({ currentUser, onClose, showToast }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserAccount[]>(getStoredUsers);
  const [showAddForm, setShowAddForm] = useState(false);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [canSearch, setCanSearch] = useState(true);
  const [canAddEdit, setCanAddEdit] = useState(false);

  const isSuperAdmin = currentUser.username === 'admin' || currentUser.role === 'admin';

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim() || !newFullName.trim()) {
      showToast('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (users.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      showToast('اسم المستخدم موجود بالفعل، يرجى اختيار اسم آخر');
      return;
    }

    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      username: newUsername.trim(),
      password: newPassword.trim(),
      fullName: newFullName.trim(),
      role: newRole,
      status: 'active' as const,
      permissions: {
        canSearch,
        canAddEdit,
        allowedBoxIds: 'all',
        allowedYears: 'all',
      },
      createdAt: new Date().toISOString(),
    };

    const updated = [...users, newUser];
    setUsers(updated);
    saveStoredUsers(updated);
    showToast(`تم إنشاء المستخدم "${newUser.fullName}" بنجاح!`);

    // Reset form
    setNewUsername('');
    setNewPassword('');
    setNewFullName('');
    setNewRole('user');
    setShowAddForm(false);
  };

  const handleToggleStatus = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    if (target.username === 'admin') {
      showToast('لا يمكن حظر حساب المدير العام الرئيسي.');
      return;
    }

    const nextStatus: 'active' | 'blocked' = target.status === 'active' ? 'blocked' : 'active';
    const updated = users.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u));
    setUsers(updated);
    saveStoredUsers(updated);
    showToast(nextStatus === 'blocked' ? `تم حظر المستخدم ${target.fullName}` : `تم فتح الدخول للمستخدم ${target.fullName}`);
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    if (target.username === 'admin') {
      showToast('لا يمكن حذف حساب المدير العام الرئيسي.');
      return;
    }

    if (window.confirm(`هل أنت متأكد من حذف المستخدم "${target.fullName}"؟`)) {
      const updated = users.filter((u) => u.id !== userId);
      setUsers(updated);
      saveStoredUsers(updated);
      showToast('تم حذف المستخدم بنجاح.');
    }
  };

  const handleResetPassword = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const newPass = prompt(`أدخل كلمة المرور الجديدة للمستخدم "${target.fullName}":`);
    if (newPass && newPass.trim()) {
      const updated = users.map((u) => (u.id === userId ? { ...u, password: newPass.trim() } : u));
      setUsers(updated);
      saveStoredUsers(updated);
      showToast(`تم تغيير كلمة مرور المستخدم ${target.fullName} بنجاح.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">إدارة المستخدمين والصلاحيات</h3>
              <p className="text-xs text-slate-400">التحكم في صلاحيات الدخول، كلمات المرور، وحظر المستخدمين</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Master Admin Notice */}
          <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200 space-y-1">
              <div className="font-bold text-white">كلمة مرور المدير العام (Super Admin): <code className="bg-blue-900/60 px-2 py-0.5 rounded font-mono text-emerald-300">5199</code></div>
              <div>المدير العام يمتلك الصلاحية الكاملة لإضافة مستخدمين جدد، تغيير كلمات المرور، أو منع وفتح الدخول لأي مستخدم في النظام.</div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>قائمة المستخدمين المسجلين</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono">{users.length}</span>
            </h4>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>{showAddForm ? 'إلغاء' : 'إضافة مستخدم جديد'}</span>
            </button>
          </div>

          {/* Add User Form */}
          {showAddForm && (
            <form onSubmit={handleCreateUser} className="bg-slate-950 border border-blue-500/30 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
              <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider">إنشاء حساب مستخدم جديد</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="مثال: أحمد محمد (محاسب)"
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">اسم المستخدم للدخول</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="مثال: ahmed"
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">كلمة المرور</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="كلمة المرور"
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={canSearch}
                    onChange={(e) => setCanSearch(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <span>صلاحية البحث</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={canAddEdit}
                    onChange={(e) => setCanAddEdit(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <span>صلاحية الإضافة والتعديل والحذف</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  حفظ وإنشاء المستخدم
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">المستخدم</th>
                  <th className="px-4 py-3">الحساب والصلاحيات</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => {
                  const isMasterAdmin = u.username === 'admin';
                  const isBlocked = u.status === 'blocked';
                  return (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isMasterAdmin ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' : 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                          }`}>
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {isMasterAdmin && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">المدير العام</span>
                              )}
                            </div>
                            <div className="text-slate-400 font-mono text-[11px]">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            u.permissions.canAddEdit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {u.permissions.canAddEdit ? 'إضافة وتعديل' : 'قارئ فقط'}
                          </span>
                          {u.permissions.canSearch && <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">بحث متاح</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          isBlocked ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                          <span>{isBlocked ? 'محظور (ممنوع من الدخول)' : 'نشط (مسموح بالدخول)'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            title="تغيير كلمة المرور"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {!isMasterAdmin && (
                            <>
                              <button
                                onClick={() => handleToggleStatus(u.id)}
                                title={isBlocked ? 'فتح الدخول للمستخدم' : 'منع دخول المستخدم'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isBlocked ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'
                                }`}
                              >
                                {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                title="حذف المستخدم"
                                className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
