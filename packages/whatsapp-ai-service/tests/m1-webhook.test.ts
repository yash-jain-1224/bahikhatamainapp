// =============================================================================
// Unit Tests: Webhook Fixtures, Message Normaliser, Dedup
// =============================================================================

import { normaliseMessage, isMessageDuplicate } from '../src/services/message-normaliser';
import { WhatsAppMessage } from '../src/types';

// ─── Webhook Payload Fixtures ────────────────────────────────────────────────

const fixtures: Record<string, WhatsAppMessage> = {
  text: {
    from: '919876543210',
    id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSRjM0MjIzNjdBQkY3QTdBNEUA',
    timestamp: '1719936000',
    type: 'text',
    text: { body: 'Ram ko 15000 diye cash mein' },
  },
  image: {
    from: '919876543210',
    id: 'wamid.image_001',
    timestamp: '1719936001',
    type: 'image',
    image: {
      id: 'media_img_123',
      mime_type: 'image/jpeg',
      sha256: 'abc123',
      caption: 'Aaj ki bill',
    },
  },
  document: {
    from: '919876543210',
    id: 'wamid.doc_001',
    timestamp: '1719936002',
    type: 'document',
    document: {
      id: 'media_doc_456',
      mime_type: 'application/pdf',
      sha256: 'def456',
      filename: 'invoice_july.pdf',
      caption: 'July invoice',
    },
  },
  audio: {
    from: '919876543210',
    id: 'wamid.audio_001',
    timestamp: '1719936003',
    type: 'audio',
    audio: {
      id: 'media_audio_789',
      mime_type: 'audio/ogg',
    },
  },
  buttonReply: {
    from: '919876543210',
    id: 'wamid.btn_001',
    timestamp: '1719936004',
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: 'approve_entry', title: 'Haan ✅' },
    },
  },
  listReply: {
    from: '919876543210',
    id: 'wamid.list_001',
    timestamp: '1719936005',
    type: 'interactive',
    interactive: {
      type: 'list_reply',
      list_reply: { id: 'party_123', title: 'Ram Kumar', description: 'Delhi' },
    },
  },
  replyContext: {
    from: '919876543210',
    id: 'wamid.reply_001',
    timestamp: '1719936006',
    type: 'text',
    text: { body: 'Haan, sahi hai' },
    context: { from: '919000000000', id: 'wamid.original_001' },
  },
};

describe('Message normaliser', () => {
  test('text message', () => {
    const textResult = normaliseMessage(fixtures.text);
    expect(textResult.wamid).toBe(fixtures.text.id);
    expect(textResult.from).toBe('919876543210');
    expect(textResult.type).toBe('text');
    expect(textResult.text).toBe('Ram ko 15000 diye cash mein');
    expect(textResult.isReply).toBe(false);
    expect(textResult.media).toBeUndefined();
  });

  test('image message', () => {
    const imgResult = normaliseMessage(fixtures.image);
    expect(imgResult.type).toBe('media');
    expect(imgResult.media?.type).toBe('image');
    expect(imgResult.media?.mediaId).toBe('media_img_123');
    expect(imgResult.media?.mimeType).toBe('image/jpeg');
    expect(imgResult.text).toBe('Aaj ki bill');
  });

  test('document message', () => {
    const docResult = normaliseMessage(fixtures.document);
    expect(docResult.type).toBe('media');
    expect(docResult.media?.type).toBe('document');
    expect(docResult.media?.filename).toBe('invoice_july.pdf');
    expect(docResult.text).toBe('July invoice');
  });

  test('audio message', () => {
    const audioResult = normaliseMessage(fixtures.audio);
    expect(audioResult.type).toBe('media');
    expect(audioResult.media?.type).toBe('audio');
    expect(audioResult.text).toBeUndefined();
  });

  test('button reply', () => {
    const btnResult = normaliseMessage(fixtures.buttonReply);
    expect(btnResult.type).toBe('interactive');
    expect(btnResult.interactive?.type).toBe('button_reply');
    expect(btnResult.interactive?.id).toBe('approve_entry');
    expect(btnResult.interactive?.title).toBe('Haan ✅');
    expect(btnResult.text).toBe('Haan ✅');
  });

  test('list reply', () => {
    const listResult = normaliseMessage(fixtures.listReply);
    expect(listResult.type).toBe('interactive');
    expect(listResult.interactive?.type).toBe('list_reply');
    expect(listResult.interactive?.id).toBe('party_123');
    expect(listResult.interactive?.description).toBe('Delhi');
  });

  test('reply context', () => {
    const replyResult = normaliseMessage(fixtures.replyContext);
    expect(replyResult.isReply).toBe(true);
    expect(replyResult.replyToId).toBe('wamid.original_001');
  });

  test('timestamp parsing', () => {
    const tsResult = normaliseMessage(fixtures.text);
    const parsedDate = new Date(tsResult.timestamp);
    expect(isNaN(parsedDate.getTime())).toBe(false);
    expect(parsedDate.getFullYear()).toBe(2024); // epoch 1719936000
  });

  test('edge cases', () => {
    const emptyText: WhatsAppMessage = {
      from: '919876543210', id: 'wamid.empty', timestamp: '1719936000',
      type: 'text', text: { body: '' },
    };
    const emptyResult = normaliseMessage(emptyText);
    expect(emptyResult.text).toBe('');
    expect(emptyResult.type).toBe('text');

    const unknownType: WhatsAppMessage = {
      from: '919876543210', id: 'wamid.unknown', timestamp: '1719936000',
      type: 'location' as any,
    };
    const unknownResult = normaliseMessage(unknownType);
    expect(unknownResult.type).toBe('unknown');
  });
});

describe('Deduplication', () => {
  test('wamid dedup behaviour', () => {
    expect(isMessageDuplicate('wamid.dedup_test_001')).toBe(false); // first time
    expect(isMessageDuplicate('wamid.dedup_test_001')).toBe(true);  // second time
    expect(isMessageDuplicate('wamid.dedup_test_002')).toBe(false); // different id
    expect(isMessageDuplicate('wamid.dedup_test_001')).toBe(true);  // still duplicate
  });
});
