// bot/codigos/musicaHandler.js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Jimp } from 'jimp';
import translate from 'google-translate-api-x';
import { buscarLetra } from './extrairLetraHandler.js';
import { baixarMusicaBuffer, obterDadosMusica, buscarUrlPorNome } from './download.util.js';

let processandoMusica = false;
const filaMusicas = [];

// ============================================
// 🎨 CONSTANTES DE IDENTIDADE VISUAL DA LETRA
// ============================================
const RODAPE = `©𝘋𝘢𝘮𝘢𝘴 𝘥𝘢 𝘕𝘪𝘨𝘩𝘵`;
const TITULO = `👏🍻 *DﾑMﾑS* 💃🔥 *Dﾑ* *NIGӇԵ* 💃🎶🍾🍸`;
const BANNER_URL = 'https://i.ibb.co/p6TmfFFs/music.png';

// ============================================
// 🌐 TRADUÇÃO DA LETRA (via google-translate-api-x)
// ============================================
// Anteriormente usava a API da Mistral (paga). Trocado para
// google-translate-api-x, que usa o motor do Google Tradutor de forma
// gratuita. Se falhar (bloqueio, timeout, etc), mantém a letra original
// no idioma em que veio (ex: inglês) em vez de travar o fluxo.
const IDIOMA_ALVO = 'pt';

// ============================================
// 🕵️ DETECTA SE O TEXTO JÁ ESTÁ EM PORTUGUÊS
// (heurística simples baseada em palavras comuns do PT-BR;
// evita gastar uma chamada de tradução pra letras que já estão em PT)
// ============================================
function pareceJaEmPortugues(texto) {
    const amostra = texto.toLowerCase();
    const marcadoresPt = [
        ' que ', ' não ', ' você ', ' para ', ' com ', ' uma ', ' está ',
        ' eu ', ' meu ', ' minha ', ' você', ' ção', ' são ', ' já '
    ];
    let acertos = 0;
    for (const marcador of marcadoresPt) {
        if (amostra.includes(marcador)) acertos++;
    }
    // Se encontrar vários marcadores típicos de PT, assume que já está em português
    return acertos >= 3;
}

async function traduzirLetraViaGoogle(texto) {
    try {
        const res = await translate(texto, { to: IDIOMA_ALVO });
        const traducao = res?.text?.trim() || null;
        return traducao;
    } catch (err) {
        console.error('❌ Erro ao traduzir letra via Google:', err.message);
        return null;
    }
}

// ============================================
// 🌐 TRADUZ A LETRA PARA PT-BR SE NÃO ESTIVER EM PORTUGUÊS
// ============================================
async function traduzirLetraSeIngles(letra) {
    try {
        if (pareceJaEmPortugues(letra)) {
            console.log('🌐 Letra já parece estar em português, não vou traduzir.');
            return { texto: letra, traduzida: false };
        }

        console.log('🌐 Letra não parece estar em português, tentando traduzir...');
        const traducao = await traduzirLetraViaGoogle(letra);

        if (traducao && traducao.trim() !== letra.trim()) {
            console.log('🌐 Letra traduzida com sucesso.');
            return { texto: traducao, traduzida: true };
        }

        console.warn('⚠️ Tradução falhou ou voltou igual ao original, mantendo letra original (idioma original).');
        return { texto: letra, traduzida: false };
    } catch (err) {
        console.error('❌ Erro ao traduzir letra:', err.message);
        // Se a tradução falhar, mantém a letra original pra não perder o conteúdo
        return { texto: letra, traduzida: false };
    }
}

function limparNomeArquivo(nome) {
    return nome
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100);
}

// ============================================
// 🧹 REMOVE SUFIXO "- Topic" DO NOME DO ARTISTA
// (vem de canais auto-gerados do YouTube, ex: "Leandro & Leonardo - Topic")
// ============================================
function limparNomeArtista(nome) {
    if (!nome) return nome;
    return nome
        .replace(/\s*-\s*Topic\s*$/i, '')
        .trim();
}

async function gerarThumbnail(buffer, size = 256) {
    try {
        const image = await Jimp.read(buffer);
        image.scaleToFit({ w: size, h: size });
        return await image.getBuffer("image/jpeg");
    } catch (err) {
        console.error('Erro ao gerar thumbnail:', err);
        return null;
    }
}

