// bot/codigos/handlers/command/gadoHandler.js

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URL do JSON no GitHub (raw)
const GADO_CONFIG_URL =
  'https://raw.githubusercontent.com/lucas-nascimento06/gado-dm/refs/heads/main/Gadoconfig%20.json';

// Cópia local usada como fallback caso o GitHub esteja fora do ar
const LOCAL_FALLBACK_PATH = path.join(__dirname, 'gadoConfig.json');

// Cache em memória para não bater no GitHub a cada comando
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
let cache = {
  data: null,
  atualizadoEm: 0,
};

// Quantas frases exibir por resultado (em vez do array inteiro do nível)
const QTD_FRASES_EXIBIDAS = 3;

/**
 * Aguarda X milissegundos.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca o gadoConfig.json do GitHub, usando cache em memória.
 * Se a busca remota falhar, tenta usar o arquivo local como fallback.
 */
async function obterGadoConfig() {
  const agora = Date.now();

  // Cache ainda válido, retorna sem fazer requisição
  if (cache.data && agora - cache.atualizadoEm < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const { data } = await axios.get(GADO_CONFIG_URL, { timeout: 8000 });
    cache = { data, atualizadoEm: agora };
    return data;
  } catch (err) {
    console.error('[gadoHandler] Falha ao buscar gadoConfig.json do GitHub, usando fallback local:', err.message);

    // Se já tem algo em cache (mesmo vencido), usa isso antes do fallback local
    if (cache.data) return cache.data;

    // Último recurso: arquivo local
    if (fs.existsSync(LOCAL_FALLBACK_PATH)) {
      const local = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_PATH, 'utf-8'));
      cache = { data: local, atualizadoEm: agora };
      return local;
    }

    throw new Error('Não foi possível obter o gadoConfig.json (remoto e local falharam).');
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
 * Sorteia `qtd` itens aleatórios e distintos de um array, sem repetir.
 */
function sortearItens(array, qtd) {
  const copia = [...array];
  const sorteados = [];
  const total = Math.min(qtd, copia.length);

  for (let i = 0; i < total; i++) {
    const idx = Math.floor(Math.random() * copia.length);
    sorteados.push(copia.splice(idx, 1)[0]);
  }

  return sorteados;
}

/**
 * Monta algumas linhas de frases do nível (emoji + texto), uma por linha.
 * Sorteia um número limitado de frases em vez de listar o array inteiro
 * (alguns níveis têm centenas de frases cadastradas no JSON).
 */
function montarFrasesDoNivel(config, nomeNivel, qtd = QTD_FRASES_EXIBIDAS) {
  const frases = config.frasesPorNivel[nomeNivel] || [];
  const sorteadas = sortearItens(frases, qtd);
  return sorteadas.map((f) => `${f.emoji} ${f.texto}`).join('\n');
}

/**
 * Monta a barra visual (blocos cheios + vazios) baseada na porcentagem.
 */
function montarBarra(config, porcentagem) {
  const tamanho = config.barraTamanho;
  const cheios = Math.round((porcentagem / 100) * tamanho);
  const vazios = tamanho - cheios;
  return config.blocoCheio.repeat(cheios) + config.blocoVazio.repeat(vazios);
}

/**
 * Monta a legenda com todas as faixas de classificação.
 */
function montarLegenda(config) {
  return config.classificacoes
    .map((c) => `${c.cor} ${c.min}%–${c.max}% → ${c.nome} ${c.emoji}`)
    .join('\n');
}

/**
 * Gera o texto final do Medidor de Gado para um usuário.
 * @param {string} nomeUsuario - Nome ou @tag do usuário (ex: "@andre")
 */
export async function gerarMedidorGado(nomeUsuario) {
  const config = await obterGadoConfig();

  const porcentagem = sortearPorcentagem();
  const classificacao = obterClassificacao(config, porcentagem);
  const barra = montarBarra(config, porcentagem);
  const frases = montarFrasesDoNivel(config, classificacao.nome);
  const resultadoFinal = config.resultadoFinal[classificacao.nome];

  const texto = `${config.titulo}
${nomeUsuario} é ${porcentagem}% gado! ${classificacao.cor}
📊 Nível de Gado:
${barra} ${porcentagem}%
🏆 Classificação: ${classificacao.nome} ${classificacao.emoji}
${frases}
${resultadoFinal}

${montarLegenda(config)}`;

  return texto;
}

/**
 * Descobre qual JID deve ser marcado no comando #gado.
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
 * seguindo o mesmo padrão de perfilHandler.js / rainhaHandler.js).
 *
 * Exemplo de uso dentro do commandHandlers.js:
 *
 *   import { gadoCommandHandler } from '../../handlers/command/gadoHandler.js';
 *   ...
 *   case 'gado':
 *     await gadoCommandHandler(sock, msg, from, mentionedJid);
 *     break;
 */
export async function gadoCommandHandler(sock, msg, from, mentionedJid) {
  const jidAlvo = resolverJidAlvo(msg, mentionedJid);
  const nomeAlvo = `@${jidAlvo.split('@')[0]}`;
  const numeroExibicao = jidAlvo.split('@')[0];

  try {
    // ⏳ MENSAGEM 1 — suspense inicial
    await sock.sendMessage(
      from,
      { text: `⏳ _Só um momento... estou analisando @${numeroExibicao}..._`, mentions: [jidAlvo] },
      { quoted: msg }
    );

    await sleep(3000);

    // 🔍 MENSAGEM 2 — mais suspense
    await sock.sendMessage(
      from,
      { text: `🔍 _Vasculhando os dados... quase lá..._` },
      { quoted: msg }
    );

    await sleep(3000);

    // 🧠 MENSAGEM 3 — suspense máximo
    await sock.sendMessage(
      from,
      { text: `🧠 _Processando resultado final... prepare-se!_` },
      { quoted: msg }
    );

    await sleep(2000);

    // 🐄 RESULTADO FINAL — gera o texto só agora, pra "sortear" na hora certa
    const texto = await gerarMedidorGado(nomeAlvo);

    await sock.sendMessage(
      from,
      {
        text: texto,
        mentions: [jidAlvo],
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('[gadoCommandHandler] Erro ao gerar medidor de gado:', err.message);
    await sock.sendMessage(
      from,
      { text: '⚠️ Não consegui buscar o Medidor de Gado agora, tenta de novo daqui a pouco.' },
      { quoted: msg }
    );
  }
}