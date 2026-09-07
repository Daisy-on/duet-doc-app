export interface SyncIdentity {
  userId: string;
  workspaceId: string;
}

let activeIdentity: SyncIdentity | null = null;

export function setActiveSyncIdentity(identity: SyncIdentity | null) {
  activeIdentity = identity;
}

export function getActiveSyncIdentity(): SyncIdentity {
  if (!activeIdentity) throw new Error('同步身份尚未初始化');
  return activeIdentity;
}

export function getActiveWorkspaceId() {
  return getActiveSyncIdentity().workspaceId;
}
