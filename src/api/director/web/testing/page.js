/**
 * The test site as a snapshot saw it at 1280 × 720 — what is on the page,
 * as data, for tests that need no browser. One line per element: kind,
 * name, target, and its rectangle in page pixels. The dialog is on the
 * page only after "Watch the demo" was clicked. Not part of the runtime.
 * @module api/director/web/testing/page
 */

const HOME = `
link|Features|a[href="#features"]|958,18,57,22
link|Pricing|a[href="#pricing"]|1043,18,46,22
link|Docs|text=Docs|1117,18,34,22
link|Sign in|text=Sign in|1179,18,45,22
section|Changelogs people actually read|header|0,58,1280,476
heading|Changelogs people actually read|text=Changelogs people actually read|56,183,616,114
link|Get started|text=Get started|56,402,130,49
button|Watch the demo|text=Watch the demo|198,402,170,49
heading|Scheduled posts are here|text=Scheduled posts are here|744,246,456,31
section|Features|#features|0,535,1280,676
heading|Features|#features-title|56,607,1168,53
heading|Write once|text=Write once|81,749,325,29
heading|Schedule it|text=Schedule it|478,749,325,29
heading|See who read it|text=See who read it|874,749,325,29
image|Readers chart|svg[aria-label="Readers chart"]|84,911,1112,180
section|Pricing|#pricing|0,1211,1280,646
heading|Pricing|#pricing-title|56,1283,1168,53
button|Monthly|text=Monthly|60,1405,100,41
button|Yearly|text=Yearly|164,1405,85,41
section|Starter plan|article[aria-label="Starter plan"]|56,1479,375,305
heading|Starter|text=Starter|81,1504,325,29
link|Choose Starter|text=Choose Starter|81,1689,161,49
section|Pro plan|article[aria-label="Pro plan"]|453,1479,375,305
heading|Pro|text=Pro|478,1504,325,29
link|Choose Pro|text=Choose Pro|478,1711,133,49
section|Team plan|article[aria-label="Team plan"]|849,1479,375,305
heading|Team|text=Team|874,1504,325,29
link|Choose Team|text=Choose Team|874,1689,150,49
section|Create your account|#signup|0,1857,1280,578
heading|Create your account|text=Create your account|56,1929,556,53
input|Email|label=Email|697,1986,498,46
input|Workspace|label=Workspace|697,2075,498,46
input|Team size Just me 2 to 10 11 to 50|label=Team size Just me 2 to 10 11 to 50|697,2164,498,43
button|Create account|text=Create account|697,2223,498,49`;

const DIALOG = `
section|Product tour|[role="dialog"]|0,0,1280,720
heading|A two-minute tour|text=A two-minute tour|410,243,460,44
button|Close tour|text=Close tour|410,429,125,49`;

const DOCS = `
heading|Docs|text=Docs|56,56,1168,68
section|Install the widget|section:nth-of-type(1)|56,198,720,170
heading|Install the widget|text=Install the widget|83,225,666,30
section|API keys|section:nth-of-type(2)|56,404,720,150
heading|API keys|text=API keys|83,431,666,30
link|Back to the home page|text=Back to the home page|83,502,160,22`;

/**
 * @param {string} table
 * @returns {import('#utils/director/web/match.js').PageElement[]}
 */
function read(table) {
  return table
    .trim()
    .split('\n')
    .map((line) => {
      const [kind, name, target, box] = line.split('|');
      const [x, y, width, height] = box.split(',').map(Number);
      return { kind, name, target, rect: { x, y, width, height }, visible: y < 720 };
    });
}

/** The home page of the test site. */
export const HOME_PAGE = Object.freeze(read(HOME));
/** What is added to it while its dialog is open. */
export const DIALOG_OPEN = Object.freeze(read(DIALOG));
/** Its second page, `/docs.html`. */
export const DOCS_PAGE = Object.freeze(read(DOCS));

/**
 * The page of the test site after some steps of a recipe: the docs once a
 * step went there, the dialog once "Watch the demo" was clicked.
 * @param {{ steps?: any[] }} recipe
 * @returns {{ title: string, height: number, elements: any[] }}
 */
export function pageAfter(recipe) {
  const steps = recipe.steps || [];
  const went = steps.filter((step) => step.do === 'goto').pop();
  if (went && /docs/.test(went.url))
    return { title: 'Tideline docs', height: 720, elements: [...DOCS_PAGE] };
  const opened = steps.some((step) => step.do === 'click' && /Watch the demo/.test(step.target));
  const closed = steps.some((step) => step.do === 'click' && /Close tour/.test(step.target));
  const extra = opened && !closed ? DIALOG_OPEN : [];
  return {
    title: 'Tideline — changelogs people read',
    height: 2516,
    elements: [...HOME_PAGE, ...extra],
  };
}
