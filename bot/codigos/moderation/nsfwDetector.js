// nsfwDetector.js - Detector de conteúdo impróprio usando Sightengine
import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

// ============================================
// ⚙️ CONFIGURAÇÕES
// ============================================
const CONFIG = {
    apiUser: '1675050557',    // ← Número do "Usuário da API"
    apiSecret: 'VCgsJL9qxBaZ9VQZNbtibaeeYYBbSweD',  // ← "Segredo da API" após revelar
    limiteNsfw: 0.7,
    timeoutMs: 15000,
};

// ============================================
// 🔍 FUNÇÃO PRINCIPAL
// ============================================
async function detectarNSFW(bufferImagem) {
    try {
        if (!bufferImagem || !Buffer.isBuffer(bufferImagem)) {
            console.warn('⚠️ Buffer de imagem inválido');
            return { isNsfw: false, erro: true, motivo: 'Buffer inválido' };
        }

        if (bufferImagem.length < 1000) {
            console.warn('⚠️ Imagem muito pequena, ignorando análise');
            return { isNsfw: false, erro: true, motivo: 'Imagem muito pequena' };
        }

        console.log(`📸 Analisando imagem (${Math.round(bufferImagem.length / 1024)}KB)...`);

        // Enviar como multipart/form-data (mais confiável que base64)
        const formData = new FormData();
        formData.append('media', bufferImagem, {
            filename: 'imagem.jpg',
            contentType: 'image/jpeg',
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

        console.log('📋 Resposta Sightengine:', JSON.stringify(resultado, null, 2));

        if (!resultado || resultado.status !== 'success') {
            console.warn('⚠️ Resposta inválida da Sightengine:', resultado);
            return { isNsfw: false, erro: true, motivo: 'Resposta inválida da API' };
        }

        // Pegar os scores de nudez
        const nudity = resultado.nudity;
        const scoreNsfw = Math.max(
            nudity?.sexual_activity || 0,
            nudity?.sexual_display  || 0,
            nudity?.erotica         || 0
        );

        const isNsfw = scoreNsfw > CONFIG.limiteNsfw;

        console.log(`📊 Score NSFW: ${Math.round(scoreNsfw * 100)}% | Resultado: ${isNsfw ? '🚫 NSFW' : '✅ Seguro'}`);

        return {
            isNsfw,
            score: Math.round(scoreNsfw * 100) + '%',
            scoreNumerico: scoreNsfw,
            erro: false,
        };

    } catch (erro) {
        if (erro.code === 'ECONNABORTED') {
            console.error('❌ Timeout na API Sightengine');
            return { isNsfw: false, erro: true, motivo: 'Timeout na API' };
        }
        if (erro.response?.status === 400) {
            console.error('❌ Erro 400 - Requisição inválida:', erro.response?.data);
            return { isNsfw: false, erro: true, motivo: 'Requisição inválida' };
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
        console.error('❌ Detalhes:', erro.response?.data);
        return { isNsfw: false, erro: true, motivo: erro.message };
    }
}

// ============================================
// 🤖 INTEGRAÇÃO COM BOT WHATSAPP
// ============================================
async function verificarImagemGrupo(sock, msg, from) {
    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});

        if (!buffer) {
            console.warn('⚠️ Não foi possível baixar a imagem');
            return false;
        }

        const resultado = await detectarNSFW(buffer);

        if (resultado.erro) {
            console.log('⚠️ Erro na API, imagem liberada por padrão');
            return false;
        }

        if (resultado.isNsfw) {
            console.log(`🚫 Imagem NSFW detectada! Score: ${resultado.score}`);

            try {
                await sock.sendMessage(from, { delete: msg.key });
                console.log('✅ Mensagem apagada com sucesso');
            } catch (erroDelete) {
                console.error('❌ Erro ao apagar mensagem:', erroDelete.message);
            }

            const sender = msg.key.participant || msg.key.remoteJid;

            await sock.sendMessage(from, {
                text:
                    `🚫 *CONTEÚDO IMPRÓPRIO REMOVIDO*\n\n` +
                    `👤 Usuário: @${sender.split('@')[0]}\n` +
                    `📊 Score: ${resultado.score}\n` +
                    `⚠️ Imagem removida automaticamente por violar as regras do grupo.`,
                mentions: [sender],
            });

            return true;
        }

        console.log(`✅ Imagem segura (${resultado.score}), liberada`);
        return false;

    } catch (erro) {
        console.error('❌ Erro em verificarImagemGrupo:', erro.message);
        return false;
    }
}

export { detectarNSFW, verificarImagemGrupo };