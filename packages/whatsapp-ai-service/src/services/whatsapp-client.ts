// =============================================================================
// WhatsApp Business Cloud API Client
// =============================================================================

import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

export class WhatsAppClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  // ─── Send Text Message ───────────────────────────────────────────────────
  async sendTextMessage(to: string, text: string, phoneNumberId?: string): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    await this.client.post(`/${id}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  // ─── Send Button Message ─────────────────────────────────────────────────
  async sendButtonMessage(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    phoneNumberId?: string
  ): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    await this.client.post(`/${id}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map(btn => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  // ─── Send List Message ───────────────────────────────────────────────────
  async sendListMessage(
    to: string,
    headerText: string,
    bodyText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    phoneNumberId?: string
  ): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    await this.client.post(`/${id}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        action: {
          button: 'Chunein',
          sections: sections.map(section => ({
            title: section.title,
            rows: section.rows.slice(0, 10).map(row => ({
              id: row.id,
              title: row.title.slice(0, 24),
              description: row.description?.slice(0, 72),
            })),
          })),
        },
      },
    });
  }

  // ─── Send Template Message ───────────────────────────────────────────────
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
    phoneNumberId?: string
  ): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    await this.client.post(`/${id}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  // ─── Mark as Read ────────────────────────────────────────────────────────
  async markAsRead(messageId: string, phoneNumberId?: string): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    try {
      await this.client.post(`/${id}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (err) {
      // Non-critical, don't fail
      console.warn('Failed to mark message as read:', (err as Error).message);
    }
  }

  // ─── Download Media ──────────────────────────────────────────────────────
  async downloadMedia(mediaId: string): Promise<Buffer> {
    // First get the media URL
    const { data: mediaInfo } = await this.client.get(`/${mediaId}`);
    
    // Then download the actual file
    const { data } = await axios.get(mediaInfo.url, {
      headers: { 'Authorization': `Bearer ${config.whatsapp.accessToken}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(data);
  }

  // ─── Send Reaction ───────────────────────────────────────────────────────
  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
    phoneNumberId?: string
  ): Promise<void> {
    const id = phoneNumberId || config.whatsapp.phoneNumberId;
    await this.client.post(`/${id}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
  }
}
