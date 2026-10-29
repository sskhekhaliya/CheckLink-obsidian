"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CheckLinkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  completionProperties: ["completed_date", "completed_at", "published_date"],
  propertyMatchMode: "exists",
  expectedValue: "done",
  matchMode: "contains",
  bidirectional: true,
  dateFormat: "YYYY-MM-DD",
  excludedFolders: [".trash", ".obsidian", "templates"],
  showNotices: false
};

// src/core/checklistSyncer.ts
var import_obsidian = require("obsidian");

// src/core/wikilinkMatcher.ts
var TASK_REGEX = /^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/;
var WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
var WikilinkMatcher = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * Checks if a line is a task and links to targetFile according to matchMode
   */
  isTaskLinkingToFile(line, sourcePath, targetFile, matchMode) {
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) {
      return { isMatch: false, isChecked: false };
    }
    const checkChar = taskMatch[2];
    const isChecked = checkChar.toLowerCase() === "x";
    const taskBody = taskMatch[4].trim();
    if (matchMode === "strict") {
      const strictMatch = taskBody.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
      if (!strictMatch) {
        return { isMatch: false, isChecked };
      }
      const linkpath = strictMatch[1].trim();
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      const isMatch = resolved !== null && resolved.path === targetFile.path;
      return { isMatch, isChecked };
    }
    WIKILINK_REGEX.lastIndex = 0;
    let match;
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
  setTaskChecked(line, shouldBeChecked) {
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) {
      return { newLine: line, changed: false };
    }
    const prefix = taskMatch[1];
    const currentChar = taskMatch[2];
    const suffix = taskMatch[3] + taskMatch[4];
    const currentlyChecked = currentChar.toLowerCase() === "x";
    if (currentlyChecked === shouldBeChecked) {
      return { newLine: line, changed: false };
    }
    const newChar = shouldBeChecked ? "x" : " ";
    return {
      newLine: `${prefix}${newChar}${suffix}`,
      changed: true
    };
  }
};

