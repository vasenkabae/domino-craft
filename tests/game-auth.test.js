import { describe, it, expect } from 'vitest';
import { nickExists, checkPassword, registerNick } from '../src/main/game-auth';

const API = 'http://server:8770';
const jsonFetch = (payload, ok = true) => {
  const f = async (url, options) => {
    f.lastCall = { url, options };
    return { ok, json: async () => payload };
  };
  return f;
};
const deadFetch = async () => { throw new Error('ECONNREFUSED'); };

describe('nickExists', () => {
  it('отдаёт ответ сервера про занятость ника', async () => {
    expect(await nickExists(API, 'vasenka', jsonFetch({ exists: true })))
      .toEqual({ exists: true, network: true });
    expect(await nickExists(API, 'newbie', jsonFetch({ exists: false })))
      .toEqual({ exists: false, network: true });
  });

  it('экранирует ник в адресе', async () => {
    const f = jsonFetch({ exists: false });
    await nickExists(API, 'a b', f);
    expect(f.lastCall.url).toBe('http://server:8770/auth/exists?name=a%20b');
  });

  it('без связи сообщает network: false, а не «ник свободен»', async () => {
    expect(await nickExists(API, 'vasenka', deadFetch)).toEqual({ network: false });
    expect(await nickExists(API, 'vasenka', jsonFetch({}, false))).toEqual({ network: false });
  });
});

describe('checkPassword / registerNick', () => {
  it('шлёт ник и пароль формой на нужную ручку', async () => {
    const f = jsonFetch({ ok: true, message: 'Пароль верный.' });
    await checkPassword(API, 'vasenka', 'secret', f);
    expect(f.lastCall.url).toBe('http://server:8770/auth/login');
    expect(f.lastCall.options.method).toBe('POST');
    expect(f.lastCall.options.body).toBe('name=vasenka&password=secret');

    await registerNick(API, 'newbie', 'secret', f);
    expect(f.lastCall.url).toBe('http://server:8770/auth/register');
  });

  it('передаёт причину отказа от сервера', async () => {
    const r = await checkPassword(API, 'vasenka', 'wrong', jsonFetch({ ok: false, message: 'Неверный пароль.' }));
    expect(r).toEqual({ ok: false, message: 'Неверный пароль.', network: true });
  });

  it('недоступный сервер — не «неверный пароль»', async () => {
    const r = await checkPassword(API, 'vasenka', 'secret', deadFetch);
    expect(r.ok).toBe(false);
    expect(r.network).toBe(false);
  });
});
