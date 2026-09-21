/** Library sync endpoints. The wire records mirror the local `Folder` /
 *  `QrDocument` shapes, plus `deletedAt` for tombstones and the logo metadata. */

import type { Locale } from "../i18n/locales";
import type { ColorFormat } from "../qr/color";
import { request } from "./client";

export interface RemoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface RemoteDocument {
  id: string;
  name: string;
  /** Null only on the tombstone of a document the server never had. */
  folderId: string | null;
  options: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  logoHash: string | null;
  logoMime: string | null;
}

export interface RemoteSettings {
  locale: Locale | null;
  colorFormat: ColorFormat | null;
  updatedAt: number;
}

/** A tombstone only needs its id and dates. */
export type FolderChange =
  | Omit<RemoteFolder, "deletedAt">
  | { id: string; updatedAt: number; deletedAt: number };
export type DocumentChange =
  | (Omit<RemoteDocument, "deletedAt" | "logoHash" | "logoMime" | "options"> & {
      options: object;
    })
  | { id: string; updatedAt: number; deletedAt: number };

export interface SyncPayload {
  cursor: number;
  folders: FolderChange[];
  documents: DocumentChange[];
  settings: RemoteSettings | null;
}

export interface SyncResponse {
  cursor: number;
  folders: RemoteFolder[];
  documents: RemoteDocument[];
  settings: RemoteSettings | null;
  rejected: string[];
  hasMore: boolean;
}

export function postSync(payload: SyncPayload): Promise<SyncResponse> {
  return request<SyncResponse>("/sync/", { method: "POST", body: payload });
}

const logoPath = (docId: string) => `/documents/${docId}/logo/`;

export function uploadLogo(
  docId: string,
  blob: Blob,
): Promise<{ logoHash: string; logoMime: string }> {
  return request(logoPath(docId), { method: "PUT", body: blob });
}

export function downloadLogo(docId: string): Promise<Blob> {
  return request<Blob>(logoPath(docId), { as: "blob" });
}

export function deleteLogo(docId: string): Promise<void> {
  return request(logoPath(docId), { method: "DELETE" });
}
