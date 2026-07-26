import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Jimp } from 'jimp';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Handler para criar stickers a partir de imagens/vídeos com texto opcional
 * Comando: #stk [texto]
 */
async function stickerHandler(sock, msg, quotedMsg, texto = '') {
    try {
        console.log('🎯 Iniciando stickerHandler...');

        if (!quotedMsg || !quotedMsg.message) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Por favor, responda a uma imagem ou vídeo com o comando #stk\n\n📝 Exemplos:\n#stk\n#stk leozinho'
            }, { quoted: msg });
            return;
        }

        const hasImage = quotedMsg.message.imageMessage ||
            quotedMsg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        const hasVideo = quotedMsg.message.videoMessage ||
            quotedMsg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

        console.log('🖼️ Tem imagem?', hasImage ? 'SIM' : 'NÃO');
        console.log('🎬 Tem vídeo?', hasVideo ? 'SIM' : 'NÃO');

        if (!hasImage && !hasVideo) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ A mensagem respondida precisa ser uma imagem ou vídeo!'
            }, { quoted: msg });
            return;
        }

        const mediaType = hasVideo ? 'vídeo' : 'imagem';
        await sock.sendMessage(msg.key.remoteJid, {
            text: `⏳ Criando sticker de ${mediaType}... Aguarde!`
        }, { quoted: msg });

        let stickerBuffer;

        if (hasVideo) {
            console.log('🎬 Baixando vídeo...');
            const buffer = await downloadMediaMessage(
                quotedMsg,
                'buffer',
                {},
                { logger: console, reuploadRequest: sock.updateMediaMessage }
            );
            console.log(`📦 Buffer de vídeo baixado: ${buffer.length} bytes`);
            stickerBuffer = await createVideoSticker(buffer, texto);
        } else {
            console.log('📥 Baixando imagem...');
            const buffer = await downloadMediaMessage(
                quotedMsg,
                'buffer',
                {},
                { logger: console, reuploadRequest: sock.updateMediaMessage }
            );
            console.log(`📦 Buffer baixado: ${buffer.length} bytes`);
            stickerBuffer = texto.trim()
                ? await createStickerWithText(buffer, texto)
                : await createSimpleSticker(buffer);
        }

        if (!stickerBuffer) throw new Error('Falha ao processar mídia');

        console.log('📤 Enviando sticker...');
        await sock.sendMessage(msg.key.remoteJid, {
            sticker: stickerBuffer,
            mimetype: 'image/webp',
            fileName: 'sticker.webp'
        }, {
            packname: '👑 Damas da Night',
            author: '🎉 Bot Exclusivo',
            categories: ['🔥']
        });

        console.log('✅ Sticker criado e enviado com sucesso!');

        // ─── DELETAR MÍDIA ORIGINAL ───────────────────────────────────────────
        try {
            console.log('🗑️ Deletando mídia original...');

            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
            await sock.sendMessage(msg.key.remoteJid, { delete: quotedMsg.key });

            console.log('✅ Mídia original e comando deletados com sucesso!');
        } catch (deleteError) {
            console.warn('⚠️ Não foi possível deletar a(s) mensagem(ns):', deleteError.message);
        }
        // ─────────────────────────────────────────────────────────────────────

    } catch (error) {
        console.error('❌ Erro ao criar sticker:', error);
        await sock.sendMessage(msg.key.remoteJid, {
            text: '❌ Erro ao criar sticker. Tente novamente ou verifique se a mídia é válida.'
        }, { quoted: msg });
    }
}

function getAvailableFontPath() {
    const isWindows = os.platform() === 'win32';
    const homeDir   = os.homedir();

    const candidates = isWindows
        ? [
            'C:\\Windows\\Fonts\\arialbd.ttf',
            'C:\\Windows\\Fonts\\arial.ttf',
            'C:\\Windows\\Fonts\\calibrib.ttf',
            'C:\\Windows\\Fonts\\calibri.ttf',
            'C:\\Windows\\Fonts\\verdanab.ttf',
            'C:\\Windows\\Fonts\\verdana.ttf',
            'C:\\Windows\\Fonts\\tahomabd.ttf',
            'C:\\Windows\\Fonts\\tahoma.ttf',
        ]
        : [
            `${homeDir}/../usr/share/fonts/TTF/DejaVuSans-Bold.ttf`,
            `${homeDir}/../usr/share/fonts/TTF/DejaVuSans.ttf`,
            '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
            '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans.ttf',
            '/data/data/com.termux/files/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
            '/data/data/com.termux/files/usr/share/fonts/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            console.log(`🔤 Fonte encontrada: ${p}`);
            return p;
        }
    }

    if (isWindows) {
        throw new Error('Nenhuma fonte TTF encontrada em C:\\Windows\\Fonts.');
    }
    const isTermux = homeDir.includes('com.termux') || fs.existsSync('/data/data/com.termux');
    if (isTermux) {
        throw new Error('Instale fontes no Termux com: pkg install font-dejavu');
    }
    throw new Error('Instale fontes com: apt-get install fonts-dejavu');
}

