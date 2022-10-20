import * as Discord from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";

import { strict as assert } from "assert";

import * as fs from "fs";

import { critical_error, M } from "../utility/utils";
import { is_authorized_admin } from "../common";
import { GuildCommandManager } from "../infra/guild_command_manager";

import { cppref_index, cppref_page } from "../../cppref/types";
import { weighted_levenshtein } from "../utility/levenshtein";


let client: Discord.Client;

let index: cppref_index;

const color = 0x7289DA; // todo: use ping color? make this common?

export function tokenize(str: string) {
    // ~ is included, along with alphanumeric characters (and _?)
    return str.toLowerCase().split(/[^a-z0-9~]+/gi).filter(s => s != "");
}

export enum TargetIndex { C, CPP }

type candidate_entry = {
    page: cppref_page;
    score: number;
};

// exported for test case reasons
export function search(query: string, target: TargetIndex) {
    const query_tokens = tokenize(query);
    assert(query_tokens.length <= 32);
    const target_index = target == TargetIndex.C ? index.c : index.cpp;
    //let best_candidate: cppref_page | undefined = undefined;
    //let best_score: entry_score = [0, 0];
    const candidates: candidate_entry[] = [];
    for(const page of target_index) {
        const title_tokens = tokenize(page.title);
        const scores = query_tokens.map(
            query_token => Math.max(
                ...title_tokens.map(title_token => {
                    const d = weighted_levenshtein(title_token, query_token);
                    if(d == 0) return +1;
                    else if(title_token.startsWith(query_token)) return 1 - d;
                    else return -d;
                })
            )
        );
        const score = scores.reduce((previous, current) => previous + current, 0) - title_tokens.length * 0.01;
        //if(query == "std::getline" && page.title == "std::getline") {
        //    console.log("----->", page, score);
        //}
        candidates.push({
            page,
            score
        });
    }
    candidates.sort((a, b) => b.score - a.score);
    console.log(query, candidates.slice(0, 4).map(candidate => [candidate.score, candidate.page.title]));
    return candidates[0].page;
}

async function on_message(message: Discord.Message) {
    try {
        if(message.author.bot) return; // Ignore bots
        if(message.content.startsWith(".cref ") && is_authorized_admin(message.member!)) {
            const query = message.content.slice(".cref".length).trim();
        }
        if(message.content.startsWith(".cppref") && is_authorized_admin(message.member!)) {
            const query = message.content.slice(".cppref".length).trim();
            const result = search(query, TargetIndex.CPP);
            M.debug("cppref", [query, result]);
            message.channel.send({embeds: [
                new Discord.EmbedBuilder()
                    .setColor(color)
                    .setAuthor({
                        name: "cppreference.com",
                        iconURL: "https://en.cppreference.com/favicon.ico",
                        url: "https://en.cppreference.com"
                    })
                    .setTitle("foobar")
                    .setURL("https://en.cppreference.com/w/cpp/container/unordered_map/insert")
                    .addFields({
                        name: "Defined in",
                        value: "<test>"
                    })
            ]});
        }
    } catch(e) {
        critical_error(e);
    }
}

/*async function on_interaction_create(interaction: Discord.Interaction) {
    if(interaction.isCommand() && interaction.commandName == "echo") {
        assert(interaction.isChatInputCommand());
        const input = interaction.options.getString("input");
        M.debug("echo command", input);
        await interaction.reply({
            ephemeral: true,
            content: input || undefined
        });
    }
}*/

async function on_ready() {
    try {
        client.on("messageCreate", on_message);
        //client.on("interactionCreate", on_interaction_create);
    } catch(e) {
        critical_error(e);
    }
}

export function cppref_testcase_setup() {
    index = JSON.parse(fs.readFileSync("cppref/cppref_index.json", {encoding: "utf-8"})) as cppref_index;
}

export async function setup_cppref(_client: Discord.Client, guild_command_manager: GuildCommandManager) {
    try {
        client = _client;
        /*const echo = new SlashCommandBuilder()
            .setName("echo")
            .setDescription("Echo")
            .addStringOption(option =>
                option.setName("input")
                    .setDescription("The input to echo back")
                    .setRequired(true));
        guild_command_manager.register(echo);*/
        index = JSON.parse(await fs.promises.readFile("cppref/cppref_index.json", {encoding: "utf-8"})) as cppref_index;
        client.on("ready", on_ready);
    } catch(e) {
        critical_error(e);
    }
}