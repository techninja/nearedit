/**
 * Path helpers for the folder browser. The paths belong to the server's
 * file system, which may be Windows, so separators are detected. Pure.
 * @module utils/projects/folderPath
 */

/**
 * @param {string} path
 * @returns {string} The separator the path uses
 */
const separatorOf = (path) => (path.includes('\\') && !path.includes('/') ? '\\' : '/');

/**
 * The browse root a path lies in (the longest one that contains it).
 * @param {string} path
 * @param {string[]} roots
 * @returns {string} '' when the path is under none of them
 */
export function rootOf(path, roots) {
  const sep = separatorOf(path);
  const inside = roots.filter((root) => {
    const base = root.endsWith(sep) ? root : root + sep;
    return path === root || path.startsWith(base);
  });
  return inside.sort((a, b) => b.length - a.length)[0] || '';
}

/**
 * Breadcrumb from the browse root down to a folder. Folders above the
 * root cannot be listed, so the trail starts at the root.
 * @param {string} path - Folder being shown
 * @param {string[]} roots - Browse roots
 * @returns {{ name: string, path: string }[]} Root first, `path` last
 */
export function breadcrumb(path, roots) {
  if (!path) return [];
  const sep = separatorOf(path);
  const root = rootOf(path, roots);
  if (!root) return [{ name: path, path }];
  const rootName = root.split(sep).filter(Boolean).pop() || root;
  const crumbs = [{ name: rootName, path: root }];
  const rest = path.slice(root.length).split(sep).filter(Boolean);
  let current = root.endsWith(sep) ? root.slice(0, -1) : root;
  for (const name of rest) {
    current += sep + name;
    crumbs.push({ name, path: current });
  }
  return crumbs;
}

/**
 * Why a folder name cannot be used, mirroring the server's rule.
 * @param {string} name
 * @returns {string} '' when the name is fine
 */
export function folderNameProblem(name) {
  const trimmed = name.trim();
  if (!trimmed) return 'Type a name for the new folder';
  if (trimmed.length > 255) return 'That name is too long';
  if (trimmed.startsWith('.')) return 'A folder name cannot start with a dot';
  if (/[/\\\u0000-\u001f]/.test(trimmed)) return 'A folder name cannot contain slashes';
  return '';
}