function formatarDuracao(segundos) {
    if (!segundos) return '0:00';
    const minutos = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${minutos}:${segs.toString().padStart(2, '0')}`;
}

function extrairVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /\/vi_webp\/([a-zA-Z0-9_-]{11})\//,
        /\/vi\/([a-zA-Z0-9_-]{11})\//,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            console.log(`✅ VideoID extraído: ${match[1]}`);
            return match[1];
        }
    }
    return null;
}

function gerarUrlsThumbnail(url) {
    const videoId = extrairVideoId(url);
    if (!videoId) return [url];
    console.log(`🔄 Gerando URLs alternativas para VideoID: ${videoId}`);
    return [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/default.jpg`,
        url
    ];
}

async function baixarThumbnailComJimp(url) {
    const urlsParaTestar = gerarUrlsThumbnail(url);
    console.log(`📋 Total de URLs para testar: ${urlsParaTestar.length}`);

    for (let i = 0; i < urlsParaTestar.length; i++) {
        const urlAtual = urlsParaTestar[i];
        try {
            console.log(`🖼️ Tentativa ${i + 1}/${urlsParaTestar.length}: ${urlAtual}`);
            const response = await axios.get(urlAtual, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                maxRedirects: 5,
                validateStatus: (status) => status === 200
            });

            const imageBuffer = Buffer.from(response.data);
            console.log(`📦 Buffer baixado: ${imageBuffer.length} bytes`);

            if (imageBuffer.length < 5000) {
                console.log(`⚠️ Imagem muito pequena, tentando próxima...`);
                continue;
            }

            const image = await Jimp.read(imageBuffer);
            console.log(`📐 Dimensões originais: ${image.bitmap.width}x${image.bitmap.height}`);

            if (image.bitmap.width > 1280 || image.bitmap.height > 720) {
                image.scaleToFit({ w: 1280, h: 720 });
            }

            const processedBuffer = await image.getBuffer("image/jpeg");
            console.log(`✅ Imagem processada: ${processedBuffer.length} bytes`);

            if (processedBuffer.length > 5 * 1024 * 1024) {
                image.scaleToFit({ w: 640, h: 360 });
                return await image.getBuffer("image/jpeg");
            }

            return processedBuffer;
        } catch (error) {
            console.log(`⚠️ Falha na URL ${i + 1}: ${error.message}`);
        }
    }

    console.error('❌ Todas as URLs de thumbnail falharam');
    return null;
}

async function baixarImagemPoster() {
    try {
        console.log('🖼️ Baixando imagem do poster inicial...');
        const response = await axios.get('https://i.ibb.co/XrWL1ZnG/damas-neon.jpg', {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
            maxRedirects: 5
        });
        const buffer = Buffer.from(response.data, 'binary');
        console.log(`✅ Imagem do poster baixada: ${buffer.length} bytes`);
        if (buffer.length < 1000) return null;
        return buffer;
    } catch (error) {
        console.error('❌ Erro ao baixar poster:', error.message);
        return null;
    }
}

// ============================================
// 🖼️ BAIXA O BANNER USADO NA LETRA
// ============================================
async function baixarBannerLetra() {
    try {
        console.log('🖼️ Baixando banner da letra...');
        const response = await axios.get(BANNER_URL, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
            maxRedirects: 5
        });
        const buffer = Buffer.from(response.data, 'binary');
        console.log(`✅ Banner da letra baixado: ${buffer.length} bytes`);
        if (buffer.length < 1000) return null;
        return buffer;
    } catch (error) {
        console.error('❌ Erro ao baixar banner da letra:', error.message);
        return null;
    }
}

async function sendMediaWithThumbnail(sock, jid, buffer, caption, mentions = []) {
    try {
        const thumb = await gerarThumbnail(buffer, 256);
        await sock.sendMessage(jid, { image: buffer, caption, mentions, jpegThumbnail: thumb });
        console.log('✅ Imagem enviada com thumbnail!');
        return true;
    } catch (err) {
        console.error('❌ Erro ao enviar com thumbnail:', err.message);
        try {
            await sock.sendMessage(jid, { image: buffer, caption, mentions });
            console.log('✅ Imagem enviada sem thumbnail (fallback)!');
            return true;
        } catch (err2) {
            console.error('❌ Erro ao enviar imagem (fallback):', err2.message);
            return false;
        }
    }
}

