/**
 * Job tray organism — a header button that opens the list of running and
 * recent background jobs (renders, analysis, director runs) with progress,
 * cancel and dismiss, and the switch for desktop notifications. It shows
 * the jobs of the open project, or of `project-id` when given, or all.
 * Live data: `#utils/ui/jobCenter.js`.
 * @module components/organisms/job-tray
 */

import { html, define, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import UserPrefs from '#store/UserPrefs.js';
import { cancelOrDismiss, dismissFinished, jobState } from '#utils/ui/jobCenter.js';
import { activeCount, isActive, trayJobs } from '#utils/ui/jobList.js';
import { disableNotifications, enableNotifications } from '#utils/ui/notify.js';
import { notificationPermission, notificationSwitch } from '#utils/ui/notify.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';
import '#molecules/job-row/index.js';

/**
 * @typedef {Object} JobTrayHost
 * @property {string} projectId - Limit the list to this project; '' = the open project, or all
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 * @property {import('#store/UserPrefs.js').UserPrefsShape} prefs
 * @property {{ jobs: import('#utils/api/jobs.js').JobSummary[] }} live
 * @property {boolean} open
 */

/** @param {JobTrayHost & HTMLElement} host */
function close(host) {
  host.open = false;
  /** @type {HTMLElement|null} */ (host.querySelector('.job-tray-button'))?.focus();
}

/** @param {JobTrayHost & HTMLElement} host @param {KeyboardEvent} event */
function handleKeydown(host, event) {
  if (!host.open) return;
  event.stopPropagation(); // keys in the open tray are not editor shortcuts
  if (event.key === 'Escape') close(host);
}

/** @param {JobTrayHost} _host @param {CustomEvent} event */
function handleDismiss(_host, event) {
  cancelOrDismiss(event.detail.job);
}

/** @param {JobTrayHost} host */
function handleNotifications(host) {
  const { on } = notificationSwitch(notificationPermission(), host.prefs.notifications);
  if (on) disableNotifications();
  else enableNotifications();
}

/**
 * @param {JobTrayHost} host
 * @param {import('#utils/api/jobs.js').JobSummary[]} jobs
 * @returns {import('hybrids').UpdateFunctionWithMethods<JobTrayHost>}
 */
function panel(host, jobs) {
  const bell = notificationSwitch(notificationPermission(), host.prefs.notifications);
  const finished = jobs.filter((job) => !isActive(job));
  return html`
    <div class="job-tray-backdrop" onclick="${close}"></div>
    <section class="menu job-tray-panel" aria-label="Background jobs">
      <header class="job-tray-header">
        <strong>Jobs</strong>
        ${finished.length
          ? html`<button
              type="button"
              class="job-tray-clear"
              onclick="${() => dismissFinished(finished)}"
            >
              Clear finished
            </button>`
          : html``}
        <button
          type="button"
          class="icon-btn job-tray-bell"
          aria-pressed="${bell.on ? 'true' : 'false'}"
          aria-label="Desktop notifications"
          title="${bell.hint}"
          disabled="${!bell.canToggle}"
          onclick="${handleNotifications}"
        >
          ${bell.on
            ? html`<app-icon name="bell" size="sm"></app-icon>`
            : html`<app-icon name="bell-off" size="sm"></app-icon>`}
        </button>
      </header>
      ${jobs.length
        ? html`<ul class="job-tray-list" onjobdismiss="${handleDismiss}">
            ${jobs.map((job) => html`<li><job-row job="${job}"></job-row></li>`.key(job.id))}
          </ul>`
        : html`<p class="empty-state">
            Nothing running. Renders, analysis and director runs show up here — they carry on when
            you close this tab.
          </p>`}
    </section>
  `;
}

/** @type {import('hybrids').Component<JobTrayHost>} */
export default define({
  tag: 'job-tray',
  projectId: '',
  project: store(ProjectState),
  prefs: store(UserPrefs),
  live: watch(jobState),
  open: false,
  render: {
    value: (host) => {
      const jobs = trayJobs(host.live.jobs, host.projectId || host.project.projectId);
      const active = activeCount(jobs);
      const label = active ? `Jobs: ${active} running` : 'Jobs';
      return html`
        <div class="job-tray" onkeydown="${handleKeydown}">
          <button
            type="button"
            class="icon-btn job-tray-button ${active ? 'job-tray-busy' : ''}"
            aria-label="${label}"
            aria-expanded="${host.open ? 'true' : 'false'}"
            title="${label}"
            onclick="${html.set('open', !host.open)}"
          >
            <app-icon name="cpu" size="sm"></app-icon>
            ${active ? html`<span class="job-tray-count">${active}</span>` : html``}
          </button>
          ${host.open ? panel(host, jobs) : html``}
        </div>
      `;
    },
    shadow: false,
  },
});
