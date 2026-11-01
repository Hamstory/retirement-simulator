import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function build({ write = true } = {}) {
  const [template, css, engineSource, settingsSource, appSource] = await Promise.all(
    ['index.template.html', 'styles.css', 'engine.js', 'settings.js', 'app.js']
      .map(name => readFile(path.join(root, 'src', name), 'utf8'))
  );
  const exportMarker = '\n// @single-file-exports\n';
  const [engine, exports] = engineSource.split(exportMarker);
  if (!exports || !/^export \{[^}]+\};\s*$/.test(exports)) {
    throw new Error('engine.js의 단일 파일 빌드용 export 구문을 확인하세요.');
  }
  const [settingsModule, settingsExports] = settingsSource.split(exportMarker);
  if (!settingsExports || !/^export \{[^}]+\};\s*$/.test(settingsExports)) throw new Error('settings.js export 구문을 확인하세요.');
  const settings = settingsModule.replace(/^import \{[^}]+\} from '\.\/engine\.js';\s*/, '');
  const app = appSource.replace(/^import \{[^}]+\} from '\.\/(?:engine|settings)\.js';\s*/gm, '');
  if (app === appSource || settings === settingsModule || /<\/script\s*>/i.test(engine + settings + app)) {
    throw new Error('스크립트 import 또는 HTML 삽입 안전성을 확인하세요.');
  }
  let html = template;
  for (const [marker, content] of [
    ['<!-- STYLES -->', `<style>\n${css}</style>`],
    ['<!-- ENGINE -->', `<script id="calculation-engine">\n${engine}\n</script>`],
    ['<!-- SETTINGS -->', `<script id="settings-codec">\n${settings}\n</script>`],
    ['<!-- APP -->', `<script id="interface">\n${app}\n</script>`],
  ]) {
    if (html.split(marker).length !== 2) throw new Error(`템플릿 표식은 정확히 한 개여야 합니다: ${marker}`);
    html = html.replace(marker, () => content);
  }
  if (write) {
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist/index.html'), html);
  }
  return html;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = await build();
  console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes; external runtime dependencies: 0)`);
}
