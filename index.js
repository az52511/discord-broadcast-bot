const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials,
  SlashCommandBuilder
} = require('discord.js');

// Import configuration from config.json file
const { token, allowedRoleId, guildId, image, logsChannelId } = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

// Initialize the Discord bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

// Define the slash command
const broadcastCommand = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('Open broadcast control panel');

/**
 * Logs all broadcast activities to a dedicated channel and database
 * Tracks: who used the command, broadcast type, target, and statistics
 */
async function logBroadcastAction({
  userId,
  userName,
  actionType,
  targetType,
  targetName,
  messagePreview,
  successCount,
  failureCount,
  additionalInfo,
  guildName
}) {
  if (!logsChannelId) {
    console.log('⚠️ Logs channel ID not configured in config.json');
    return;
  }

  try {
    const logsChannel = client.channels.cache.get(logsChannelId);
    if (!logsChannel) {
      console.log('⚠️ Logs channel not found');
      return;
    }

    // Format timestamp with Saudi Arabia timezone
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Build the log message embed
    const logEmbed = new EmbedBuilder()
      .setColor('#2563eb')
      .setTitle('📊 Broadcast Activity Log')
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3143/3143615.png')
      .addFields(
        {
          name: 'User',
          value: `<@${userId}> • **${userName}**`,
          inline: false
        },
        {
          name: 'Action Type',
          value: actionType,
          inline: true
        },
        {
          name: 'Target Type',
          value: targetType,
          inline: true
        },
        {
          name: 'Target Name',
          value: targetName || 'N/A',
          inline: true
        },
        {
          name: 'Message Preview',
          value: `\`\`\`${messagePreview.slice(0, 180)}${messagePreview.length > 180 ? '...' : ''}\`\`\``,
          inline: false
        },
        {
          name: 'Statistics',
          value: `✅ Success: **${successCount}**\n❌ Failed: **${failureCount}**\n📈 Total: **${successCount + failureCount}**`,
          inline: true
        },
        {
          name: 'Server',
          value: guildName || 'N/A',
          inline: true
        },
        {
          name: 'Timestamp',
          value: timestamp,
          inline: true
        }
      );

    // Add additional info if provided
    if (additionalInfo) {
      logEmbed.addFields({
        name: 'Additional Info',
        value: additionalInfo,
        inline: false
      });
    }

    logEmbed.setFooter({
      text: 'Discord Broadcast Bot | Activity Logger'
    });

    // Send the log message to logs channel
    await logsChannel.send({ embeds: [logEmbed] });

    // Save data to database for future statistics
    await db.set(`broadcast_log_${Date.now()}`, {
      userId,
      userName,
      actionType,
      targetType,
      targetName,
      successCount,
      failureCount,
      messagePreview,
      timestamp: new Date().toISOString(),
      guildName
    });

  } catch (error) {
    console.error('❌ Error logging broadcast action:', error);
  }
}

/**
 * Get action type name in a clear and readable format
 */
function getActionTypeName(customId) {
  const actionMap = {
    send_all: 'Send to All Members',
    send_online: 'Send to Online Members',
    send_offline: 'Send to Offline Members',
    send_by_role: 'Send by Role',
    send_to_user: 'Send to Specific User'
  };

  return actionMap[customId] || customId;
}

// If a mention for the recipient exists in the message, move it to its own last line; otherwise return original text
function placeMentionOnLastLine(messageText, userId) {
  try {
    if (!messageText) return messageText || '';
    const mentionRegex = new RegExp(`<@!?${userId}>`, 'g');

    // If the message doesn't contain a mention for this user, return original message
    if (!mentionRegex.test(messageText)) return messageText;

    // Remove all occurrences of that user's mention and trim
    const cleaned = messageText.replace(mentionRegex, '').trim();

    // If nothing left, return only the mention
    if (cleaned === '') return `<@${userId}>`;

    // Otherwise return cleaned text with mention on its own last line
    return `${cleaned}\n<@${userId}>`;
  } catch (e) {
    // Fallback to original message on error
    return messageText;
  }
}

/**
 * Bot ready event - fires when the bot successfully connects to Discord
 */
client.once('ready', async () => {
  console.log('✅ Bot is Ready!');
  client.user.setActivity('/broadcast for control panel', { type: 'LISTENING' });

  try {
    await client.application.commands.set([broadcastCommand.toJSON()], guildId);
    console.log('✅ Slash command registered successfully');
  } catch (error) {
    console.error('❌ Error registering slash command:', error);
  }
});

/**
 * Main interaction handler - processes commands, buttons, and modals
 */
