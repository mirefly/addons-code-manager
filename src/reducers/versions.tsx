import { Reducer } from 'redux';
import { ActionType, createAction, getType } from 'typesafe-actions';
import log from 'loglevel';
import {
  ChangeInfo,
  DiffInfo,
  DiffInfoType,
  HunkInfo,
  getChangeKey,
} from 'react-diff-view';
import { push } from 'connected-react-router';

import { ThunkActionCreator } from '../configureStore';
import { getDiff, getVersion, getVersionsList, isErrorResponse } from '../api';
import {
  LocalizedStringMap,
  createAdjustedQueryString,
  extractNumber,
} from '../utils';
import { actions as errorsActions } from './errors';
import {
  ROOT_PATH,
  RelativePathPosition,
  findRelativePathWithDiff,
} from './fileTree';

export enum ScrollTarget {
  firstDiff = 'firstDiff',
  lastDiff = 'lastDiff',
}

type VersionCompatibility = {
  [appName: string]: {
    min: string;
    max: string;
  };
};

type VersionLicense = {
  id: number;
  isCustom: boolean;
  name: LocalizedStringMap;
  text: LocalizedStringMap;
  url: string;
};

export type VersionEntryStatus = '' | 'M' | 'A' | 'D' | 'R' | 'C';
export type VersionEntryType = 'image' | 'directory' | 'text' | 'binary';

export type ExternalVersionEntry = {
  depth: number;
  filename: string;
  mime_category: VersionEntryType;
  mimetype: string;
  modified: string;
  path: string;
  sha256: string;
  size: number | null;
  status?: VersionEntryStatus;
};

type PartialExternalVersionFile = {
  created: string;
  download_url: string | null;
  entries: {
    [nodeName: string]: ExternalVersionEntry;
  };
  hash: string;
  id: number;
  is_mozilla_signed_extension: boolean;
  is_restart_required: boolean;
  is_webextension: boolean;
  permissions: string[];
  platform: string;
  selected_file: string;
  size: number;
  status: string;
  url: string;
};

export type ExternalVersionAddon = {
  icon_url: string;
  id: number;
  name: LocalizedStringMap;
  slug: string;
};

type PartialExternalVersion = {
  addon: ExternalVersionAddon;
  channel: string;
  compatibility: VersionCompatibility;
  edit_url: string;
  has_been_validated: boolean;
  id: number;
  is_strict_compatibility_enabled: boolean;
  license: VersionLicense;
  release_notes: LocalizedStringMap | null;
  reviewed: string;
  url: string;
  validation_url: string;
  validation_url_json: string;
  version: string;
};

export type ExternalChange = {
  content: string;
  new_line_number: number;
  old_line_number: number;
  type: 'normal' | 'delete' | 'insert';
};

export type ExternalHunk = {
  changes: ExternalChange[];
  header: string;
  new_lines: number;
  new_start: number;
  old_lines: number;
  old_start: number;
};

type ExternalDiff = {
  hash: string;
  hunks: ExternalHunk[];
  is_binary: boolean;
  lines_added: number;
  lines_deleted: number;
  mode: string;
  new_ending_new_line: boolean;
  old_ending_new_line: boolean;
  old_path: string;
  parent: string;
  path: string;
  size: number;
};

export type ExternalVersionFileWithContent = PartialExternalVersionFile & {
  content: string;
};

export type ExternalVersionFileWithDiff = PartialExternalVersionFile & {
  diff: ExternalDiff | null;
};

export type ExternalVersionWithContent = PartialExternalVersion & {
  file: ExternalVersionFileWithContent;
};

export type ExternalVersionWithDiff = PartialExternalVersion & {
  file: ExternalVersionFileWithDiff;
};

// This is how we store file information, but the getVersionFile selector
// returns more info, which is defined in VersionFile, below.
type InternalVersionFile = {
  content: string;
  created: string;
  downloadURL: string | null;
  id: number;
  size: number;
};

export type VersionFile = {
  content: string;
  created: string;
  downloadURL: string | null;
  // This is the basename of the file.
  filename: string;
  id: number;
  mimeType: string;
  // This is the relative path to the file, including directories.
  path: string;
  sha256: string;
  size: number;
  type: VersionEntryType;
  version: string;
};

export type VersionEntry = {
  depth: number;
  filename: string;
  mimeType: string;
  modified: string;
  path: string;
  sha256: string;
  type: VersionEntryType;
};

type VersionAddon = {
  iconUrl: string;
  id: number;
  name: LocalizedStringMap;
  slug: string;
};

