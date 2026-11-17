export interface UserAccount {
  id: string;
  username: string;
  password: string; // Stored securely in localStorage for this app
  fullName: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  permissions: {
    canSearch: boolean;
    canAddEdit: boolean;
    allowedBoxIds: number[] | 'all'; // 'all' or list of box IDs
    allowedYears: number[] | 'all'; // 'all' or list of years
  };
  createdAt: string;
}

export const SUPER_ADMIN_PASSWORD = '5199';

export const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'admin-1',
    username: 'admin',
    password: '5199',
    fullName: 'المدير العام (Super Admin)',
    role: 'admin',
    status: 'active',
    permissions: {
      canSearch: true,
      canAddEdit: true,
      allowedBoxIds: 'all',
      allowedYears: 'all',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-1',
    username: 'reader',
    password: '123',
    fullName: 'مستخدم قارئ (معاينة عامة)',
    role: 'user',
    status: 'active',
    permissions: {
      canSearch: true,
      canAddEdit: false,
      allowedBoxIds: 'all',
      allowedYears: 'all',
    },
    createdAt: new Date().toISOString(),
  },
];

const USERS_STORAGE_KEY = 'archive_system_users_v1';
const SESSION_STORAGE_KEY = 'archive_current_session_v1';

export function getStoredUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  saveStoredUsers(DEFAULT_USERS);
  return DEFAULT_USERS;
}

export function saveStoredUsers(users: UserAccount[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

export function getActiveSession(): UserAccount | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.username) {
        // Verify user still exists and is not blocked
        const allUsers = getStoredUsers();
        const found = allUsers.find((u) => u.id === user.id || u.username === user.username);
        if (found && found.status === 'active') {
          return found;
        }
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function saveActiveSession(user: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function authenticateUser(username: string, pass: string): { success: boolean; user?: UserAccount; error?: string } {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = pass.trim();

  const users = getStoredUsers();
  const user = users.find((u) => u.username.toLowerCase() === cleanUser);

  if (!user) {
    // Special check for super admin override with 5199
    if (cleanUser === 'admin' && cleanPass === SUPER_ADMIN_PASSWORD) {
      const adminUser = users.find((u) => u.username === 'admin') || DEFAULT_USERS[0];
      return { success: true, user: adminUser };
    }
    return { success: false, error: 'اسم المستخدم غير موجود.' };
  }

  if (user.status === 'blocked') {
    return { success: false, error: 'عذراً، هذا الحساب محظور من قِبل المدير العام.' };
  }

  if (user.password !== cleanPass) {
    // Check master password override for admin
    if (user.username === 'admin' && cleanPass === SUPER_ADMIN_PASSWORD) {
      return { success: true, user };
    }
    return { success: false, error: 'كلمة المرور غير صحيحة.' };
  }

  return { success: true, user };
}