/**
 * Aplica bordas arredondadas em uma imagem já 512x512
 * CORRIGIDO para Jimp v1: usa image.width / image.height e arrow function no scan
 */
async function applyRoundedCornersFullImage(image, radius) {
    // FIX: Jimp v1 usa .width e .height (não .getWidth() / .getHeight())
    const width  = image.width;
    const height = image.height;

    // FIX: Jimp v1 não suporta `this` dentro do callback do scan — usar arrow function
    image.scan(0, 0, width, height, (x, y, idx) => {
        let transparent = false;

        if (x < radius && y < radius) {
            const dx = radius - x, dy = radius - y;
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (x > width - radius && y < radius) {
            const dx = x - (width - radius), dy = radius - y;
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (x < radius && y > height - radius) {
            const dx = radius - x, dy = y - (height - radius);
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (x > width - radius && y > height - radius) {
            const dx = x - (width - radius), dy = y - (height - radius);
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        }

        if (transparent) image.bitmap.data[idx + 3] = 0;
    });

    return image;
}

/**
 * Aplica bordas arredondadas detectando bounds da área visível
 * CORRIGIDO para Jimp v1
 */
async function applyRoundedCorners(image, radius) {
    // FIX: Jimp v1 usa .width e .height
    const width  = image.width;
    const height = image.height;
    const data   = image.bitmap.data;

    let minX = width, maxX = 0, minY = height, maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (minX >= maxX || minY >= maxY) return image;

    console.log(`🔍 Bounds da imagem real: (${minX},${minY}) → (${maxX},${maxY})`);

    const imgW = maxX - minX + 1;
    const imgH = maxY - minY + 1;

    // FIX: arrow function para evitar uso de `this`
    image.scan(0, 0, width, height, (x, y, idx) => {
        if (x < minX || x > maxX || y < minY || y > maxY) return;

        const rx = x - minX;
        const ry = y - minY;
        let transparent = false;

        if (rx < radius && ry < radius) {
            const dx = radius - rx, dy = radius - ry;
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (rx > imgW - radius && ry < radius) {
            const dx = rx - (imgW - radius), dy = radius - ry;
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (rx < radius && ry > imgH - radius) {
            const dx = radius - rx, dy = ry - (imgH - radius);
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        } else if (rx > imgW - radius && ry > imgH - radius) {
            const dx = rx - (imgW - radius), dy = ry - (imgH - radius);
            if (Math.sqrt(dx * dx + dy * dy) > radius) transparent = true;
        }

        if (transparent) image.bitmap.data[idx + 3] = 0;
    });

    return image;
}

/**
 * Converte PNG para WebP usando FFmpeg
 */
async function convertToWebP(inputBuffer) {
    const tempDir = os.tmpdir();
    const timestamp = Date.now() + Math.random().toString(36).substring(7);
    const inputPath  = path.join(tempDir, `sticker_input_${timestamp}.png`);
    const outputPath = path.join(tempDir, `sticker_output_${timestamp}.webp`);

    try {
        console.log('🔄 Convertendo para WebP...');
        fs.writeFileSync(inputPath, inputBuffer);
        console.log(`💾 PNG temporário salvo: ${inputPath}`);

        const ffmpegCommand = [
            'ffmpeg', '-y',
            '-i', `"${inputPath}"`,
            '-vcodec', 'libwebp',
            '-filter:v', '"format=rgba"',
            '-quality', '90',
            '-compression_level', '3',
            '-loop', '0',
            '-an',
            '-vsync', '0',
            `"${outputPath}"`
        ].join(' ');

        console.log('⚙️ Executando FFmpeg...');
        await execPromise(ffmpegCommand);

        const webpBuffer = fs.readFileSync(outputPath);
        console.log(`✅ WebP gerado: ${webpBuffer.length} bytes`);

        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        return webpBuffer;

    } catch (error) {
        console.error('❌ Erro ao converter para WebP:', error.message);
        try {
            if (fs.existsSync(inputPath))  fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (_) {}
        return null;
    }
}

/**
 * Cria sticker animado a partir de vídeo
 */
async function createVideoSticker(videoBuffer, texto = '') {
    const tempDir = os.tmpdir();
    const timestamp = Date.now() + Math.random().toString(36).substring(7);
    const inputPath  = path.join(tempDir, `sticker_video_input_${timestamp}.mp4`);
    const outputPath = path.join(tempDir, `sticker_video_output_${timestamp}.webp`);

    try {
        console.log('🎬 Processando vídeo para sticker animado...');
        fs.writeFileSync(inputPath, videoBuffer);
        console.log(`💾 Vídeo temporário salvo: ${inputPath}`);

        let textFilter = '';
        if (texto.trim()) {
            const textoUpper = texto.toUpperCase().replace(/'/g, "\\'").replace(/:/g, '\\:');
            console.log(`✍️ Adicionando texto ao vídeo: "${textoUpper}"`);

            const fontPath = getAvailableFontPath();
            const fontPathEscaped = os.platform() === 'win32'
                ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
                : fontPath;

            textFilter =
                `,drawtext=text='${textoUpper}':fontsize=64:fontcolor=white:` +
                `borderw=3:bordercolor=black:` +
                `x=(w-text_w)/2:y=h-text_h-20:` +
                `fontfile='${fontPathEscaped}'`;
        }

        const vfFilter =
            `scale=512:512:force_original_aspect_ratio=increase,` +
            `crop=512:512:(iw-512)/2:(ih-512)/2,` +
            `fps=10,` +
            `format=yuv420p` +
            textFilter;

        const ffmpegCommand = [
            'ffmpeg', '-y',
            '-i', `"${inputPath}"`,
            '-vf', `"${vfFilter}"`,
            '-vcodec', 'libwebp',
            '-quality', '50',
            '-compression_level', '6',
            '-preset', 'default',
            '-loop', '0',
            '-an',
            '-t', '5',
            '-fs', '500K',
            `"${outputPath}"`
        ].join(' ');

        console.log('⚙️ Executando FFmpeg...');
        await execPromise(ffmpegCommand);

        const webpBuffer = fs.readFileSync(outputPath);
        console.log(`✅ WebP animado gerado: ${webpBuffer.length} bytes`);

        for (const f of [inputPath, outputPath]) {
            try { fs.unlinkSync(f); } catch (_) {}
        }

        return webpBuffer;

    } catch (error) {
        console.error('❌ Erro ao converter vídeo para WebP:', error.message);
        for (const f of [inputPath, outputPath]) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        }
        return null;
    }
}

/**
 * Cria sticker simples sem texto
 * CORRIGIDO para Jimp v1
 */
async function createSimpleSticker(imageBuffer) {
    try {
        console.log('🖼️ Processando imagem para sticker simples...');

        // FIX: Jimp v1 usa Jimp.fromBuffer() em vez de Jimp.read()
        let image = await Jimp.fromBuffer(imageBuffer);
        console.log(`📐 Dimensões originais: ${image.width}x${image.height}`);

        // FIX: Jimp v1 — contain() agora recebe objeto { w, h }
        image.contain({ w: 512, h: 512 });
        console.log('✅ Redimensionado: 512x512');

        image = await applyRoundedCorners(image, 60);
        console.log('✅ Bordas arredondadas aplicadas');

        // FIX: Jimp v1 — getBuffer() recebe o mime type como string
        const pngBuffer = await image.getBuffer('image/png');
        console.log(`✅ PNG gerado: ${pngBuffer.length} bytes`);

        const webpBuffer = await convertToWebP(pngBuffer);
        if (!webpBuffer) {
            console.log('⚠️ Falha ao converter para WebP, enviando PNG...');
            return pngBuffer;
        }

        return webpBuffer;

    } catch (error) {
        console.error('❌ Erro ao criar sticker simples:', error);
        return null;
    }
}

/**
 * Cria sticker com texto
 * CORRIGIDO para Jimp v1
 */
async function createStickerWithText(imageBuffer, texto) {
    try {
        console.log('🖼️ Processando imagem para sticker com texto...');

        // FIX: Jimp v1 usa Jimp.fromBuffer()
        let image = await Jimp.fromBuffer(imageBuffer);
        console.log(`📐 Dimensões originais: ${image.width}x${image.height}`);

        // FIX: Jimp v1 — contain() recebe objeto
        image.contain({ w: 512, h: 512 });
        console.log('✅ Redimensionado: 512x512');

        image = await applyRoundedCorners(image, 60);
        console.log('✅ Bordas arredondadas aplicadas');

        const textoUpper = texto.toUpperCase();
        console.log(`✍️ Adicionando texto: "${textoUpper}"`);

        // NOTA: Jimp v1 removeu os fontes bitmap embutidos (FONT_SANS_64_WHITE etc.)
        // É necessário usar FFmpeg para texto, ou a biblioteca @jimp/plugin-print com fonte customizada.
        // A solução mais simples e robusta é usar FFmpeg para adicionar texto via filter drawtext.
        const tempDir = os.tmpdir();
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        const pngInput  = path.join(tempDir, `sticker_txt_in_${timestamp}.png`);
        const pngOutput = path.join(tempDir, `sticker_txt_out_${timestamp}.png`);

        const pngBuf = await image.getBuffer('image/png');
        fs.writeFileSync(pngInput, pngBuf);

        const fontPath = getAvailableFontPath();
        const fontPathEscaped = os.platform() === 'win32'
            ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
            : fontPath;

        const textoEscaped = textoUpper.replace(/'/g, "\\'").replace(/:/g, '\\:');

        const drawCmd = [
            'ffmpeg', '-y',
            '-i', `"${pngInput}"`,
            '-vf',
            `"drawtext=text='${textoEscaped}':fontsize=64:fontcolor=white:` +
            `borderw=3:bordercolor=black:` +
            `x=(w-text_w)/2:y=h-text_h-20:` +
            `fontfile='${fontPathEscaped}'"`,
            `"${pngOutput}"`
        ].join(' ');

        await execPromise(drawCmd);
        const pngWithText = fs.readFileSync(pngOutput);

        for (const f of [pngInput, pngOutput]) {
            try { fs.unlinkSync(f); } catch (_) {}
        }

        console.log(`✅ PNG com texto gerado: ${pngWithText.length} bytes`);

        const webpBuffer = await convertToWebP(pngWithText);
        if (!webpBuffer) {
            console.log('⚠️ Falha ao converter para WebP, enviando PNG...');
            return pngWithText;
        }

        return webpBuffer;

    } catch (error) {
        console.error('❌ Erro ao criar sticker com texto:', error);
        return null;
    }
}

/**
 * Função principal para processar o comando
 */
export async function handleStickerCommand(sock, msg) {
    try {
        console.log('🚀 handleStickerCommand iniciado');

        const messageText = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || '';

        console.log('💬 Texto da mensagem:', messageText);

        const parts   = messageText.split(' ');
        const comando = parts[0].toLowerCase();
        const texto   = parts.slice(1).join(' ').trim();

        console.log('🔧 Comando:', comando);
        console.log('📝 Texto extraído:', texto);

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;

        if (!contextInfo || !contextInfo.quotedMessage) {
            console.log('❌ Não há mensagem citada');
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Por favor, responda a uma imagem ou vídeo com o comando #stk\n\n📝 Exemplos:\n#stk\n#stk leozinho'
            }, { quoted: msg });
            return;
        }

        console.log('✅ Mensagem citada encontrada');
        console.log('📦 QuotedMessage keys:', Object.keys(contextInfo.quotedMessage));

        const quotedMsg = {
            key: {
                remoteJid:   msg.key.remoteJid,
                fromMe:      false,
                id:          contextInfo.stanzaId,
                participant: contextInfo.participant
            },
            message: contextInfo.quotedMessage
        };

        await stickerHandler(sock, msg, quotedMsg, texto);

    } catch (error) {
        console.error('❌ Erro no handleStickerCommand:', error);
        console.error('Stack trace:', error.stack);
    }
}

export { stickerHandler, createSimpleSticker };