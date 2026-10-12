# Better Calendar

A Windows desktop calendar with journals, reminders, undated tasks, optional trackers, and an on-demand AI assistant.

## Install

Download the setup executable from this repository's Releases page once the Windows build completes. The installer creates Start menu and desktop shortcuts. Pin the installed app to the taskbar if desired. Startup behavior is configurable in Settings. Closing the window keeps the app in the tray; use the tray's Quit action to exit.

The installer is unsigned. It does not claim a verified publisher certificate.

## Local features

Select a calendar date to edit its journal and reminders. Journal changes autosave, and the calendar shows journal snippets and reminder summaries. The main calendar includes a persistent undated task list. Optional suggested task times use local availability settings and recorded calendar events; accepting a suggestion creates an editable calendar block.

Subscription status records describe activity entered by the user; the app does not change subscriptions at external services. Optional recurring-payment stop dates affect only the local schedule.

Optional routines support signed points, weekly targets, reversible daily check-ins, and archiving. The opportunity tracker stores manually entered applications and outreach, including status and next actions. Focus sessions and weekly reviews are stored locally.

## Privacy and AI

Calendar data, journals, tasks, trackers, and imported conversation archives are stored on the computer. No personal records are bundled in this repository or installer. Backups exclude the API key and should be kept private. The API key uses Electron safeStorage and is not exposed to the renderer.

AI is optional and runs only when a user submits a request. OpenAI API billing is separate from ChatGPT subscriptions. Monthly request limits count attempts, including failures; they are not a guaranteed account-wide monetary cap. Context-sharing controls determine which local data is included with a request.

Imported conversation archives can supply searchable context. The app does not automatically access or synchronize ChatGPT account history.

## Automatic updates

Version 2.2.0 adds a GitHub release update channel. Update availability depends on the first successful release build and installing its setup executable once. Packaged Windows builds check after 15 seconds and every six hours. Available updates download in the background. Installation requires the app's explicit Restart to update action; ordinary quitting does not install an update. The app saves calendar and journal data before restarting. Save other forms before restarting.

Only the application restarts; no computer restart is requested. Update checks and downloads do not call OpenAI or use OpenAI API credits. Local records remain outside the installation directory.

## Development

Use Node.js 22 or later:

```sh
npm ci
npm test
npm start
```

Build a Windows NSIS installer with:

```sh
npm run dist -- --publish never
```

The GitHub Actions workflow tests and builds Windows releases on main branch pushes. A new stable package version creates a release containing the installer, blockmap, and update metadata. Existing release versions are skipped. No long-lived GitHub token is bundled with the application.
