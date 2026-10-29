import { App, TFile } from 'obsidian';
import { ChecklistMatchMode } from '../types';

// Regex to capture markdown task checkbox line:
// Group 1: Leading indentation + bullet + "[": e.g. "  - ["
// Group 2: Checkbox state char: e.g. " ", "x", "X"
// Group 3: Closing bracket + space: e.g. "] "
// Group 4: Task body: e.g. "[[Chapter 1]] read today"
export const TASK_REGEX = /^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/;

// Regex to find all [[wikilink]] references in a line:
// Group 1: linkpath (without heading/alias)
// Group 2: optional heading/block anchor
// Group 3: optional alias
export const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

export class WikilinkMatcher {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Checks if a line is a task and links to targetFile according to matchMode
   */
  public isTaskLinkingToFile(
    line: string,
    sourcePath: string,
    targetFile: TFile,
    matchMode: ChecklistMatchMode
  ): { isMatch: boolean; isChecked: boolean } {
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) {
      return { isMatch: false, isChecked: false };
    }

    const checkChar = taskMatch[2];
    const isChecked = checkChar.toLowerCase() === 'x';
    const taskBody = taskMatch[4].trim();

    if (matchMode === 'strict') {
      // Must be strictly [[link]] or [[link|alias]] with nothing else
      const strictMatch = taskBody.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
      if (!strictMatch) {
        return { isMatch: false, isChecked };
      }

      const linkpath = strictMatch[1].trim();
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      const isMatch = resolved !== null && resolved.path === targetFile.path;
      return { isMatch, isChecked };
    }

    // "contains" mode: check all wikilinks in the task body
    WIKILINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_REGEX.exec(taskBody)) !== null) {
      const linkpath = match[1].trim();
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      if (resolved && resolved.path === targetFile.path) {
        return { isMatch: true, isChecked };
      }
    }

    return { isMatch: false, isChecked };
  }

  /**
   * Toggles or sets the check state of a task line.
   * Preserves indentation, bullet type (- * +), and following content.
   */
  public setTaskChecked(line: string, shouldBeChecked: boolean): { newLine: string; changed: boolean } {
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) {
      return { newLine: line, changed: false };
    }

    const prefix = taskMatch[1]; // e.g. "  - ["
    const currentChar = taskMatch[2];
    const suffix = taskMatch[3] + taskMatch[4]; // e.g. "] [[Chapter 1]]"

    const currentlyChecked = currentChar.toLowerCase() === 'x';
    if (currentlyChecked === shouldBeChecked) {
      return { newLine: line, changed: false };
    }

    const newChar = shouldBeChecked ? 'x' : ' ';
    return {
      newLine: `${prefix}${newChar}${suffix}`,
      changed: true
    };
  }
}

