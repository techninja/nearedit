import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptationRows, deletionEffect, deletionMessage, effectiveParents } from './tree.js';

const a = (id, parentAdaptationId = '', name = id) => ({ id, parentAdaptationId, name });
const shape = (rows) => rows.map((row) => `${'  '.repeat(row.depth)}${row.adaptation.id}`);

describe('adaptationRows', () => {
  it('nests children under their parents, depth first, in stored order', () => {
    const list = [
      a('long'),
      a('podcast'),
      a('reel', 'long'),
      a('audiogram', 'podcast'),
      a('teaser', 'long'),
      a('teaser-cut', 'teaser'),
    ];
    assert.deepEqual(shape(adaptationRows(list)), [
      'long',
      '  reel',
      '  teaser',
      '    teaser-cut',
      'podcast',
      '  audiogram',
    ]);
  });

  it('reports child counts and parent names', () => {
    const rows = adaptationRows([a('long', '', 'Long form'), a('reel', 'long'), a('sq', 'long')]);
    assert.equal(rows[0].childCount, 2);
    assert.equal(rows[0].parentName, '');
    assert.equal(rows[1].parentName, 'Long form');
    assert.equal(rows[1].childCount, 0);
  });

  it('shows an adaptation whose parent is gone at the top level', () => {
    assert.deepEqual(shape(adaptationRows([a('one'), a('orphan', 'deleted')])), ['one', 'orphan']);
  });

  it('never loses adaptations to a parent loop', () => {
    const rows = adaptationRows([a('x', 'y'), a('y', 'x'), a('z', 'y'), a('self', 'self')]);
    assert.deepEqual(shape(rows).sort(), ['  z', 'self', 'x', 'y'].sort());
    assert.equal(rows.length, 4);
  });

  it('tolerates missing input', () => {
    assert.deepEqual(adaptationRows(undefined), []);
    assert.deepEqual(adaptationRows([null, { name: 'no id' }]), []);
  });
});

describe('effectiveParents', () => {
  it('keeps real parents and clears unusable ones', () => {
    const parents = effectiveParents([a('root'), a('child', 'root'), a('lost', 'nope')]);
    assert.equal(parents.get('child'), 'root');
    assert.equal(parents.get('root'), '');
    assert.equal(parents.get('lost'), '');
  });
});

describe('deletionEffect', () => {
  const list = [
    a('long', '', 'Long form'),
    a('reel', 'long', 'Reel'),
    a('reel-a', 'reel', 'Reel A'),
    a('reel-b', 'reel', 'Reel B'),
  ];

  it('names the children that move and where they go', () => {
    assert.deepEqual(deletionEffect(list, 'reel'), {
      allowed: true,
      children: ['Reel A', 'Reel B'],
      newParentName: 'Long form',
    });
  });

  it('moves the children of a root to the top level', () => {
    const effect = deletionEffect(list, 'long');
    assert.deepEqual(effect.children, ['Reel']);
    assert.equal(effect.newParentName, '');
  });

  it('refuses the last adaptation', () => {
    assert.equal(deletionEffect([a('only')], 'only').allowed, false);
  });
});

describe('deletionMessage', () => {
  it('says only that the timeline goes when there are no children', () => {
    const text = deletionMessage('Reel', { children: [], newParentName: '' });
    assert.match(text, /timeline of “Reel” is deleted/);
    assert.doesNotMatch(text, /move/);
  });

  it('tells where one child moves', () => {
    const text = deletionMessage('Reel', { children: ['Reel A'], newParentName: 'Long form' });
    assert.match(text, /Its variant “Reel A” moves under “Long form”\./);
  });

  it('tells that several children become top-level', () => {
    const text = deletionMessage('Long', { children: ['A', 'B'], newParentName: '' });
    assert.match(text, /Its variants “A”, “B” move to the top level\./);
  });
});
