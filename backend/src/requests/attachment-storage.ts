import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export const DEFAULT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};
const MIME_TYPES: Record<string, string> = {
  ...IMAGE_MIME_TYPES,
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.ps1',
  '.sh',
  '.vbs',
]);
// Written next to user files by Windows Explorer, macOS or an open Office
// document; they are never Attachments.
const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
// Path separators, characters Windows forbids in names, and control characters.
// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARACTERS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

export interface StoredAttachmentFile {
  filename: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export function sanitizeFolderSegment(value: string): string {
  return value.trim().replace(INVALID_NAME_CHARACTERS, '_');
}

/** `[Product_Description]_[ID]`, or `_[ID]` while Product_Description is blank. */
export function requestFolderName(
  productDescription: unknown,
  numericId: number,
): string {
  const segment =
    typeof productDescription === 'string'
      ? sanitizeFolderSegment(productDescription)
      : '';
  return `${segment}_${numericId}`;
}

export function isImageFilename(filename: string): boolean {
  return Object.hasOwn(IMAGE_MIME_TYPES, extname(filename).toLowerCase());
}

export function attachmentMimeType(filename: string): string {
  return (
    MIME_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream'
  );
}

function isSystemFile(filename: string): boolean {
  return SYSTEM_FILES.has(filename.toLowerCase()) || filename.startsWith('~$');
}

/** The original name without any client path, safe to store on the NAS. */
export function sanitizeAttachmentFilename(originalName: string): string {
  const baseName = originalName.split(/[/\\]/).pop() ?? '';
  // Windows drops trailing dots and spaces, which would rename the file.
  const filename = baseName
    .replace(INVALID_NAME_CHARACTERS, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (!filename) throw new BadRequestException('A file name is required.');
  if (BLOCKED_EXTENSIONS.has(extname(filename).toLowerCase()))
    throw new BadRequestException(
      `${filename} cannot be attached: executable and script files are not allowed.`,
    );
  if (isSystemFile(filename))
    throw new BadRequestException(
      `${filename} is a system file and cannot be attached.`,
    );
  return filename;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/** Request Attachment folders under `ATTACHMENT_STORAGE_PATH`, typically a NAS share. */
export class AttachmentStorage {
  readonly rootPath: string | null;
  readonly maxBytes: number;

  constructor(env: Record<string, string | undefined>) {
    this.rootPath = env.ATTACHMENT_STORAGE_PATH?.trim() || null;
    const maxBytes = env.ATTACHMENT_MAX_BYTES?.trim();
    this.maxBytes = maxBytes ? Number(maxBytes) : DEFAULT_ATTACHMENT_MAX_BYTES;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0)
      throw new Error('ATTACHMENT_MAX_BYTES must be a positive integer');
  }

  get configured(): boolean {
    return this.rootPath !== null;
  }

  /** Refuses work while the root is unset or unreachable, so an offline NAS never reads as empty folders. */
  async assertReachable(): Promise<void> {
    if (!this.rootPath)
      throw new ServiceUnavailableException(
        'Attachment storage is not configured (ATTACHMENT_STORAGE_PATH).',
      );
    try {
      if ((await stat(this.rootPath)).isDirectory()) return;
    } catch {
      // Reported below.
    }
    throw new ServiceUnavailableException(
      'Attachment storage is unreachable. Try again later.',
    );
  }

  filePath(folder: string, filename: string): string {
    const directory = this.folderPath(folder);
    const path = resolve(directory, filename);
    if (!path.startsWith(directory + sep))
      throw new BadRequestException('Invalid attachment file name.');
    return path;
  }

  /** Regular files directly inside the folder; none when it does not exist. */
  async listFiles(folder: string): Promise<StoredAttachmentFile[]> {
    const directory = this.folderPath(folder);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
    const files: StoredAttachmentFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || isSystemFile(entry.name)) continue;
      try {
        const info = await stat(join(directory, entry.name));
        files.push({
          filename: entry.name,
          sizeBytes: info.size,
          modifiedAt: info.mtime,
        });
      } catch (error) {
        // Removed from the NAS while the folder was being read.
        if (errorCode(error) !== 'ENOENT') throw error;
      }
    }
    return files;
  }

  /** Writes a new file, appending ` (1)`, ` (2)`… before the extension instead of overwriting. */
  async saveFile(
    folder: string,
    filename: string,
    content: Buffer,
  ): Promise<string> {
    const directory = this.folderPath(folder);
    await mkdir(directory, { recursive: true });
    const extension = extname(filename);
    const stem = filename.slice(0, filename.length - extension.length);
    for (let copy = 0; ; copy++) {
      const candidate = copy === 0 ? filename : `${stem} (${copy})${extension}`;
      const path = this.filePath(folder, candidate);
      let handle;
      try {
        handle = await open(path, 'wx');
      } catch (error) {
        if (errorCode(error) === 'EEXIST') continue;
        throw error;
      }
      try {
        await handle.writeFile(content);
      } catch (error) {
        await handle.close();
        await unlink(path).catch(() => undefined);
        throw error;
      }
      await handle.close();
      return candidate;
    }
  }

  async deleteFile(folder: string, filename: string): Promise<void> {
    try {
      await unlink(this.filePath(folder, filename));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
  }

  /**
   * Renames a request folder after its Product_Description changed. Nothing
   * moves when the old folder does not exist. Returns how to undo the rename.
   */
  async renameFolder(from: string, to: string): Promise<() => Promise<void>> {
    const source = this.folderPath(from);
    const target = this.folderPath(to);
    const noChange = () => Promise.resolve();
    if (from === to || !(await this.isDirectory(source))) return noChange;
    // A case-only change names the same folder on a Windows share.
    if (from.toLowerCase() !== to.toLowerCase() && (await this.exists(target)))
      throw new ConflictException(
        `A NAS folder named "${to}" already exists. Move or rename it on the NAS, then save again.`,
      );
    await rename(source, target);
    return () => rename(target, source);
  }

  async removeFolder(folder: string): Promise<void> {
    await rm(this.folderPath(folder), { recursive: true, force: true });
  }

  private folderPath(folder: string): string {
    if (!this.rootPath)
      throw new ServiceUnavailableException(
        'Attachment storage is not configured (ATTACHMENT_STORAGE_PATH).',
      );
    const root = resolve(this.rootPath);
    const directory = resolve(root, folder);
    if (directory === root || !directory.startsWith(root + sep))
      throw new BadRequestException('Invalid attachment folder.');
    return directory;
  }

  private async isDirectory(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isDirectory();
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return false;
      throw error;
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return false;
      throw error;
    }
  }
}
