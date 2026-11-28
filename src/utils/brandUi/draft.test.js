import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_SCHEMA } from '#utils/brand/index.js';
import { brandDialog } from './dialogState.js';
import {
  draftKit,
  isChanged,
  resetToken,
  setToken,
  startDraft,
  tokenAt,
  withFont,
} from './draft.js';
import { changeToken, chooseFile, resetOne } from './draftEdits.js';
import { fileUrlOf, pendingFiles } from './draftFiles.js';
import { filesOf, slugOf, withStoredNames } from './draftNames.js';
import { beginDraft, draftState, endDraft } from './draftState.js';
import { fakeKitServer } from './fakeKitServer.js';
import { faceFromFile, fileProblem } from './fontFiles.js';
import { chooseKit, loadKits } from './kitList.js';
import { loadProjectKit } from './kitLoad.js';
import { kitState, standIn } from './kitState.js';
import { previewKit } from './previewKit.js';
import { saveForProject, saveToLibrary } from './saveKit.js';
import { kitOf } from './testkit.js';
import { contrastNotes, tokenGroups } from './tokenFields.js';

const bold = kitOf('bold');
const blank = startDraft({ choice: 'builtin:bold', kit: null });
const file = (name) => new File(['abc'], name);
let net = { calls: [], files: {}, state: {}, restore: () => {} };
afterEach(() => {
  net.restore();
  endDraft();
  kitState.set(standIn('', 'fallback'));
});

describe('a draft', () => {
  it('starts empty over the kit in use, or from the project’s own kit', () => {
    assert.deepEqual(blank, { extends: 'builtin:bold', name: '', tokens: {}, fonts: [], rest: {} });
    const own = {
      name: 'Mine',
      extends: 'acme',
      tokens: { color: { primary: '#ff0000' } },
      elements: { x: {} },
    };
    const draft = startDraft({ choice: 'project', kit: own });
    assert.deepEqual([draft.extends, draft.name, draft.tokens], ['acme', 'Mine', own.tokens]);
    assert.notEqual(draft.tokens, own.tokens, 'a copy: the stored kit is never changed');
    assert.deepEqual(draftKit(draft).elements, { x: {} }, 'what else the kit holds is kept');
  });

  it('holds only what differs from its base', () => {
    let draft = setToken(blank, 'color.primary', '#22d3ee', bold);
    assert.equal(isChanged(draft, 'color.primary'), true);
    draft = setToken(draft, 'font.heading.weight', 700, bold);
    draft = setToken(draft, 'font.heading.italic', false, bold);
    assert.deepEqual(draft.tokens, {
      color: { primary: '#22d3ee' },
      font: { heading: { weight: 700 } },
    });
    draft = setToken(draft, 'color.primary', tokenAt(bold.tokens, 'color.primary'), bold);
    assert.equal(isChanged(draft, 'color.primary'), false, 'the base’s own value is no change');
    assert.deepEqual(resetToken(draft, 'font.heading.weight').tokens, {});
    assert.equal(setToken(blank, 'nope.x', 1, bold), blank);
    assert.equal(resetToken(blank, 'color.text'), blank);
  });

  it('is saved as a kit that extends its base', () => {
    const draft = withFont(
      setToken(blank, 'shape.radius', 3, bold),
      faceFromFile('Acme-Bold.woff2'),
    );
    assert.deepEqual(draftKit(draft, 'Mine'), {
      name: 'Mine',
      extends: 'builtin:bold',
      tokens: { shape: { radius: 3 } },
      fonts: [{ family: 'Acme', weight: 700, style: 'normal', file: 'Acme-Bold.woff2' }],
    });
  });

  it('previews as a complete kit, colours derived anew', () => {
    const draft = setToken(blank, 'color.primary', '#000000', bold);
    const kit = previewKit(bold, draft);
    assert.equal(kit.tokens.color.primary, '#000000');
    assert.equal(kit.tokens.color.onPrimary, '#ffffff', 'white reads on black');
    assert.equal(bold.tokens.color.onPrimary, '#000000');
    assert.deepEqual(Object.keys(kit.tokens), Object.keys(TOKEN_SCHEMA));
    assert.equal(kit.elements, bold.elements);
    const own = previewKit(bold, setToken(draft, 'color.onPrimary', '#ff00ff', bold));
    assert.equal(own.tokens.color.onPrimary, '#ff00ff', 'a chosen colour is kept');
    const logo = previewKit(
      bold,
      setToken(blank, 'logo.mark', 'a.png', bold),
      (name) => `blob:x#${name}`,
    );
    assert.equal(logo.tokens.logo.mark, 'blob:x#a.png');
  });
});

