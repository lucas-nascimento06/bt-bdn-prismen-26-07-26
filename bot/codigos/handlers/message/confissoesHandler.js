// confissoesHandler.js - Usuário manda no privado → bot posta no grupo → pede pro usuário apagar a mensagem dele
import pool from '../../../../db.js';

const GROUP_ID = '120363412511975026@g.us';

const CABECALHO =
`🎭 *CONFISSÃO ANÔNIMA - 📮 correio eletrônico* 💌💕`;

const PALAVRAS_BLOQUEADAS = [
    'buceta', 'puta', 'putinha', 'porra', 'caralho', 'viado', 'fake',
    'merda', 'foda', 'foder', 'fodase', 'foda-se', 'cu', 'cuzão',
    'vagabunda', 'vagabundo', 'prostituta', 'piranha', 'safada', 'safado',
    'desgraça', 'desgraçado', 'maldito', 'idiota', 'imbecil', 'otario',
    'otário', 'filhadaputa', 'filho da puta', 'fdp', 'arrombado',
    'arrombada', 'babaca', 'bosta', 'puta que pariu', 'cachorra',
    'cachorro', 'cadela', 'puto', 'putinho'
];

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const contemPalavraBloqueada = (texto) => {
    const alvo = normalizar(texto);
    return PALAVRAS_BLOQUEADAS.filter(p => alvo.includes(normalizar(p)));
};

// 📋 Modelo fixo do poster que a pessoa copia, preenche e envia no privado
const MODELO_POSTER =
`🎭 *CONFISSÃO ANÔNIMA* - 📮 *correio eletrônico* 💌💕 #confissao

✍️ Escreva uma mensagem para aquela pessoa especial que você gosta e admira no grupo:📜


*------------------------------*

💬 *ESCREVA SUA MENSAGEM AQUI:* 

....

📲 *WHATSAPP DA PESSOA:* 

+55...

*------------------------------*


ℹ️ *COMO FUNCIONA:* 

✅ Após preencher o pôster, copie e cole-o no PV do bot.

#damasdanight #confissao #amizade #paquera #romancenoar`;

// Linhas fixas do poster (usadas para filtrar o que é "instrução" do que é conteúdo do usuário)
// ⚠️ IMPORTANTE: precisam bater exatamente (em minúsculo) com as linhas do MODELO_POSTER acima.
// Se o MODELO_POSTER mudar, atualize esta lista também.
const LINHAS_FIXAS = [
    '🎭 *confissão anônima* - 📮 *correio eletrônico* 💌💕 #confissao',
    '✍️ escreva uma mensagem para aquela pessoa especial que você gosta e admira no grupo:📜',
    '*------------------------------*',
    '💬 *escreva sua mensagem aqui:*',
    '📲 *whatsapp da pessoa:*',
    'ℹ️ *como funciona:*',
    '✅ preencha este poster com sua mensagem e o número da pessoa.',
    '✅ depois de preencher copie e cole este poster no privado do bot.',
    '🔐 sua confissão é postada de forma *100% anônima* no grupo. depois de enviar, *apague você mesmo(a)* a mensagem no pv do bot para garantir seu anonimato total. 🔐',
    '#damasdanight #confissao #amizade #paquera #romancenoar'
];

const ehLinhaFixa = (linha) => LINHAS_FIXAS.includes(linha.trim().toLowerCase());

// Placeholders do poster: os que a pessoa deve substituir (novo formato) e formatos antigos,
// mantidos por compatibilidade caso alguém ainda tenha o poster velho salvo.
const ehPlaceholder = (linha) => {
    const l = linha.trim().toLowerCase();
    return l === 'escreva aqui:' || l === '[escreva aqui]' || l === 'você...' || l === '+55...';
};

