Release v0.4.1

1. Copy js/models.js into your project.
2. Replace js/api.js.
3. Update your Settings view.

Replace:

const data = await API.testConnection();
const name = data.name;

With:

const result = await API.testConnection();
const { player } = result;

status.textContent =
`Connected as ${player.name} [${player.id}]`;

Optional:
Display player.avatar, player.level and player.rank.
