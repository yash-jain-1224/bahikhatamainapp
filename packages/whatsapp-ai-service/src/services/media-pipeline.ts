// =============================================================================
// Media Pipeline - Download from WhatsApp → Store → Signed URL
// =============================================================================
// ADR-6: Azure Blob Storage in production, local disk fallback for dev
// =============================================================================

import { WhatsAppClient } from './whatsapp-client';
import { config } from '../config';
import { SecureLogger } from '../middleware/pii-masking';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';

const logger = new SecureLogger('MediaPipeline');

/**
 * Where the local-disk fallback writes.
 *
 * `process.cwd()` is read-only on serverless (on Vercel it is /var/task), so
 * the previous unconditional mkdir there threw ENOENT — and because
 * webhook.routes.ts constructs a MediaPipeline at module scope, that threw
 * during import and killed the whole function on *every* request, health
 * checks included. Only the temp dir is writable there.
 */
/**
 * WhatsApp media filenames are supplied by the *sender*, and both storage paths
 * used them as a path segment: `path.join(dirPath, filename)` for local disk and
 * `${date}/${filename}` for the blob name. A filename of `../../../tmp/x` walks
 * straight out of the media store, so treat it as a label, never a path.
 */
function safeFilename(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]/g, '_');
  if (!base || base === '.' || base === '..' || base.startsWith('.')) return fallback;
  return base.slice(0, 120);
}

function resolveLocalStoragePath(): string {
  if (process.env.MEDIA_STORE_DIR) return process.env.MEDIA_STORE_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'media-store');
  }
  return path.join(process.cwd(), 'media-store');
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredMedia {
  id: string;             // Unique storage ID
  originalMediaId: string; // WhatsApp media ID
  mimeType: string;
  filename: string;
  size: number;
  url: string;            // Signed URL (Blob) or local path
  storedAt: string;       // ISO timestamp
  expiresAt?: string;     // Signed URL expiry (if applicable)
}

// ─── Media Pipeline Service ──────────────────────────────────────────────────

export class MediaPipeline {
  private whatsappClient: WhatsAppClient;
  private storageMode: 'azure-blob' | 'local';
  private localStoragePath: string;

  constructor() {
    this.whatsappClient = new WhatsAppClient();
    this.storageMode = config.azure.storage.connectionString ? 'azure-blob' : 'local';
    this.localStoragePath = resolveLocalStoragePath();

    // Deliberately does NOT create the directory here. This constructor runs at
    // module import (webhook.routes.ts), so anything that throws takes the whole
    // service down before a single request is handled. The directory is created
    // lazily on first write instead.
    if (this.storageMode === 'local') {
      logger.info(`Media pipeline: local storage mode (${this.localStoragePath})`);
    } else {
      logger.info('Media pipeline: Azure Blob Storage mode');
    }
  }

  /**
   * Full pipeline: Download from WhatsApp → Store → Return signed URL
   */
  async processMedia(
    mediaId: string,
    mimeType: string,
    originalFilename?: string
  ): Promise<StoredMedia> {
    const startTime = Date.now();

    // Step 1: Download from WhatsApp (Graph API)
    logger.debug(`Downloading media: ${mediaId}`);
    const buffer = await this.whatsappClient.downloadMedia(mediaId);

    // Step 2: Generate storage filename
    const extension = this.mimeToExtension(mimeType);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const filename = safeFilename(originalFilename, `${Date.now()}_${hash}${extension}`);
    const containerName = this.getContainerForMime(mimeType);

    // Step 3: Store
    let storedMedia: StoredMedia;
    if (this.storageMode === 'azure-blob') {
      storedMedia = await this.uploadToBlob(buffer, containerName, filename, mimeType, mediaId);
    } else {
      storedMedia = await this.saveToLocal(buffer, containerName, filename, mimeType, mediaId);
    }

    const elapsed = Date.now() - startTime;
    logger.info(`Media processed: ${mediaId} → ${storedMedia.url} (${elapsed}ms, ${buffer.length} bytes)`);

    return storedMedia;
  }

  // ─── Azure Blob Storage ────────────────────────────────────────────────────

  private async uploadToBlob(
    buffer: Buffer,
    containerName: string,
    filename: string,
    mimeType: string,
    mediaId: string
  ): Promise<StoredMedia> {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.azure.storage.connectionString
    );

    const containerClient = blobServiceClient.getContainerClient(containerName);
    // Ensure container exists
    await containerClient.createIfNotExists({ access: undefined });

    const blobName = `${new Date().toISOString().split('T')[0]}/${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload with metadata
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
      metadata: {
        whatsappMediaId: mediaId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Generate SAS URL (valid for 1 hour)
    const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } =
      await import('@azure/storage-blob');

    // Parse connection string for account name and key
    const connParts = config.azure.storage.connectionString.split(';');
    const accountName = connParts.find(p => p.startsWith('AccountName='))?.split('=')[1] || '';
    const accountKey = connParts.find(p => p.startsWith('AccountKey='))?.split('=')[1] || '';

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + 3600000); // 1 hour

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      sharedKeyCredential
    ).toString();

    const url = `${blockBlobClient.url}?${sasToken}`;

    return {
      id: `blob_${crypto.randomUUID()}`,
      originalMediaId: mediaId,
      mimeType,
      filename: blobName,
      size: buffer.length,
      url,
      storedAt: new Date().toISOString(),
      expiresAt: expiresOn.toISOString(),
    };
  }

  // ─── Local Storage (Dev Fallback) ──────────────────────────────────────────

  private async saveToLocal(
    buffer: Buffer,
    containerName: string,
    filename: string,
    mimeType: string,
    mediaId: string
  ): Promise<StoredMedia> {
    const dirPath = path.join(this.localStoragePath, containerName);
    fs.mkdirSync(dirPath, { recursive: true });

    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, buffer);

    // For local dev, the URL is just a file path
    // In a real setup, serve static files or use a local HTTP endpoint
    const url = `file://${filePath}`;

    return {
      id: `local_${crypto.randomUUID()}`,
      originalMediaId: mediaId,
      mimeType,
      filename,
      size: buffer.length,
      url,
      storedAt: new Date().toISOString(),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/opus': '.opus',
      'video/mp4': '.mp4',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/csv': '.csv',
    };
    return map[mimeType] || '.bin';
  }

  private getContainerForMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return config.azure.storage.containers.images;
    if (mimeType.startsWith('audio/')) return config.azure.storage.containers.audio;
    if (mimeType.startsWith('video/')) return config.azure.storage.containers.audio;
    return config.azure.storage.containers.documents;
  }
}
