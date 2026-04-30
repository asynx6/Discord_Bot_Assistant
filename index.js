import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import dotenv from "dotenv";
import { getAiInstruction } from "./Modules/aiHandler.js";
import { executeAiAction } from "./Modules/discordActions.js";
import { saveContext, getContext } from "./Modules/contextManager.js";
import { connectDB } from "./Modules/database.js";

dotenv.config();
connectDB();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
    ]
});

const processingLock = new Map();

client.once("clientReady", () => {
    console.log(`✅ Bot online sebagai: ${client.user.tag}`);
    console.log(`📡 Tersambung ke ${client.guilds.cache.size} server`);
    client.user.setActivity("Discord Bot Asistant", { type: ActivityType.Listening });
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const botMention = `<@${client.user.id}>`;
    const botMentionMobile = `<@!${client.user.id}>`;

    let instruction;
    let isContextReply = false;
    let progressMsg = null;
    const previousContext = getContext(message);

    if (previousContext) {
        instruction = previousContext;
        const firstKey = Object.keys(instruction).find(k => !isNaN(k));

        if (instruction[firstKey]) {
            const item = instruction[firstKey];
            if (!item.url) item.url = message.content.trim();
            else if (!item.name) item.name = message.content.trim();
            else item.content = message.content.trim();
        }
        isContextReply = true;
    } else {
        if (!message.content.startsWith(botMention) && !message.content.startsWith(botMentionMobile)) return;
        if (message.author.id !== process.env.DISCORD_OWNER_ID) return;

        const userInput = message.content.replace(botMention, "").replace(botMentionMobile, "").trim();
        if (!userInput) return message.reply("Mau nyuruh apa lagi haaa??");

        const guildLock = processingLock.get(message.guild.id);
        if (guildLock) {
            return message.reply(`Sabar WOI, satu-satu... Gue lagi kerjain perintahnya <@${guildLock}> nih! ✋`);
        }

        processingLock.set(message.guild.id, message.author.id);

        try {
            await message.channel.sendTyping();
            progressMsg = await message.reply("⏳ Sabar ya Bos, gue lagi mikir dan ngerjain request lu... Kalo banyak mintanya makin lama kelarnya. Pantengin terus!");
            instruction = await getAiInstruction(userInput);
        } catch (err) {
            processingLock.delete(message.guild.id);
            console.error("AI call failed:", err);
            if (progressMsg) return progressMsg.edit("❌ Gagal kontak otak AI. Coba lagi!");
            return message.reply("❌ Gagal kontak otak AI. Coba lagi!");
        }
    }

    try {
        if (!isContextReply) {
            processingLock.set(message.guild.id, message.author.id);
        }

        if (instruction.isError) {
            if (progressMsg) return progressMsg.edit(`❌ ${instruction.message}`);
            return message.reply(`❌ ${instruction.message}`);
        }

        if (!progressMsg) {
            progressMsg = await message.reply("⏳ Melanjutkan proses eksekusi...");
        }

        await message.channel.sendTyping();
        const resultMessage = await executeAiAction(message, instruction);
        const finalMessage = resultMessage?.trim() || "✅ Beres bos!";

        try {
            let sentMsg;
            if (finalMessage.length > 1900) {
                const chunks = finalMessage.match(/.{1,1900}/gs) || [];
                for (let i = 0; i < chunks.length; i++) {
                    if (i === 0 && progressMsg) {
                        sentMsg = await progressMsg.edit(chunks[i]);
                    } else {
                        sentMsg = await message.channel.send(chunks[i]);
                    }
                }
            } else {
                if (progressMsg) {
                    sentMsg = await progressMsg.edit(finalMessage).catch(() => message.reply(finalMessage));
                } else {
                    sentMsg = await message.reply(finalMessage).catch(() => message.channel.send(finalMessage));
                }
            }

            if (finalMessage.includes("?") || finalMessage.toLowerCase().includes("mana")) {
                if (sentMsg) saveContext(sentMsg.id, message.author.id, message.channel.id, instruction);
            }
        } catch (sendError) {
            console.error("Gagal kirim balasan:", sendError.message);
        }
    } catch (error) {
        console.error("Error Detail:", error);
        try {
            message.reply("Waduh, ada error pas AI nyoba mikir. Cek konsol!").catch(() => {});
        } catch (e) {}
    } finally {
        processingLock.delete(message.guild.id);
    }
});

client.login(process.env.TOKEN_BOT);