export type Version = {
  addon: VersionAddon;
  entries: VersionEntry[];
  expandedPaths: string[];
  id: number;
  reviewed: string;
  selectedPath: string;
  validationURL: string;
  visibleSelectedPath: string | null;
  version: string;
};

export type VersionsListItem = {
  channel: 'unlisted' | 'listed';
  id: number;
  version: string;
};

export type ExternalVersionsListItem = VersionsListItem;

export type ExternalVersionsList = ExternalVersionsListItem[];

export type VersionsList = VersionsListItem[];

export type VersionsMap = {
  listed: VersionsList;
  unlisted: VersionsList;
};

export type CompareInfo = {
  diff: DiffInfo | null;
  mimeType: string;
};

export type EntryStatusMap = {
  [nodeName: string]: VersionEntryStatus | undefined;
};

export const actions = {
  loadVersionFile: createAction('LOAD_VERSION_FILE', (resolve) => {
    return (payload: { path: string; version: ExternalVersionWithContent }) =>
      resolve(payload);
  }),
  loadVersionInfo: createAction('LOAD_VERSION_INFO', (resolve) => {
    return (payload: {
      version: ExternalVersionWithContent | ExternalVersionWithDiff;
    }) => resolve(payload);
  }),
  loadEntryStatusMap: createAction('LOAD_ENTRY_STATUS_MAP', (resolve) => {
    return (payload: {
      version: ExternalVersionWithContent | ExternalVersionWithDiff;
      comparedToVersionId: number | null;
    }) => resolve(payload);
  }),
  updateSelectedPath: createAction('UPDATE_SELECTED_PATH', (resolve) => {
    return (payload: { selectedPath: string; versionId: number }) =>
      resolve(payload);
  }),
  setCurrentVersionId: createAction('SET_CURRENT_VERSION_ID', (resolve) => {
    return (payload: { versionId: number }) => resolve(payload);
  }),
  unsetCurrentVersionId: createAction('UNSET_CURRENT_VERSION_ID', (resolve) => {
    return () => resolve();
  }),
  setVisibleSelectedPath: createAction(
    'SET_VISIBLE_SELECTED_PATH',
    (resolve) => {
      return (payload: { path: string | null; versionId: number }) =>
        resolve(payload);
    },
  ),
  toggleExpandedPath: createAction('TOGGLE_EXPANDED_PATH', (resolve) => {
    return (payload: { path: string; versionId: number }) => resolve(payload);
  }),
  expandTree: createAction('EXPAND_TREE', (resolve) => {
    return (payload: { versionId: number }) => resolve(payload);
  }),
  collapseTree: createAction('COLLAPSE_TREE', (resolve) => {
    return (payload: { versionId: number }) => resolve(payload);
  }),
  loadVersionsList: createAction('LOAD_VERSIONS_LIST', (resolve) => {
    return (payload: { addonId: number; versions: ExternalVersionsList }) =>
      resolve(payload);
  }),
  beginFetchDiff: createAction('BEGIN_FETCH_DIFF', (resolve) => {
    return (payload: {
      addonId: number;
      baseVersionId: number;
      headVersionId: number;
      path?: string;
    }) => resolve(payload);
  }),
  beginFetchVersionFile: createAction('BEGIN_FETCH_VERSION_FILE', (resolve) => {
    return (payload: { path: string; versionId: number }) => resolve(payload);
  }),
  abortFetchDiff: createAction('ABORT_FETCH_DIFF', (resolve) => {
    return (payload: {
      addonId: number;
      baseVersionId: number;
      headVersionId: number;
      path?: string;
    }) => resolve(payload);
  }),
  abortFetchVersionFile: createAction('ABORT_FETCH_VERSION_FILE', (resolve) => {
    return (payload: { path: string; versionId: number }) => resolve(payload);
  }),
  loadDiff: createAction('LOAD_DIFF', (resolve) => {
    return (payload: {
      addonId: number;
      baseVersionId: number;
      headVersionId: number;
      version: ExternalVersionWithDiff;
      path?: string;
    }) => resolve(payload);
  }),
  beginFetchVersion: createAction('BEGIN_FETCH_VERSION', (resolve) => {
    return (payload: { versionId: number }) => resolve(payload);
  }),
  abortFetchVersion: createAction('ABORT_FETCH_VERSION', (resolve) => {
    return (payload: { versionId: number }) => resolve(payload);
  }),
};

