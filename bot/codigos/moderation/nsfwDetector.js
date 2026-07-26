// nsfwDetector.js - Detector NSFW para Imagens, Stickers e Vídeos
import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const execPromise = promisify(exec);

// ============================================
// ⚙️ CONFIGURAÇÕES
// ============================================
const CONFIG = {
    apiUser: '1675050557',
    apiSecret: 'VCgsJL9qxBaZ9VQZNbtibaeeYYBbSweD',
    limiteNsfw: 0.7,
    timeoutMs: 15000,
    tempDir: join(process.cwd(), 'temp'),
};

// ============================================
// 🔧 CONVERTER WEBP → PNG (stickers)
// ============================================
async function webpParaPng(bufferWebp) {
    const timestamp = Date.now();
    const inputPath  = join(CONFIG.tempDir, `sticker_${timestamp}.webp`);
    const outputPath = join(CONFIG.tempDir, `sticker_${timestamp}.png`);
    const gifPath    = join(CONFIG.tempDir, `sticker_${timestamp}.gif`);

    try {
        // Método 1: Sharp (melhor para WebP animado do WhatsApp)
        try {
            const pngBuffer = await sharp(bufferWebp, { pages: 1 })
                .png()
                .toBuffer();
            if (pngBuffer && pngBuffer.length > 100) {
                console.log('✅ Sticker convertido (Método 1: Sharp)');
                return pngBuffer;
            }
        } catch (e) {
            console.log('⚠️ Sharp falhou:', e.message);
        }

        // Método 2: Sharp página 0
        try {
            const pngBuffer = await sharp(bufferWebp, { page: 0 })
                .png()
                .toBuffer();
            if (pngBuffer && pngBuffer.length > 100) {
                console.log('✅ Sticker convertido (Método 2: Sharp página 0)');
                return pngBuffer;
            }
        } catch (e) {
            console.log('⚠️ Sharp página 0 falhou:', e.message);
        }

        // Método 3: FFmpeg ignore_loop
        writeFileSync(inputPath, bufferWebp);
        try {
            await execPromise(
                `ffmpeg -ignore_loop 0 -i "${inputPath}" -vframes 1 -y "${outputPath}"`,
                { timeout: 10000 }
            );
            if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                console.log('✅ Sticker convertido (Método 3: FFmpeg ignore_loop)');
                return readFileSync(outputPath);
            }
        } catch {}

        // Método 4: FFmpeg via GIF
        try {
            await execPromise(
                `ffmpeg -i "${inputPath}" -y "${gifPath}"`,
                { timeout: 10000 }
            );
            if (existsSync(gifPath)) {
                await execPromise(
                    `ffmpeg -i "${gifPath}" -vframes 1 -y "${outputPath}"`,
                    { timeout: 10000 }
                );
                if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                    console.log('✅ Sticker convertido (Método 4: via GIF)');
                    return readFileSync(outputPath);
                }
            }
        } catch {} finally {
            try { if (existsSync(gifPath)) unlinkSync(gifPath); } catch {}
        }

        // Método 5: FFmpeg probesize maior
        try {
            await execPromise(
                `ffmpeg -analyzeduration 100M -probesize 100M -i "${inputPath}" -vframes 1 -y "${outputPath}"`,
                { timeout: 15000 }
            );
            if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                console.log('✅ Sticker convertido (Método 5: probesize)');
                return readFileSync(outputPath);
            }
        } catch {}

        console.warn('⚠️ Todos os métodos falharam para este sticker');
        return null;

    } catch (erro) {
        console.error('❌ Erro ao converter WebP:', erro.message);
        return null;
    } finally {
        try { if (existsSync(inputPath))  unlinkSync(inputPath);  } catch {}
        try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch {}
    }
}

