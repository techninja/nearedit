/**
 * The bounds of kits on disk, as data: how large a `kit.json` and a file
 * beside it may be, which kinds of file a kit may hold, how many of them,
 * and which ids the library keeps for itself.
 * Contract: docs/app-spec/BRAND-API.md § Limits.
 * @module api/kits/limits
 */

import { BUILTIN_KITS } from '#utils/brand/index.js';

/** The file a kit folder is recognised by. */
export const KIT_FILE = 'kit.json';

/** Largest `kit.json` that is read or written, bytes. */
export const MAX_KIT_JSON = 512 * 1024;

/** Largest logo or font file, bytes. */
export const MAX_FILE = 10 * 1024 * 1024;

/** Files one kit folder may hold. */
export const MAX_FILES = 64;

/** Kits the library may hold. */
export const MAX_KITS = 500;

/** Longest file name, characters, extension included. */
export const MAX_FILE_NAME = 100;

/** Folders below a kit's own that are searched for its files. */
export const FILE_DEPTH = 3;

/** Logos and other pictures a kit may hold, by extension. */
export const PICTURE_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

/** Font files a kit may hold, by extension. */
export const FONT_TYPES = ['woff2', 'woff', 'ttf', 'otf'];

/** Every kind of file a kit may hold, by extension. */
export const FILE_TYPES = [...PICTURE_TYPES, ...FONT_TYPES];

/** What a project names when it has a kit of its own. */
export const PROJECT_CHOICE = 'project';

/**
 * Ids the library cannot give to a kit: `project` names a project's own
 * kit, and a built-in kit's name always means the built-in kit.
 */
export const RESERVED_IDS = [PROJECT_CHOICE, ...BUILTIN_KITS.map((kit) => kit.id)];

/** Longest description that is kept, characters. */
export const MAX_DESCRIPTION = 400;
