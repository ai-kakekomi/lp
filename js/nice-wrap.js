// 中央揃えの文と見出しを、文節の切れ目で改行する（最後の行に数文字だけはみ出さないように）
// Chrome・Edge は CSS の word-break: auto-phrase、iPhone の Safari などは BudouX（vendor/budoux）で区切る
const TAGS = 'h1,h2,h3,h4,h5,p,li,dt,dd,figcaption,blockquote,a,button,span,div,small,strong,em,b,label,td,th';
const JA = /[぀-ヿ一-鿿]/;

const style = document.createElement('style');
style.textContent = '.nw { text-wrap: balance; word-break: auto-phrase; overflow-wrap: break-word; }';
document.head.appendChild(style);

const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && JA.test(n.textContent));
const targets = [];
for (const el of document.body.querySelectorAll(TAGS)) {
  if (el.closest('.nw, script, style, svg, pre, code, table.ledger, [data-no-nw]') || !hasText(el)) continue;
  if (el.textContent.length > 160) continue;
  const heading = /^H[1-4]$/.test(el.tagName);
  if (!heading && getComputedStyle(el).textAlign !== 'center') continue;
  el.classList.add('nw');
  targets.push(el);
}

const native = CSS.supports('word-break', 'auto-phrase') && !/[?&]budoux\b/.test(location.search);
if (!native && targets.length) {
  const [{ HTMLProcessingParser }, { model }] = await Promise.all([
    import('../vendor/budoux/html_processor.js'),
    import('../vendor/budoux/data/models/ja.js'),
  ]);
  const parser = new HTMLProcessingParser(model);
  for (const el of targets) parser.applyToElement(el);
}
