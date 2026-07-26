import fetch from 'node-fetch';
import pool from '../../../db.js';
import {
  buildSystemPrompt,
  AVISO_PROIBIDO,
  AVISO_OFENSIVO_PROMPT,
  PALAVRAS_PROIBIDAS,
  PALAVROES_GRAVES,
} from './mayaPrompts.js';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

// ============================================
// 🔍 BUSCA NOME DO USUÁRIO NO BANCO
// ============================================
async function getNomeUsuario(numero) {
  try {
    const numeroLimpo = numero.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const res = await pool.query(
      `SELECT nome FROM mensagens_grupo
       WHERE usuario_id = $1 AND nome IS NOT NULL AND nome != ''
       ORDER BY id DESC LIMIT 1`,
      [numeroLimpo]
    );
    return res.rows[0]?.nome ?? null;
  } catch (err) {
    console.error('❌ [Maya Kyteler] Erro ao buscar nome:', err.message);
    return null;
  }
}

// ============================================
// 🚨 MODERAÇÃO DE CONTEÚDO
// ============================================
function verificarConteudo(texto) {
  const lower = texto.toLowerCase();
  for (const palavra of PALAVRAS_PROIBIDAS) {
    if (lower.includes(palavra)) return 'proibido';
  }
  for (const palavra of PALAVROES_GRAVES) {
    if (lower.includes(palavra)) return 'ofensivo';
  }
  return 'ok';
}

async function gerarAvisoOfensivo() {
  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: buildSystemPrompt(null) },
          { role: 'user', content: AVISO_OFENSIVO_PROMPT },
        ],
        max_tokens: 80,
        temperature: 0.9,
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '🛑 Sem ofensa aqui, bora se respeitar! 💛';
  } catch (err) {
    console.error('❌ [Maya Kyteler] Erro ao gerar aviso ofensivo:', err.message);
    return '🛑 Sem ofensa aqui, bora se respeitar! 💛';
  }
}

// ============================================
// 🕐 PERÍODO DO DIA (horário de Brasília)
// ============================================
function getPeriodoDia() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  const diasSemana = [
    'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado',
  ];
  const diaSemana = diasSemana[now.getDay()];
  const agora = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = now.getHours();

  let periodo;
  if (hora >= 5 && hora < 12) periodo = 'manhã';
  else if (hora >= 12 && hora < 18) periodo = 'tarde';
  else if (hora >= 18 && hora < 23) periodo = 'noite';
  else periodo = 'madrugada';

  return `[Contexto de horário: hoje é ${diaSemana}, ${agora}, período: ${periodo}]`;
}

// ============================================
// 🧹 REMOVE PREFIXO SE O MODELO TEIMAR
// ============================================
function limparResposta(texto) {
  return texto.replace(/^Maya\s*:\s*/i, '').trim();
}

// ============================================
// 📝 HISTÓRICO POR USUÁRIO
// ============================================
const historicos = new Map();
const MAX_HISTORICO = 10;

// ============================================
// 🔴🟢 CONTROLE DE GRUPOS
// ============================================
const gruposAtivos = new Set();

export function ativarIA(groupId) {
  gruposAtivos.add(groupId);
  console.log(`🟢 [Maya Kyteler] IA ativada no grupo: ${groupId}`);
}

export function pausarIA(groupId) {
  gruposAtivos.delete(groupId);
  console.log(`🔴 [Maya Kyteler] IA pausada no grupo: ${groupId}`);
}

export function isIAAtiva(groupId) {
  return gruposAtivos.has(groupId);
}

// ============================================
// ⏱️ DELAY HUMANO — entre 20 e 25 segundos
// ============================================
function delayHumano() {
  const ms = Math.floor(Math.random() * (25000 - 20000 + 1)) + 20000;
  console.log(`⏱️ [Maya Kyteler] Aguardando ${ms / 1000}s antes de responder...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 🤖 RESPOSTA NATURAL
// ============================================
export async function responderNaturalmente(userId, textoUsuario) {
  try {
    const status = verificarConteudo(textoUsuario);

    if (status === 'proibido') {
      console.warn(`🚨 [Maya Kyteler] Conteúdo proibido detectado de ${userId}`);
      await delayHumano();
      return AVISO_PROIBIDO;
    }

    if (status === 'ofensivo') {
      console.warn(`⚠️ [Maya Kyteler] Conteúdo ofensivo detectado de ${userId}`);
      await delayHumano();
      return await gerarAvisoOfensivo();
    }

    // 🔍 Busca nome do usuário no banco
    const nome = await getNomeUsuario(userId);
    console.log('👤 Nome encontrado:', nome, '| userId:', userId);
    if (nome) {
      console.log(`👤 [Maya Kyteler] Falando com: ${nome}`);
    }

    // ⏱️ Esperar antes de responder
    await delayHumano();

    if (!historicos.has(userId)) {
      historicos.set(userId, []);
    }
    const historico = historicos.get(userId);

    const periodoAtual = getPeriodoDia();
    const mensagemComContexto = `${periodoAtual}\n${textoUsuario}`;

    historico.push({ role: 'user', content: mensagemComContexto });

    if (historico.length > MAX_HISTORICO) {
      historico.splice(0, historico.length - MAX_HISTORICO);
    }

    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: buildSystemPrompt(nome) },
          ...historico,
        ],
        max_tokens: 150,
        temperature: 0.85,
      }),
    });

    const data = await response.json();
    const respostaBruta = data.choices?.[0]?.message?.content?.trim();
    const resposta = respostaBruta ? limparResposta(respostaBruta) : null;

    if (resposta) {
      historico.push({ role: 'assistant', content: resposta });
    }

    return resposta ?? null;

  } catch (err) {
    console.error('❌ [Maya Kyteler] Erro:', err.message);
    return null;
  }
}