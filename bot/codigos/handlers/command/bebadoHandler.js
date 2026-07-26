// bot/codigos/handlers/command/bebadoHandler.js

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URL do JSON no GitHub (raw) — ajuste para o repo/caminho real do seu bebadoConfig.json
const BEBADO_CONFIG_URL =
  'https://raw.githubusercontent.com/lucas-nascimento06/rankings-zoeira/refs/heads/main/Bebado.json';

// Cópia local usada como fallback caso o GitHub esteja fora do ar
const LOCAL_FALLBACK_PATH = path.join(__dirname, 'bebadoConfig.json');

// Cache em memória para não bater no GitHub a cada comando
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
let cache = {
  data: null,
  atualizadoEm: 0,
};

// Blocos usados pra montar as barras visuais (têm fallback caso não venham do JSON)
const BARRA_TAMANHO_PADRAO = 10;
const BLOCO_CHEIO_PADRAO = '🟫';
const BLOCO_VAZIO_PADRAO = '⬜';
const SETA_CHEIA_PADRAO = '▰';
const SETA_VAZIA_PADRAO = '▱';

// Quantidade de frases de diagnóstico exibidas por resultado
const QTD_FRASES_DIAGNOSTICO = 3;

/**
 * Aguarda X milissegundos.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca o bebadoConfig.json do GitHub, usando cache em memória.
 * Se a busca remota falhar, tenta usar o arquivo local como fallback.
 */
async function obterBebadoConfig() {
  const agora = Date.now();

  // Cache ainda válido, retorna sem fazer requisição
  if (cache.data && agora - cache.atualizadoEm < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const { data } = await axios.get(BEBADO_CONFIG_URL, { timeout: 8000 });
    cache = { data, atualizadoEm: agora };
    return data;
  } catch (err) {
    console.error('[bebadoHandler] Falha ao buscar bebadoConfig.json do GitHub, usando fallback local:', err.message);

    // Se já tem algo em cache (mesmo vencido), usa isso antes do fallback local
    if (cache.data) return cache.data;

    // Último recurso: arquivo local
    if (fs.existsSync(LOCAL_FALLBACK_PATH)) {
      const local = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_PATH, 'utf-8'));
      cache = { data: local, atualizadoEm: agora };
      return local;
    }

    throw new Error('Não foi possível obter o bebadoConfig.json (remoto e local falharam).');
  }
}

/**
 * Sorteia uma porcentagem de 0 a 100.
 */
function sortearPorcentagem() {
  return Math.floor(Math.random() * 101);
}

/**
 * Encontra a classificação (faixa) correspondente à porcentagem sorteada.
 */
function obterClassificacao(config, porcentagem) {
  return config.classificacoes.find(
    (c) => porcentagem >= c.min && porcentagem <= c.max
  );
}

/**
 * Embaralha uma cópia do array (Fisher-Yates), sem alterar o original.
 */
