import { invoke } from '@tauri-apps/api/core';

export interface DesktopOrganizeEntry {
  fileName: string;
  suggestedFilename: string;
  category: string;
  journal: string;
  year: string;
  sourcePath?: string;
  fileBase64?: string;
}

export interface DesktopOrganizeDetail {
  originalName: string;
  destinationPath?: string;
  status: 'organized' | 'skipped';
  message: string;
  autoRenamedFrom?: string;
}

export interface DesktopOrganizeResult {
  operationId: string;
  organizedCount: number;
  skippedCount: number;
  renamedCount: number;
  details: DesktopOrganizeDetail[];
  branches: string[];
  totalManagedFiles: number;
}

export interface DesktopRollbackResult {
  operationId?: string;
  restoredCount: number;
  details: string[];
  branches: string[];
  totalManagedFiles: number;
}

export interface DesktopRollbackPreviewItem {
  destinationPath: string;
  rollbackPath: string;
  exists: boolean;
}

export interface DesktopRollbackPreview {
  operationId?: string;
  totalItems: number;
  missingItems: number;
  preview: DesktopRollbackPreviewItem[];
}

export interface DesktopLibraryOverview {
  initialized: boolean;
  libraryRoot: string;
  managedFiles: number;
  branches: string[];
  operationsTotal: number;
  pendingRollbackOperations: number;
}

export const isDesktopRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || navigator.userAgent.includes('Tauri'));
};

const assertDesktop = () => {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop-only feature. Please run with Tauri.');
  }
};

export const selectDirectory = async (title = 'Select Directory'): Promise<string | null> => {
  assertDesktop();
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    title,
    directory: true,
    multiple: false,
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
};

export const getLibraryOverview = async (libraryRoot: string): Promise<DesktopLibraryOverview> => {
  assertDesktop();
  return invoke<DesktopLibraryOverview>('get_library_overview', { library_root: libraryRoot });
};

export const applyOrganization = async (
  libraryRoot: string,
  entries: DesktopOrganizeEntry[],
  operationId?: string
): Promise<DesktopOrganizeResult> => {
  assertDesktop();
  return invoke<DesktopOrganizeResult>('apply_organization', {
    library_root: libraryRoot,
    entries,
    operation_id: operationId,
  });
};

export const previewLastRollback = async (libraryRoot: string): Promise<DesktopRollbackPreview> => {
  assertDesktop();
  return invoke<DesktopRollbackPreview>('preview_last_rollback', { library_root: libraryRoot });
};

export const rollbackLastOrganization = async (libraryRoot: string): Promise<DesktopRollbackResult> => {
  assertDesktop();
  return invoke<DesktopRollbackResult>('rollback_last_organization', { library_root: libraryRoot });
};
