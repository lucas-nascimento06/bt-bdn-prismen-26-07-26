// golpeHandler.js
import fetch from 'node-fetch';

const URL_GOLPE = 'https://raw.githubusercontent.com/lucas-nascimento06/golpe/refs/heads/main/golpe.json';

let frasesCache = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function carregarFrases() {
  if (frasesCache) return frasesCache;
  try {
    console.log('📡 [golpe] Baixando frases do GitHub...');
    const res = await fetch(URL_GOLPE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    frasesCache = await res.json();
    console.log('✅ [golpe] Frases carregadas com sucesso!');
    return frasesCache;
  } catch (err) {
    console.error('❌ [golpe] Erro ao carregar frases:', err.message);
    return {
      altissimo: {
        titulo: "🚨 ALERTA MÁXIMO! GOLPISTA NATO!",
        frases: [{ texto: "Esse aqui é golpista raiz!" }]
      },
      alto: {
        titulo: "⚠️ ALTO RISCO! Cuidado!",
        frases: [{ texto: "Sinal vermelho! Muita atenção com esse!" }]
      },
      medio: {
        titulo: "🟡 Risco moderado. Fique esperto!",
        frases: [{ texto: "Nem anjo, nem golpista. Fica de olho!" }]
      },
      baixo: {
        titulo: "💚 Baixo risco. Parece confiável!",
        frases: [{ texto: "Sinal verde! Pode confiar com cautela!" }]
      },
      zero: {
        titulo: "💖 Coração puro detectado!",
        frases: [{ texto: "Zero golpe! Pessoa rara e verdadeira!" }]
      }
    };
  }
}

function getFaixa(porcentagem) {
  if (porcentagem >= 85) return "altissimo";
  if (porcentagem >= 65) return "alto";
  if (porcentagem >= 40) return "medio";
  if (porcentagem >= 15) return "baixo";
  return "zero";
}

function getEmojiBarra(porcentagem) {
  const total = 10;
  const preenchido = Math.round((porcentagem / 100) * total);
  const vazio = total - preenchido;
  return "🟥".repeat(preenchido) + "⬜".repeat(vazio);
}

function getRandomFrase(faixaObj) {
  if (faixaObj && typeof faixaObj === 'object' && Array.isArray(faixaObj.frases)) {
    const arr = faixaObj.frases;
    if (arr.length === 0) return "Sem informações disponíveis.";
    const item = arr[Math.floor(Math.random() * arr.length)];
    return typeof item === 'object' ? item.texto : item;
  }
  if (Array.isArray(faixaObj)) {
    if (faixaObj.length === 0) return "Sem informações disponíveis.";
    const item = faixaObj[Math.floor(Math.random() * faixaObj.length)];
    return typeof item === 'object' ? item.texto : item;
  }
  return "Sem informações disponíveis.";
}

export async function golpeHandler(sock, message, from) {
  try {
    console.log('🔍 [golpe] Handler iniciado');

    const frases = await carregarFrases();

    const { key, message: msg } = message;

    // ─── Mesma lógica do banHandler ─────────────────────────────────────────
    // Pega o conteúdo de texto igual ao ban
    const messageContent = msg?.extendedTextMessage?.text || msg?.conversation || '';
    const contextInfo    = msg?.extendedTextMessage?.contextInfo;
    const mentionedJid   = contextInfo?.mentionedJid;

    let jidAlvo = null;

    // MODO 1: respondeu a mensagem de alguém (igual ao ban)
    if (msg?.extendedTextMessage?.contextInfo?.participant) {
      const quotedParticipant = contextInfo?.participantAlt || contextInfo?.participant;
      if (quotedParticipant && contextInfo?.quotedMessage) {
        jidAlvo = quotedParticipant;
        console.log('🧪 [golpe] Modo: REPLY → jidAlvo:', jidAlvo);
      }
    }

    // MODO 2: menção direta — #golpe @pessoa (igual ao ban)
    if (!jidAlvo && mentionedJid?.length > 0) {
      jidAlvo = mentionedJid[0];
      console.log('🧪 [golpe] Modo: MENÇÃO → jidAlvo:', jidAlvo);
    }

    // Nenhum alvo encontrado
    if (!jidAlvo) {
      await sock.sendMessage(
        from,
        { text: '❌ Responda a mensagem de alguém ou mencione alguém para usar o #golpe!\n\nExemplo: *#golpe @pessoa* ou respondendo a mensagem dela.' },
        { quoted: message }
      );
      return;
    }

    const numeroExibicao = jidAlvo.split('@')[0];

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

    // Calcula resultado
    const porcentagem = Math.floor(Math.random() * 101);
    const faixa    = getFaixa(porcentagem);
    const barra    = getEmojiBarra(porcentagem);
    const faixaObj = frases[faixa];
    const titulo   = faixaObj?.titulo || "";
    const veredito = getRandomFrase(faixaObj);

    console.log(`🧪 porcentagem=${porcentagem} | faixa="${faixa}" | veredito="${veredito}"`);

    const texto =
      `💘 *DETECTOR DE GOLPISTA* 💘\n` +
      `┗━━━━━━━━🕵️‍♂️━━━━━━━┛\n` +
      `👤 *Analisado(a):* @${numeroExibicao}\n` +
      `🔍 _Analisando o nível de golpe neste exato momento..._\n\n` +
      `📊 *Nível de Golpe:*\n` +
      `${barra}\n` +
      `🎯 *${porcentagem}%* de golpista\n` +
      `${titulo}\n` +
      `> ${veredito}\n\n` +
       `╰─❖💃🏼⃟⃟💻✰͜͡҈➳Rᵉˢᵘˡᵗᵃᵈᵒ ᵍᵉʳᵃᵈᵒ ᵖᵉˡᵃ 𝐢𝐚 ᵈᵒ ᵍʳᵘᵖᵒ Dᵃᵐᵃˢ ᵈᵃ Nⁱᵍʰᵗ™✨✠̤⃢⃞⃟֟🧐⃟⃟ 🔍🕵🏻⃟⃝🧬💃🏼 ⃧⃟⃞⃟🔥`;

    const quotedMsg = contextInfo?.quotedMessage
      ? {
          key: {
            remoteJid:   from,
            fromMe:      false,
            id:          contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: contextInfo.quotedMessage,
        }
      : message;

    await sock.sendMessage(
      from,
      { text: texto, mentions: [jidAlvo] },
      { quoted: quotedMsg }
    );

    console.log('✅ [golpe] Mensagem enviada com sucesso!');

  } catch (error) {
    console.error('❌ ERRO golpe:', error);
    await sock.sendMessage(
      from,
      { text: `❌ Erro: ${error.message}` },
      { quoted: message }
    );
  }
}