export type VersionsState = {
  byAddonId: {
    [addonId: number]: VersionsMap;
  };
  compareInfo: {
    [compareInfoKey: string]:
      | CompareInfo // data successfully loaded
      | null // an error has occured
      | undefined; // data not fetched yet
  };
  compareInfoIsLoading: {
    [compareInfoKey: string]: boolean;
  };
  currentVersionId: number | undefined | false;
  entryStatusMaps: {
    [entryStatusMapKey: string]: EntryStatusMap;
  };
  versionInfo: {
    [versionId: number]:
      | Version // data successfully loaded
      | null // an error has occured
      | undefined; // data not fetched yet
  };
  versionFiles: {
    [versionId: number]: {
      [path: string]:
        | InternalVersionFile // data successfully loaded
        | null // an error has occured
        | undefined; // data not fetched yet
    };
  };
  versionFilesLoading: {
    [versionId: number]: {
      [path: string]: boolean;
    };
  };
};

export const initialState: VersionsState = {
  byAddonId: {},
  compareInfo: {},
  compareInfoIsLoading: {},
  currentVersionId: undefined,
  entryStatusMaps: {},
  versionFiles: {},
  versionFilesLoading: {},
  versionInfo: {},
};

export const getParentFolders = (path: string): string[] => {
  const parents = [ROOT_PATH];

  const folders = path.split('/');

  while (folders.length > 1) {
    folders.pop();
    parents.push(folders.join('/'));
  }

  return parents;
};

export const createInternalVersionFile = (
  file: ExternalVersionFileWithContent,
): InternalVersionFile => {
  return {
    content: file.content,
    created: file.created,
    downloadURL: file.download_url,
    id: file.id,
    size: file.size,
  };
};

export const createInternalVersionEntry = (
  entry: ExternalVersionEntry,
): VersionEntry => {
  return {
    depth: entry.depth,
    filename: entry.filename,
    mimeType: entry.mimetype,
    modified: entry.modified,
    path: entry.path,
    sha256: entry.sha256,
    type: entry.mime_category,
  };
};

export const getEntryStatusMapKey = ({
  versionId,
  comparedToVersionId,
}: {
  versionId: number;
  comparedToVersionId: number | null;
}) => {
  return `versionId=${versionId};comparedToVersionId=${comparedToVersionId}`;
};

export const createEntryStatusMap = (
  version: ExternalVersionWithContent | ExternalVersionWithDiff,
): EntryStatusMap => {
  const { entries } = version.file;
  const entryStatusMap: EntryStatusMap = {};

  for (const nodeName of Object.keys(entries)) {
    entryStatusMap[nodeName] = entries[nodeName].status;
  }

  return entryStatusMap;
};

export const createInternalVersionAddon = (
  addon: ExternalVersionAddon,
): VersionAddon => {
  return {
    iconUrl: addon.icon_url,
    id: addon.id,
    name: addon.name,
    slug: addon.slug,
  };
};

export const createInternalVersion = (
  version: ExternalVersionWithContent | ExternalVersionWithDiff,
): Version => {
  return {
    addon: createInternalVersionAddon(version.addon),
    entries: Object.keys(version.file.entries).map((nodeName) => {
      return createInternalVersionEntry(version.file.entries[nodeName]);
    }),
    expandedPaths: getParentFolders(version.file.selected_file),
    id: version.id,
    reviewed: version.reviewed,
    selectedPath: version.file.selected_file,
    version: version.version,
    validationURL: version.validation_url_json,
    visibleSelectedPath: null,
  };
};

export const getVersionFiles = (versions: VersionsState, versionId: number) => {
  return versions.versionFiles[versionId];
};

export const getVersionInfo = (versions: VersionsState, versionId: number) => {
  return versions.versionInfo[versionId];
};

export const getEntryStatusMap = ({
  versions,
  versionId,
  comparedToVersionId,
}: {
  versions: VersionsState;
  versionId: number;
  comparedToVersionId: number | null;
}): EntryStatusMap | undefined => {
  return versions.entryStatusMaps[
    getEntryStatusMapKey({
      versionId,
      comparedToVersionId,
    })
  ];
};

export const selectCurrentVersionInfo = (
  versions: VersionsState,
): Version | null | undefined | false => {
  if (!versions.currentVersionId) {
    return versions.currentVersionId === undefined ? undefined : false;
  }
  return getVersionInfo(versions, versions.currentVersionId);
};

