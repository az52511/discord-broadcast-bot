# Discord Broadcast Bot

Discord bot with slash command `/bc` and a button-based broadcast dashboard.

Features:
- Send to everyone
- Send to online members only
- Send to offline members only
- Send to members with a specific role
- Send to a specific channel

## Requirements
- Node.js 18+
- Discord Bot Token
- Discord server where the bot is invited

## Setup
1. Open `config.json` and fill in your values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the bot:
   ```bash
   npm start
   ```

## config.json
```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "allowedRoleId": "YOUR_ALLOWED_ROLE_ID",
  "guildId": "YOUR_GUILD_ID",
  "image": "https://example.com/your-image.jpg"
}
```

## Discord setup
- Create a bot in the Discord Developer Portal.
- Invite it to your server with the required intents.
- Use `/bc` in your server.

## Notes
- `allowedRoleId` is the role allowed to use the broadcast command.
- `guildId` is the server ID where the slash command will be registered.
- The bot must have permission to send private messages to members.
