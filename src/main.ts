/**
 * @fileoverview Main entry point for application.
 * @author Andreas Kruhlmann
 * @since 1.0.0
 */

import * as discord from "discord.js";
import { handle_exception, log } from "./io";
import { LoggingLevel } from "./typings/types";
import * as config from "../config.json";
import * as captcha_generator from "./captchas";
import { createHash } from "crypto";
import * as psql from "./db"

// Global exception handling.
process.on("uncaughtException", handle_exception);
process.on("unhandledRejection", handle_exception);

const captcha_preface = "__**Fight Club Gatekeeping**__\n\nWelcome to the Fight Club Classic Warrior discord.\n\nMost channels in this discord are for **serious** theorycrafting and as such we ask you to please answer the question below, if you want write priviledges, to verify that you have at least some basic knowledge about the warrior class.\n\nYou can find the answer to your question if you throroughly read through the frequently asked questions channels.\n\n"

/**
 * Sends a captcha to a user to allow them to optain write permissions.
 *
 * @param user - User to send captcha to.
 */
function send_captcha(user: discord.GuildMember) {
    const captcha = captcha_generator.generate();
    const message = new discord.RichEmbed()
        .setTitle("Fight Club Captcha")
        .setDescription(captcha.text)
        .setThumbnail("https://img.rankedboost.com/wp-content/uploads/2019/05/WoW-Classic-Warrior-Guide-150x150.png")

    const hasher = createHash("sha256");
    hasher.update(captcha.seed + captcha.answer)

    user.send(captcha_preface)
    user.send(message);
    user.send(`\`${captcha.seed}:${hasher.digest("hex")}\``);
}

/**
 * Adds the default read-only role to all members without it.
 *
 * @param guild - Guild to apply read role to.
 * @param read_role - Role to apply to members.
 */
function role_routine(guild: discord.Guild, read_role: discord.Role): void {
    guild.members.forEach((user) => {
        const has_read_role = !!user.roles.find((role) => {
            return role.id === read_role.id;
        });

        if (!has_read_role) {
            user.addRole(read_role);
            const usr_str = `<${user.user.username}:${user.id}>`;
            const role_str = `<${read_role.name}:${read_role.id}>`;
            log(`Added read role ${role_str} to user ${usr_str}`);
        }
    });
}

// Main fucntion.
(async () => {
    // Init discord virtual client.
    const discord_client = new discord.Client();
    const dicord_token = config.deployment_mode === "production"
        ? config.discord_bot_token.production
        : config.discord_bot_token.development;

    const db = psql.connect()
    console.log(await db.get_captchas());

    log("Awaiting response from discord", LoggingLevel.DEV);

    discord_client.on("ready", () => {
        log(`Started gatekeeper in ${config.deployment_mode} mode`);

        const guild = discord_client.guilds.get(config.guild_id);
        const read_role = guild.roles.get(config.role_ids.read);

        role_routine(guild, read_role);
        setInterval(() => role_routine(guild, read_role), 5000);
    });

    discord_client.on("message", (message: discord.Message) => {
        const guild = discord_client.guilds.get(config.guild_id);
        const user = guild.members.get(message.author.id);

        if (message.channel.type !== "dm") {
            if (message.channel.id === config.trigger_channel_id && message.content === "!captcha") {
                // TODO: Don't send message to people who already have write roles.
                send_captcha(user);
            }
            return;
        }

        const channel = message.channel as discord.DMChannel;
        const messages_promise = channel.fetchMessages({});
        const write_role = guild.roles.get(config.role_ids.write);
        const has_write_role = !!user.roles.find((role) => {
            return role.id === config.role_ids.write;
        });

        // TODO: Re-add role restriction.
        if (/*has_write_role || */message.author.id === discord_client.user.id) {
            return;
        }

        messages_promise.then((messages: Map<any, discord.Message>) => {
            const queue: string[] = [];
            console.log(1)
            for (const [m_id, m] of messages.entries()) {
                console.log(2)
                if (m.author.id !== discord_client.user.id || !m.content.match(/\w+:\w{64,64}/g)) {
                    console.log("Skipping msg")
                    continue;
                }
                const seed = m.content.split(":")[0].replace("`", "");
                const answer = m.content.split(":")[1].replace("`", "");

                const hasher = createHash("sha256");
                hasher.update(seed + message.content);
                const user_answer = hasher.digest("hex");

                if (user_answer === answer) {
                    user.addRole(write_role);
                    const usr_str = `<${user.user.username}:${user.id}>`;
                    const role_str = `<${write_role.name}:${write_role.id}>`;
                    log(`Added read role ${role_str} to user ${usr_str}`);
                    queue.push(`\`${message.content}\` is correct. You've been given write permissions to the channels.`)
                } else {
                    queue.push(`\`${message.content}\` is not correct.`)
                }
                break;
            }

            if (queue.length > 0) {
                message.channel.send(queue[0])
            }
        });
    });

    // Authenticate.
    discord_client.login(dicord_token).catch(handle_exception);
})();