export const getMostRelevantEntryStatus = ({
  version,
  entryStatusMap,
  path,
}: {
  version: Version;
  entryStatusMap: EntryStatusMap;
  path: string;
}): VersionEntryStatus | undefined => {
  const statuses = version.entries
    .filter((e) => e.path.startsWith(path))
    .map((e) => entryStatusMap[e.path]);

  const priorities: VersionEntryStatus[] = ['A', 'M', 'D'];

  for (const p of priorities) {
    if (statuses.includes(p)) {
      return p;
    }
  }

  return statuses.length ? statuses[0] : undefined;
};

export const getVersionFile = (
  versions: VersionsState,
  versionId: number,
  path: string,
  { _log = log } = {},
): VersionFile | undefined | null => {
  const version = getVersionInfo(versions, versionId);
  const filesForVersion = getVersionFiles(versions, versionId);

  if (version && filesForVersion) {
    const file = filesForVersion[path];

    // A file is `null` when it could not be retrieved from the API because of
    // an error.
    if (file === null) {
      return null;
    }

    const entry = version.entries.find((e) => e.path === path);

    if (!entry) {
      _log.debug(`Entry missing for path: ${path}, versionId: ${versionId}`);
      return undefined;
    }

    if (file) {
      return {
        ...file,
        filename: entry.filename,
        mimeType: entry.mimeType,
        path,
        sha256: entry.sha256,
        type: entry.type,
        version: version.version,
      };
    }
  }

  // The version or file was not found.
  return undefined;
};

export const isFileLoading = (
  versions: VersionsState,
  versionId: number,
  path: string,
): boolean => {
  if (versions.versionFilesLoading[versionId]) {
    return versions.versionFilesLoading[versionId][path] || false;
  }

  return false;
};

export const getDiffAnchors = (diff: DiffInfo): string[] => {
  const anchors: string[] = [];

  for (const hunk of diff.hunks) {
    let seekingChange = true;
    for (const change of hunk.changes) {
      if (change.type === 'normal') {
        seekingChange = true;
      } else if (seekingChange) {
        // This is the first change in a block.
        anchors.push(getChangeKey(change));
        seekingChange = false;
      }
    }
  }
  return anchors;
};

export type GetRelativeDiffAnchorParams = {
  currentAnchor?: string | undefined;
  diff: DiffInfo;
  position?: RelativePathPosition;
};

export const getRelativeDiffAnchor = ({
  currentAnchor = '',
  diff,
  position = RelativePathPosition.next,
}: GetRelativeDiffAnchorParams): string | null => {
  const anchors = getDiffAnchors(diff);
  if (anchors.length) {
    if (!currentAnchor) {
      // Since we aren't looking for an anchor relative to an existing one,
      // just get the first anchor.
      return anchors[0];
    }

    const currentIndex = anchors.indexOf(currentAnchor);

    if (currentIndex >= 0) {
      const newIndex =
        position === RelativePathPosition.previous
          ? currentIndex - 1
          : currentIndex + 1;

      if (newIndex >= 0 && newIndex < anchors.length) {
        return anchors[newIndex];
      }
      // The currentAnchor is the only anchor in the diff.
      return null;
    }

    // We have a currentAnchor, but is doesn't match anything in anchors, so
    // we need to try to find the correct anchor closest to the currentAnchor.
    const currentAnchorNumber = extractNumber(currentAnchor);
    const sortedAnchors: string[] =
      position === RelativePathPosition.previous
        ? [...anchors].reverse()
        : anchors;
    if (currentAnchorNumber) {
      for (const anchor of sortedAnchors) {
        const anchorNumber = extractNumber(anchor);
        if (anchorNumber) {
          if (
            (position === RelativePathPosition.previous &&
              anchorNumber <= currentAnchorNumber) ||
            (position === RelativePathPosition.next &&
              anchorNumber >= currentAnchorNumber)
          ) {
            return anchor;
          }
        }
      }
    }
  }

  // We never found a valid next/previous anchor in the file, so return null.
  return null;
};

export type GetRelativeDiffParams = {
  _findRelativePathWithDiff?: typeof findRelativePathWithDiff;
  _getRelativeDiffAnchor?: typeof getRelativeDiffAnchor;
  currentAnchor: string | undefined;
  diff: DiffInfo | null;
  entryStatusMap: EntryStatusMap;
  pathList: string[];
  position: RelativePathPosition;
  version: Version;
};

type RelativeDiffResult = {
  anchor: string | null;
  path: string | null;
};