// Detecta qualquer variação da linha "ESCREVA SUA MENSAGEM AQUI:", inclusive quando o bot
// prefixa avisos de erro nela (ex: "❌ Escreva sua confissão no poster abaixo, preencha e reenvie:")
// ou quando vem com outra formatação/emoji.
const ehMarcadorMensagem = (linha) => {
    const l = normalizar(linha);
    return l.includes('escreva sua mensagem aqui') || l.includes('escreva sua confissao no poster');
};

const ehMarcadorTelefone = (linha) => {
    const l = normalizar(linha);
    return l.includes('whatsapp da pessoa');
};

const ehSeparador = (linha) => linha.trim() === '*------------------------------*';

// Procura um número de telefone em qualquer parte do texto (qualquer formato comum)
function extrairNumero(texto) {
    const candidatos = texto.match(/\+?[\d][\d\s().-]{7,}\d/g) || [];

    for (const candidato of candidatos) {
        let numero = candidato.replace(/\D/g, '');
        if (numero.length === 10 || numero.length === 11) numero = '55' + numero;
        if (numero.length >= 12 && numero.length <= 13) {
            return { numero, trecho: candidato };
        }
    }
    return { numero: null, trecho: null };
}

// Extrai a confissão e o número (se houver) a partir do poster preenchido pelo usuário.
//
// Em vez de tentar remover todas as linhas "conhecidas" do poster (abordagem frágil, que
// quebra sempre que o bot manda um texto extra, como avisos de erro, e o usuário reenvia
// em cima dele), o parser localiza os DOIS marcadores que sempre existem no poster:
//   1) a linha "ESCREVA SUA MENSAGEM AQUI:"
//   2) a linha "WHATSAPP DA PESSOA:"
// e considera confissão apenas o que está ENTRE eles, e número apenas o que vem DEPOIS
// do segundo marcador (até o próximo separador). Assim, qualquer lixo fora dessa região
// (avisos antigos do bot, mensagens coladas por engano, etc.) é ignorado automaticamente.
function parsearMensagem(content) {
    const linhas = content.split('\n');

    const idxMsg = linhas.findIndex(ehMarcadorMensagem);
    const idxTel = linhas.findIndex(ehMarcadorTelefone);

    // Se não encontrar os marcadores esperados (ou estiverem fora de ordem), não há
    // como extrair com segurança - trata como confissão vazia para pedir reenvio.
    if (idxMsg === -1 || idxTel === -1 || idxTel <= idxMsg) {
        return { numero: null, confissao: '' };
    }

    // Tudo entre "ESCREVA SUA MENSAGEM AQUI:" e "WHATSAPP DA PESSOA:" é a confissão
    let confissao = linhas
        .slice(idxMsg + 1, idxTel)
        .filter(l => !ehLinhaFixa(l) && !ehPlaceholder(l) && !ehSeparador(l))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Tudo depois de "WHATSAPP DA PESSOA:" até o próximo separador (ou fim) é o número
    let idxFimTel = linhas.findIndex((l, i) => i > idxTel && ehSeparador(l));
    if (idxFimTel === -1) idxFimTel = linhas.length;

    const trechoTelefone = linhas.slice(idxTel + 1, idxFimTel).join('\n');
    const { numero } = extrairNumero(trechoTelefone);

    return { numero, confissao };
}

function montarTextoGrupo(confissao, numero) {
    const destino = numero ? `\n\n📌 *Para:* @${numero}` : '';
    return `${CABECALHO}\n\n*MENSAGEM:*\n✉️ ${confissao}${destino}\n\n🔐 *Seu anonimato foi preservado.*`;
}

class ConfissoesHandler {

