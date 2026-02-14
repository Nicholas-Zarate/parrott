const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Store active polls
const activePolls = new Map();

// Poll types
const POLL_TYPES = {
    SINGLE: 'single',
    MULTIPLE: 'multiple',
    RANKED: 'ranked',
    YES_NO: 'yes_no'
};

// Minimal / ASCII theme - dark brown palette
const THEME = {
    color: {
        primary: 0x362925,   // very dark brown (embed border)
        ended: 0x2c2019      // darker brown (ended polls)
    },
    chars: {
        barFull: '#',
        barEmpty: '-',
        optionPrefix: (n) => `(${n})`
    },
    labels: {
        poll: '[POLL]',
        ended: '[ENDED]',
        votes: 'votes',
        winner: '[winner]',
        lock: '[role]',
        duration: '[time]',
        by: 'by',
        anonymous: 'anonymous',
        public: 'public'
    }
};

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    registerCommands();
});

async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('vote')
            .setDescription('Create a new poll')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of poll')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Single Choice', value: POLL_TYPES.SINGLE },
                        { name: 'Multiple Choice', value: POLL_TYPES.MULTIPLE },
                        { name: 'Ranked Choice', value: POLL_TYPES.RANKED },
                        { name: 'Yes/No', value: POLL_TYPES.YES_NO }
                    ))
            .addStringOption(option =>
                option.setName('question')
                    .setDescription('The poll question')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('options')
                    .setDescription('Poll options separated by | (e.g., Option1|Option2|Option3)')
                    .setRequired(false))
            .addIntegerOption(option =>
                option.setName('duration')
                    .setDescription('Poll duration in minutes (0 for no limit)')
                    .setRequired(false))
            .addRoleOption(option =>
                option.setName('allowed_role')
                    .setDescription('Role required to vote (leave empty for everyone)')
                    .setRequired(false))
            .addBooleanOption(option =>
                option.setName('anonymous')
                    .setDescription('Hide voter names')
                    .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('endpoll')
            .setDescription('End an active poll')
            .addStringOption(option =>
                option.setName('poll_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        
        new SlashCommandBuilder()
            .setName('pollresults')
            .setDescription('Show detailed poll results')
            .addStringOption(option =>
                option.setName('poll_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('vote_hearing')
            .setDescription('Quick poll: put your own question (Yes/No by default)')
            .addStringOption(option =>
                option.setName('question')
                    .setDescription('Your question')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('options')
                    .setDescription('Options separated by | (default: Yes | No)')
                    .setRequired(false))
            .addIntegerOption(option =>
                option.setName('duration')
                    .setDescription('Duration in minutes (0 = no limit)')
                    .setRequired(false))
            .addBooleanOption(option =>
                option.setName('anonymous')
                    .setDescription('Hide voter names')
                    .setRequired(false))
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    }
});

async function handleCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'vote') {
        await createPoll(interaction);
    } else if (commandName === 'vote_hearing') {
        await createHearingPoll(interaction);
    } else if (commandName === 'endpoll') {
        await endPoll(interaction);
    } else if (commandName === 'pollresults') {
        await showResults(interaction);
    }
}

async function createPoll(interaction) {
    const type = interaction.options.getString('type');
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const duration = interaction.options.getInteger('duration') || 0;
    const allowedRole = interaction.options.getRole('allowed_role');
    const anonymous = interaction.options.getBoolean('anonymous') || false;

    let options = [];
    if (type === POLL_TYPES.YES_NO) {
        options = ['Yes', 'No'];
    } else {
        if (!optionsStr) {
            return interaction.reply({ content: 'options required for this type.', ephemeral: true });
        }
        options = optionsStr.split('|').map(o => o.trim()).filter(o => o);
        if (options.length < 2) {
            return interaction.reply({ content: 'at least 2 options required.', ephemeral: true });
        }
    }

    await createPollFromParams(interaction, { type, question, options, duration, allowedRole, anonymous });
}

async function createHearingPoll(interaction) {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const duration = interaction.options.getInteger('duration') || 0;
    const anonymous = interaction.options.getBoolean('anonymous') || false;

    let options = ['Yes', 'No'];
    if (optionsStr) {
        options = optionsStr.split('|').map(o => o.trim()).filter(o => o);
        if (options.length < 2) {
            return interaction.reply({ content: 'at least 2 options required.', ephemeral: true });
        }
    }

    const type = options.length === 2 ? POLL_TYPES.YES_NO : POLL_TYPES.SINGLE;
    await createPollFromParams(interaction, { type, question, options, duration, allowedRole: null, anonymous });
}

