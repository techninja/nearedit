import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequest, initialAdaptationForm, updateRequest } from './adaptationForm.js';
import { validateAdaptationForm, withAspect } from './adaptationForm.js';
import { ASPECT_PRESETS, statusLabel } from './adaptationPresets.js';
import { ASPECT_RESOLUTIONS, aspectOf } from '../../api/projects/adaptationFields.js';

const parent = {
  id: 'p1',
  name: 'Long form',
  aspectRatio: '16:9',
  resolution: '1920x1080',
  fps: 25,
};

describe('ASPECT_PRESETS', () => {
  it('lead with the size the server would choose for each ratio', () => {
    for (const preset of ASPECT_PRESETS) {
      assert.equal(preset.sizes[0], ASPECT_RESOLUTIONS[preset.aspectRatio], preset.aspectRatio);
    }
  });

  it('only offer sizes the server accepts for their ratio', () => {
    for (const preset of ASPECT_PRESETS) {
      for (const size of preset.sizes) assert.equal(aspectOf(size), preset.aspectRatio, size);
    }
  });
});

describe('initialAdaptationForm', () => {
  it('starts a top-level adaptation as an empty 16:9', () => {
    assert.deepEqual(initialAdaptationForm(), {
      name: '',
      aspectRatio: '16:9',
      resolution: '1920x1080',
      fps: 30,
      parentId: '',
      copy: false,
    });
  });

  it('proposes a vertical copy for a variant of a landscape edit', () => {
    const form = initialAdaptationForm({ parent });
    assert.equal(form.aspectRatio, '9:16');
    assert.equal(form.resolution, '1080x1920');
    assert.equal(form.fps, 25, 'keeps the parent frame rate');
    assert.equal(form.parentId, 'p1');
    assert.equal(form.copy, true);
    assert.equal(form.name, 'Long form — Vertical');
  });

  it('proposes a square variant of a vertical edit', () => {
    assert.equal(
      initialAdaptationForm({ parent: { ...parent, aspectRatio: '9:16' } }).aspectRatio,
      '1:1',
    );
  });

  it('loads the values of an adaptation being edited', () => {
    const editing = { ...parent, id: 'c1', parentAdaptationId: 'p1', name: 'Reel' };
    const form = initialAdaptationForm({ editing });
    assert.equal(form.name, 'Reel');
    assert.equal(form.parentId, 'p1');
    assert.equal(form.copy, false);
  });
});

describe('withAspect', () => {
  it('switches the size with the ratio', () => {
    const next = withAspect(initialAdaptationForm(), '1:1');
    assert.equal(next.aspectRatio, '1:1');
    assert.equal(next.resolution, '1080x1080');
  });

  it('ignores an unknown ratio', () => {
    const form = initialAdaptationForm();
    assert.equal(withAspect(form, '5:7'), form);
  });
});

describe('validateAdaptationForm', () => {
  it('requires a name and a sane frame rate', () => {
    const errors = validateAdaptationForm({ ...initialAdaptationForm(), name: '  ', fps: 0 });
    assert.ok(errors.name);
    assert.ok(errors.fps);
  });

  it('accepts a complete form', () => {
    assert.deepEqual(validateAdaptationForm({ ...initialAdaptationForm(), name: 'Main' }), {});
  });
});

describe('requests', () => {
  it('creates a top-level adaptation without parent fields', () => {
    const body = createRequest({ ...initialAdaptationForm(), name: ' Main ' });
    assert.deepEqual(body, { name: 'Main', aspectRatio: '16:9', resolution: '1920x1080', fps: 30 });
  });

  it('creates a variant as a copy of its parent', () => {
    const body = createRequest(initialAdaptationForm({ parent }));
    assert.equal(body.parentAdaptationId, 'p1');
    assert.equal(body.copyFrom, 'p1');
  });

  it('creates an empty variant when copying is switched off', () => {
    const body = createRequest({ ...initialAdaptationForm({ parent }), copy: false });
    assert.equal(body.parentAdaptationId, 'p1');
    assert.equal('copyFrom' in body, false);
  });

  it('updates only the settings', () => {
    const body = updateRequest({ ...initialAdaptationForm({ parent }), name: 'Reel', fps: '24' });
    assert.deepEqual(body, { name: 'Reel', aspectRatio: '9:16', resolution: '1080x1920', fps: 24 });
  });
});

describe('statusLabel', () => {
  it('names known statuses and passes others through', () => {
    assert.equal(statusLabel('review'), 'In review');
    assert.equal(statusLabel(''), 'Draft');
    assert.equal(statusLabel('archived'), 'archived');
  });
});
