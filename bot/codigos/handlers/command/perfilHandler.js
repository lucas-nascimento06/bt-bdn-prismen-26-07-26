// bot/codigos/handlers/command/perfilHandler.js
import axios from 'axios';
import { Jimp, loadFont, HorizontalAlign } from 'jimp';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// 👤 SISTEMA DE PERFIL - ESTILO TROLL COM BARRA DE PORCENTAGEM
// Uso: #perfil          → exibe seu próprio perfil
//      #perfil @nome    → exibe o perfil de @nome
//      @nome #perfil    → exibe o perfil de @nome (também funciona!)
// ─────────────────────────────────────────────────────────────────────────────

const PERFIL_JSON_URL = 'https://raw.githubusercontent.com/lucas-nascimento06/perfil-integrantes-admins/refs/heads/main/perfil-frases.json';

const POSTER_URLS = [
    'https://i.ibb.co/wZzQ1rCB/1.png',
    'https://i.ibb.co/84RzKhsC/2.png',
    'https://i.ibb.co/xt9zypby/3.png',
    'https://i.ibb.co/bj3LXdfS/4.png',
    'https://i.ibb.co/fz0dG5MZ/5.png',
    'https://i.ibb.co/bMwxL8Y5/6.png',
    'https://i.ibb.co/6cCKMh6z/7.png',
    'https://i.ibb.co/pvvGPtz2/8.png',
    'https://i.ibb.co/kVYXT52C/9-copiar.png',
    'https://i.ibb.co/0yVVP69L/10-copiar.png',
];

// ── SLEEP ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── CAMINHOS DE FONTE (resolvidos uma vez em tempo de importação) ─────────────

const _require   = createRequire(import.meta.url);
const _pluginDir = dirname(_require.resolve('@jimp/plugin-print/package.json'));
const _fontsDir  = resolve(_pluginDir, 'dist/fonts/open-sans');

const FONT_32_WHITE = resolve(_fontsDir, 'open-sans-32-white/open-sans-32-white.fnt');
const FONT_16_WHITE = resolve(_fontsDir, 'open-sans-16-white/open-sans-16-white.fnt');

let perfilData = null;
let _font32    = null;
let _font16    = null;

// ── PRÉ-CARREGAMENTO DAS FONTES ───────────────────────────────────────────────

async function obterFontes() {
    if (_font32 && _font16) return { font32: _font32, font16: _font16 };
    try {
        _font32 = await loadFont(FONT_32_WHITE);
        _font16 = await loadFont(FONT_16_WHITE);
    } catch (err) {
        console.warn('⚠️ [PERFIL] Fontes não carregadas:', err.message);
        _font32 = null;
        _font16 = null;
    }
    return { font32: _font32, font16: _font16 };
}

// ── ADICIONAR TÍTULO NO POSTER ────────────────────────────────────────────────

async function adicionarTituloNoPoster(buffer) {
    try {
        const { font32, font16 } = await obterFontes();
        if (!font32 || !font16) return buffer;

        const image   = await Jimp.read(buffer);
        const W       = image.bitmap.width;
        const FAIXA_H = 105;

        image.scan(0, 0, W, FAIXA_H, (x, y, idx) => {
            image.bitmap.data[idx]     = Math.floor(image.bitmap.data[idx]     * 0.22);
            image.bitmap.data[idx + 1] = Math.floor(image.bitmap.data[idx + 1] * 0.22);
            image.bitmap.data[idx + 2] = Math.floor(image.bitmap.data[idx + 2] * 0.22);
        });

        image.print({
            font:     font32,
            x:        0,
            y:        10,
            text:     { text: 'Detector da Chiquinha', alignmentX: HorizontalAlign.CENTER },
            maxWidth: W
        });

        image.print({
            font:     font16,
            x:        0,
            y:        62,
            text:     { text: 'So Pra Quem Aguenta a Verdade', alignmentX: HorizontalAlign.CENTER },
            maxWidth: W
        });

        console.log('✅ [PERFIL] Título adicionado ao poster.');
        return await image.getBuffer('image/jpeg');
    } catch (err) {
        console.error('❌ [PERFIL] Erro ao adicionar título no poster:', err.message);
        return buffer;
    }
}

// ── CARREGAMENTO DO JSON ────────────────────────────────────────────────────

export async function carregarPerfilData() {
    try {
        console.log('🔄 Carregando dados de perfil...');
        const response = await axios.get(PERFIL_JSON_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            timeout: 15000
        });
        perfilData = response.data;
        console.log(`✅ Dados de perfil carregados!`);
        console.log(`   📊 Amorosa: ${perfilData.amorosa?.length || 0} frases`);
        console.log(`   📊 Grupo: ${perfilData.grupo?.length || 0} frases`);
        console.log(`   📊 Secreto: ${perfilData.secreto?.length || 0} frases`);
        console.log(`   📊 Gostosura: ${perfilData.gostosura?.length || 0} frases`);
        console.log(`   📊 Diagnóstico: ${perfilData.diagnostico?.length || 0} frases`);
        return true;
    } catch (err) {
        console.error('❌ Erro ao carregar dados de perfil:', err.message);
        throw err;
    }
}