    async initDatabase() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS confissoes (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(100) NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`);
            console.log('✅ Tabela de confissões criada/verificada');
        } catch (error) {
            console.error('❌ Erro ao criar tabela:', error);
        }
    }

    // 📮 Chamado quando a mensagem vem do GRUPO. Responde ao comando "#poster"
    // enviando o modelo para as pessoas copiarem, preencherem e mandarem no privado.
    async handleGroupMessage(sock, message, from, userId, content) {
        console.log('🔎 ============ DEBUG CONFISSOES HANDLER (GRUPO) ============');
        console.log('🔎 from:', from);
        console.log('🔎 userId:', userId);
        console.log('🔎 content bruto:', JSON.stringify(content));
        console.log('🔎 content normalizado:', JSON.stringify(content?.trim().toLowerCase()));
        console.log('==================================================');

        if (content.trim().toLowerCase() !== '#poster') {
            console.log('⏭️ Não é comando #poster, ignorando');
            return false;
        }

        try {
            await sock.sendMessage(from, { text: MODELO_POSTER });
            console.log(`📮 Poster de confissão enviado no grupo a pedido de ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Erro ao enviar poster:', error);
            return false;
        }
    }

    // 💌 Chamado quando a mensagem vem do PRIVADO. Processa o poster preenchido
    // e publica a confissão anonimamente no grupo.
    async handlePrivateMessage(sock, message, from, userId, content) {
        // Só ativa quando reconhece o poster (linha do título com #confissao),
        // evitando colisão com outros comandos que usem prefixo parecido
        if (!/confissão anônima.*#confissao/i.test(content)) return false;

        try {
            const { numero, confissao } = parsearMensagem(content);

            if (!confissao) {
                await sock.sendMessage(from, {
                    text: '❌ *Escreva sua confissão no poster abaixo, preencha e reenvie:*\n\n' + MODELO_POSTER
                });
                return true;
            }

            const bloqueadas = contemPalavraBloqueada(confissao);
            if (bloqueadas.length) {
                await sock.sendMessage(from, {
                    text: '🚫 *Confissão rejeitada!*\n\nSua confissão contém palavras que não são permitidas. 😔\n\n' +
                          '✏️ *Reescreva sua confissão* sem palavrões ou ofensas e tente novamente! 💌'
                });
                console.log(`⛔ Confissão de ${userId} rejeitada: ${bloqueadas.join(', ')}`);
                return true;
            }

            const mentions = numero ? [`${numero}@s.whatsapp.net`] : [];
            const { rows } = await pool.query(
                'INSERT INTO confissoes (user_id, content) VALUES ($1, $2) RETURNING id',
                [userId, confissao]
            );

            await sock.sendMessage(GROUP_ID, { text: montarTextoGrupo(confissao, numero), mentions });
            await pool.query('DELETE FROM confissoes WHERE id = $1', [rows[0].id]);

            // 1) Confirma que a confissão foi publicada
            await sock.sendMessage(from, {
                text: numero
                    ? `✅ *Confissão enviada anonimamente para @${numero}!* 💌`
                    : '✅ *Confissão enviada anonimamente!* 💌'
            });

            // 2) ⚠️ O WhatsApp só permite apagar "para todos" mensagens enviadas pela própria conta.
            // Como quem manda a confissão é o usuário (não o bot), o bot NÃO tem como apagar essa
            // mensagem daqui do privado. Por isso pedimos, logo em seguida, para a pessoa apagar
            // ela mesma a mensagem que enviou — é a única forma de garantir o anonimato 100%.
            await sock.sendMessage(from, {
                text: '🗑️ *IMPORTANTE - Apague sua mensagem agora:*\n\n' +
                      'Eu não consigo apagar sua mensagem aqui automaticamente (o WhatsApp só permite apagar mensagens que a própria conta enviou). ' +
                      'Para garantir seu anonimato *100%*, apague *você mesmo(a)* a mensagem que você me mandou:\n\n' +
                      '👉 Segure a mensagem → *Apagar* → *Apagar para todos*'
            });

            console.log(`✅ Confissão de ${userId} postada no grupo${numero ? ` (marcando ${numero})` : ''}`);
            return true;

        } catch (error) {
            console.error('❌ Erro ao processar confissão:', error);
            await sock.sendMessage(from, { text: '❌ Erro ao enviar sua confissão. Tente novamente!' });
            return false;
        }
    }
}

export default new ConfissoesHandler();