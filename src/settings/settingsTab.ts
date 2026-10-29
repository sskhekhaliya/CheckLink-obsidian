import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import CheckLinkPlugin from '../main';
import { PropertyMatchMode, ChecklistMatchMode, DateFormatOption } from '../types';

export class CheckLinkSettingsTab extends PluginSettingTab {
  private plugin: CheckLinkPlugin;

  constructor(app: App, plugin: CheckLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'CheckLink Settings' });
    containerEl.createEl('p', {
      text: 'Automatically synchronize markdown task checkboxes with note completion properties via wikilinks.',
      cls: 'setting-item-description'
    });

    // 1. Multiple Completion Properties
    const currentProps = this.plugin.syncer.getCompletionProperties().join(', ');

    new Setting(containerEl)
      .setName('Completion properties')
      .setDesc(
        'Comma-separated frontmatter properties to inspect for completion (e.g. "completed_date, completed_at, published_date"). If any is set, the note is considered completed.'
      )
      .addText((text) =>
        text
          .setPlaceholder('completed_date, completed_at, published_date')
          .setValue(currentProps)
          .onChange(async (value) => {
            const props = value
              .split(',')
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            this.plugin.settings.completionProperties = props.length > 0 ? props : ['completed_date'];
            await this.plugin.saveSettings();
          })
      );

    // 2. Property Evaluation Mode
    let expectedValueSetting: Setting | null = null;

    new Setting(containerEl)
      .setName('Completion criteria')
      .setDesc('How CheckLink determines whether the note property marks it as completed.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('exists', 'Property exists & not empty (e.g. date)')
          .addOption('truthy', 'Truthy / Boolean (e.g. true or non-false)')
          .addOption('value', 'Specific value match (e.g. status: done)')
          .setValue(this.plugin.settings.propertyMatchMode)
          .onChange(async (value) => {
            this.plugin.settings.propertyMatchMode = value as PropertyMatchMode;
            await this.plugin.saveSettings();
            if (expectedValueSetting) {
              expectedValueSetting.settingEl.toggle(this.plugin.settings.propertyMatchMode === 'value');
            }
          })
      );

    // 3. Expected Value (conditional)
    expectedValueSetting = new Setting(containerEl)
      .setName('Expected property value')
      .setDesc('The value that marks the note as completed (case-insensitive).')
      .addText((text) =>
        text
          .setPlaceholder('done')
          .setValue(this.plugin.settings.expectedValue)
          .onChange(async (value) => {
            this.plugin.settings.expectedValue = value.trim() || 'done';
            await this.plugin.saveSettings();
          })
      );
    expectedValueSetting.settingEl.toggle(this.plugin.settings.propertyMatchMode === 'value');

    // 4. Checklist Matching Mode
    new Setting(containerEl)
      .setName('Checklist match mode')
      .setDesc(
        'Whether to match tasks where the wikilink appears anywhere in the line, or only tasks consisting purely of the wikilink.'
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('contains', 'Contains wikilink (e.g. "- [ ] Review [[Chapter 1]] today")')
          .addOption('strict', 'Strict match only (e.g. "- [ ] [[Chapter 1]]")')
          .setValue(this.plugin.settings.matchMode)
          .onChange(async (value) => {
            this.plugin.settings.matchMode = value as ChecklistMatchMode;
            await this.plugin.saveSettings();
          })
      );

    // 5. Two-way / Bidirectional Sync
    new Setting(containerEl)
      .setName('Bidirectional sync (Two-way)')
      .setDesc(
        'When you check/uncheck a task checkbox in any note, automatically write or clear the completion property in the linked note.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.bidirectional)
          .onChange(async (value) => {
            this.plugin.settings.bidirectional = value;
            await this.plugin.saveSettings();
          })
      );

    // 6. Date Format for Bidirectional
    new Setting(containerEl)
      .setName('Completion date format')
      .setDesc('Format used when writing completion date back into frontmatter.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('YYYY-MM-DD', 'YYYY-MM-DD (e.g. 2026-10-29)')
          .addOption('YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm:ss')
          .addOption('ISO', 'Full ISO Timestamp')
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value as DateFormatOption;
            await this.plugin.saveSettings();
          })
      );

    // 7. Excluded Folders
    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Comma-separated list of folders to exclude from sync (e.g. .trash, templates, archive).')
      .addText((text) =>
        text
          .setPlaceholder('.trash, .obsidian, templates')
          .setValue(this.plugin.settings.excludedFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split(',')
              .map((f) => f.trim())
              .filter((f) => f.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // 8. Notifications
    new Setting(containerEl)
      .setName('Show notifications')
      .setDesc('Show notice notifications when tasks are updated.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotices)
          .onChange(async (value) => {
            this.plugin.settings.showNotices = value;
            await this.plugin.saveSettings();
          })
      );

    // 9. Manual Sync Button
    containerEl.createEl('h3', { text: 'Vault Operations' });
    new Setting(containerEl)
      .setName('Synchronize entire vault')
      .setDesc('Scan all notes and update all referring checklist wikilinks to match current note properties.')
      .addButton((btn) =>
        btn
          .setButtonText('Sync Entire Vault Now')
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Syncing...');
            const result = await this.plugin.syncer.syncAllVault();
            btn.setDisabled(false);
            btn.setButtonText('Sync Entire Vault Now');
            new Notice(`CheckLink: Synced ${result.updatedTasks} task(s) across ${result.scannedNotes} notes.`);
          })
      );
  }
}