export const getRelativeDiff = ({
  _findRelativePathWithDiff = findRelativePathWithDiff,
  _getRelativeDiffAnchor = getRelativeDiffAnchor,
  currentAnchor,
  diff,
  entryStatusMap,
  pathList,
  position,
  version,
}: GetRelativeDiffParams): RelativeDiffResult => {
  const result: RelativeDiffResult = {
    anchor: diff
      ? _getRelativeDiffAnchor({ currentAnchor, diff, position })
      : null,
    path: null,
  };

  if (!result.anchor) {
    result.path = _findRelativePathWithDiff({
      currentPath: version.selectedPath,
      entryStatusMap,
      pathList,
      position,
      version,
    });
  }

  return result;
};

type FetchVersionParams = {
  _getVersion?: typeof getVersion;
  addonId: number;
  versionId: number;
  path?: string;
};

export const fetchVersion = ({
  _getVersion = getVersion,
  addonId,
  versionId,
  path,
}: FetchVersionParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { api: apiState } = getState();

    dispatch(actions.beginFetchVersion({ versionId }));
    // Set this as the current version so that components can track its
    // loading progress.
    dispatch(actions.setCurrentVersionId({ versionId }));

    const response = await _getVersion({
      addonId,
      apiState,
      path,
      versionId,
    });

    if (isErrorResponse(response)) {
      dispatch(actions.abortFetchVersion({ versionId }));
      dispatch(errorsActions.addError({ error: response.error }));
    } else {
      dispatch(actions.loadVersionInfo({ version: response }));
      dispatch(
        actions.loadVersionFile({
          version: response,
          path: response.file.selected_file,
        }),
      );
    }
  };
};

type FetchVersionFileParams = {
  _getVersion?: typeof getVersion;
  addonId: number;
  path: string;
  versionId: number;
};

export const fetchVersionFile = ({
  _getVersion = getVersion,
  addonId,
  path,
  versionId,
}: FetchVersionFileParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { api: apiState } = getState();

    dispatch(actions.beginFetchVersionFile({ path, versionId }));

    const response = await _getVersion({
      addonId,
      apiState,
      versionId,
      path,
    });

    if (isErrorResponse(response)) {
      dispatch(actions.abortFetchVersionFile({ path, versionId }));
      dispatch(errorsActions.addError({ error: response.error }));
    } else {
      dispatch(actions.loadVersionFile({ path, version: response }));
    }
  };
};

export const createVersionsMap = (
  versions: ExternalVersionsList,
): VersionsMap => {
  const listed = versions.filter((version) => version.channel === 'listed');
  const unlisted = versions.filter((version) => version.channel === 'unlisted');

  return {
    listed,
    unlisted,
  };
};

type FetchVersionsListParams = {
  _getVersionsList?: typeof getVersionsList;
  addonId: number;
};

export const fetchVersionsList = ({
  _getVersionsList = getVersionsList,
  addonId,
}: FetchVersionsListParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { api: apiState } = getState();

    const response = await _getVersionsList({ addonId, apiState });

    if (isErrorResponse(response)) {
      dispatch(errorsActions.addError({ error: response.error }));
    } else {
      dispatch(actions.loadVersionsList({ addonId, versions: response }));
    }
  };
};

type CreateInternalDiffParams = {
  version: ExternalVersionWithDiff;
  baseVersionId: number;
  headVersionId: number;
};

export const createInternalChangeInfo = (
  change: ExternalChange,
): ChangeInfo => {
  return {
    content: change.content,
    isDelete: change.type === 'delete',
    isInsert: change.type === 'insert',
    isNormal: change.type === 'normal',
    lineNumber:
      change.type === 'insert'
        ? change.new_line_number
        : change.old_line_number,
    newLineNumber: change.new_line_number,
    oldLineNumber: change.old_line_number,
    type: change.type,
  };
};

export const createInternalHunk = (hunk: ExternalHunk): HunkInfo => {
  return {
    changes: hunk.changes.map(createInternalChangeInfo),
    content: hunk.header,
    isPlain: false,
    newLines: hunk.new_lines,
    newStart: hunk.new_start,
    oldLines: hunk.old_lines,
    oldStart: hunk.old_start,
  };
};

export const createInternalDiff = ({
  baseVersionId,
  headVersionId,
  version,
}: CreateInternalDiffParams): DiffInfo | null => {
  const GIT_STATUS_TO_TYPE: { [status: string]: DiffInfoType } = {
    A: 'add',
    C: 'copy',
    D: 'delete',
    M: 'modify',
    R: 'rename',
  };

  const { diff } = version.file;
  if (diff) {
    return {
      newRevision: String(headVersionId),
      oldRevision: String(baseVersionId),
      hunks: diff.hunks.map(createInternalHunk),
      type: GIT_STATUS_TO_TYPE[diff.mode] || GIT_STATUS_TO_TYPE.M,
      newEndingNewLine: diff.new_ending_new_line,
      oldEndingNewLine: diff.old_ending_new_line,
      newMode: diff.mode,
      oldMode: diff.mode,
      newPath: diff.path,
      oldPath: diff.old_path,
    };
  }
  return null;
};

