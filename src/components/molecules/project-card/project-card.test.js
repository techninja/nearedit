import { fixture, expect } from '@open-wc/testing';
import './project-card.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const PROJECT = {
  id: 'p1',
  name: 'Park adventure',
  description: 'A walk in the park.',
  path: '/media/video/park',
  available: true,
  adaptations: [{ id: 'a1' }, { id: 'a2' }],
  updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
};

async function mount(project) {
  const el = await fixture(`<project-card></project-card>`);
  el.project = project;
  await frame();
  return el;
}

describe('project-card', () => {
  it('links to the project and shows its facts', async () => {
    const el = await mount(PROJECT);
    expect(el.querySelector('a.project-card-main').getAttribute('href')).to.equal('/project/p1');
    expect(el.querySelector('.project-card-name').textContent).to.equal('Park adventure');
    expect(el.querySelector('.project-card-path').getAttribute('title')).to.equal(
      '/media/video/park',
    );
    const meta = el.querySelector('.project-card-meta').textContent.replace(/\s+/g, ' ').trim();
    expect(meta).to.equal('2 adaptations · changed 3 hours ago');
  });

  it('flags a project whose folder cannot be read and does not link to it', async () => {
    const el = await mount({ ...PROJECT, available: false, adaptations: [] });
    expect(el.querySelector('a.project-card-main')).to.equal(null);
    expect(el.querySelector('.project-card-missing').textContent).to.contain(
      'Folder not available',
    );
    expect(el.querySelector('.project-card-unavailable')).to.not.equal(null);
  });

  it('asks to be removed from the list, saying no files are deleted', async () => {
    const el = await mount(PROJECT);
    const forgotten = [];
    el.addEventListener('projectforget', (event) => forgotten.push(event.detail.project.id));
    const button = el.querySelector('.project-card-forget');
    expect(button.title).to.contain('no files are deleted');
    button.click();
    expect(forgotten).to.deep.equal(['p1']);
  });
});
