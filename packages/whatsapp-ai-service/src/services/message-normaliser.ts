// =============================================================================
// Message Normaliser - Converts all WhatsApp message types to a unified format
// + wamid-based deduplication (Redis or in-memory fallback)
// =============================================================================

import { WhatsAppMessage } from '../types';
import { SecureLogger } from '../middleware/pii-masking';

const logger = new SecureLogger('MessageNormaliser');

// ─── Normalised Message ──────────────────────────────────────────────────────

export interface NormalisedMessage {
  wamid: string;                 // WhatsApp message ID (unique)
  from: string;                  // Sender phone number
  timestamp: string;             // ISO timestamp
  type: 'text' | 'media' | 'interactive' | 'location' | 'unknown';
  text?: string;                 // Extracted text content (from text, caption, button reply)
  media?: NormalisedMedia;       // Media info (if media message)
  interactive?: NormalisedInteractive; // Interactive reply info
  isReply: boolean;              // Whether this is a reply to another message
  replyToId?: string;            // ID of the message being replied to
}

export interface NormalisedMedia {
  mediaId: string;
  mimeType: string;
  type: 'image' | 'document' | 'audio' | 'video';
  filename?: string;
  caption?: string;
}

export interface NormalisedInteractive {
  type: 'button_reply' | 'list_reply';
  id: string;
  title: string;
  description?: string;
}

// ─── Deduplication Store ─────────────────────────────────────────────────────

class WamidDedupStore {
  private store = new Map<string, number>(); // wamid → timestamp
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    // Periodic cleanup every hour (unref: must not keep the process alive)
    setInterval(() => this.cleanup(), 3600000).unref();
  }

  /**
   * Check if message has been seen before. If not, marks it as seen.
   * Returns true if DUPLICATE (already seen)
   */
  isDuplicate(wamid: string): boolean {
    if (this.store.has(wamid)) {
      logger.debug(`Duplicate wamid detected: ${wamid}`);
      return true;
    }
    this.store.set(wamid, Date.now());
    return false;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.TTL_MS;
    let cleaned = 0;
    for (const [key, ts] of this.store) {
      if (ts < cutoff) {
        this.store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired wamid entries`);
    }
  }

  size(): number {
    return this.store.size;
  }
}

// Singleton dedup store (in production, replace with Redis SETNX)
const dedupStore = new WamidDedupStore();

// ─── Normalise Function ──────────────────────────────────────────────────────

/**
 * Normalise a WhatsApp message into a unified format
 */
export function normaliseMessage(message: WhatsAppMessage): NormalisedMessage {
  const base: NormalisedMessage = {
    wamid: message.id,
    from: message.from,
    timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    type: 'unknown',
    isReply: !!message.context,
    replyToId: message.context?.id,
  };

  switch (message.type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: message.text?.body || '',
      };

    case 'image':
      return {
        ...base,
        type: 'media',
        text: message.image?.caption,
        media: {
          mediaId: message.image!.id,
          mimeType: message.image!.mime_type,
          type: 'image',
          caption: message.image?.caption,
        },
      };

    case 'document':
      return {
        ...base,
        type: 'media',
        text: message.document?.caption,
        media: {
          mediaId: message.document!.id,
          mimeType: message.document!.mime_type,
          type: 'document',
          filename: message.document?.filename,
          caption: message.document?.caption,
        },
      };

    case 'audio':
      return {
        ...base,
        type: 'media',
        media: {
          mediaId: message.audio!.id,
          mimeType: message.audio!.mime_type,
          type: 'audio',
        },
      };

    case 'video':
      return {
        ...base,
        type: 'media',
        text: message.video?.caption,
        media: {
          mediaId: message.video!.id,
          mimeType: message.video!.mime_type,
          type: 'video',
          caption: message.video?.caption,
        },
      };

    case 'interactive':
      if (message.interactive?.button_reply) {
        return {
          ...base,
          type: 'interactive',
          text: message.interactive.button_reply.title,
          interactive: {
            type: 'button_reply',
            id: message.interactive.button_reply.id,
            title: message.interactive.button_reply.title,
          },
        };
      }
      if (message.interactive?.list_reply) {
        return {
          ...base,
          type: 'interactive',
          text: message.interactive.list_reply.title,
          interactive: {
            type: 'list_reply',
            id: message.interactive.list_reply.id,
            title: message.interactive.list_reply.title,
            description: message.interactive.list_reply.description,
          },
        };
      }
      return { ...base, type: 'interactive' };

    case 'button':
      return {
        ...base,
        type: 'interactive',
        text: message.button?.text,
        interactive: {
          type: 'button_reply',
          id: message.button?.payload || '',
          title: message.button?.text || '',
        },
      };

    default:
      return base;
  }
}

/**
 * Check if a message is a duplicate (already processed)
 * Uses in-memory store (replace with Redis SETNX in production)
 */
export function isMessageDuplicate(wamid: string): boolean {
  return dedupStore.isDuplicate(wamid);
}

/**
 * Get dedup store stats (for metrics)
 */
export function getDedupStats(): { size: number } {
  return { size: dedupStore.size() };
}