type FetchDiffParams = {
  _getDiff?: typeof getDiff;
  addonId: number;
  baseVersionId: number;
  headVersionId: number;
  path?: string;
};

type GetCompareInfoKeyParams = {
  addonId: number;
  baseVersionId: number;
  headVersionId: number;
  path?: string;
};

export const getCompareInfoKey = ({
  addonId,
  baseVersionId,
  headVersionId,
  path,
}: GetCompareInfoKeyParams) => {
  return [addonId, baseVersionId, headVersionId, path].join('/');
};

export const createInternalCompareInfo = ({
  baseVersionId,
  headVersionId,
  entry,
  version,
}: {
  baseVersionId: number;
  headVersionId: number;
  entry: VersionEntry;
  version: ExternalVersionWithDiff;
}): CompareInfo => {
  return {
    diff: createInternalDiff({
      baseVersionId,
      headVersionId,
      version,
    }),
    mimeType: entry.mimeType,
  };
};

export const getCompareInfo = (
  versions: VersionsState,
  addonId: number,
  baseVersionId: number,
  headVersionId: number,
  path?: string,
) => {
  const compareInfoKey = getCompareInfoKey({
    addonId,
    baseVersionId,
    headVersionId,
    path,
  });

  return versions.compareInfo[compareInfoKey];
};

export const isCompareInfoLoading = (
  versions: VersionsState,
  addonId: number,
  baseVersionId: number,
  headVersionId: number,
  path?: string,
) => {
  const compareInfoKey = getCompareInfoKey({
    addonId,
    baseVersionId,
    headVersionId,
    path,
  });

  return versions.compareInfoIsLoading[compareInfoKey] || false;
};

export const fetchDiff = ({
  _getDiff = getDiff,
  addonId,
  baseVersionId,
  headVersionId,
  path,
}: FetchDiffParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { api: apiState, versions: versionsState } = getState();
    if (
      isCompareInfoLoading(
        versionsState,
        addonId,
        baseVersionId,
        headVersionId,
        path,
      )
    ) {
      log.debug('Aborting because the diff is already being fetched');
      return;
    }

    dispatch(
      actions.beginFetchDiff({ addonId, baseVersionId, headVersionId, path }),
    );
    // Set the current version to the newer one (the head vesion) so that
    // components can track its loading progress.
    dispatch(actions.setCurrentVersionId({ versionId: headVersionId }));

    const response = await _getDiff({
      addonId,
      apiState,
      baseVersionId,
      headVersionId,
      path,
    });

    if (isErrorResponse(response)) {
      dispatch(
        actions.abortFetchDiff({ addonId, baseVersionId, headVersionId, path }),
      );
      // Since the diff response loads a version, we also need to simulate
      // aborting a version fetch.
      dispatch(actions.abortFetchVersion({ versionId: headVersionId }));
      dispatch(errorsActions.addError({ error: response.error }));
    } else {
      if (!getVersionInfo(versionsState, response.id)) {
        dispatch(
          actions.loadVersionInfo({
            version: response,
          }),
        );
      }
      if (
        !getEntryStatusMap({
          versions: versionsState,
          versionId: response.id,
          comparedToVersionId: baseVersionId,
        })
      ) {
        dispatch(
          actions.loadEntryStatusMap({
            version: response,
            comparedToVersionId: baseVersionId,
          }),
        );
      }
      dispatch(
        actions.loadDiff({
          addonId,
          baseVersionId,
          headVersionId,
          path,
          version: response,
        }),
      );
    }
  };
};

type ViewVersionFileParams = {
  preserveHash?: boolean;
  selectedPath: string;
  scrollTo?: ScrollTarget;
  versionId: number;
};

export const viewVersionFile = ({
  preserveHash = false,
  selectedPath,
  scrollTo,
  versionId,
}: ViewVersionFileParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { router } = getState();

    const newLocation = {
      ...router.location,
      search: createAdjustedQueryString(router.location, {
        path: selectedPath,
        scrollTo,
      }),
    };

    // We do not want to preserve the hash when we select a new file for
    // instance, but we want to keep it when we load a file via its path.
    if (!preserveHash) {
      delete newLocation.hash;
    }

    dispatch(actions.updateSelectedPath({ versionId, selectedPath }));
    dispatch(push(newLocation));
  };
};