client.on('interactionCreate', async (interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'broadcast') {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        // Verify user has the allowed role
        if (!member || !member.roles.cache.has(allowedRoleId)) {
          return interaction.reply({
            content: '❌ You do not have permission to use this command!',
            ephemeral: true
          });
        }

        // Display the main control panel
        const controlPanelEmbed = new EmbedBuilder()
          .setColor('#1e1e2e')
          .setTitle('🎙️ Broadcast Control Panel')
          .setImage(image)
          .setDescription('Select the type of broadcast for your members.')
          .setFooter({ text: 'Click a button below to proceed' });

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('send_all')
            .setLabel('Send to All')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📢'),

          new ButtonBuilder()
            .setCustomId('send_online')
            .setLabel('Send to Online')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢'),

          new ButtonBuilder()
            .setCustomId('send_offline')
            .setLabel('Send to Offline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔴'),

          new ButtonBuilder()
            .setCustomId('send_by_role')
            .setLabel('Send by Role')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏷️'),

          new ButtonBuilder()
            .setCustomId('send_to_user')
            .setLabel('Send to User')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👤')
        );

        await interaction.reply({
          embeds: [controlPanelEmbed],
          components: [actionRow],
          ephemeral: true
        });
      }
    }

    // Handle button clicks - shows input modal
    if (interaction.isButton()) {
      let modalId = null;

      // Determine modal type based on button clicked
      if (interaction.customId === 'send_all') {
        modalId = 'modal_all';
      } else if (interaction.customId === 'send_online') {
        modalId = 'modal_online';
      } else if (interaction.customId === 'send_offline') {
        modalId = 'modal_offline';
      } else if (interaction.customId === 'send_by_role') {
        modalId = 'modal_by_role';
      } else if (interaction.customId === 'send_to_user') {
        modalId = 'modal_to_user';
      }

      if (!modalId) return;

      // Create the input modal
      const messageModal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('✍️ Write Your Message');

      // Message field - required for all cases
      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('Enter your message here')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      // For sending to specific user - add User ID field
      if (modalId === 'modal_to_user') {
        const userIdInput = new TextInputBuilder()
          .setCustomId('userInput')
          .setLabel('Enter User ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(userIdInput)
        );
      }
      // For sending by role - add Role ID field
      else if (modalId === 'modal_by_role') {
        const roleIdInput = new TextInputBuilder()
          .setCustomId('roleInput')
          .setLabel('Enter Role ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(roleIdInput)
        );
      }
      // For sending to all or by status
      else {
        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput)
        );
      }

      // Show the modal to user
      await interaction.showModal(messageModal);
      return;
    }

    // Handle modal submissions - receive user input
    if (interaction.isModalSubmit()) {
      const messageText = interaction.fields.getTextInputValue('messageInput');
      const guild = interaction.guild;

      if (!guild) return;

      // Defer the reply to allow time for processing
      await interaction.deferReply({ ephemeral: true });

      // Case: Send to specific user
      if (interaction.customId === 'modal_to_user') {
        const userId = interaction.fields.getTextInputValue('userInput');

        try {
          // Verify user exists
          const targetUser = await client.users.fetch(userId);

          // Verify user is in the server
          const targetMember = await guild.members.fetch(userId).catch(() => null);

          if (!targetMember) {
            await logBroadcastAction({
              userId: interaction.user.id,
              userName: interaction.user.username,
              actionType: getActionTypeName('send_to_user'),
              targetType: 'Specific User',
              targetName: userId,
              messagePreview: messageText,
              successCount: 0,
              failureCount: 1,
              additionalInfo: `User ID: \`${userId}\` | Status: User not found in server`,
              guildName: guild.name
            });

            return interaction.editReply({
              content: '❌ User not found in this server.\n💡 Make sure the User ID is correct.'
            });
          }

          // Send the message to user (include mention and allow it)
          await targetUser.send({
            content: placeMentionOnLastLine(messageText, targetUser.id),
            allowedMentions: { users: [targetUser.id] }
          });

          // Log successful action
          await logBroadcastAction({
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: 'Specific User',
            targetName: targetUser.username,
            messagePreview: messageText,
            successCount: 1,
            failureCount: 0,
            additionalInfo: `User ID: \`${userId}\` | Username: \`${targetUser.username}\``,
            guildName: guild.name
          });

          return interaction.editReply({
            content: `✅ Message sent successfully to **${targetUser.username}**!`
          });

        } catch (error) {
          console.error('Error sending to user:', error);

          // Log failed action
          await logBroadcastAction({
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: 'Specific User',
            targetName: userId,
            messagePreview: messageText,
            successCount: 0,
            failureCount: 1,
            additionalInfo: `User ID: \`${userId}\` | Error: ${error.message}`,
            guildName: guild.name
          });

          return interaction.editReply({
            content: '❌ Failed to send message to user.\n💡 The user might have DMs disabled.'
          });
        }
      }

      // Case: Send by role
      if (interaction.customId === 'modal_by_role') {
        const roleId = interaction.fields.getTextInputValue('roleInput');
        const targetRole = guild.roles.cache.get(roleId);

        // Verify role exists
        if (!targetRole) {
          return interaction.editReply({
            content: '❌ Role not found or invalid Role ID.\n💡 Make sure the Role ID is correct.'
          });
        }

        await sendBroadcastByRole(guild, messageText, roleId, interaction);
        return;
      }

      // Case: Send to all members
      if (interaction.customId === 'modal_all') {
        await sendBroadcast(guild, messageText, null, interaction, 'send_all');
        return;
      }

      // Case: Send to online members only
      if (interaction.customId === 'modal_online') {
        await sendBroadcast(guild, messageText, 'online', interaction, 'send_online');
        return;
      }

      // Case: Send to offline members only
      if (interaction.customId === 'modal_offline') {
        await sendBroadcast(guild, messageText, 'offline', interaction, 'send_offline');
        return;
      }
    }

  } catch (error) {
    console.error('Error in interactionCreate:', error);
  }
});

