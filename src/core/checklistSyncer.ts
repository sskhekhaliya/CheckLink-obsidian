import { App, TFile, Notice, normalizePath } from 'obsidian';
import { CheckLinkSettings } from '../types';
import { WikilinkMatcher } from './wikilinkMatcher';

export class ChecklistSyncer {
  private app: App;
  private settings: CheckLinkSettings;
  private matcher: WikilinkMatcher;

  // Cache to track each file's last known completion state to avoid redundant syncs
  private completionStateCache: Map<string, boolean> = new Map();

  // Cache of file lines to detect user task checkbox toggles via vault modify events
  private fileLinesCache: Map<string, string[]> = new Map();

  // Temporary set to ignore modify events triggered by CheckLink itself
  private programmaticModifications: Set<string> = new Set();

  constructor(app: App, settings: CheckLinkSettings) {
    this.app = app;
    this.settings = settings;
    this.matcher = new WikilinkMatcher(app);
  }

  public updateSettings(settings: CheckLinkSettings): void {
    this.settings = settings;
    this.completionStateCache.clear();
  }

  /**
   * Helper to get list of active completion properties
   */
  public getCompletionProperties(): string[] {
    if (this.settings.completionProperties && this.settings.completionProperties.length > 0) {
      return this.settings.completionProperties;
    }
    if (this.settings.completionProperty) {
      return [this.settings.completionProperty];
    }
    return ['completed_date', 'completed_at', 'published_date'];
  }

  /**
   * Cache file lines in memory
   */
  public cacheFileLines(filePath: string, lines: string[]): void {
    this.fileLinesCache.set(filePath, lines);
  }