type GoToRelativeDiffParams = {
  _getRelativeDiff?: typeof getRelativeDiff;
  _viewVersionFile?: typeof viewVersionFile;
  currentAnchor: string | undefined;
  diff: DiffInfo | null;
  pathList: string[];
  position: RelativePathPosition;
  versionId: number;
  comparedToVersionId: number | null;
};

export const goToRelativeDiff = ({
  /* istanbul ignore next */
  _getRelativeDiff = getRelativeDiff,
  /* istanbul ignore next */
  _viewVersionFile = viewVersionFile,
  comparedToVersionId,
  currentAnchor,
  diff,
  pathList,
  position,
  versionId,
}: GoToRelativeDiffParams): ThunkActionCreator => {
  return async (dispatch, getState) => {
    const { router, versions: versionsState } = getState();
    const version = getVersionInfo(versionsState, versionId);
    const entryStatusMap = getEntryStatusMap({
      comparedToVersionId,
      versions: versionsState,
      versionId,
    });

    if (!version) {
      throw new Error('Cannot go to relative diff without a version loaded.');
    }
    if (!entryStatusMap) {
      throw new Error(
        `Cannot go to relative diff without an entryStatusMap for versionId=${version.id} comparedToVersionId=${comparedToVersionId}`,
      );
    }

    const nextDiffInfo = _getRelativeDiff({
      currentAnchor,
      diff,
      entryStatusMap,
      pathList,
      position,
      version,
    });

    if (nextDiffInfo.anchor) {
      const newLocation = {
        ...router.location,
        hash: `#${nextDiffInfo.anchor}`,
      };

      dispatch(push(newLocation));
    } else if (nextDiffInfo.path) {
      dispatch(
        _viewVersionFile({
          preserveHash: false,
          selectedPath: nextDiffInfo.path,
          scrollTo:
            position === RelativePathPosition.next
              ? ScrollTarget.firstDiff
              : ScrollTarget.lastDiff,
          versionId,
        }),
      );
    }
  };
};