async function createPollFromParams(interaction, { type, question, options, duration, allowedRole, anonymous }) {
    const embed = new EmbedBuilder()
        .setTitle(`${THEME.labels.poll} ${question}`)
        .setColor(THEME.color.primary)
        .setDescription(getPollDescription(type))
        .addFields(
            options.map((opt, i) => ({ name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`, value: `0 ${THEME.labels.votes}`, inline: false }))
        )
        .setFooter({ text: `${THEME.labels.by} ${interaction.user.tag} | ${anonymous ? THEME.labels.anonymous : THEME.labels.public}` })
        .setTimestamp();

    if (allowedRole) {
        embed.addFields({ name: THEME.labels.lock, value: `${allowedRole}` });
    }

    if (duration > 0) {
        embed.addFields({ name: THEME.labels.duration, value: `${duration} min` });
    }

    const buttons = options.map((opt, i) => 
        new ButtonBuilder()
            .setCustomId(`vote_${i}`)
            .setLabel(String(i + 1))
            .setStyle(ButtonStyle.Secondary)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poll_results')
            .setLabel('Results')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('poll_end')
            .setLabel('End')
            .setStyle(ButtonStyle.Danger)
    );
    rows.push(controlRow);

    const message = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });

    const pollData = {
        id: message.id,
        question,
        type,
        options,
        votes: new Map(),
        voters: new Set(),
        allowedRole: allowedRole?.id,
        anonymous,
        createdBy: interaction.user.id,
        createdAt: Date.now()
    };

    activePolls.set(message.id, pollData);

    if (duration > 0) {
        setTimeout(() => endPollAuto(message.id, interaction.channel), duration * 60 * 1000);
    }
}

function getPollDescription(type) {
    switch (type) {
        case POLL_TYPES.SINGLE:
            return 'single choice';
        case POLL_TYPES.MULTIPLE:
            return 'multiple choice';
        case POLL_TYPES.RANKED:
            return 'ranked (order = weight)';
        case POLL_TYPES.YES_NO:
            return 'yes / no';
        default:
            return '';
    }
}

async function handleButton(interaction) {
    const pollData = activePolls.get(interaction.message.id);
    
    if (!pollData) {
        return interaction.reply({ content: 'poll ended or invalid.', ephemeral: true });
    }

    if (interaction.customId === 'poll_results') {
        return showResultsButton(interaction, pollData);
    }

    if (interaction.customId === 'poll_end') {
        if (interaction.user.id !== pollData.createdBy && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: 'creator or manage-messages only.', ephemeral: true });
        }
        return endPollButton(interaction);
    }

    // Check permissions
    if (pollData.allowedRole && !interaction.member.roles.cache.has(pollData.allowedRole)) {
        return interaction.reply({ content: 'no permission to vote.', ephemeral: true });
    }

    const optionIndex = parseInt(interaction.customId.split('_')[1]);
    const userId = interaction.user.id;

    // Handle different poll types (YES_NO behaves like SINGLE)
    if (pollData.type === POLL_TYPES.SINGLE || pollData.type === POLL_TYPES.YES_NO) {
        pollData.votes.set(userId, [optionIndex]);
        pollData.voters.add(userId);
        await interaction.reply({ content: `voted: ${pollData.options[optionIndex]}`, ephemeral: true });
    } else if (pollData.type === POLL_TYPES.MULTIPLE) {
        let userVotes = pollData.votes.get(userId) || [];
        if (userVotes.includes(optionIndex)) {
            userVotes = userVotes.filter(v => v !== optionIndex);
            await interaction.reply({ content: `removed: ${pollData.options[optionIndex]}`, ephemeral: true });
        } else {
            userVotes.push(optionIndex);
            await interaction.reply({ content: `added: ${pollData.options[optionIndex]}`, ephemeral: true });
        }
        pollData.votes.set(userId, userVotes);
        pollData.voters.add(userId);
    } else if (pollData.type === POLL_TYPES.RANKED) {
        let userVotes = pollData.votes.get(userId) || [];
        if (!userVotes.includes(optionIndex)) {
            userVotes.push(optionIndex);
            pollData.votes.set(userId, userVotes);
            pollData.voters.add(userId);
            await interaction.reply({
                content: `ranked ${pollData.options[optionIndex]} #${userVotes.length}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({ content: 'already ranked.', ephemeral: true });
        }
    }

    await updatePollEmbed(interaction.message, pollData);
}

async function updatePollEmbed(message, pollData) {
    const voteCounts = calculateVotes(pollData);
    const totalVotes = pollData.voters.size;

    const embed = EmbedBuilder.from(message.embeds[0]);
    const full = THEME.chars.barFull;
    const empty = THEME.chars.barEmpty;
    embed.setFields(
        pollData.options.map((opt, i) => {
            const votes = voteCounts[i] || 0;
            const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
            const filled = Math.floor(percentage / 5);
            const bar = full.repeat(filled) + empty.repeat(20 - filled);
            return {
                name: `${THEME.chars.optionPrefix(i + 1)} ${opt}`,
                value: `${bar}\n${votes} ${THEME.labels.votes} (${percentage}%)`,
                inline: false
            };
        })
    );

    embed.setFooter({ text: `${embed.data.footer?.text ?? ''} | ${totalVotes} voters` });

    await message.edit({ embeds: [embed] });
}

function calculateVotes(pollData) {
    const counts = {};
    pollData.options.forEach((_, i) => counts[i] = 0);

    if (pollData.type === POLL_TYPES.RANKED) {
        for (const [_, votes] of pollData.votes) {
            votes.forEach((optIdx, rank) => {
                const weight = pollData.options.length - rank;
                counts[optIdx] += weight;
            });
        }
    } else {
        for (const [_, votes] of pollData.votes) {
            votes.forEach(optIdx => counts[optIdx]++);
        }
    }

    return counts;
}

async function showResultsButton(interaction, pollData) {
    const voteCounts = calculateVotes(pollData);
    const totalVotes = pollData.voters.size;

    let resultsText = `voters: ${totalVotes}\n\n`;

    pollData.options.forEach((opt, i) => {
        const votes = voteCounts[i] || 0;
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        resultsText += `(${i + 1}) ${opt}: ${votes} (${percentage}%)\n`;
    });

    if (!pollData.anonymous) {
        resultsText += '\n';
        for (const [userId, votes] of pollData.votes) {
            const user = await client.users.fetch(userId);
            const votedOptions = votes.map(v => pollData.options[v]).join(', ');
            resultsText += `- ${user.tag}: ${votedOptions}\n`;
        }
    }

    await interaction.reply({ content: resultsText, ephemeral: true });
}

async function endPollButton(interaction) {
    const pollData = activePolls.get(interaction.message.id);
    await finalizeResults(interaction.message, pollData);
    activePolls.delete(interaction.message.id);
    await interaction.reply({ content: 'ended.', ephemeral: true });
}

async function endPoll(interaction) {
    const pollId = interaction.options.getString('poll_id');
    const pollData = activePolls.get(pollId);

    if (!pollData) {
        return interaction.reply({ content: 'poll not found or ended.', ephemeral: true });
    }

    const message = await interaction.channel.messages.fetch(pollId);
    await finalizeResults(message, pollData);
    activePolls.delete(pollId);
    await interaction.reply({ content: 'ended.', ephemeral: true });
}

async function endPollAuto(pollId, channel) {
    const pollData = activePolls.get(pollId);
    if (!pollData) return;

    const message = await channel.messages.fetch(pollId);
    await finalizeResults(message, pollData);
    activePolls.delete(pollId);
}

async function finalizeResults(message, pollData) {
    const voteCounts = calculateVotes(pollData);

    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setTitle(`${THEME.labels.ended} ${pollData.question}`);
    embed.setColor(THEME.color.ended);

    const winner = Object.keys(voteCounts).reduce((a, b) =>
        voteCounts[a] > voteCounts[b] ? a : b
    );

    embed.addFields({
        name: THEME.labels.winner,
        value: `${pollData.options[winner]} -- ${voteCounts[winner]} ${THEME.labels.votes}`
    });

    await message.edit({ embeds: [embed], components: [] });
}

async function showResults(interaction) {
    const pollId = interaction.options.getString('poll_id');
    const pollData = activePolls.get(pollId);

    if (!pollData) {
        return interaction.reply({ content: 'poll not found.', ephemeral: true });
    }

    await showResultsButton(interaction, pollData);
}

// Login
client.login('MTQ3MTczMDcyMDAxNDYwMjI4MA.GT0Oxx.NFYEnyow6Vn9100w5M9O5XtrwC9pA33QYADTD8');
