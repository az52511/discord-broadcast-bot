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

const { token, allowedRoleId, guildId, image } = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.GuildMember]
});

const bcCommand = new SlashCommandBuilder()
  .setName('bc')
  .setDescription('فتح لوحة البث');

client.once('ready', async () => {
  console.log('Bot is Ready!');
  client.user.setActivity('/bc للبث', { type: 'LISTENING' });

  try {
    await client.application.commands.set([bcCommand.toJSON()], guildId);
    console.log('Slash command registered successfully');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'bc') {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!member || !member.roles.cache.has(allowedRoleId)) {
          return interaction.reply({
            content: 'ليس لديك صلاحية لاستخدام هذا الأمر!',
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setTitle('لوحة تحكم البرودكاست')
          .setImage(image)
          .setDescription('الرجاء اختيار نوع الإرسال للأعضاء.');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('send_all')
            .setLabel('ارسل للجميع')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('send_online')
            .setLabel('ارسل للمتصلين')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId('send_offline')
            .setLabel('ارسل للغير المتصلين')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('send_by_role')
            .setLabel('ارسل حسب الرتبة')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('send_to_channel')
            .setLabel('ارسل إلى روم معين')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    }

    if (interaction.isButton()) {
      let modalId = null;

      if (interaction.customId === 'send_all') {
        modalId = 'modal_all';
      } else if (interaction.customId === 'send_online') {
        modalId = 'modal_online';
      } else if (interaction.customId === 'send_offline') {
        modalId = 'modal_offline';
      } else if (interaction.customId === 'send_by_role') {
        modalId = 'modal_by_role';
      } else if (interaction.customId === 'send_to_channel') {
        modalId = 'modal_to_channel';
      }

      if (!modalId) return;

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('اكتب رسالتك');

      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('اكتب رسالتك هنا')
        .setStyle(TextInputStyle.Paragraph);

      if (modalId === 'modal_to_channel') {
        const channelInput = new TextInputBuilder()
          .setCustomId('channelInput')
          .setLabel('أدخل معرف الروم')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(channelInput)
        );
      } else if (modalId === 'modal_by_role') {
        const roleInput = new TextInputBuilder()
          .setCustomId('roleInput')
          .setLabel('أدخل معرف الرتبة')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(roleInput)
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput)
        );
      }

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit()) {
      const messageText = interaction.fields.getTextInputValue('messageInput');
      const guild = interaction.guild;

      if (!guild) return;

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === 'modal_to_channel') {
        const channelId = interaction.fields.getTextInputValue('channelInput');
        const targetChannel = guild.channels.cache.get(channelId);

        if (!targetChannel || targetChannel.type !== 0) {
          return interaction.editReply({
            content: '❌ الروم غير موجود أو المعرف غير صالح.'
          });
        }

        try {
          await targetChannel.send({ content: messageText });
          return interaction.editReply({
            content: '✅ تم إرسال الرسالة إلى الروم المحدد بنجاح.'
          });
        } catch (error) {
          console.error(error);
          return interaction.editReply({
            content: '❌ حدث خطأ أثناء إرسال الرسالة إلى الروم.'
          });
        }
      }

      if (interaction.customId === 'modal_by_role') {
        const roleId = interaction.fields.getTextInputValue('roleInput');
        const targetRole = guild.roles.cache.get(roleId);

        if (!targetRole) {
          return interaction.editReply({
            content: '❌ الرتبة غير موجودة أو المعرف غير صالح.'
          });
        }

        await sendBroadcastByRole(guild, messageText, roleId, interaction);
        return;
      }

      if (interaction.customId === 'modal_all') {
        await sendBroadcast(guild, messageText, null, interaction);
        return;
      }

      if (interaction.customId === 'modal_online') {
        await sendBroadcast(guild, messageText, 'online', interaction);
        return;
      }

      if (interaction.customId === 'modal_offline') {
        await sendBroadcast(guild, messageText, 'offline', interaction);
        return;
      }
    }
  } catch (error) {
    console.error('Error in interactionCreate:', error);
  }
});

async function sendBroadcast(guild, messageText, status, interaction) {
  try {
    const members = await guild.members.fetch();
    let sentCount = 0;
    let failedCount = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;

      if (status && member.presence?.status !== status) continue;

      try {
        await member.send({
          content: `${messageText}\n<@${member.user.id}>`,
          allowedMentions: { parse: ['users'] }
        });
        sentCount++;
      } catch (error) {
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return interaction.editReply({
      content: `✅ تم إرسال الرسالة بنجاح!\n📊 الإحصائيات:\n✔️ تم إرسالها إلى: **${sentCount}** عضو\n❌ فشل الإرسال: **${failedCount}** عضو`
    });
  } catch (error) {
    console.error('sendBroadcast error:', error);
    return interaction.editReply({
      content: '❌ حدث خطأ أثناء محاولة البث.'
    });
  }
}

async function sendBroadcastByRole(guild, messageText, roleId, interaction) {
  try {
    const members = await guild.members.fetch();
    let sentCount = 0;
    let failedCount = 0;
    const roleName = guild.roles.cache.get(roleId)?.name || 'غير معروفة';

    for (const member of members.values()) {
      if (member.user.bot) continue;

      if (!member.roles.cache.has(roleId)) continue;

      try {
        await member.send({
          content: `${messageText}\n<@${member.user.id}>`,
          allowedMentions: { parse: ['users'] }
        });
        sentCount++;
      } catch (error) {
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return interaction.editReply({
      content: `✅ تم إرسال الرسالة بنجاح للرتبة: **${roleName}**\n📊 الإحصائيات:\n✔️ تم إرسالها إلى: **${sentCount}** عضو\n❌ فشل الإرسال: **${failedCount}** عضو`
    });
  } catch (error) {
    console.error('sendBroadcastByRole error:', error);
    return interaction.editReply({
      content: '❌ حدث خطأ أثناء محاولة البث حسب الرتبة.'
    });
  }
}

client.login(token);
