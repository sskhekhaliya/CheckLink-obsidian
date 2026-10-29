import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { CheckLinkSettings, DEFAULT_SETTINGS } from './types';
import { ChecklistSyncer } from './core/checklistSyncer';
import { CheckLinkSettingsTab } from './settings/settingsTab';

export default class CheckLinkPlugin extends Plugin {
  public settings: CheckLinkSettings = DEFAULT_SETTINGS;
  public syncer!: ChecklistSyncer;

  public async onload(): Promise<void> {
    await this.loadSettings();

    this.syncer = new ChecklistSyncer(this.app, this.settings);

    // Settings Tab
    this.addSettingTab(new CheckLinkSettingsTab(this.app, this));

    // Wait until layout & metadata cache are fully loaded
    this.app.workspace.onLayoutReady(async () => {
      this.syncer.initializeCache();

      // Cache lines for active file on startup
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === 'md') {
        const content = await this.app.vault.read(activeFile);
        this.syncer.cacheFileLines(activeFile.path, content.split('\n'));
      }
    });

    // Cache file lines whenever a user opens a markdown file
    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          try {
            const content = await this.app.vault.read(file);
            this.syncer.cacheFileLines(file.path, content.split('\n'));
          } catch {
            // Ignore if file cannot be read
          }
        }
      })
    );

    // 1. Vault modify event: detect checkbox toggles directly from file edits (works in all views/shortcuts)
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.syncer.handleFileModified(file);
        }
      })
    );

    // 2. Core Event: Note frontmatter / metadata updated (Property -> Checklist sync)
    this.registerEvent(
      this.app.metadataCache.on('changed', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.syncer.handleMetadataChange(file);
        }
      })
    );

    // 3. Note renamed: re-sync referring files
    this.registerEvent(
      this.app.vault.on('rename', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.syncer.handleMetadataChange(file);
        }
      })
    );

    // 4. Interactive DOM Click: Instant response for mouse clicks in Reading View & Live Preview
    this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
      if (!this.settings.bidirectional) return;

      const target = evt.target as HTMLElement;
      if (!target) return;

      const checkbox = target.matches('input.task-list-item-checkbox')
        ? (target as HTMLInputElement)
        : (target.closest('.task-list-item-checkbox') as HTMLInputElement | null);

      if (!checkbox) return;

      // Small delay allows Obsidian's click event to apply checked state
      setTimeout(async () => {
        try {
          const activeFile = this.app.workspace.getActiveFile();
          if (!activeFile || activeFile.extension !== 'md') return;

          const isChecked = checkbox.checked;

          // A. Reading view: check parent <li>
          const li = checkbox.closest('li');
          if (li) {
            const links = li.querySelectorAll('a.internal-link');
            if (links.length > 0) {
              for (let i = 0; i < links.length; i++) {
                const href = links[i].getAttribute('data-href');
                if (href) {
                  const targetFile = this.app.metadataCache.getFirstLinkpathDest(href, activeFile.path);
                  if (targetFile instanceof TFile && targetFile.extension === 'md') {
                    await this.syncer.updateFileFrontmatterCompletion(targetFile, isChecked);
                  }
                }
              }
              return;
            }
          }

          // B. Live Preview / CodeMirror: check .cm-line
          const cmLine = checkbox.closest('.cm-line');
          if (cmLine) {
            const text = cmLine.textContent || '';
            await this.syncer.handleChecklistUserToggle(activeFile, text, isChecked);
          }
        } catch (err) {
          console.debug('CheckLink: DOM click toggle handler error', err);
        }
      }, 80);
    });

    // Commands
    this.addCommand({
      id: 'checklink-sync-vault',
      name: 'Sync all checklists in vault with note properties',
      callback: async () => {
        new Notice('CheckLink: Synchronizing vault checklists...');
        const result = await this.syncer.syncAllVault();
        new Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
      }
    });

    this.addCommand({
      id: 'checklink-sync-active',
      name: 'Sync checklists for active note',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
          if (!checking) {
            const isCompleted = this.syncer.isFileCompleted(activeFile);
            this.syncer.syncReferringFilesFor(activeFile, isCompleted).then((count) => {
              new Notice(`CheckLink: Updated ${count} task(s) linking to "${activeFile.basename}".`);
            });
          }
          return true;
        }
        return false;
      }
    });

    // Ribbon Icon for quick sync
    this.addRibbonIcon('check-check', 'CheckLink: Sync Vault Checklists', async () => {
      const result = await this.syncer.syncAllVault();
      new Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
    });
  }

  public async onunload(): Promise<void> {
    // Cleanup if needed
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Migration / normalization for multiple properties
    if (!this.settings.completionProperties || this.settings.completionProperties.length === 0) {
      if (this.settings.completionProperty) {
        this.settings.completionProperties = [this.settings.completionProperty];
      } else {
        this.settings.completionProperties = ['completed_date', 'completed_at', 'published_date'];
      }
    }
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.syncer) {
      this.syncer.updateSettings(this.settings);
    }
  }
}
