import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clickFrames } from './acts.js';
import { encoderArgs, pngSize } from './encoder.js';
import { CLEAR_FIELD, mouse, pressKey, typeChar } from './input.js';
import { PAGE_SCRIPT, helperCall } from './inject.js';
import { charKey, namedKey } from './keys.js';
import { pressParts, typeParts } from './typing.js';

/** The parts of the web recorder that need no browser: keys, input events, frame timing. */

describe('web recorder: keys, input and timing', () => {
  it('knows keys by name and by character', () => {
    assert.deepEqual(namedKey('enter'), { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' });
    assert.deepEqual(
      [namedKey('Esc').key, namedKey('Down').code, namedKey('F5').keyCode, namedKey('Space').code],
      ['Escape', 'ArrowDown', 116, 'Space'],
    );
    assert.deepEqual([namedKey('F13'), namedKey('Nope'), namedKey('')], [null, null, null]);
    assert.deepEqual(charKey('A'), { key: 'A', code: 'KeyA', keyCode: 65, text: 'A', shift: true });
    assert.deepEqual(
      [charKey('%').code, charKey('?').code, charKey('_').shift, charKey("'").shift],
      ['Digit5', 'Slash', true, false],
    );
    assert.deepEqual([charKey('é'), charKey('😀'), charKey('中')], [null, null, null]);
    assert.deepEqual(typeChar('é'), [['Input.insertText', { text: 'é' }]]);
    const [down, up] = typeChar('a');
    assert.deepEqual(
      [down[1].type, down[1].text, up[1].type, up[1].text],
      ['keyDown', 'a', 'keyUp', undefined],
    );
    assert.equal(typeChar('\n')[0][1].text, '\r');
    assert.equal(typeChar('\t')[0][1].type, 'rawKeyDown', 'Tab types nothing: it moves on');
    const combo = pressKey('a', ['Shift', 'Control', 'Bogus'], 'down').map(([, event]) => [
      event.key,
      event.type,
      event.modifiers,
    ]);
    assert.deepEqual(combo, [
      ['Shift', 'rawKeyDown', 8],
      ['Control', 'rawKeyDown', 10],
      ['a', 'rawKeyDown', 10],
    ]);
    assert.deepEqual(
      pressKey('a', ['Control'], 'up').map(([, event]) => event.key),
      ['a', 'Control'],
    );
    assert.equal(pressKey('NoKey', [], 'down'), null);
    assert.deepEqual(CLEAR_FIELD[0][1].commands, ['selectAll']);
    assert.deepEqual(mouse('mouseMoved', { x: 1, y: 2 }, { held: 'left' })[1], {
      type: 'mouseMoved',
      x: 1,
      y: 2,
      button: 'left',
      buttons: 1,
      clickCount: 0,
    });
    assert.deepEqual(mouse('mouseReleased', { x: 1, y: 2 }, { button: 'right', count: 1 })[1], {
      type: 'mouseReleased',
      x: 1,
      y: 2,
      button: 'right',
      buttons: 0,
      clickCount: 1,
    });
  });

  it('puts presses, releases and keys on frames', () => {
    assert.deepEqual(clickFrames({ step: 0, S: 0, A: 21, E: 39 }, 1, 30), [[21, 25]]);
    assert.deepEqual(clickFrames({ step: 0, S: 0, A: 21, E: 39 }, 2, 30), [
      [21, 25],
      [27, 31],
    ]);
    assert.deepEqual(
      clickFrames({ step: 0, S: 0, A: 21, E: 23 }, 2, 30),
      [
        [21, 23],
        [23, 23],
      ],
      'never after the step',
    );
    assert.deepEqual(clickFrames({ step: 0, S: 0, A: 21, E: 21 }, 1, 60), [[21, 21]]);
    const step = {
      do: 'type',
      text: 'héy',
      target: '#name',
      speed: 10,
      clear: true,
      ease: 'linear',
    };
    const parts = typeParts(step, { step: 3, S: 30, A: 54, E: 60 }, 30);
    assert.deepEqual([parts.G, parts.down, parts.ripple], [45, [[45, 47]], [45]]);
    const at = { x: 5, y: 6 };
    const methods = (n) => parts.cue(n, at).map(([method, params]) => params.type || method);
    assert.deepEqual(methods(45), ['mousePressed']);
    assert.deepEqual(
      methods(46),
      ['rawKeyDown', 'keyUp', 'rawKeyDown', 'keyUp'],
      'the field is emptied once it has the focus',
    );
    assert.deepEqual(methods(47), ['mouseReleased']);
    assert.deepEqual(
      [methods(48), methods(51), methods(54)],
      [['keyDown', 'keyUp'], ['Input.insertText'], ['keyDown', 'keyUp']],
    );
    assert.deepEqual(methods(49), []);
    const loose = typeParts(
      { do: 'type', text: 'ab', target: '', speed: 15 },
      { step: 0, S: 3, A: 7, E: 7 },
      30,
    );
    assert.equal(loose.G, undefined, 'without a target the pointer stays where it is');
    assert.deepEqual(
      [3, 4, 5, 6, 7].map((n) => loose.cue(n, at).length),
      [0, 0, 2, 0, 2],
    );
    const press = pressParts({ key: 'Enter', modifiers: [] }, { step: 0, S: 4, A: 8, E: 20 });
    assert.deepEqual(
      [press.cue(4, at).length, press.cue(6, at).length, press.cue(8, at).length],
      [1, 0, 1],
    );
    assert.equal(pressParts({ key: 'Whatever' }, { step: 0, S: 4, A: 8, E: 20 }), null);
  });

  it('writes helper calls and encoder arguments', () => {
    assert.equal(
      helperCall('resolve', 3, { by: 'text', value: "it's" }, 0, undefined),
      `__nearedit.resolve(3, {"by":"text","value":"it's"}, 0, undefined)`,
    );
    assert.doesNotThrow(() => new Function(PAGE_SCRIPT), 'the planted script is valid JavaScript');
    const args = encoderArgs({ fps: 29.97, output: '/out/x.part' });
    assert.deepEqual(args.slice(args.indexOf('-framerate'), args.indexOf('-framerate') + 2), [
      '-framerate',
      '30000/1001',
    ]);
    assert.deepEqual(args.slice(args.indexOf('-g'), args.indexOf('-g') + 2), ['-g', '15']);
    assert.ok(
      args.join(' ').includes('crop=trunc(iw/2)*2:trunc(ih/2)*2') && args.includes('yuv420p'),
    );
    assert.deepEqual(args.slice(-3), ['-f', 'mp4', '/out/x.part']);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]),
      Buffer.from('IHDR'),
      Buffer.from([0, 0, 5, 0, 0, 0, 2, 208]),
    ]);
    assert.deepEqual(pngSize(png), { width: 1280, height: 720 });
    assert.throws(() => pngSize(Buffer.alloc(0)), /did not return a picture/);
  });
});
