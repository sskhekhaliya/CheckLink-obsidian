export type PropertyMatchMode = 'exists' | 'truthy' | 'value';
export type ChecklistMatchMode = 'contains' | 'strict';
export type DateFormatOption = 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm:ss' | 'ISO';

export interface CheckLinkSettings {
  // List of frontmatter properties to watch (e.g. ["completed_date", "completed_at", "published_date"])
  completionProperties: string[];

  // Legacy single property for backward compatibility
  completionProperty?: string;

  // How to determine completion:
  // - exists: property is defined, not null, and not empty string
  // - truthy: boolean true, or non-false value
  // - value: exact match with expectedValue
  propertyMatchMode: PropertyMatchMode;
  expectedValue: string;

  // How to match checklist lines:
  // - contains: checklist line contains the wikilink anywhere (e.g. "- [ ] Review [[Chapter 1]] before Friday")
  // - strict: wikilink is the sole content of the task (e.g. "- [ ] [[Chapter 1]]" or "- [ ] [[Chapter 1|Alias]]")
  matchMode: ChecklistMatchMode;

  // Clicking/checking a checkbox in any note writes/removes the completionProperty in the linked note
  bidirectional: boolean;
  dateFormat: DateFormatOption;

  // Folders to exclude from being scanned/updated
  excludedFolders: string[];

  // Show subtle notices when sync updates occur
  showNotices: boolean;
}

export const DEFAULT_SETTINGS: CheckLinkSettings = {
  completionProperties: ['completed_date', 'completed_at', 'published_date'],
  propertyMatchMode: 'exists',
  expectedValue: 'done',
  matchMode: 'contains',
  bidirectional: true,
  dateFormat: 'YYYY-MM-DD',
  excludedFolders: ['.trash', '.obsidian', 'templates'],
  showNotices: false
};