/**
 * Broadcast function for all members or filtered by status
 * Sends message to multiple members with delays to avoid rate limits
 */
async function sendBroadcast(guild, messageText, status, interaction, actionType) {
  try {
    // Fetch all members in the server
    const members = await guild.members.fetch();
    let successCount = 0;
    let failureCount = 0;

    // Loop through all members
    for (const member of members.values()) {
      // Skip bots
      if (member.user.bot) continue;

      // Filter by status if provided
      if (status && member.presence?.status !== status) continue;

      try {
        // Attempt to send message and mention recipient automatically
        await member.send({
          content: placeMentionOnLastLine(messageText, member.id),
          allowedMentions: { users: [member.id] }
        });
        successCount++;
      } catch (error) {
        // Failed to send (user might have DMs disabled)
        failureCount++;
      }

      // Delay 500ms between messages to avoid Discord rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Determine the broadcast type label
    const statusLabel = status
      ? (status === 'online' ? 'Online Members' : 'Offline Members')
      : 'All Members';

    // Log the action to database and logs channel
    await logBroadcastAction({
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName(actionType),
      targetType: statusLabel,
      targetName: statusLabel,
      messagePreview: messageText,
      successCount: successCount,
      failureCount: failureCount,
      additionalInfo: `Total Processed: \`${successCount + failureCount}\` members`,
      guildName: guild.name
    });

    // Send result message to user
    return interaction.editReply({
      content: `✅ Broadcast sent successfully!\n📊 **Statistics:**\n✔️ Success: **${successCount}** members\n❌ Failed: **${failureCount}** members`
    });

  } catch (error) {
    console.error('sendBroadcast error:', error);
    return interaction.editReply({
      content: '❌ An error occurred while sending the broadcast.'
    });
  }
}

/**
 * Broadcast function for specific role
 * Sends message only to members who have a specific role
 */
async function sendBroadcastByRole(guild, messageText, roleId, interaction) {
  try {
    // Fetch all members in the server
    const members = await guild.members.fetch();
    let successCount = 0;
    let failureCount = 0;

    // Get the role name
    const roleName = guild.roles.cache.get(roleId)?.name || 'Unknown Role';

    // Loop through all members
    for (const member of members.values()) {
      // Skip bots
      if (member.user.bot) continue;

      // Verify member has the role
      if (!member.roles.cache.has(roleId)) continue;

      try {
        // Attempt to send message and mention recipient automatically
        await member.send({
          content: placeMentionOnLastLine(messageText, member.id),
          allowedMentions: { users: [member.id] }
        });
        successCount++;
      } catch (error) {
        // Failed to send
        failureCount++;
      }

      // Delay 500ms between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Log the action
    await logBroadcastAction({
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName('send_by_role'),
      targetType: 'Specific Role',
      targetName: roleName,
      messagePreview: messageText,
      successCount: successCount,
      failureCount: failureCount,
      additionalInfo: `Role ID: \`${roleId}\` | Total Processed: \`${successCount + failureCount}\` members`,
      guildName: guild.name
    });

    // Send result message
    return interaction.editReply({
      content: `✅ Broadcast sent successfully to role **${roleName}**!\n📊 **Statistics:**\n✔️ Success: **${successCount}** members\n❌ Failed: **${failureCount}** members`
    });

  } catch (error) {
    console.error('sendBroadcastByRole error:', error);
    return interaction.editReply({
      content: '❌ An error occurred while sending the broadcast by role.'
    });
  }
}

// Login bot with token
client.login(token);
