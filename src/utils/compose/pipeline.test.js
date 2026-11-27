import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media, title } from '../../../tests/compose/build.js';
import { draw, near, rgb } from '../../../tests/compose/pixels.js';
import { createCanvas } from '../../api/compose/index.js';

const RED = '#ff0000';
const GREEN = '#00ff00';
const BLUE = '#0000ff';
const solid = (id, color, extra = {}) => gen(id, 'solid', { color }, extra);
const centre = (edl, time, options) => draw(edl, time, options).at(0.5, 0.5);
const close = (actual, expected, tolerance, message) =>
  assert.ok(near(actual, expected, tolerance), `${message || ''} got ${actual}, want ${expected}`);

/** A footage frame / still: a canvas of one colour. */
function plate(color, width = 64, height = 36) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

describe('layer pipeline', () => {
  it('fills the frame with the document background, black by default', () => {
    close(centre(doc([[]])), [0, 0, 0]);
    close(centre(doc([[]], { background: '#336699' })), rgb('#336699'));
    close(centre(doc([[]], { background: 'not a colour' })), [0, 0, 0]);
  });

  it('puts the first video track in front and honours mute and solo', () => {
    const tracks = [[solid('front', GREEN)], [solid('back', RED)]];
    close(centre(doc(tracks)), rgb(GREEN));
    close(centre(doc([{ clips: tracks[0], muted: true }, tracks[1]])), rgb(RED));
    close(centre(doc([tracks[0], { clips: tracks[1], solo: true }])), rgb(RED));
  });

  it('draws only clips that cover the time, and nothing for placeholders', () => {
    const edl = doc([
      [
        solid('a', GREEN, { timelineStart: 0, timelineEnd: 2 }),
        solid('b', RED, { timelineStart: 2, timelineEnd: 4 }),
        media('p', '', { timelineStart: 4, timelineEnd: 6, placeholder: true }),
      ],
    ]);
    close(centre(edl, 1), rgb(GREEN));
    close(centre(edl, 2), rgb(RED), 2, 'a clip ends where the next begins:');
    close(centre(edl, 5), [0, 0, 0]);
    close(centre(edl, 9), [0, 0, 0]);
  });

  it('multiplies transform opacity and fades into the clip opacity', () => {
    close(centre(doc([[solid('a', GREEN, { transform: { opacity: 0.5 } })]])), [0, 128, 0]);
    const fading = doc([
      [solid('a', GREEN, { fadeIn: 2, fadeOut: 1, transform: { opacity: 0.5 } })],
    ]);
    close(centre(fading, 1), [0, 64, 0]);
    close(centre(fading, 3.5), [0, 64, 0]);
    close(centre(fading, 2.5), [0, 128, 0]);
  });

  it('dissolves: the outgoing clip stays opaque under the incoming one', () => {
    const edl = doc([
      [
        solid('out', RED, { timelineStart: 0, timelineEnd: 3, fadeOut: 2 }),
        solid('in', BLUE, { timelineStart: 1, timelineEnd: 4, fadeIn: 2 }),
      ],
      [solid('under', GREEN)],
    ]);
    // Midpoint: half blue over full red — the green track never shows through.
    close(centre(edl, 2), [128, 0, 128]);
    close(centre(edl, 1.5), [191, 0, 64], 3);
  });

  it('fades to what is behind when nothing dissolves in', () => {
    const edl = doc([[solid('a', RED, { timelineEnd: 2, fadeOut: 2 })], [solid('b', GREEN)]]);
    close(centre(edl, 1), [128, 128, 0], 3);
  });

  it('maps every blend mode onto its composite operation', () => {
    const over = (blendMode) =>
      centre(doc([[solid('a', '#804020', { blendMode })], [solid('b', '#406080')]]));
    close(over('normal'), [128, 64, 32]);
    close(over('add'), [192, 160, 160]);
    close(over('multiply'), [32, 24, 16]);
    close(over('screen'), [160, 136, 144]);
    close(over('darken'), [64, 64, 32]);
    close(over('lighten'), [128, 96, 128]);
    close(over('difference'), [64, 32, 96]);
    close(over('overlay'), [64, 48, 33], 3);
    close(over('no-such-mode'), [128, 64, 32]);
    assert.ok(!near(over('soft-light'), [64, 96, 128], 4), 'soft-light changes the backdrop');
  });

  it('composes a track with opacity on its own surface', () => {
    // Two opaque clips mid-dissolve, the track at half: the back shows by half.
    const edl = doc([
      {
        opacity: 0.5,
        clips: [
          solid('out', RED, { timelineEnd: 3, fadeOut: 2 }),
          solid('in', BLUE, { timelineStart: 1, fadeIn: 2 }),
        ],
      },
      [solid('back', '#00ff00')],
    ]);
    close(centre(edl, 2), [64, 128, 64], 3);
    close(centre(doc([{ opacity: 0, clips: [solid('a', RED)] }, [solid('b', GREEN)]])), rgb(GREEN));
  });

  it('applies a track blend mode and track effects to the whole track', () => {
    const blended = doc([
      { blendMode: 'add', clips: [solid('a', '#400000')] },
      [solid('b', '#004000')],
    ]);
    close(centre(blended), [64, 64, 0]);
    const blurred = doc([
      {
        effects: [fx('blur', { radius: 80 })],
        clips: [gen('a', 'shape', { width: 0.1, height: 0.1, fill: '#ffffff' })],
      },
    ]);
    const sharp = doc([[gen('a', 'shape', { width: 0.1, height: 0.1, fill: '#ffffff' })]]);
    assert.deepEqual(draw(sharp).at(0.5, 0.5), [255, 255, 255]);
    assert.ok(draw(blurred).at(0.5, 0.5)[0] < 200, 'the track effect softened the shape');
    assert.ok(draw(blurred).at(0.6, 0.5)[0] > 0, 'and spread it past its rectangle');
  });

  it('draws footage and stills from the host, placed by the transform', () => {
    const images = new Map([['/m/still.png', plate(GREEN)]]);
    const frameOf = (clip, sourceTime) =>
      clip.clipId === 'v' && sourceTime === 3.5 ? plate(RED) : null;
    const edl = doc([
      [
        media('s', '/m/still.png', {
          transform: { fit: 'contain', scaleX: 0.5, scaleY: 0.5, x: 480 },
        }),
      ],
      [media('v', '/m/clip.mp4', { sourceIn: 2.5, sourceOut: 6.5 })],
    ]);
    const frame = draw(edl, 1, { images, frameOf });
    close(frame.at(0.25, 0.5), rgb(RED), 2, 'footage at sourceIn + 1 s:');
    close(frame.at(0.75, 0.5), rgb(GREEN), 2, 'still moved right by a quarter frame:');
    close(frame.at(0.75, 0.2), rgb(RED), 2, 'still scaled to half height:');
    close(draw(edl, 2, { images, frameOf }).at(0.25, 0.5), [0, 0, 0], 2, 'no frame, no layer:');
  });

  it('gives a title the same transform as any other source', () => {
    const block = { content: 'MMMM', fontSize: 200, color: GREEN, background: GREEN };
    const moved = draw(doc([[title('t', 'x', block, { transform: { x: 480, y: -270 } })]]));
    close(moved.at(0.75, 0.25), rgb(GREEN));
    close(moved.at(0.5, 0.5), [0, 0, 0]);
    const grown = draw(
      doc([[title('t', 'x', { ...block, fontSize: 40 }, { transform: { scaleX: 6, scaleY: 6 } })]]),
    );
    close(grown.at(0.5, 0.5), rgb(GREEN));
  });
});