const reducer: Reducer<VersionsState, ActionType<typeof actions>> = (
  state = initialState,
  action,
): VersionsState => {
  switch (action.type) {
    case getType(actions.beginFetchVersion): {
      const { versionId } = action.payload;

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: undefined,
        },
      };
    }
    case getType(actions.loadVersionInfo): {
      const { version } = action.payload;

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [version.id]: createInternalVersion(version),
        },
      };
    }
    case getType(actions.abortFetchVersion): {
      const { versionId } = action.payload;

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: null,
        },
      };
    }
    case getType(actions.loadEntryStatusMap): {
      const { version, comparedToVersionId } = action.payload;
      const key = getEntryStatusMapKey({
        versionId: version.id,
        comparedToVersionId,
      });

      return {
        ...state,
        entryStatusMaps: {
          ...state.entryStatusMaps,
          [key]: createEntryStatusMap(version),
        },
      };
    }
    case getType(actions.loadVersionFile): {
      const { path, version } = action.payload;

      return {
        ...state,
        versionFiles: {
          ...state.versionFiles,
          [version.id]: {
            ...state.versionFiles[version.id],
            [path]: createInternalVersionFile(version.file),
          },
        },
        versionFilesLoading: {
          ...state.versionFilesLoading,
          [version.id]: {
            ...state.versionFilesLoading[version.id],
            [path]: false,
          },
        },
      };
    }
    case getType(actions.beginFetchVersionFile): {
      const { path, versionId } = action.payload;

      return {
        ...state,
        versionFilesLoading: {
          ...state.versionFilesLoading,
          [versionId]: {
            ...state.versionFilesLoading[versionId],
            [path]: true,
          },
        },
      };
    }
    case getType(actions.abortFetchVersionFile): {
      const { path, versionId } = action.payload;

      return {
        ...state,
        versionFiles: {
          ...state.versionFiles,
          [versionId]: {
            ...state.versionFiles[versionId],
            [path]: null,
          },
        },
        versionFilesLoading: {
          ...state.versionFilesLoading,
          [versionId]: {
            ...state.versionFilesLoading[versionId],
            [path]: false,
          },
        },
      };
    }
    case getType(actions.updateSelectedPath): {
      const { selectedPath, versionId } = action.payload;

      const version = state.versionInfo[versionId];

      if (!version) {
        throw new Error(`Version missing for versionId: ${versionId}`);
      }

      const { expandedPaths } = version;

      const parents = getParentFolders(selectedPath);

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: {
            ...version,
            selectedPath,
            expandedPaths: [
              ...expandedPaths,
              ...parents.filter((newPath) => !expandedPaths.includes(newPath)),
            ],
          },
        },
      };
    }
    case getType(actions.setVisibleSelectedPath): {
      const { path, versionId } = action.payload;

      const version = state.versionInfo[versionId];

      if (!version) {
        throw new Error(`Version missing for versionId: ${versionId}`);
      }

      if (path && !version.entries.find((e) => e.path === path)) {
        throw new Error(
          `Path "${path}" is an unknown path for version ID ${versionId}`,
        );
      }

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: {
            ...version,
            visibleSelectedPath: path,
          },
        },
      };
    }
    case getType(actions.toggleExpandedPath): {
      const { path, versionId } = action.payload;

      const version = state.versionInfo[versionId];

      if (!version) {
        throw new Error(`Version missing for versionId: ${versionId}`);
      }

      const { expandedPaths } = version;

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: {
            ...version,
            expandedPaths: expandedPaths.includes(path)
              ? expandedPaths.filter((storedPath) => path !== storedPath)
              : [...expandedPaths, path],
          },
        },
      };
    }
    case getType(actions.expandTree): {
      const { versionId } = action.payload;

      const version = state.versionInfo[versionId];

      if (!version) {
        throw new Error(`Version missing for versionId: ${versionId}`);
      }

      const expandedPaths = version.entries
        .filter((entry) => entry.type === 'directory')
        .map((entry) => entry.path);
      expandedPaths.push(ROOT_PATH);

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: {
            ...version,
            expandedPaths,
          },
        },
      };
    }
    case getType(actions.collapseTree): {
      const { versionId } = action.payload;

      const version = state.versionInfo[versionId];

      if (!version) {
        throw new Error(`Version missing for versionId: ${versionId}`);
      }

      return {
        ...state,
        versionInfo: {
          ...state.versionInfo,
          [versionId]: {
            ...version,
            expandedPaths: [ROOT_PATH],
          },
        },
      };
    }
    case getType(actions.loadVersionsList): {
      const { addonId, versions } = action.payload;

      return {
        ...state,
        byAddonId: {
          ...state.byAddonId,
          [addonId]: createVersionsMap(versions),
        },
      };
    }
    case getType(actions.beginFetchDiff): {
      const key = getCompareInfoKey(action.payload);

      return {
        ...state,
        compareInfo: {
          ...state.compareInfo,
          [key]: undefined,
        },
        compareInfoIsLoading: {
          ...state.compareInfoIsLoading,
          [key]: true,
        },
      };
    }
    case getType(actions.abortFetchDiff): {
      const key = getCompareInfoKey(action.payload);

      return {
        ...state,
        compareInfo: {
          ...state.compareInfo,
          [key]: null,
        },
        compareInfoIsLoading: {
          ...state.compareInfoIsLoading,
          [key]: false,
        },
      };
    }
    case getType(actions.loadDiff): {
      const {
        addonId,
        baseVersionId,
        headVersionId,
        path,
        version,
      } = action.payload;

      const compareInfoKey = getCompareInfoKey({
        addonId,
        baseVersionId,
        headVersionId,
        path,
      });

      const headVersion = getVersionInfo(state, headVersionId);
      if (!headVersion) {
        throw new Error(`Version missing for headVersionId: ${headVersionId}`);
      }

      const { entries, selectedPath } = headVersion;
      const entry = entries.find((e) => e.path === selectedPath);

      if (!entry) {
        throw new Error(`Entry missing for headVersionId: ${headVersionId}`);
      }

      return {
        ...state,
        compareInfo: {
          ...state.compareInfo,
          [compareInfoKey]: createInternalCompareInfo({
            baseVersionId,
            headVersionId,
            entry,
            version,
          }),
        },
        compareInfoIsLoading: {
          ...state.compareInfoIsLoading,
          [compareInfoKey]: false,
        },
      };
    }
    case getType(actions.setCurrentVersionId): {
      const { versionId } = action.payload;
      return {
        ...state,
        currentVersionId: versionId,
      };
    }
    case getType(actions.unsetCurrentVersionId): {
      return {
        ...state,
        currentVersionId: false,
      };
    }
    default:
      return state;
  }
};

export default reducer;
