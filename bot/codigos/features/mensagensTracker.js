import { registrarMensagem } from '../utils/rainhaModel.js';

// 🔥 CACHE ANTI-DUPLICATA APENAS
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 200;

// 🔥 TODOS OS TIPOS DE MENSAGEM QUE DEVEM SER CONTADOS
const TIPOS_VALIDOS = new Set([
    'conversation',
    'extendedTextMessage',
    'imageMessage',
    'videoMessage',
    'stickerMessage',
    'audioMessage',
    'voiceMessage',
    'ptvMessage',
    'documentMessage',
    'documentWithCaptionMessage',
    'reactionMessage',
    'locationMessage',
    'liveLocationMessage',
    'contactMessage',
    'contactsArrayMessage',
    'gifMessage',
    'buttonsResponseMessage',
    'listResponseMessage',
    'templateButtonReplyMessage',
]);

function extractDigits(number) {
    if (!number) return null;
    return number.replace(/@.*$/, '').replace(/\D/g, '');
}

function isMessageProcessed(messageKey) {
    const uniqueId = `${messageKey.remoteJid}_${messageKey.id}`;
    if (processedMessages.has(uniqueId)) return true;
    processedMessages.add(uniqueId);
    if (processedMessages.size > MESSAGE_CACHE_LIMIT) {
        const toDelete = processedMessages.size - MESSAGE_CACHE_LIMIT;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
    return false;
}

function getNumeroReal(message) {
    if (message.key.participantAlt) return message.key.participantAlt;
    if (message.key.participant) return message.key.participant;
    return null; // nunca usa remoteJid para evitar salvar o ID do grupo
}

function desembrulharMensagem(msg) {
    // Desembrulha todas as camadas possíveis do Baileys
    if (msg?.ephemeralMessage?.message) return desembrulharMensagem(msg.ephemeralMessage.message);
    if (msg?.viewOnceMessage?.message) return desembrulharMensagem(msg.viewOnceMessage.message);
    if (msg?.viewOnceMessageV2?.message) return desembrulharMensagem(msg.viewOnceMessageV2.message);
    if (msg?.editedMessage?.message) return desembrulharMensagem(msg.editedMessage.message);
    if (msg?.documentWithCaptionMessage?.message) return msg; // mantém o wrapper, tem tipo válido
    return msg;
}

function getMessageType(msg) {
    for (const tipo of Object.keys(msg)) {
        if (TIPOS_VALIDOS.has(tipo)) {
            return tipo;
        }
    }
    return null;
}

function getTipoExibicao(tipoMsg) {
    const mapa = {
        conversation:                'texto',
        extendedTextMessage:         'texto',
        imageMessage:                'imagem',
        videoMessage:                'vídeo',
        stickerMessage:              'sticker',
        audioMessage:                'áudio',
        voiceMessage:                'áudio',
        ptvMessage:                  'vídeo',
        documentMessage:             'documento',
        documentWithCaptionMessage:  'documento',
        reactionMessage:             'reação',
        locationMessage:             'localização',
        liveLocationMessage:         'localização',
        contactMessage:              'contato',
        contactsArrayMessage:        'contato',
        gifMessage:                  'gif',
        buttonsResponseMessage:      'resposta',
        listResponseMessage:         'resposta',
        templateButtonReplyMessage:  'resposta',
    };
    return mapa[tipoMsg] || tipoMsg;
}

export async function trackMensagem(client, message) {
    try {
        // Verificação de duplicata
        if (isMessageProcessed(message.key)) return;

        // Só processa grupos
        if (!message?.key?.remoteJid?.endsWith('@g.us')) return;

        // Ignora mensagens do próprio bot
        if (message.key.fromMe) return;

        let msg = message.message;
        if (!msg) return;

        // Desembrulha todas as camadas (ephemeral, viewOnce, etc.)
        msg = desembrulharMensagem(msg);
        if (!msg) return;

        // Detecta o tipo da mensagem
        const tipoMsg = getMessageType(msg);

        // Se não reconheceu o tipo, loga para debug mas não descarta
        if (!tipoMsg) {
            console.log(`⚠️ [trackMensagem] Tipo não reconhecido, keys: ${Object.keys(msg).join(', ')}`);
            return;
        }

        const grupoId = message.key.remoteJid;

        // Pega o número real do usuário
        const numeroCompleto = getNumeroReal(message);
        if (!numeroCompleto) return;

        let numeroLimpo = extractDigits(numeroCompleto);

        // Corrige se ainda tiver LID
        if (!numeroLimpo || numeroLimpo.includes('lid') || numeroLimpo.length < 10) {
            if (message.key.participantAlt) {
                const altLimpo = extractDigits(message.key.participantAlt);
                if (altLimpo && !altLimpo.includes('lid') && altLimpo.length >= 10) {
                    numeroLimpo = altLimpo;
                }
            }
        }

        if (!numeroLimpo || numeroLimpo.length < 10) return;

        const tipoExibicao = getTipoExibicao(tipoMsg);
        console.log(`✅ CONTANDO: ${tipoExibicao} de ${numeroLimpo}`);

        const nome = message.pushName || 'Desconhecido';

        await registrarMensagem(grupoId, numeroLimpo, nome, null);
        console.log(`💾 SALVO: ${tipoExibicao} - ${numeroLimpo}`);

    } catch (err) {
        console.error('[trackMensagem] Erro:', err.message);
    }
}