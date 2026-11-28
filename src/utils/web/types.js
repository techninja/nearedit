/**
 * Shared JSDoc types of web clips. No runtime code.
 * Field semantics: docs/app-spec/WEBCLIP.md.
 * @module utils/web/types
 */

/**
 * What a step aims at: `text=…`, `label=…`, `css=…` (or a bare CSS
 * selector), `point=x,y`, or a point in viewport CSS pixels.
 * @typedef {string | { x: number, y: number }} Target
 */

/**
 * A target taken apart. `value` is the text, label or selector — for a
 * point `"x,y"`, with the numbers in `x` and `y`.
 * @typedef {{ by: 'css'|'text'|'label'|'point', value: string, x?: number, y?: number }} ParsedTarget
 */

/**
 * One parameter of a step kind, as the step form and the director see it.
 * @typedef {Object} StepParam
 * @property {'target'|'text'|'number'|'boolean'|'select'|'key'|'code'} type
 * @property {any} default
 * @property {string} label
 * @property {readonly string[]} [options] - `select`: the choices.
 *   `target`: words accepted instead of a target (`top`, `bottom`)
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} [required] - A recording cannot start without it
 * @property {boolean} [integer] - `number`: whole numbers only
 * @property {boolean} [multiple] - `select`: a list of choices (`modifiers`)
 * @property {boolean} [number] - `target`: a number of pixels is accepted too
 * @property {'color'|'url'} [format] - `text`: a hex colour / an address
 */

/**
 * One step kind: its name, what it does, its default timing in seconds and
 * its own parameters.
 * @typedef {Object} StepKind
 * @property {string} do
 * @property {string} label
 * @property {string} description
 * @property {number} duration - Default; `type` adds its typing time
 * @property {number} hold - Default
 * @property {Record<string, StepParam>} params
 * @property {string[]} [oneOf] - Parameters of which at least one must be
 *   set (`scroll`: `to` or `by`)
 * @property {'always'|'clicks'} [camera] - The step is a zoom cue: always
 *   (`focus`), or when zooming on clicks is asked for (`click`, `type`)
 */

/**
 * What every step has, whatever its kind.
 * @typedef {Object} StepFields
 * @property {string} do - A step kind
 * @property {string} ease - An easing name, for the step's motion
 * @property {string} note - A caption; never part of the recipe key
 * @property {number} [duration] - Seconds; absent = the kind's default
 * @property {number} [hold] - Seconds; absent = the kind's default
 */

/**
 * One step of a recipe: the common fields, and the parameters of its kind
 * (`STEP_KINDS`) — `target`, `index`, `text`, `key`… — each with its
 * default filled in.
 * @typedef {StepFields & Record<string, any>} Step
 */

/**
 * @typedef {Object} Recipe
 * @property {string} url - `http:` or `https:`; '' = none yet
 * @property {{ width: number, height: number }} viewport - CSS pixels
 * @property {number} scale - Device pixels per CSS pixel
 * @property {'light'|'dark'} colorScheme
 * @property {number} lead - Seconds before the first step
 * @property {number} tail - Seconds after the last step
 * @property {{ style: string, size: number, color: string, clicks: boolean }} cursor
 * @property {Target[]} hide
 * @property {string} storage
 * @property {'fail'|'skip'} onMissing
 * @property {Step[]} steps
 */

/**
 * When one step happens. Every time is a whole number of frames.
 * @typedef {Object} ScoreStep
 * @property {number} index - Index into the normalised recipe's `steps`
 * @property {string} do
 * @property {number} start - Where the step's `duration` begins
 * @property {number} actionEnd - `start + duration`
 * @property {number} end - `actionEnd + hold`
 * @property {string} note
 */

/**
 * @typedef {Object} Score
 * @property {number} fps
 * @property {number} duration - Seconds, `frames / fps`
 * @property {number} frames
 * @property {ScoreStep[]} steps
 */

/**
 * A step as it was recorded.
 * @typedef {Object} TrackStep
 * @property {number} index
 * @property {string} do
 * @property {number} start
 * @property {number} actionEnd
 * @property {number} end
 * @property {string} note
 * @property {Target} [target]
 * @property {boolean} missing
 * @property {{ x: number, y: number, width: number, height: number }} [rect] -
 *   Of the target, viewport CSS pixels, at the action
 * @property {{ x: number, y: number }} [point] - Where the cursor went
 * @property {number} [zoom] - A `focus` step's own zoom, when the recorder notes it
 */

/**
 * What happened in a recording (`<key>.json`).
 * @typedef {Object} Track
 * @property {number} version
 * @property {string} key
 * @property {string} url
 * @property {string} title
 * @property {number} fps
 * @property {number} duration
 * @property {{ width: number, height: number }} viewport
 * @property {number} scale
 * @property {number} width - Pixels of the recording
 * @property {number} height
 * @property {TrackStep[]} steps
 * @property {number[][]} cursor - `[t, x, y]`, only when it moved
 * @property {number[][]} scroll - `[t, y]`
 * @property {string[]} warnings
 */

/**
 * The `web` field of a clip.
 * @typedef {{ recipe: Recipe, key: string, title: string }} WebBlock
 */

export {};
