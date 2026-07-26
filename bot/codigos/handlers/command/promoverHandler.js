// promoverHandler.js - Promover e Rebaixar admins
const frasesPromover = [
    '👑🎉 Parabéns! Você acaba de receber a administração do DﾑMﾑS Dﾑ NIGӇԵ! 🍾🔥',
    '🍾✨ Promoção concluída! Agora você faz parte da administração do DﾑMﾑS Dﾑ NIGӇԵ. 🌙👑',
    '🌙💃 Você recebeu a administração do DﾑMﾑS Dﾑ NIGӇԵ! Seja bem-vindo(a) à equipe. 🔥',
    '🔥👑 A administração do DﾑMﾑS Dﾑ NIGӇԵ agora também é sua. Parabéns pela promoção! 🍸✨',
    '💎🍾 Você foi promovido(a) a administrador(a) do DﾑMﾑS Dﾑ NIGӇԵ. Faça a Night brilhar ainda mais! 🌙',
    '🎭👑 Parabéns! Você recebeu a administração e agora faz parte da equipe que comanda o DﾑMﾑS Dﾑ NIGӇԵ. 🔥',
    '🥂🌙 Novo(a) administrador(a) do DﾑMﾑS Dﾑ NIGӇԵ! Desejamos muito sucesso nessa nova missão. 👑',
    '🎉💃 A promoção chegou! Você acaba de receber a administração do DﾑMﾑS Dﾑ NIGӇԵ. 🍾🔥',
];

const frasesRebaixar = [
    '⬇️😔 Sua administração no DﾑMﾑS Dﾑ NIGӇԵ foi encerrada. Até a próxima! 🍸',
    '🚪💨 Você deixou de ser administrador(a) do DﾑMﾑS Dﾑ NIGӇԵ. Foi uma boa jornada! 🌙',
    '😶‍🌫️👋 A administração do DﾑMﾑS Dﾑ NIGӇԵ foi removida. Sem ressentimentos! 🍾',
    '🔻🎭 Fim da missão! Você não faz mais parte da administração do DﾑMﾑS Dﾑ NIGӇԵ. 💔',
    '🌙😮 A Night segue, mas sem você na administração do DﾑMﾑS Dﾑ NIGӇԵ por agora. 🍸',
    '💼📤 Administração encerrada! O DﾑMﾑS Dﾑ NIGӇԵ agradece pelos serviços prestados. 👋',
    '🎤⬇️ Microfone desligado! Você foi removido(a) da administração do DﾑMﾑS Dﾑ NIGӇԵ. 🌙',
    '🚫👑 A coroa foi retirada! Você não é mais admin do DﾑMﾑS Dﾑ NIGӇԵ. Até logo! 🍾',
];

export async function handlePromoverRebaixar(sock, message, from, userId) {
    const content = message.message?.extendedTextMessage?.text
        || message.message?.conversation || '';
    const lower = content.toLowerCase().trim();

    if (!lower.startsWith('#promover') && !lower.startsWith('#rebaixar')) return false;
    if (!from.endsWith('@g.us')) return false;

    const groupMetadata = await sock.groupMetadata(from);
    const admins = groupMetadata.participants
        .filter(p => p.admin)
        .map(p => p.id);

    if (!admins.includes(userId)) {
        await sock.sendMessage(from, { text: '❌ Apenas admins podem usar esse comando.' });
        return true;
    }

    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0];

    if (!target) {
        await sock.sendMessage(from, { text: '❌ Marque alguém para usar o comando.' });
        return true;
    }

    if (lower.startsWith('#promover')) {
        if (admins.includes(target)) {
            await sock.sendMessage(from, {
                text: `⚠️ @${target.split('@')[0]} já é admin!`,
                mentions: [target]
            });
            return true;
        }

        await sock.groupParticipantsUpdate(from, [target], 'promote');

        const frase = frasesPromover[Math.floor(Math.random() * frasesPromover.length)];
        await sock.sendMessage(from, {
            text: `👏🍻 *DﾑMﾑS* 💃🔥 *Dﾑ* *NIGӇԵ* 💃🎶🍾🍸\n✅ *Promoção de Administrador*\n\n@${target.split('@')[0]} ${frase}`,
            mentions: [target]
        });
    }

    if (lower.startsWith('#rebaixar')) {
        if (!admins.includes(target)) {
            await sock.sendMessage(from, {
                text: `⚠️ @${target.split('@')[0]} não é admin!`,
                mentions: [target]
            });
            return true;
        }

        await sock.groupParticipantsUpdate(from, [target], 'demote');

        const frase = frasesRebaixar[Math.floor(Math.random() * frasesRebaixar.length)];
        await sock.sendMessage(from, {
            text: `👏🍻 *DﾑMﾑS* 💃🔥 *Dﾑ* *NIGӇԵ* 💃🎶🍾🍸\n❌⬇️ *Rebaixamento de Administrador(a)* ⬇️❌\n\n@${target.split('@')[0]} ${frase}`,
            mentions: [target]
        });
    }

    return true;
}