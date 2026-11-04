import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const html = await readFile(new URL('../kifu.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('// お振込の連絡:'), html.lastIndexOf('</script>'));
const RPC = 'https://uzavspfdkfwrefwbdbrd.supabase.co/rest/v1/rpc/submit_donation_notice';
const key = 'sb_publishable_test_only';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };

// 配信するインラインJSを実行し、DOMイベントと外部通信だけを模擬する。
async function browser(options = {}) {
  const nodes = new Map();
  const limits = new Map();
  const calls = [];
  let validityChecks = 0;
  class Element extends EventTarget {
    constructor() { super(); this.value = ''; this.textContent = ''; this.disabled = false; this.classList = { toggle() {} }; }
    focus() { document.activeElement = this; }
    setSelectionRange() {}
  }
  for (const match of html.matchAll(/<input\b([^>]*\bid="(kf-[^"]+)"[^>]*)>/g)) {
    nodes.set('#' + match[2], new Element());
    const maximum = match[1].match(/maxlength="(\d+)"/);
    if (maximum) limits.set('#' + match[2], Number(maximum[1]));
  }
  for (const selector of ['.kf-submit', '.kf-status', '.kf-banchi', '#kf-banchi-error']) nodes.set(selector, new Element());
  nodes.get('.kf-submit').disabled = true;
  const form = new Element();
  form.querySelector = (selector) => { assert.ok(nodes.has(selector), selector); return nodes.get(selector); };
  form.reportValidity = () => {
    validityChecks++;
    if (options.nativeValid === false) return false;
    for (const [selector, limit] of limits) if (nodes.get(selector).value.length > limit) return false;
    const email = nodes.get('#kf-email').value;
    return !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  };
  form.reset = () => { for (const [selector, node] of nodes) if (selector.startsWith('#')) node.value = ''; };
  const document = { getElementById: (id) => id === 'renraku' ? form : null };
  class FixedDate extends Date { static now() { return Date.parse('2026-11-04T15:30:00Z'); } }
  vm.runInNewContext(options.unconfigured ? source : source.replace("var SUPABASE_KEY = '';", "var SUPABASE_KEY = '" + key + "';"), {
    document, Date: FixedDate, AbortSignal,
    fetch: async (url, init = {}) => {
      const call = { url, init, body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      if (url === RPC) return options.post ? options.post(call) : json(options.result ?? 'ok', options.status ?? 200);
      assert.ok(url.startsWith('https://zipcloud.ibsnet.co.jp/api/search?zipcode='));
      return options.lookup ? options.lookup(url) : json({ results: [{ address1: '架空県', address2: '架空市', address3: '架空町' }] });
    }
  });
  const values = {
    '#kf-name': 'テスト 花子', '#kf-postal': '451-0000', '#kf-address': '架空県架空市架空町',
    '#kf-banchi': '1-2-3', '#kf-date': '2026-11-05', '#kf-amount': '3000', '#kf-kana': 'テスト ハナコ'
  };
  for (const [selector, value] of Object.entries(values)) nodes.get(selector).value = value;
  await settle();
  return {
    nodes, calls, form,
    get posts() { return calls.filter((call) => call.url === RPC); },
    get message() { return nodes.get('.kf-status').textContent; },
    get validityChecks() { return validityChecks; },
    async send() {
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      await settle();
    },
    async input(selector, value) { nodes.get(selector).value = value; nodes.get(selector).dispatchEvent(new Event('input')); await settle(); }
  };
}

test('JS未動作時もGETで個人情報を送らず、送信ボタンを無効にする', () => {
  const form = html.match(/<form\b[^>]*id="renraku"[^>]*>/)[0];
  assert.match(form, /method="post"/);
  assert.ok(form.includes('action="' + RPC + '"'));
  assert.match(html, /<button\b[^>]*class="[^"]*kf-submit[^"]*"[^>]*\bdisabled/);
  assert.match(html, /<noscript>/);
  assert.ok(source.includes("var SUPABASE_KEY = '';"));
  assert.ok(!source.includes('internal.ai-kakekomi.com'));
});

test('公開キー未設定時は準備中を表示し、Enterでも送信しない', async () => {
  const b = await browser({ unconfigured: true });
  assert.equal(b.nodes.get('.kf-submit').disabled, true);
  assert.match(b.message, /準備中/);
  await b.send();
  assert.equal(b.calls.length, 0);
});

test('公開キーをapikeyだけで送り、元のRPCの9項目を渡して成功時だけリセットする', async () => {
  const b = await browser();
  assert.equal(b.calls.length, 0);
  await b.send();
  assert.equal(b.posts.length, 1);
  const { init, body } = b.posts[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.headers.apikey, key);
  assert.equal(init.headers.Authorization, undefined);
  assert.deepEqual(Object.keys(body).sort(), ['p_name', 'p_postal_code', 'p_address', 'p_banchi', 'p_paid_on', 'p_amount', 'p_payer_kana', 'p_email', 'p_website'].sort());
  assert.equal(body.p_amount, 3000);
  assert.equal(body.p_email, null);
  assert.equal(b.nodes.get('#kf-name').value, '');
  assert.match(b.message, /ありがとうございました/);
});

test('小数・0円・上限超過を拒否し、指数表記を切り捨てない', async () => {
  const b = await browser();
  for (const value of ['1.5', '0', '-1', '100000001']) {
    b.nodes.get('#kf-amount').value = value;
    await b.send();
    assert.equal(b.posts.length, 0);
    assert.match(b.message, /整数/);
  }
  b.nodes.get('#kf-amount').value = '1e4';
  await b.send();
  assert.equal(b.posts[0].body.p_amount, 10000);
});

test('全角郵便番号を正規化し、不正な形式は送らない', async () => {
  const b = await browser();
  b.nodes.get('#kf-postal').value = '４５１－００００';
  await b.send();
  assert.equal(b.posts[0].body.p_postal_code, '451-0000');
  const invalid = await browser();
  invalid.nodes.get('#kf-postal').value = '451abc0';
  await invalid.send();
  assert.equal(invalid.posts.length, 0);
});

test('前後の空白を除き、郵便番号とメールの未入力はnullにする', async () => {
  const b = await browser();
  b.nodes.get('#kf-name').value = '　テスト 花子\t';
  b.nodes.get('#kf-postal').value = '　';
  b.nodes.get('#kf-email').value = '　';
  await b.send();
  assert.equal(b.posts[0].body.p_name, 'テスト 花子');
  assert.equal(b.posts[0].body.p_postal_code, null);
  assert.equal(b.posts[0].body.p_email, null);
});

test('空白だけの必須項目・番地の欠落・文字数超過・不正メールを送らない', async () => {
  for (const [selector, value] of [['#kf-name', '　'], ['#kf-address', '\t'], ['#kf-banchi', ''], ['#kf-banchi', 'ビル'], ['#kf-kana', '　'], ['#kf-name', 'あ'.repeat(61)], ['#kf-email', 'bad email']]) {
    const b = await browser();
    b.nodes.get(selector).value = value;
    await b.send();
    assert.equal(b.posts.length, 0, selector);
  }
});

test('日本時間で振込日の範囲を確認する', async () => {
  const b = await browser();
  assert.equal(b.nodes.get('#kf-date').max, '2026-11-06');
  for (const value of ['2026-11-07', '2020-01-01']) {
    b.nodes.get('#kf-date').value = value;
    await b.send();
    assert.equal(b.posts.length, 0);
    assert.match(b.message, /明日まで/);
  }
});

for (const [status, result, message] of [
  [400, { code: 'P0001', message: 'too_many_requests' }, /10分/],
  [400, { code: '23514', message: 'private detail' }, /入力内容/],
  [503, { message: 'private detail' }, /利用できません/],
  [200, { result: 'ok' }, /利用できません/]
]) {
  test('RPCの失敗・不正な応答で入力を消さない: ' + status + JSON.stringify(result), async () => {
    const b = await browser({ status, result });
    await b.send();
    assert.equal(b.nodes.get('#kf-name').value, 'テスト 花子');
    assert.equal(b.nodes.get('.kf-submit').disabled, false);
    assert.match(b.message, message);
    assert.ok(!b.message.includes('private detail'));
  });
}

test('通信結果が不明な場合は入力を残し、重複送信を避けるための問い合わせを案内する', async () => {
  const b = await browser({ post: async () => { throw new Error('offline'); } });
  await b.send();
  assert.equal(b.nodes.get('#kf-name').value, 'テスト 花子');
  assert.match(b.message, /重複送信/);
});

test('二重クリック・Enterで同時送信しない', async () => {
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const b = await browser({ post: () => pending });
  await b.send();
  assert.equal(b.nodes.get('.kf-submit').disabled, true);
  await b.send();
  assert.equal(b.posts.length, 1);
  complete(json('ok'));
  await settle();
  assert.equal(b.nodes.get('.kf-submit').disabled, false);
});

test('郵便番号補完の古い応答で新しい住所を上書きしない', async () => {
  const pending = [];
  const b = await browser({ lookup: () => new Promise((resolve) => pending.push(resolve)) });
  b.nodes.get('#kf-address').value = '';
  await b.input('#kf-postal', '４５１－００００');
  await b.input('#kf-postal', '4520000');
  assert.match(b.calls[0].url, /zipcode=4510000$/);
  pending[1](json({ results: [{ address1: '新しい県', address2: '市', address3: '町' }] }));
  await settle();
  pending[0](json({ results: [{ address1: '古い県', address2: '市', address3: '町' }] }));
  await settle();
  assert.equal(b.nodes.get('#kf-address').value, '新しい県市町');
});
