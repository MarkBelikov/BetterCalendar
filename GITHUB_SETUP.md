# One-time GitHub update setup

Release repository: MarkBelikov/BetterCalendar.

Proposed app repository: **MarkBelikov/BetterCalendar**, separate from the profile repository.

1. Create BetterCalendar under MarkBelikov. For the simple update channel, choose **Public** and initialize with a README. Public means the app code and installers can be viewed/downloaded by others. Your personal calendar, journals, tasks, trackers, imported chats and API key stay on your computer and are not uploaded.
2. Grant the connected GitHub app access to this repository if access is limited to selected repositories.
3. Return the repository link. The prepared app source and Windows release workflow can then be committed to it and the setup release built and checked.
4. Install the 2.2.0 setup release once. Later version bumps can be delivered through the in-app Restart to update button.

Repository creation is not exposed by the connected tools in this session. An existing private app repository can also be granted, but a private-only update feed requires additional authentication design; do not embed a repository access token in a downloadable app.

The prepared source uses electron-updater 6.8.9 with a GitHub provider fixed to MarkBelikov/BetterCalendar, background downloads and explicit restart. The workflow runs only on main pushes or manual dispatch, verifies a stable version, and does not overwrite existing releases.

App updates do not consume OpenAI API credits. GitHub standard Actions runners are free for public repositories; private repositories have their own usage quotas. Sources: https://www.electron.build/v26/docs/features/auto-update/ and https://docs.github.com/en/billing/concepts/product-billing/github-actions