async function processarFila() {
    if (processandoMusica || filaMusicas.length === 0) return;
    processandoMusica = true;
    const { sock, from, termo, senderId, messageKey, originalMessage } = filaMusicas.shift();
    try {
        await baixarEEnviarMusica(sock, from, termo, senderId, messageKey, originalMessage);
    } catch (error) {
        console.error('Erro ao processar música da fila:', error);
    } finally {
        processandoMusica = false;
        if (filaMusicas.length > 0) setTimeout(() => processarFila(), 2000);
    }
}

async function baixarEEnviarMusica(sock, from, termo, senderId, messageKey, originalMessage) {
    const caminhoCompleto = path.join('./downloads', `temp_${Date.now()}.mp3`);
    let dados = null;
    let url = null;

    try {
        // ── 1. POSTER INICIAL ────────────────────────────────────────────────
        console.log('📸 Iniciando download do poster...');
        const posterBuffer = await baixarImagemPoster();

        const captionPoster =
            `👏🍻 *DﾑMﾑS* 💃🔥 *Dﾑ* *NIGӇԵ* 💃🎶🍾🍸\n\n` +
            `@${senderId.split('@')[0]}\n\n` +
            `🎧🎶 Preparando pra te entregar o hit: "${termo}"! 🎶💃🕺🔥\n\n` +
            `💡 *DICA DE OURO:* 🎯\n` +
            `Para resultados mais precisos use:\n` +
            `📝 *#play [cantor/banda - música]*\n` +
            `✨ Exemplo: _#play Bon Jovi - Always_`;

        if (posterBuffer) {
            console.log('✅ Poster baixado, enviando...');
            const enviado = await sendMediaWithThumbnail(sock, from, posterBuffer, captionPoster, [senderId]);
            if (!enviado) {
                await sock.sendMessage(from, { text: captionPoster, mentions: [senderId], quoted: originalMessage });
            }
        } else {
            await sock.sendMessage(from, { text: captionPoster, mentions: [senderId], quoted: originalMessage });
        }

        // ── 2. BUSCA DADOS DA MÚSICA ─────────────────────────────────────────
        console.log(`🔍 Buscando: ${termo}`);
        url = await buscarUrlPorNome(termo);

        console.log(`📊 Obtendo dados da música...`);
        dados = await obterDadosMusica(url);

        // 🧹 Remove sufixo "- Topic" (canais auto-gerados do YouTube)
        dados.autor = limparNomeArtista(dados.autor);
        dados.titulo = limparNomeArtista(dados.titulo);

        console.log(`📄 Dados obtidos: ${dados.titulo} - ${dados.autor}`);

        // ── 3. BUSCA E ENVIA A LETRA (ANTES DO ÁUDIO) ────────────────────────
        // Agora letra + banner vão numa ÚNICA mensagem: imagem com a letra na legenda.
        try {
            console.log(`📖 Buscando letra: ${dados.titulo} - ${dados.autor}`);
            const letra = await buscarLetra(dados.autor, dados.titulo);

            if (letra) {
                const { texto: letraFinal, traduzida } = await traduzirLetraSeIngles(letra);

                const legendaLetra =
                    `${TITULO}\n` +
                    `#musicaboa 🔥 Não tem idade, tem atitude 💃 #damasdanight #amizade #liberdade #diversao #atitude\n\n` +
                    `@${senderId.split('@')[0]}\n\n` +
                    `🎼📖 *${dados.titulo} - ${dados.autor}*\n\n` +
                    `${letraFinal}\n\n` +
                    `_🍋🧂🥃 Se a vida te der limão, pede sal e tequila e se joga! 🎉_\n\n` +
                    `${RODAPE}`;

                const bannerBuffer = await baixarBannerLetra();

                if (bannerBuffer) {
                    // Tenta mandar tudo junto: imagem do banner + letra na legenda
                    const enviouJunto = await sendMediaWithThumbnail(
                        sock, from, bannerBuffer, legendaLetra, [senderId]
                    );
                    if (enviouJunto) {
                        console.log(`✅ Letra + banner enviados juntos!`);
                    } else {
                        // Fallback: se falhar mandar como imagem (ex: legenda grande demais
                        // ou WhatsApp rejeitando payload), manda só o texto da letra.
                        console.warn('⚠️ Falha ao enviar letra+banner juntos, caindo para texto puro.');
                        await sock.sendMessage(from, { text: legendaLetra, mentions: [senderId] });
                    }
                } else {
                    // Sem banner disponível, manda só o texto da letra.
                    console.warn('⚠️ Banner da letra indisponível, enviando apenas texto.');
                    await sock.sendMessage(from, { text: legendaLetra, mentions: [senderId] });
                }
            } else {
                console.log(`⚠️ Letra não encontrada para: ${dados.titulo} - ${dados.autor}`);
            }
        } catch (letraErr) {
            console.error('❌ Erro ao buscar/enviar letra:', letraErr.message);
        }

        // ── 4. THUMBNAIL + INFO ──────────────────────────────────────────────
        let thumbnailEnviada = false;
        if (dados.thumbnailUrl) {
            console.log(`🖼️ Processando thumbnail...`);
            const thumbnailBuffer = await baixarThumbnailComJimp(dados.thumbnailUrl);

            if (thumbnailBuffer) {
                try {
                    const thumb = await gerarThumbnail(thumbnailBuffer, 256);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await sock.sendMessage(from, {
                        image: thumbnailBuffer,
                        caption:
                            `👏🍻 *DﾑMﾑS* 💃🔥 *Dﾑ* *NIGӇԵ* 💃🎶🍾🍸\n\n` +
                            `♫♪♩·.¸¸.·♩♪♫ ෴💞෴ ෴💞෴\n\n` +
                            `🎼 *${dados.titulo}*\n` +
                            `🎙️ *${dados.autor}*\n` +
                            `⏰ Duração: ${formatarDuracao(dados.duracao)}\n\n` +
                            `♫♪♩·.¸¸.·♩♪♫ ෴💞෴ ෴💞෴\n\n` +
                            `#NoitePerfeita #DamasDaNight #VibeBoa\n\n` +
                            `@${senderId.split('@')[0]}\n\n` +
                            `💃✨🅢🅘🅝🅣🅐 🅞 🅡🅘🅣🅜🅞. 🅑🅡🅘🅛🅗🅔 🅝🅐 🅟🅘🅢🅣🅐✨🕺\n` +
                            `⬇️ 𝙱𝙰𝙸𝚇𝙰𝙽𝙳𝙾 𝚂𝙴𝚄 𝙷𝙸𝚃... 🎧\n💃 𝙿𝚁𝙴𝙿𝙰𝚁𝙰 𝙿𝚁𝙰 𝙳𝙰𝙽𝙲̧𝙰𝚁! 🕺\n`+
                            `🔥 𝙰 𝙵𝙴𝚂𝚃𝙰 𝚅𝙰𝙸 𝙲𝙾𝙼𝙴𝙲̧𝙰𝚁! 🎉`,
                        jpegThumbnail: thumb,
                        mentions: [senderId],
                        contextInfo: {
                            stanzaId: originalMessage.key.id,
                            participant: originalMessage.key.participant || originalMessage.key.remoteJid,
                            quotedMessage: originalMessage.message
                        }
                    });
                    console.log(`✅ Thumbnail enviada!`);
                    thumbnailEnviada = true;
                } catch (sendErr) {
                    console.error('❌ Erro ao enviar thumbnail:', sendErr.message);
                }
            }
        }

        if (!thumbnailEnviada) {
            await sock.sendMessage(from, {
                text:
                    `💃🔥 *DﾑMﾑS Dﾑ NIGӇԵ* 🔥💃\n\n` +
                    `🎵 *${dados.titulo}*\n` +
                    `🎤 *${dados.autor}*\n` +
                    `⏱️ Duração: ${formatarDuracao(dados.duracao)}\n\n` +
                    `@${senderId.split('@')[0]}\n\n` +
                    `⬇️ Baixando... 🎧`,
                mentions: [senderId],
                contextInfo: {
                    stanzaId: originalMessage.key.id,
                    participant: originalMessage.key.participant || originalMessage.key.remoteJid,
                    quotedMessage: originalMessage.message
                }
            });
        }

        // ── 5. DOWNLOAD E ENVIO DO ÁUDIO ─────────────────────────────────────
        console.log(`⬇️ Baixando áudio: ${dados.titulo} - ${dados.autor}`);
        const result = await baixarMusicaBuffer(url);

        const nomeFormatado = limparNomeArquivo(`${dados.autor} - ${dados.titulo}`);
        const nomeArquivo = `${nomeFormatado}.mp3`;
        const caminhoFinal = path.join('./downloads', nomeArquivo);

        fs.writeFileSync(caminhoCompleto, result.buffer);
        if (fs.existsSync(caminhoFinal)) fs.unlinkSync(caminhoFinal);
        fs.renameSync(caminhoCompleto, caminhoFinal);

        console.log(`📤 Enviando áudio: ${nomeArquivo}`);
        try {
            const sentAudio = await sock.sendMessage(from, {
                audio: fs.readFileSync(caminhoFinal),
                mimetype: 'audio/mpeg',
                fileName: nomeArquivo,
                ptt: false,
                contextInfo: {
                    stanzaId: originalMessage.key.id,
                    participant: originalMessage.key.participant || originalMessage.key.remoteJid,
                    quotedMessage: originalMessage.message
                }
            });
            console.log(`✅ Áudio enviado!`, sentAudio?.key);
        } catch (audioErr) {
            console.error(`❌ Erro ao enviar áudio:`, audioErr.message);
        }

        if (fs.existsSync(caminhoFinal)) fs.unlinkSync(caminhoFinal);

        console.log(`✅ Música enviada com sucesso!`);

    } catch (err) {
        console.error('❌ Erro ao processar música:', err);
        if (fs.existsSync(caminhoCompleto)) fs.unlinkSync(caminhoCompleto);

        let mensagemErro = `❌ Ops! Não consegui baixar "${termo}".`;
        if (err.message?.includes('EBUSY')) {
            mensagemErro += '\n⏳ Bot ocupado, tente novamente em instantes.';
        } else if (err.message?.includes('No video found')) {
            mensagemErro += '\n🔍 Não encontrei. Tente: [música - cantor/banda]';
        } else if (err.message?.includes('timeout')) {
            mensagemErro += '\n⏱️ Tempo esgotado. Tente uma música mais curta.';
        }

        await sock.sendMessage(from, {
            text: `@${senderId.split('@')[0]}\n\n${mensagemErro}`,
            mentions: [senderId],
            quoted: originalMessage
        });
    }
}