function garantirData() {
    if (!perfilData) throw new Error('Dados não carregados. Chame carregarPerfilData() primeiro.');
}

// ── SORTEAR FRASE ALEATÓRIA DE UMA CATEGORIA ───────────────────────────────

function sortearFrase(categoria) {
    garantirData();
    const lista = perfilData[categoria];
    if (!lista || lista.length === 0) {
        return `⚠️ Categoria "${categoria}" vazia ou não encontrada.`;
    }

    const ativos = lista.filter(item => item.ativo === true);
    if (ativos.length === 0) return `⚠️ Nenhuma frase ativa na categoria "${categoria}".`;

    return ativos[Math.floor(Math.random() * ativos.length)].texto;
}

// ── MONTAR PERFIL ────────────────────────────────────────────────

function montarPerfil(nomeExibicao) {
    garantirData();

    const fraseAmorosa     = sortearFrase('amorosa');
    const fraseGrupo       = sortearFrase('grupo');
    const fraseSecreto     = sortearFrase('secreto');
    const fraseGostosura   = sortearFrase('gostosura');
    const fraseDiagnostico = sortearFrase('diagnostico');

    return (
        `𝗗𝗘𝗧𝗘𝗖𝗧𝗢𝗥 𝗗𝗔 𝗖𝗛𝗜𝗤𝗨𝗜𝗡𝗛𝗔 💣: 𝗦𝗼́ 𝗣𝗿𝗮 𝗤𝘂𝗲𝗺 𝗔𝗴𝘂𝗲𝗻𝘁𝗮 𝗮 𝗩𝗲𝗿𝗱𝗮𝗱𝗲\n` +
        `👤 @${nomeExibicao}\n\n` +

        `💔 🅐🅜🅞🅡🅞🅢🅐 :\n` +
        `${fraseAmorosa}\n\n` +

        `👥 🅝🅞 🅖🅡🅤🅟🅞 :\n` +
        `${fraseGrupo}\n\n` +

        `🤫🔍 🅥🅔🅡🅓🅐🅓🅔🅢 :\n` +
        `${fraseSecreto}\n\n` +

        `🥵🔥 🅖🅞🅢🅣🅞🅢🅤🅡🅐 :\n` +
        `${fraseGostosura}\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🧠🧐 🅓🅘🅐🅖🅝🅞🅢🅣🅘🅒🅞 :\n` +
        `${fraseDiagnostico}`
    );
}

// ── HELPERS ────────────────────────────────────────────────────────────────

async function gerarThumbnail(buffer, size = 256) {
    try {
        const image = await Jimp.read(buffer);
        image.scaleToFit({ w: size, h: size });
        return await image.getBuffer('image/jpeg');
    } catch (err) {
        console.error('Erro ao gerar thumbnail:', err);
        return null;
    }
}

async function baixarImagemPoster() {
    const posterUrl = POSTER_URLS[Math.floor(Math.random() * POSTER_URLS.length)];

    try {
        console.log('🖼️ Baixando poster de perfil...');
        const response = await axios.get(posterUrl, { responseType: 'arraybuffer' });

        let buffer = Buffer.from(response.data, 'binary');
        if (buffer.length < 1000) return null;

        console.log(`✅ Poster baixado: ${buffer.length} bytes`);
        buffer = await adicionarTituloNoPoster(buffer);
        return buffer;
    } catch (err) {
        console.error('❌ Erro ao baixar poster:', err.message);
        return null;
    }
}

// ── RESOLVER SENDER REAL ──────────────────────────────────────────────────

function resolverSenderId(message) {
    const key = message.key;
    if (key.participantAlt && key.participantAlt.endsWith('@s.whatsapp.net')) {
        return key.participantAlt;
    }
    if (key.participant && key.participant.endsWith('@s.whatsapp.net')) {
        return key.participant;
    }
    return key.participant || key.remoteJid;
}

// ── HANDLER PRINCIPAL ──────────────────────────────────────────────────────
// Usa a mesma lógica do golpeHandler:
// MODO 1 → reply numa mensagem
// MODO 2 → menção direta (@pessoa)
// MODO 3 → sem alvo → gera perfil do próprio remetente

