# CheckLink (Obsidian Plugin)

<p align="center">
  <a href="https://buymeacoffee.com/sskhekhaliya">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
  </a>
  <img src="https://img.shields.io/badge/Obsidian-v1.5.0+-7C3AED?style=for-the-badge&logo=obsidian&logoColor=white" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License">
</p>

> **Lightning-fast, automatic checklist and task synchronization powered by Obsidian wikilinks and note frontmatter.**  
> Mark a note completed with frontmatter properties (e.g. `completed_date`), and all corresponding checklist tasks across your vault auto-check in real time.

---

## 🌟 Why CheckLink?

In Obsidian, index notes, syllabus files, project dashboards, and MOCs frequently list tasks as wikilinks:

```markdown
- [ ] [[Chapter 1 - Introduction]]
- [ ] [[Chapter 2 - Data Structures]]
- [ ] [[Chapter 3 - Algorithms]]
```

When you finish studying or writing `Chapter 1 - Introduction.md`, you might add frontmatter:
```yaml
---
completed_date: 2026-10-29
---
```

Manually going back to your overview notes, syllabus, or daily trackers to tick every checkbox is tedious and prone to falling out of date.

**CheckLink automates this seamlessly:**
1. **⚡ Instant Zero-Lag Sync**: Uses Obsidian's in-memory Backlink Index (`metadataCache.resolvedLinks`). Instead of scanning your hard drive, it updates referring notes in microseconds ($O(1)$).
2. **🎯 Precision Wikilink Targeting**: Resolves true note destinations, avoiding false positives even if multiple notes share similar names in different folders.
3. **📁 Folder & Nested Subfolder Agnostic**: Works whether your overview file lives in the same folder, a parent folder, or the root of your vault. The note does **not** need any link back to the overview!
4. **🛡️ 100% Non-Destructive**: Normal tasks (e.g. `- [ ] Buy groceries`, `- [ ] Review design`) are completely untouched.
5. **🔄 Optional Two-Way (Bidirectional) Sync**: Clicking `- [ ]` $\rightarrow$ `- [x]` in any note can automatically write the completion date straight into the linked note's YAML frontmatter. Unchecking clears the value while preserving the property.

---

## ✨ Features & Capabilities

### 1. Flexible Task Matching Modes
* **Contains Wikilink (Default)**: Matches tasks where the wikilink appears anywhere in the line:
  - `- [ ] Review [[Chapter 1]] before Friday` $\rightarrow$ `- [x] Review [[Chapter 1]] before Friday`
  - `- [ ] [[Chapter 1|Alias Name]]` $\rightarrow$ `- [x] [[Chapter 1|Alias Name]]`
* **Strict / Exact Match Only**: Only updates checklist lines where the wikilink is the entire task item:
  - `- [ ] [[Chapter 1]]` $\rightarrow$ `- [x] [[Chapter 1]]`
  - Lines with extra text outside the link remain ignored.

### 2. Multiple Completion Properties Support
Define multiple properties at once (comma-separated):
* e.g. `completed_date, completed_at, published_date, finish_date`
* If a note has **any** of these properties set, CheckLink treats it as completed.
* **Smart Frontmatter Assignment**: When checking a task via bidirectional sync, CheckLink checks if the note already has one of your configured properties (e.g. `published_date:` in a book note), and updates that existing property. If none exist yet, it populates the primary (first) property.
* **Clean Uncheck**: When unchecking a task, all matching completion properties have their values automatically cleared (preserving property keys in your note frontmatter).

### 3. Bidirectional (Two-Way) Synchronization
Turn on **Bidirectional Sync** in settings:
* Check a task box in your dashboard: CheckLink writes `completed_date: YYYY-MM-DD` (or `completed: true`) directly into that note's frontmatter!
* Uncheck the task box: CheckLink clears the completion property value.

---

## ⚙️ Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Completion property** | Frontmatter YAML key to watch (`completed_date`, `completed_at`, `status`) | `completed_date` |
| **Completion criteria** | How completion is determined (`exists`, `truthy`, or `value`) | `exists` |
| **Expected property value** | Value required when using `value` criteria (e.g. `done`) | `done` |
| **Checklist match mode** | `contains` (anywhere in task line) or `strict` (only link) | `contains` |
| **Bidirectional sync** | Clicking task checkboxes in notes updates/clears the target note's frontmatter property | `false` |
| **Completion date format** | Date format for two-way sync (`YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, `ISO`) | `YYYY-MM-DD` |
| **Excluded folders** | Folders ignored during sync (e.g. `.trash, templates, archive`) | `.trash, .obsidian, templates` |
| **Show notifications** | Displays Obsidian notice popups when tasks are auto-updated | `false` |

---

## 📦 Commands & Ribbon

* **Ribbon Icon (`check-check`)**: One-click vault synchronization.
* **`CheckLink: Sync all checklists in vault with note properties`**: Scans all notes and syncs all checklist wikilinks across the vault.
* **`CheckLink: Sync checklists for active note`**: Instantly checks/unchecks tasks across the vault that link to the currently open note.

---

## 📄 License

MIT License © [SSKhekhaliya](https://www.sskhekhaliya.in/)