// ============================================
// 🎬 EXTRAIR FRAME DO VÍDEO
// ============================================
async function extrairFrameVideo(bufferVideo) {
    const timestamp = Date.now();
    const inputPath  = join(CONFIG.tempDir, `video_${timestamp}.mp4`);
    const outputPath = join(CONFIG.tempDir, `frame_${timestamp}.png`);

    try {
        writeFileSync(inputPath, bufferVideo);

        // Pegar duração do vídeo
        let duracao = 0;
        try {
            const { stdout } = await execPromise(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`,
                { timeout: 10000 }
            );
            duracao = parseFloat(stdout.trim()) || 0;
        } catch {}

        // Extrair frame do meio do vídeo (mais representativo)
        const tempoFrame = duracao > 2 ? (duracao / 2).toFixed(2) : '0';
        console.log(`🎬 Extraindo frame em ${tempoFrame}s de ${duracao.toFixed(1)}s de vídeo...`);

        // Método 1: Frame do meio
        try {
            await execPromise(
                `ffmpeg -ss ${tempoFrame} -i "${inputPath}" -vframes 1 -y "${outputPath}"`,
                { timeout: 15000 }
            );
            if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                console.log('✅ Frame extraído (Método 1: meio do vídeo)');
                return readFileSync(outputPath);
            }
        } catch {}

        // Método 2: Primeiro frame (fallback)
        try {
            await execPromise(
                `ffmpeg -i "${inputPath}" -vframes 1 -y "${outputPath}"`,
                { timeout: 15000 }
            );
            if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                console.log('✅ Frame extraído (Método 2: primeiro frame)');
                return readFileSync(outputPath);
            }
        } catch {}

        // Método 3: Frame com scale para garantir compatibilidade
        try {
            await execPromise(
                `ffmpeg -i "${inputPath}" -vf "select=eq(n\\,0),scale=512:-1" -vframes 1 -y "${outputPath}"`,
                { timeout: 15000 }
            );
            if (existsSync(outputPath) && readFileSync(outputPath).length > 100) {
                console.log('✅ Frame extraído (Método 3: com scale)');
                return readFileSync(outputPath);
            }
        } catch {}

        console.warn('⚠️ Não foi possível extrair frame do vídeo');
        return null;

    } catch (erro) {
        console.error('❌ Erro ao extrair frame do vídeo:', erro.message);
        return null;
    } finally {
        try { if (existsSync(inputPath))  unlinkSync(inputPath);  } catch {}
        try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch {}
    }
}

// ============================================
// 🔍 FUNÇÃO PRINCIPAL
// ============================================
async function detectarNSFW(bufferImagem, tipo = 'image/jpeg') {
    try {
        if (!bufferImagem || !Buffer.isBuffer(bufferImagem)) {
            console.warn('⚠️ Buffer de imagem inválido');
            return { isNsfw: false, erro: true, motivo: 'Buffer inválido' };
        }

        if (bufferImagem.length < 1000) {
            console.warn('⚠️ Imagem muito pequena, ignorando análise');
            return { isNsfw: false, erro: true, motivo: 'Imagem muito pequena' };
        }

        console.log(`📸 Analisando (${Math.round(bufferImagem.length / 1024)}KB | tipo: ${tipo})...`);

        const formData = new FormData();
        formData.append('media', bufferImagem, {
            filename: tipo === 'image/png' ? 'imagem.png' : 'imagem.jpg',
            contentType: tipo,
        });
        formData.append('models', 'nudity-2.0');
        formData.append('api_user', CONFIG.apiUser);
        formData.append('api_secret', CONFIG.apiSecret);

        const resposta = await axios.post(
            'https://api.sightengine.com/1.0/check.json',
            formData,
            {
                headers: { ...formData.getHeaders() },
                timeout: CONFIG.timeoutMs,
            }
        );

        const resultado = resposta.data;

        if (!resultado || resultado.status !== 'success') {
            console.warn('⚠️ Resposta inválida da Sightengine');
            return { isNsfw: false, erro: true, motivo: 'Resposta inválida' };
        }

        const nudity = resultado.nudity;
        const scoreNsfw = Math.max(
            nudity?.sexual_activity || 0,
            nudity?.sexual_display  || 0,
            nudity?.erotica         || 0
        );

        const isNsfw = scoreNsfw > CONFIG.limiteNsfw;

        console.log(`📊 Score NSFW: ${Math.round(scoreNsfw * 100)}% | ${isNsfw ? '🚫 NSFW' : '✅ Seguro'}`);

        return {
            isNsfw,
            score: Math.round(scoreNsfw * 100) + '%',
            scoreNumerico: scoreNsfw,
            erro: false,
        };

    } catch (erro) {
        if (erro.code === 'ECONNABORTED') {
            console.error('❌ Timeout na API');
            return { isNsfw: false, erro: true, motivo: 'Timeout' };
        }
        if (erro.response?.status === 401) {
            console.error('❌ Credenciais inválidas');
            return { isNsfw: false, erro: true, motivo: 'Credenciais inválidas' };
        }
        if (erro.response?.status === 429) {
            console.error('❌ Limite de requisições atingido');
            return { isNsfw: false, erro: true, motivo: 'Rate limit atingido' };
        }
        console.error('❌ Erro na detecção NSFW:', erro.message);
        return { isNsfw: false, erro: true, motivo: erro.message };
    }
}

// ============================================
// ⚖️ TOMAR AÇÃO SE FOR NSFW
// ============================================
async function _tomarAcao(sock, msg, from, resultado) {
    if (resultado.erro) {
        console.log('⚠️ Erro na API, liberado por padrão');
        return false;
    }

    if (resultado.isNsfw) {
        console.log(`🚫 Conteúdo NSFW! Score: ${resultado.score}`);

        try {
            await sock.sendMessage(from, { delete: msg.key });
            console.log('✅ Mensagem apagada');
        } catch (e) {
            console.error('❌ Erro ao apagar:', e.message);
        }

        const sender = msg.key.participant || msg.key.remoteJid;

        await sock.sendMessage(from, {
            text:
                `🚫 *CONTEÚDO IMPRÓPRIO REMOVIDO*\n\n` +
                `👤 Usuário: @${sender.split('@')[0]}\n` +
                `📊 Score: ${resultado.score}\n` +
                `⚠️ Conteúdo removido automaticamente por violar as regras do grupo.`,
            mentions: [sender],
        });

        return true;
    }

    console.log(`✅ Conteúdo seguro (${resultado.score}), liberado`);
    return false;
}

// ============================================
// 🤖 INTEGRAÇÃO COM BOT WHATSAPP
// ============================================
async function verificarImagemGrupo(sock, msg, from) {
    try {
        const messageType = Object.keys(msg.message || {})[0];

        // ✅ Imagem normal
        if (messageType === 'imageMessage') {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            if (!buffer) return false;

            const resultado = await detectarNSFW(buffer, 'image/jpeg');
            return await _tomarAcao(sock, msg, from, resultado);
        }

        // ✅ Sticker / Figurinha
        if (messageType === 'stickerMessage') {
            console.log('🎭 Sticker detectado! Convertendo para análise...');

            const bufferWebp = await downloadMediaMessage(msg, 'buffer', {});
            if (!bufferWebp) return false;

            const bufferPng = await webpParaPng(bufferWebp);
            if (!bufferPng) {
                console.warn('⚠️ Não foi possível converter sticker, liberando por padrão');
                return false;
            }

            const resultado = await detectarNSFW(bufferPng, 'image/png');
            return await _tomarAcao(sock, msg, from, resultado);
        }

        // ✅ Vídeo
        if (messageType === 'videoMessage') {
            console.log('🎬 Vídeo detectado! Extraindo frame para análise...');

            const bufferVideo = await downloadMediaMessage(msg, 'buffer', {});
            if (!bufferVideo) return false;

            console.log(`📦 Vídeo baixado: ${Math.round(bufferVideo.length / 1024)}KB`);

            const bufferFrame = await extrairFrameVideo(bufferVideo);
            if (!bufferFrame) {
                console.warn('⚠️ Não foi possível extrair frame, liberando por padrão');
                return false;
            }

            const resultado = await detectarNSFW(bufferFrame, 'image/png');
            return await _tomarAcao(sock, msg, from, resultado);
        }

        return false;

    } catch (erro) {
        console.error('❌ Erro em verificarImagemGrupo:', erro.message);
        return false;
    }
}

export { detectarNSFW, verificarImagemGrupo };