describe('names and files', () => {
  it('reads a font file’s family, weight and style from its name', () => {
    assert.deepEqual(faceFromFile('AcmeSans-BoldItalic.woff2'), {
      family: 'Acme Sans',
      weight: 700,
      style: 'italic',
      file: 'AcmeSans-BoldItalic.woff2',
    });
    assert.equal(faceFromFile('Poppins-SemiBold.otf').weight, 600);
    assert.equal(
      faceFromFile('Inter-Regular.ttf').family,
      'Inter Custom',
      'a bundled family is not redefined',
    );
    assert.equal(fileProblem('logo.svg', 'logo'), 'A logo must be a png, jpg, webp or gif picture');
    assert.match(fileProblem('font.zip', 'font'), /\.woff2/);
    assert.equal(fileProblem('a.png', 'logo', 11 * 1024 * 1024), 'The file is larger than 10 MB');
    assert.equal(fileProblem('a.PNG', 'logo', 10), '');
  });

  it('makes ids, lists files and takes the names the server gave', () => {
    assert.equal(slugOf('  Acme Studio! '), 'acme-studio');
    assert.equal(slugOf('…'), '');
    const draft = withFont(
      setToken(setToken(blank, 'logo.main', 'My Logo.png', bold), 'logo.mark', 'My Logo.png', bold),
      faceFromFile('A-Bold.ttf'),
    );
    assert.deepEqual(filesOf(draft), ['My Logo.png', 'A-Bold.ttf']);
    const named = withStoredNames(draft, new Map([['My Logo.png', 'My-Logo.png']]));
    assert.deepEqual(
      [named.tokens.logo.main, named.tokens.logo.mark, named.fonts[0].file],
      ['My-Logo.png', 'My-Logo.png', 'A-Bold.ttf'],
    );
  });

  it('generates the editor from the schema and remarks on colours that read badly', () => {
    const groups = tokenGroups();
    assert.deepEqual(
      groups.map((group) => group.group),
      Object.keys(TOKEN_SCHEMA),
    );
    assert.equal(groups[0].fields[2].path, 'color.primary');
    assert.deepEqual(contrastNotes(bold.tokens), {});
    const notes = contrastNotes({ color: { ...bold.tokens.color, text: '#222222' } });
    assert.match(
      notes['color.text'],
      /^Hard to read on the background \(contrast 1\.\d, aim for 4\.5\) and on the surface/,
    );
  });
});

describe('customising against a server', () => {
  it('chooses a kit, edits, brings files and saves the project’s own kit', async () => {
    net = fakeKitServer();
    await loadProjectKit('p1');
    await loadKits();
    assert.equal(brandDialog.get().kits.length, 4);
    assert.equal(await chooseKit('builtin:bold'), true);
    assert.equal(kitState.get().choice, 'builtin:bold');
    await beginDraft();
    changeToken('color.primary', '#22d3ee');
    assert.equal(draftState.get().preview.tokens.color.primary, '#22d3ee');
    assert.equal(chooseFile('logo.main', file('logo.svg')), false);
    assert.match(draftState.get().problem, /png/);
    assert.equal(chooseFile('logo.main', file('logo.png')), true);
    assert.deepEqual(draftState.get().draft.tokens.logo, { main: 'logo.png', mark: 'logo.png' });
    assert.match(fileUrlOf('logo.png'), /^blob:.*#logo\.png$/);
    assert.equal(chooseFile('font.heading', file('Acme-Bold.ttf')), true);
    assert.deepEqual(draftState.get().draft.tokens.font.heading, { family: 'Acme', weight: 700 });
    assert.equal(draftState.get().preview.fonts[0].family, 'Acme');
    changeToken('space.gap', 4);
    resetOne('space.gap');
    assert.deepEqual([...pendingFiles().keys()], ['logo.png', 'Acme-Bold.ttf']);
    assert.equal(await saveForProject(), true);
    const puts = net.calls.filter((call) => call.method === 'PUT').map((call) => call.path);
    assert.deepEqual(puts.slice(-3), [
      '/api/projects/p1/kit/files/logo.png',
      '/api/projects/p1/kit/files/Acme-Bold.ttf',
      '/api/projects/p1/kit',
    ]);
    assert.equal(net.state.own.extends, 'builtin:bold');
    assert.equal(net.state.own.tokens.color.primary, '#22d3ee');
    assert.deepEqual(
      [kitState.get().choice, kitState.get().effective.tokens.logo.mark],
      ['project', '/kits/project/logo.png'],
    );
    assert.equal(pendingFiles().size, 0);
    assert.equal(draftState.get().dirty, false);
    assert.equal(
      fileUrlOf('logo.png'),
      '/kits/project/logo.png',
      'now read from where the server keeps it',
    );
  });

  it('saves to the library: the kit first, then its files; a kit that does not validate is not stored', async () => {
    net = fakeKitServer();
    await loadProjectKit('p1');
    await beginDraft();
    chooseFile('logo.mark', file('mark.png'));
    assert.equal(await saveToLibrary('Acme Studio'), true);
    const puts = net.calls.filter((call) => call.method === 'PUT').map((call) => call.path);
    assert.deepEqual(puts, ['/api/kits/acme-studio', '/api/kits/acme-studio/files/mark.png']);
    assert.deepEqual(net.files['acme-studio'], ['mark.png']);
    assert.equal(kitState.get().choice, 'builtin:clean', 'the project keeps its kit');
    assert.match(brandDialog.get().said, /Saved to the library as “Acme Studio”/);
    assert.equal(await saveToLibrary('?'), false);
    assert.match(brandDialog.get().error, /name/);
    changeToken('color.primary', 'nonsense');
    assert.equal(await saveToLibrary('Broken'), false);
    assert.equal(brandDialog.get().problems[0].path, 'tokens.color.primary');
    assert.equal(net.state.library.broken, undefined);
  });
});
