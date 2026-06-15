import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';

export type UserRole = 'requester' | 'setup_owner' | 'admin';

export interface AuthenticatedUserProfile {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  setupOwnerDepartment: 'GNTC' | 'MFG' | null;
}

export interface AuthSessionData extends SessionData {
  userId?: string;
}

export type AuthenticatedRequest = Request & {
  session: Session & Partial<AuthSessionData>;
};