  /**
   * Initializes the in-memory cache of file completion states
   */
  public initializeCache(): void {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isExcluded(file.path)) continue;
      this.completionStateCache.set(file.path, this.isFileCompleted(file));
    }
  }

  /**
   * Checks whether a path is in an excluded directory
   */
  public isExcluded(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return this.settings.excludedFolders.some(excluded => {
      const normExcluded = normalizePath(excluded).toLowerCase();
      return (
        normalized.toLowerCase().startsWith(normExcluded + '/') ||
        normalized.toLowerCase() === normExcluded
      );
    });
  }

  /**
   * Determines if a file is considered "completed" based on any of the configured properties
   */
  public isFileCompleted(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return false;

    const properties = this.getCompletionProperties();

    for (const prop of properties) {
      const val = frontmatter[prop];
      if (val === undefined || val === null) continue;

      if (this.settings.propertyMatchMode === 'truthy') {
        if (typeof val === 'boolean' && val === true) return true;
        if (typeof val === 'string') {
          const lower = val.trim().toLowerCase();
          if (lower !== 'false' && lower !== '0' && lower !== 'no' && lower !== '') {
            return true;
          }
        } else if (Boolean(val)) {
          return true;
        }
      } else if (this.settings.propertyMatchMode === 'value') {
        if (String(val).trim().toLowerCase() === this.settings.expectedValue.trim().toLowerCase()) {
          return true;
        }
      } else {
        // Default: 'exists'
        if (typeof val === 'string') {
          if (val.trim().length > 0) return true;
        } else if (typeof val === 'boolean') {
          if (val === true) return true;
        } else {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Returns formatted date string based on settings
   */
  public getFormattedDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    if (this.settings.dateFormat === 'ISO') {
      return now.toISOString();
    }

    if (this.settings.dateFormat === 'YYYY-MM-DD HH:mm:ss') {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // Default: YYYY-MM-DD
    return `${year}-${month}-${day}`;
  }

  /**
   * Finds all markdown file paths that contain a wikilink resolving to targetFilePath
   */
  public getReferringPaths(targetFilePath: string): string[] {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const referringPaths: string[] = [];

    for (const sourcePath in resolvedLinks) {
      if (this.isExcluded(sourcePath)) continue;
      const linksFromSource = resolvedLinks[sourcePath];
      if (linksFromSource && linksFromSource[targetFilePath]) {
        referringPaths.push(sourcePath);
      }
    }

    return referringPaths;
  }

  /**
   * Handles metadata change event for a file:
   * Only triggers sync if the file's completion state actually changed!
   */
  public async handleMetadataChange(file: TFile): Promise<void> {
    if (this.isExcluded(file.path)) return;

    const newCompleted = this.isFileCompleted(file);
    const prevCompleted = this.completionStateCache.get(file.path);

    // If state hasn't changed, do nothing! (Instant exit, zero overhead)
    if (prevCompleted !== undefined && prevCompleted === newCompleted) {
      return;
    }

    // State changed: update cache and sync referring files
    this.completionStateCache.set(file.path, newCompleted);
    const updatedCount = await this.syncReferringFilesFor(file, newCompleted);

    if (updatedCount > 0 && this.settings.showNotices) {
      new Notice(`CheckLink: Updated ${updatedCount} task(s) for "${file.basename}".`);
    }
  }

  /**
   * Syncs all checklists in notes that link to targetFile
   */
  public async syncReferringFilesFor(targetFile: TFile, shouldBeChecked: boolean): Promise<number> {
    const referringPaths = this.getReferringPaths(targetFile.path);
    if (referringPaths.length === 0) return 0;

    let totalUpdated = 0;

    for (const sourcePath of referringPaths) {
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(sourceFile instanceof TFile) || sourceFile.extension !== 'md') continue;

      try {
        const content = await this.app.vault.read(sourceFile);
        const lines = content.split('\n');
        let fileModified = false;

        for (let i = 0; i < lines.length; i++) {
          const { isMatch } = this.matcher.isTaskLinkingToFile(
            lines[i],
            sourcePath,
            targetFile,
            this.settings.matchMode
          );

          if (isMatch) {
            const { newLine, changed } = this.matcher.setTaskChecked(lines[i], shouldBeChecked);
            if (changed) {
              lines[i] = newLine;
              fileModified = true;
              totalUpdated++;
            }
          }
        }

        if (fileModified) {
          this.programmaticModifications.add(sourcePath);
          this.fileLinesCache.set(sourcePath, lines);
          await this.app.vault.modify(sourceFile, lines.join('\n'));
          // Release lock shortly after
          setTimeout(() => {
            this.programmaticModifications.delete(sourcePath);
          }, 600);
        }
      } catch (err) {
        console.error(`CheckLink: Failed to update referring file "${sourcePath}"`, err);
      }
    }

    return totalUpdated;
  }

  /**
   * Handle user checking/unchecking a checkbox directly in an overview note (Bidirectional Sync)
   */
  public async handleChecklistUserToggle(
    sourceFile: TFile,
    lineText: string,
    nowChecked: boolean
  ): Promise<void> {
    if (!this.settings.bidirectional) return;
    if (this.programmaticModifications.has(sourceFile.path)) return;
    if (this.isExcluded(sourceFile.path)) return;

    // Find all wikilinks in this task line
    const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = wikilinkRegex.exec(lineText)) !== null) {
      const linkpath = match[1].trim();
      const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourceFile.path);

      if (targetFile instanceof TFile && targetFile.extension === 'md') {
        await this.updateFileFrontmatterCompletion(targetFile, nowChecked);
      }
    }
  }

  /**
   * Detects checkbox toggles via vault modify events
   */
  public async handleFileModified(file: TFile): Promise<void> {
    if (!this.settings.bidirectional) return;
    if (this.programmaticModifications.has(file.path)) return;
    if (this.isExcluded(file.path)) return;

    const oldLines = this.fileLinesCache.get(file.path);
    let newContent: string;
    try {
      newContent = await this.app.vault.read(file);
    } catch {
      return;
    }
    const newLines = newContent.split('\n');
    this.fileLinesCache.set(file.path, newLines);

    if (!oldLines) return; // First time cached, wait for next modification

    const maxLines = Math.min(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      if (oldLine === newLine) continue;

      // Check if task state changed
      const oldMatch = oldLine.match(/^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/);
      const newMatch = newLine.match(/^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/);

      if (oldMatch && newMatch) {
        const oldChecked = oldMatch[2].toLowerCase() === 'x';
        const newChecked = newMatch[2].toLowerCase() === 'x';

        if (oldChecked !== newChecked) {
          await this.handleChecklistUserToggle(file, newLine, newChecked);
        }
      }
    }
  }

  /**
   * Updates target file's frontmatter completion property
   */
  public async updateFileFrontmatterCompletion(targetFile: TFile, completed: boolean): Promise<void> {
    try {
      const properties = this.getCompletionProperties();
      this.programmaticModifications.add(targetFile.path);

      await this.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
        if (completed) {
          // 1. If target file already has one of the configured properties, update that one
          let propToSet = properties[0] || 'completed_date';
          for (const prop of properties) {
            if (prop in frontmatter) {
              propToSet = prop;
              break;
            }
          }

          if (this.settings.propertyMatchMode === 'value') {
            frontmatter[propToSet] = this.settings.expectedValue;
          } else if (this.settings.propertyMatchMode === 'truthy') {
            frontmatter[propToSet] = true;
          } else {
            // Default: 'exists' (date format)
            frontmatter[propToSet] = this.getFormattedDate();
          }
        } else {
          // Unchecking: Clear the value of configured completion properties instead of deleting them
          let cleared = false;
          for (const prop of properties) {
            if (prop in frontmatter) {
              if (typeof frontmatter[prop] === 'boolean') {
                frontmatter[prop] = false;
              } else {
                frontmatter[prop] = null;
              }
              cleared = true;
            }
          }
          if (!cleared && properties.length > 0) {
            const propToClear = properties[0] || 'completed_date';
            frontmatter[propToClear] = null;
          }
        }
      });

      // Update completion cache immediately to prevent echo
      this.completionStateCache.set(targetFile.path, completed);

      if (this.settings.showNotices) {
        new Notice(
          `CheckLink: ${completed ? 'Completed' : 'Unchecked'} "${targetFile.basename}".`
        );
      }

      setTimeout(() => {
        this.programmaticModifications.delete(targetFile.path);
      }, 600);
    } catch (err) {
      console.error(`CheckLink: Failed to update frontmatter for "${targetFile.path}"`, err);
      this.programmaticModifications.delete(targetFile.path);
    }
  }

  /**
   * Scans the whole vault and synchronizes all task checkboxes with note properties
   */
  public async syncAllVault(): Promise<{ scannedNotes: number; updatedTasks: number }> {
    const files = this.app.vault.getMarkdownFiles();
    let updatedTasks = 0;
    let scannedNotes = 0;

    for (const file of files) {
      if (this.isExcluded(file.path)) continue;
      scannedNotes++;

      const isCompleted = this.isFileCompleted(file);
      this.completionStateCache.set(file.path, isCompleted);
      const count = await this.syncReferringFilesFor(file, isCompleted);
      updatedTasks += count;
    }

    return { scannedNotes, updatedTasks };
  }
}
