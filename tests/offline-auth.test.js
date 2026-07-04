import { describe, it, expect } from 'vitest';
import { offlineUuid, offlineAuth } from '../src/main/offline-auth';

describe('offlineUuid', () => {
  it('детерминированный для одного ника', () => {
    expect(offlineUuid('vasenka')).toBe(offlineUuid('vasenka'));
  });
  it('разный для разных ников', () => {
    expect(offlineUuid('vasenka')).not.toBe(offlineUuid('petya'));
  });
  it('корректный формат UUID v3', () => {
    const u = offlineUuid('vasenka');
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('совпадает с эталоном ванильного сервера', () => {
    // UUID v3 от "OfflinePlayer:Notch": md5 = b50ad385829da141a2167e7d7539ba7f,
    // версия 3 в 6-м байте, вариант в 8-м (проверено независимым вычислением md5)
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
  });
});

describe('offlineAuth', () => {
  it('возвращает mclc-совместимый объект', () => {
    const a = offlineAuth('vasenka');
    expect(a.name).toBe('vasenka');
    expect(a.uuid).toBe(offlineUuid('vasenka'));
    expect(a.meta.type).toBe('mojang');
  });
});