describe('keyframes and effects in the pipeline', () => {
  const animated = doc([
    [
      gen(
        'a',
        'shape',
        { width: 0.1, height: 0.2, fill: '#ffffff' },
        {
          sourceIn: 10,
          sourceOut: 14,
          keyframes: {
            'transform.x': [
              { t: 10, v: -480 },
              { t: 12, v: 480 },
            ],
            'generator.params.fill': [
              { t: 10, v: '#ff0000' },
              { t: 12, v: '#0000ff' },
            ],
            'transform.opacity': [
              { t: 12, v: 1 },
              { t: 14, v: 0 },
            ],
          },
        },
      ),
    ],
  ]);

  it('moves and recolours a clip along its keyframes, in clip-local time', () => {
    close(draw(animated, 0).at(0.25, 0.5), rgb(RED));
    close(draw(animated, 1).at(0.5, 0.5), [128, 0, 128]);
    close(draw(animated, 2).at(0.75, 0.5), rgb(BLUE));
    close(draw(animated, 3).at(0.75, 0.5), [0, 0, 128], 2, 'opacity halfway down:');
    close(draw(animated, 1).at(0.25, 0.5), [0, 0, 0], 2, 'it left where it started:');
  });

  it('animates an effect parameter addressed by effect id', () => {
    const edl = doc([
      [
        gen(
          'a',
          'shape',
          { width: 0.2, height: 0.2, fill: '#ffffff' },
          {
            effects: [fx('blur', { radius: 0 })],
            keyframes: {
              'effects.fx_blur.radius': [
                { t: 0, v: 0 },
                { t: 4, v: 80 },
              ],
            },
          },
        ),
      ],
    ]);
    const spread = (time) => draw(edl, time).at(0.62, 0.5)[0];
    assert.equal(spread(0), 0);
    assert.ok(spread(2) > 0 && spread(3.9) > spread(2), `${spread(2)} then ${spread(3.9)}`);
  });

  it('skips disabled effects, ignores unknown ones and unknown generators', () => {
    const shape = (effects) => doc([[gen('a', 'shape', { width: 0.2, height: 0.2 }, { effects })]]);
    const plain = draw(shape([])).data;
    assert.deepEqual(draw(shape([fx('blur', { radius: 30 }, false)])).data, plain);
    assert.deepEqual(draw(shape([fx('does-not-exist')])).data, plain);
    close(centre(doc([[gen('a', 'no-such-generator')], [solid('b', GREEN)]])), rgb(GREEN));
  });

  it('lets effects spill outside the clip rectangle, in frame space', () => {
    const glowing = (scale) =>
      doc([
        [
          gen(
            'a',
            'shape',
            { width: 0.4, height: 0.4, fill: '#ffffff' },
            {
              transform: { scaleX: scale, scaleY: scale },
              effects: [fx('glow', { radius: 24, intensity: 2 })],
            },
          ),
        ],
      ]);
    // The shape's edge is at 0.5 + 0.2·scale of the width; look 10 output px beyond it.
    const beyond = (scale) => draw(glowing(scale)).at(0.5 + 0.2 * scale + 10 / 1920, 0.5)[0];
    assert.ok(beyond(1) > 40, `halo outside the shape: ${beyond(1)}`);
    assert.ok(
      Math.abs(beyond(1) - beyond(0.5)) < 12,
      'the radius is in output pixels, not clip pixels',
    );
  });
});