function embaralhar(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Sorteia N frases (sem repetir) do nível correspondente e monta
 * as linhas de diagnóstico já formatadas (emoji + texto).
 *
 * As frases ficam num objeto separado no nível raiz do config:
 * `frasesPorNivel`, indexado pelo nome da classificação.
 * Cada item de frasesPorNivel[nome] é { emoji, texto }.
 */
function sortearLinhasDiagnostico(config, classificacao, quantidade = QTD_FRASES_DIAGNOSTICO) {
  const frases = config.frasesPorNivel?.[classificacao.nome] || [];
  if (frases.length === 0) return '🤷 Nenhum diagnóstico disponível.';

  const sorteadas = embaralhar(frases).slice(0, Math.min(quantidade, frases.length));

  return sorteadas
    .map((f) => {
      if (typeof f === 'string') return f;
      return `${f.emoji ?? ''} ${f.texto ?? ''}`.trim();
    })
    .join('\n');
}

/**
 * Sorteia uma frase de veredito (fechamento engraçado) do config.
 */
function sortearVeredito(config) {
  const vereditos = config.vereditos || [];
  if (vereditos.length === 0) return 'Amanhã eu conto o resto...';
  const idx = Math.floor(Math.random() * vereditos.length);
  return vereditos[idx];
}

/**
 * Monta a barra de blocos (🟫/⬜) baseada na porcentagem.
 */
function montarBarraBlocos(config, porcentagem) {
  const tamanho = config.barraTamanho ?? BARRA_TAMANHO_PADRAO;
  const cheio = config.blocoCheio ?? BLOCO_CHEIO_PADRAO;
  const vazio = config.blocoVazio ?? BLOCO_VAZIO_PADRAO;
  const cheios = Math.round((porcentagem / 100) * tamanho);
  const vazios = tamanho - cheios;
  return cheio.repeat(cheios) + vazio.repeat(vazios);
}

/**
 * Monta a barra de setas (▰/▱) baseada na porcentagem.
 */
function montarBarraSetas(config, porcentagem) {
  const tamanho = config.barraTamanho ?? BARRA_TAMANHO_PADRAO;
  const cheio = config.setaCheia ?? SETA_CHEIA_PADRAO;
  const vazio = config.setaVazia ?? SETA_VAZIA_PADRAO;
  const cheios = Math.round((porcentagem / 100) * tamanho);
  const vazios = tamanho - cheios;
  return cheio.repeat(cheios) + vazio.repeat(vazios);
}

/**
 * Gera o texto final do Teste do Bêbado para um usuário.
 * @param {string} nomeUsuario - Nome ou @tag do usuário (ex: "@andre")
 */
export async function gerarTesteBebado(nomeUsuario) {
  const config = await obterBebadoConfig();

  const porcentagem = sortearPorcentagem();
  const classificacao = obterClassificacao(config, porcentagem);

  if (!classificacao) {
    throw new Error(`Nenhuma classificação encontrada para ${porcentagem}%. Verifique os ranges (min/max) no bebadoConfig.json.`);
  }

  const barraBlocos = montarBarraBlocos(config, porcentagem);
  const barraSetas = montarBarraSetas(config, porcentagem);
  const diagnostico = sortearLinhasDiagnostico(config, classificacao);
  const veredito = sortearVeredito(config);

  const texto = `${config.titulo}
╭───────────────────╮
👤 *Pessoa:* ${nomeUsuario}
🍺 *Teor Alcoólico:* ${porcentagem}%
╰───────────────────╯
📊 *Nível de Embriaguez*
${barraBlocos}
${barraSetas} ${porcentagem}%
🏆 *Classificação:* ${classificacao.nome}
🤣 *Diagnóstico:*
${diagnostico}
🍾 Veredito:
"${veredito}" 🤡`;

  return texto;
}

/**
 * Descobre qual JID deve ser marcado no comando #bebado.
 *
 * Prioridade:
 *   1) Se o comando marcou alguém com @ (mentionedJid) → usa o marcado
 *   2) Se o comando foi enviado como reply/quote na mensagem de outra pessoa
 *      → usa o autor da mensagem citada
 *   3) Senão → usa quem mandou o comando (self)
 */
function resolverJidAlvo(msg, mentionedJid) {
  const contextInfo =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.conversation?.contextInfo ||
    {};

  // autor da mensagem citada (quando o usuário dá reply em alguém)
  const quotedParticipant = contextInfo.participant;

  // quem mandou a mensagem atual (fallback final - "self")
  const remetente = msg.key.participant || msg.key.remoteJid;

  return mentionedJid || quotedParticipant || remetente;
}

/**
 * Handler do comando (integrar com o roteador de comandos do bot,
 * seguindo o mesmo padrão de gadoHandler.js / perfilHandler.js).
 *
 * Exemplo de uso dentro do commandHandlers.js:
 *
 *   import { bebadoCommandHandler } from '../../handlers/command/bebadoHandler.js';
 *   ...
 *   case 'bebado':
 *     await bebadoCommandHandler(sock, msg, from, mentionedJid);
 *     break;
 */
export async function bebadoCommandHandler(sock, msg, from, mentionedJid) {
  const jidAlvo = resolverJidAlvo(msg, mentionedJid);
  const nomeAlvo = `@${jidAlvo.split('@')[0]}`;
  const numeroExibicao = jidAlvo.split('@')[0];

  try {
    // 🍺 MENSAGEM 1 — suspense inicial
    await sock.sendMessage(
      from,
      { text: `🍺 _Medindo o nível de cachaça de @${numeroExibicao}..._`, mentions: [jidAlvo] },
      { quoted: msg }
    );

    await sleep(3000);

    // 🥴 MENSAGEM 2 — mais suspense
    await sock.sendMessage(
      from,
      { text: `🥴 _Analisando o cambaleio... quase lá..._` },
      { quoted: msg }
    );

    await sleep(3000);

    // 🧠 MENSAGEM 3 — suspense máximo
    await sock.sendMessage(
      from,
      { text: `🧠 _Calculando o diagnóstico final... prepare-se!_` },
      { quoted: msg }
    );

    await sleep(2000);

    // 🍻 RESULTADO FINAL — gera o texto só agora, pra "sortear" na hora certa
    const texto = await gerarTesteBebado(nomeAlvo);

    await sock.sendMessage(
      from,
      {
        text: texto,
        mentions: [jidAlvo],
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('[bebadoCommandHandler] Erro ao gerar teste do bêbado:', err.message);
    await sock.sendMessage(
      from,
      { text: '⚠️ Não consegui buscar o Teste do Bêbado agora, tenta de novo daqui a pouco.' },
      { quoted: msg }
    );
  }
}