export async function handleMusicaCommands(sock, message, from) {
    const content = message.message?.conversation ||
                    message.message?.extendedTextMessage?.text || '';
    const lowerContent = content.toLowerCase().trim();

    if (!lowerContent.startsWith('#play ')) return false;

    // Se tiver @menção = é dedicatória, deixa o dedicatoriaHandler tratar
    const temMencaoNoTexto = /@\S+/.test(content);
    const temMencaoResolvida = (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length || 0) > 0;
    if (temMencaoNoTexto || temMencaoResolvida) return false;

    const termo = content.replace(/^#play\s*/i, '').trim();
    const senderId = message.key.participant || message.key.remoteJid;
    const messageKey = message.key;
    const originalMessage = message;

    console.log(`👤 SenderId extraído: ${senderId}`);

    if (!termo) {
        await sock.sendMessage(from, {
            text: `@${senderId.split('@')[0]}\n\nUso correto: *#play [música - cantor/banda]*\nExemplo: _#play Envolver - Anitta_`,
            mentions: [senderId],
            quoted: originalMessage
        });
        return true;
    }

    filaMusicas.push({ sock, from, termo, senderId, messageKey, originalMessage });

    if (filaMusicas.length > 1) {
        await sock.sendMessage(from, {
            text: `@${senderId.split('@')[0]}\n\n⏳ Sua música está na fila! Posição: ${filaMusicas.length}\n💃 Aguarde um momento... 🎵`,
            mentions: [senderId],
            quoted: originalMessage
        });
    }

    processarFila();
    return true;
}