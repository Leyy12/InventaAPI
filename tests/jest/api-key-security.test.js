import { describe, test, expect } from '@jest/globals';
import {
  issueCredential, parseCredential, credentialMatches, validDocumentId, assertActiveKey,
} from '../../services/api-key-security.js';

describe('issueCredential', () => {
  test('creates a daas_v2 key and stores only its hash', () => {
    const { id, credential, stored } = issueCredential();
    expect(credential).toMatch(/^daas_v2_[a-f0-9]{32}\.[a-f0-9]{64}$/);
    expect(credential.startsWith(`daas_v2_${id}.`)).toBe(true);
    expect(stored.credentialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(credential);
  });
  test('two keys are never the same', () => {
    expect(issueCredential().credential).not.toBe(issueCredential().credential);
  });
});

describe('parseCredential', () => {
  test('parses a v2 key', () => {
    const { id, credential } = issueCredential();
    expect(parseCredential(credential)).toEqual({ version: 2, id });
  });
  test.each([undefined, '', 'hello', 'daas_v3_abc', 'daas_v2_bad', 'x'.repeat(300)])('rejects %p', value => {
    expect(parseCredential(value)).toBeNull();
  });
});

describe('credentialMatches', () => {
  test('accepts the right key', () => {
    const { id, credential, stored } = issueCredential();
    expect(credentialMatches(id, stored, credential)).toBe(true);
  });
  test('rejects a different key', () => {
    const a = issueCredential();
    const b = issueCredential();
    expect(credentialMatches(a.id, a.stored, b.credential)).toBe(false);
  });
});

describe('validDocumentId', () => {
  test.each(['abc123', 'user_1'])('accepts %p', id => expect(validDocumentId(id)).toBe(true));
  test.each(['', ' abc', 'a/b', '.', '..', '__x__', 42])('rejects %p', id => expect(validDocumentId(id)).toBe(false));
});

describe('assertActiveKey', () => {
  test('throws 401 for a revoked key', () => {
    expect(() => assertActiveKey({ status: 'revoked', userId: 'u1' })).toThrow(expect.objectContaining({ status: 401 }));
  });
  test('throws for a missing key', () => {
    expect(() => assertActiveKey(null)).toThrow();
  });
});
