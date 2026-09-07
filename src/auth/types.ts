export interface AuthUser {
  id: string;
  username: string | null;
  display_name: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: AuthUser;
  workspace_id: string;
}

export interface MeResponse {
  user: AuthUser;
  workspaces: WorkspaceSummary[];
}

export interface RegisterInput {
  username: string;
  password: string;
  display_name?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}