export async function perfilHandler(sock, message) {
    try {
        console.log('🔍 [PERFIL] Handler iniciado');

        const { key, message: msg } = message;
        const from = key.remoteJid;

        const contextInfo  = msg?.extendedTextMessage?.contextInfo;
        const mentionedJid = contextInfo?.mentionedJid;

        const senderId = resolverSenderId(message);

        let jidAlvo = null;

        // MODO 1: reply numa mensagem de alguém — igual ao golpeHandler
        if (contextInfo?.participant) {
            const quotedParticipant = contextInfo?.participantAlt || contextInfo?.participant;
            if (quotedParticipant && contextInfo?.quotedMessage) {
                jidAlvo = quotedParticipant;
                console.log('🧪 [PERFIL] Modo: REPLY → jidAlvo:', jidAlvo);
            }
        }

        // MODO 2: menção direta — @pessoa #perfil ou #perfil @pessoa
        if (!jidAlvo && mentionedJid?.length > 0) {
            jidAlvo = mentionedJid[0];
            console.log('🧪 [PERFIL] Modo: MENÇÃO → jidAlvo:', jidAlvo);
        }

        // MODO 3: sem alvo → perfil do próprio remetente
        if (!jidAlvo) {
            jidAlvo = senderId;
            console.log('🧪 [PERFIL] Modo: PRÓPRIO → jidAlvo:', jidAlvo);
        }

        const numeroExibicao = jidAlvo.split('@')[0];

        const mentionsFinais = jidAlvo === senderId
            ? [senderId]
            : [jidAlvo, senderId];

        const replyContext = {
            stanzaId:      key.id,
            participant:   key.participant || key.remoteJid,
            quotedMessage: msg
        };

        console.log(`👤 [PERFIL] Gerando perfil para: ${numeroExibicao} | JID: ${jidAlvo}`);

        // ⏳ MENSAGEM 1 — suspense inicial
        await sock.sendMessage(
            from,
            { text: `⏳ _Só um momento... estou analisando @${numeroExibicao}..._`, mentions: [jidAlvo] },
            { quoted: message }
        );

        await sleep(3000);

        // ⏳ MENSAGEM 2 — mais suspense
        await sock.sendMessage(
            from,
            { text: `🔍 _Vasculhando os dados... quase lá..._` },
            { quoted: message }
        );

        await sleep(3000);

        // ⏳ MENSAGEM 3 — suspense máximo
        await sock.sendMessage(
            from,
            { text: `🧠 _Processando resultado final... prepare-se!_` },
            { quoted: message }
        );

        await sleep(2000);

        const perfilCompleto = montarPerfil(numeroExibicao);

        // ── Tentar enviar com poster + título ─────────────────────────────
        const posterBuffer = await baixarImagemPoster();

        if (posterBuffer) {
            const thumb = await gerarThumbnail(posterBuffer, 256);
            try {
                await sock.sendMessage(from, {
                    image:         posterBuffer,
                    caption:       perfilCompleto,
                    mentions:      mentionsFinais,
                    jpegThumbnail: thumb,
                    contextInfo:   replyContext
                });
                console.log('✅ [PERFIL] Poster + perfil enviados!');
                return;
            } catch (e) {
                console.warn('⚠️ [PERFIL] Falha ao enviar imagem, enviando só texto:', e.message);
            }
        }

        // ── Fallback: apenas texto ─────────────────────────────────────────
        await sock.sendMessage(from, {
            text:     perfilCompleto,
            mentions: mentionsFinais,
            quoted:   message
        });

        console.log('✅ [PERFIL] Perfil enviado como texto!');

    } catch (err) {
        console.error('❌ [PERFIL] Erro:', err.message);
        const from = message.key.remoteJid;
        await sock.sendMessage(from, {
            text:   `❌ Erro ao gerar perfil: ${err.message}`,
            quoted: message
        });
    }
}

export async function atualizarPerfilHandler(sock, message) {
    const from     = message.key.remoteJid;
    const senderId = resolverSenderId(message);

    await sock.sendMessage(from, {
        text:     '🔄 Recarregando dados de perfil do GitHub...',
        mentions: [senderId],
        quoted:   message
    });

    try {
        await carregarPerfilData();
        await sock.sendMessage(from, {
            text:     `✅ Dados atualizados!\n📊 Carregado com sucesso.`,
            mentions: [senderId],
            quoted:   message
        });
        console.log('✅ [RELOAD PERFIL] Dados recarregados via comando.');
    } catch (err) {
        await sock.sendMessage(from, {
            text:     `❌ Erro ao recarregar dados: ${err.message}`,
            mentions: [senderId],
            quoted:   message
        });
        console.error('❌ [RELOAD PERFIL] Falha:', err.message);
    }
}

// ── INICIALIZAÇÃO ────────────────────────────────────────────────────────

Promise.all([
    carregarPerfilData().catch(err => console.error('❌ Erro ao inicializar dados de perfil:', err)),
    obterFontes()
]);