// src/core/checklistSyncer.ts
var ChecklistSyncer = class {
  constructor(app, settings) {
    // Cache to track each file's last known completion state to avoid redundant syncs
    this.completionStateCache = /* @__PURE__ */ new Map();
    // Cache of file lines to detect user task checkbox toggles via vault modify events
    this.fileLinesCache = /* @__PURE__ */ new Map();
    // Temporary set to ignore modify events triggered by CheckLink itself
    this.programmaticModifications = /* @__PURE__ */ new Set();
    this.app = app;
    this.settings = settings;
    this.matcher = new WikilinkMatcher(app);
  }
  updateSettings(settings) {
    this.settings = settings;
    this.completionStateCache.clear();
  }
  /**
   * Helper to get list of active completion properties
   */
  getCompletionProperties() {
    if (this.settings.completionProperties && this.settings.completionProperties.length > 0) {
      return this.settings.completionProperties;
    }
    if (this.settings.completionProperty) {
      return [this.settings.completionProperty];
    }
    return ["completed_date", "completed_at", "published_date"];
  }
  /**
   * Cache file lines in memory
   */
  cacheFileLines(filePath, lines) {
    this.fileLinesCache.set(filePath, lines);
  }
  /**
   * Initializes the in-memory cache of file completion states
   */
  initializeCache() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isExcluded(file.path)) continue;
      this.completionStateCache.set(file.path, this.isFileCompleted(file));
    }
  }
  /**
   * Checks whether a path is in an excluded directory
   */
  isExcluded(filePath) {
    const normalized = (0, import_obsidian.normalizePath)(filePath);
    return this.settings.excludedFolders.some((excluded) => {
      const normExcluded = (0, import_obsidian.normalizePath)(excluded).toLowerCase();
      return normalized.toLowerCase().startsWith(normExcluded + "/") || normalized.toLowerCase() === normExcluded;
    });
  }
  /**
   * Determines if a file is considered "completed" based on any of the configured properties
   */
  isFileCompleted(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return false;
    const properties = this.getCompletionProperties();
    for (const prop of properties) {
      const val = frontmatter[prop];
      if (val === void 0 || val === null) continue;
      if (this.settings.propertyMatchMode === "truthy") {
        if (typeof val === "boolean" && val === true) return true;
        if (typeof val === "string") {
          const lower = val.trim().toLowerCase();
          if (lower !== "false" && lower !== "0" && lower !== "no" && lower !== "") {
            return true;
          }
        } else if (Boolean(val)) {
          return true;
        }
      } else if (this.settings.propertyMatchMode === "value") {
        if (String(val).trim().toLowerCase() === this.settings.expectedValue.trim().toLowerCase()) {
          return true;
        }
      } else {
        if (typeof val === "string") {
          if (val.trim().length > 0) return true;
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
  getFormattedDate() {
    const now = /* @__PURE__ */ new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    if (this.settings.dateFormat === "ISO") {
      return now.toISOString();
    }
    if (this.settings.dateFormat === "YYYY-MM-DD HH:mm:ss") {
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    return `${year}-${month}-${day}`;
  }
  /**
   * Finds all markdown file paths that contain a wikilink resolving to targetFilePath
   */
  getReferringPaths(targetFilePath) {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const referringPaths = [];
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
  async handleMetadataChange(file) {
    if (this.isExcluded(file.path)) return;
    const newCompleted = this.isFileCompleted(file);
    const prevCompleted = this.completionStateCache.get(file.path);
    if (prevCompleted !== void 0 && prevCompleted === newCompleted) {
      return;
    }
    this.completionStateCache.set(file.path, newCompleted);
    const updatedCount = await this.syncReferringFilesFor(file, newCompleted);
    if (updatedCount > 0 && this.settings.showNotices) {
      new import_obsidian.Notice(`CheckLink: Updated ${updatedCount} task(s) for "${file.basename}".`);
    }
  }
  /**
   * Syncs all checklists in notes that link to targetFile
   */
  async syncReferringFilesFor(targetFile, shouldBeChecked) {
    const referringPaths = this.getReferringPaths(targetFile.path);
    if (referringPaths.length === 0) return 0;
    let totalUpdated = 0;
    for (const sourcePath of referringPaths) {
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(sourceFile instanceof import_obsidian.TFile) || sourceFile.extension !== "md") continue;
      try {
        const content = await this.app.vault.read(sourceFile);
        const lines = content.split("\n");
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
          await this.app.vault.modify(sourceFile, lines.join("\n"));
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
  async handleChecklistUserToggle(sourceFile, lineText, nowChecked) {
    if (!this.settings.bidirectional) return;
    if (this.programmaticModifications.has(sourceFile.path)) return;
    if (this.isExcluded(sourceFile.path)) return;
    const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
    let match;
    while ((match = wikilinkRegex.exec(lineText)) !== null) {
      const linkpath = match[1].trim();
      const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourceFile.path);
      if (targetFile instanceof import_obsidian.TFile && targetFile.extension === "md") {
        await this.updateFileFrontmatterCompletion(targetFile, nowChecked);
      }
    }
  }
  /**
   * Detects checkbox toggles via vault modify events
   */
  async handleFileModified(file) {
    if (!this.settings.bidirectional) return;
    if (this.programmaticModifications.has(file.path)) return;
    if (this.isExcluded(file.path)) return;
    const oldLines = this.fileLinesCache.get(file.path);
    let newContent;
    try {
      newContent = await this.app.vault.read(file);
    } catch {
      return;
    }
    const newLines = newContent.split("\n");
    this.fileLinesCache.set(file.path, newLines);
    if (!oldLines) return;
    const maxLines = Math.min(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      if (oldLine === newLine) continue;
      const oldMatch = oldLine.match(/^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/);
      const newMatch = newLine.match(/^([ \t]*[-*+]\s+\[)(.)(\]\s+)(.*)$/);
      if (oldMatch && newMatch) {
        const oldChecked = oldMatch[2].toLowerCase() === "x";
        const newChecked = newMatch[2].toLowerCase() === "x";
        if (oldChecked !== newChecked) {
          await this.handleChecklistUserToggle(file, newLine, newChecked);
        }
      }
    }
  }
  /**
   * Updates target file's frontmatter completion property
   */
  async updateFileFrontmatterCompletion(targetFile, completed) {
    try {
      const properties = this.getCompletionProperties();
      this.programmaticModifications.add(targetFile.path);
      await this.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
        if (completed) {
          let propToSet = properties[0] || "completed_date";
          for (const prop of properties) {
            if (prop in frontmatter) {
              propToSet = prop;
              break;
            }
          }
          if (this.settings.propertyMatchMode === "value") {
            frontmatter[propToSet] = this.settings.expectedValue;
          } else if (this.settings.propertyMatchMode === "truthy") {
            frontmatter[propToSet] = true;
          } else {
            frontmatter[propToSet] = this.getFormattedDate();
          }
        } else {
          for (const prop of properties) {
            delete frontmatter[prop];
          }
        }
      });
      this.completionStateCache.set(targetFile.path, completed);
      if (this.settings.showNotices) {
        new import_obsidian.Notice(
          `CheckLink: ${completed ? "Completed" : "Unchecked"} "${targetFile.basename}".`
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
  async syncAllVault() {
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
};

// src/settings/settingsTab.ts
var import_obsidian2 = require("obsidian");
var CheckLinkSettingsTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CheckLink Settings" });
    containerEl.createEl("p", {
      text: "Automatically synchronize markdown task checkboxes with note completion properties via wikilinks.",
      cls: "setting-item-description"
    });
    const currentProps = this.plugin.syncer.getCompletionProperties().join(", ");
    new import_obsidian2.Setting(containerEl).setName("Completion properties").setDesc(
      'Comma-separated frontmatter properties to inspect for completion (e.g. "completed_date, completed_at, published_date"). If any is set, the note is considered completed.'
    ).addText(
      (text) => text.setPlaceholder("completed_date, completed_at, published_date").setValue(currentProps).onChange(async (value) => {
        const props = value.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
        this.plugin.settings.completionProperties = props.length > 0 ? props : ["completed_date"];
        await this.plugin.saveSettings();
      })
    );
    let expectedValueSetting = null;
    new import_obsidian2.Setting(containerEl).setName("Completion criteria").setDesc("How CheckLink determines whether the note property marks it as completed.").addDropdown(
      (dropdown) => dropdown.addOption("exists", "Property exists & not empty (e.g. date)").addOption("truthy", "Truthy / Boolean (e.g. true or non-false)").addOption("value", "Specific value match (e.g. status: done)").setValue(this.plugin.settings.propertyMatchMode).onChange(async (value) => {
        this.plugin.settings.propertyMatchMode = value;
        await this.plugin.saveSettings();
        if (expectedValueSetting) {
          expectedValueSetting.settingEl.toggle(this.plugin.settings.propertyMatchMode === "value");
        }
      })
    );
    expectedValueSetting = new import_obsidian2.Setting(containerEl).setName("Expected property value").setDesc("The value that marks the note as completed (case-insensitive).").addText(
      (text) => text.setPlaceholder("done").setValue(this.plugin.settings.expectedValue).onChange(async (value) => {
        this.plugin.settings.expectedValue = value.trim() || "done";
        await this.plugin.saveSettings();
      })
    );
    expectedValueSetting.settingEl.toggle(this.plugin.settings.propertyMatchMode === "value");
    new import_obsidian2.Setting(containerEl).setName("Checklist match mode").setDesc(
      "Whether to match tasks where the wikilink appears anywhere in the line, or only tasks consisting purely of the wikilink."
    ).addDropdown(
      (dropdown) => dropdown.addOption("contains", 'Contains wikilink (e.g. "- [ ] Review [[Chapter 1]] today")').addOption("strict", 'Strict match only (e.g. "- [ ] [[Chapter 1]]")').setValue(this.plugin.settings.matchMode).onChange(async (value) => {
        this.plugin.settings.matchMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Bidirectional sync (Two-way)").setDesc(
      "When you check/uncheck a task checkbox in any note, automatically write or remove the completion property in the linked note."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.bidirectional).onChange(async (value) => {
        this.plugin.settings.bidirectional = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Completion date format").setDesc("Format used when writing completion date back into frontmatter.").addDropdown(
      (dropdown) => dropdown.addOption("YYYY-MM-DD", "YYYY-MM-DD (e.g. 2026-10-29)").addOption("YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm:ss").addOption("ISO", "Full ISO Timestamp").setValue(this.plugin.settings.dateFormat).onChange(async (value) => {
        this.plugin.settings.dateFormat = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Excluded folders").setDesc("Comma-separated list of folders to exclude from sync (e.g. .trash, templates, archive).").addText(
      (text) => text.setPlaceholder(".trash, .obsidian, templates").setValue(this.plugin.settings.excludedFolders.join(", ")).onChange(async (value) => {
        this.plugin.settings.excludedFolders = value.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Show notifications").setDesc("Show notice notifications when tasks are updated.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showNotices).onChange(async (value) => {
        this.plugin.settings.showNotices = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Vault Operations" });
    new import_obsidian2.Setting(containerEl).setName("Synchronize entire vault").setDesc("Scan all notes and update all referring checklist wikilinks to match current note properties.").addButton(
      (btn) => btn.setButtonText("Sync Entire Vault Now").setCta().onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("Syncing...");
        const result = await this.plugin.syncer.syncAllVault();
        btn.setDisabled(false);
        btn.setButtonText("Sync Entire Vault Now");
        new import_obsidian2.Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
      })
    );
  }
};

// src/main.ts
var CheckLinkPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.syncer = new ChecklistSyncer(this.app, this.settings);
    this.addSettingTab(new CheckLinkSettingsTab(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      this.syncer.initializeCache();
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === "md") {
        const content = await this.app.vault.read(activeFile);
        this.syncer.cacheFileLines(activeFile.path, content.split("\n"));
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          try {
            const content = await this.app.vault.read(file);
            this.syncer.cacheFileLines(file.path, content.split("\n"));
          } catch {
          }
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          await this.syncer.handleFileModified(file);
        }
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", async (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          await this.syncer.handleMetadataChange(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", async (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          await this.syncer.handleMetadataChange(file);
        }
      })
    );
    this.registerDomEvent(document, "click", async (evt) => {
      if (!this.settings.bidirectional) return;
      const target = evt.target;
      if (!target) return;
      const checkbox = target.matches("input.task-list-item-checkbox") ? target : target.closest(".task-list-item-checkbox");
      if (!checkbox) return;
      setTimeout(async () => {
        try {
          const activeFile = this.app.workspace.getActiveFile();
          if (!activeFile || activeFile.extension !== "md") return;
          const isChecked = checkbox.checked;
          const li = checkbox.closest("li");
          if (li) {
            const links = li.querySelectorAll("a.internal-link");
            if (links.length > 0) {
              for (let i = 0; i < links.length; i++) {
                const href = links[i].getAttribute("data-href");
                if (href) {
                  const targetFile = this.app.metadataCache.getFirstLinkpathDest(href, activeFile.path);
                  if (targetFile instanceof import_obsidian3.TFile && targetFile.extension === "md") {
                    await this.syncer.updateFileFrontmatterCompletion(targetFile, isChecked);
                  }
                }
              }
              return;
            }
          }
          const cmLine = checkbox.closest(".cm-line");
          if (cmLine) {
            const text = cmLine.textContent || "";
            await this.syncer.handleChecklistUserToggle(activeFile, text, isChecked);
          }
        } catch (err) {
          console.debug("CheckLink: DOM click toggle handler error", err);
        }
      }, 80);
    });
    this.addCommand({
      id: "checklink-sync-vault",
      name: "Sync all checklists in vault with note properties",
      callback: async () => {
        new import_obsidian3.Notice("CheckLink: Synchronizing vault checklists...");
        const result = await this.syncer.syncAllVault();
        new import_obsidian3.Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
      }
    });
    this.addCommand({
      id: "checklink-sync-active",
      name: "Sync checklists for active note",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            const isCompleted = this.syncer.isFileCompleted(activeFile);
            this.syncer.syncReferringFilesFor(activeFile, isCompleted).then((count) => {
              new import_obsidian3.Notice(`CheckLink: Updated ${count} task(s) linking to "${activeFile.basename}".`);
            });
          }
          return true;
        }
        return false;
      }
    });
    this.addRibbonIcon("check-check", "CheckLink: Sync Vault Checklists", async () => {
      const result = await this.syncer.syncAllVault();
      new import_obsidian3.Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
    });
  }
  async onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.completionProperties || this.settings.completionProperties.length === 0) {
      if (this.settings.completionProperty) {
        this.settings.completionProperties = [this.settings.completionProperty];
      } else {
        this.settings.completionProperties = ["completed_date", "completed_at", "published_date"];
      }
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.syncer) {
      this.syncer.updateSettings(this.settings);
    }
  }
};
