// Optional developer verification; the shipped game has no npm dependency.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [kind='renderer',base='http://127.0.0.1:8083',fixturesFile=path.join(root,'build/animation-fixtures.json')]=process.argv.slice(2);
const moduleFile=path.join(root,'build/browser-test-deps/node_modules/playwright/index.mjs');
let chromium;
try { ({chromium}=await import(pathToFileURL(moduleFile))); }
catch { console.error('Install test-only dependencies: npm install --prefix build/browser-test-deps --no-save --package-lock=false playwright@1.58.2');process.exit(1); }
const browser=await chromium.launch({headless:true,channel:process.env.ZUMA_BROWSER_CHANNEL || undefined,executablePath:process.env.ZUMA_BROWSER_EXECUTABLE || undefined});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(base);
  const filename=kind==='renderer'?'animation_fixture_checks.js':'d_browser_checks.js';
  const source=await readFile(path.join(root,'tests',filename),'utf8');
  const check=Function(`return (${source});`)();
  const fixtures=kind==='renderer'?JSON.parse(await readFile(fixturesFile,'utf8')):undefined;
  const result=await check(page,fixtures,base);
  await writeFile(path.join(root,'build',`browser-${kind}-result.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
