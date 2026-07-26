// contatoHandler.js
import pool from '../../../../db.js';

// ============================================
// 🗄️ INIT TABELA
// ============================================
export async function initContatosDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contatos_salvos (
      id         SERIAL PRIMARY KEY,
      numero     TEXT NOT NULL UNIQUE,
      nome       TEXT,
      foto_url   TEXT,
      salvo_por  TEXT,
      criado_em  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('🗄️ Tabela contatos_salvos verificada.');
}

// ============================================
// 💾 #salva / #s +55 21 99999-9999 Maria Silva
// Só owner pode usar
// ============================================
export async function handleSalvaContato(sock, message) {
  const from    = message.key.remoteJid;
  const userId  = message.key.participant || message.key.remoteJid;
  const content =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text || '';

  const OWNER_NUMBERS = ['555195201826', '5521972337640'];

  const remetenteReal = message.key.participantAlt || message.key.participant || userId;
  const remetenteNum  = remetenteReal.replace(/\D/g, '').replace(/^.*?(\d{10,13})$/, '$1');

  if (!OWNER_NUMBERS.some(o => remetenteReal.includes(o))) {
    await sock.sendMessage(from, {
      text: '❌ Apenas admins podem usar #salva.',
    }, { quoted: message });
    return true;
  }

  // ✅ Aceita #salva ou #s
  const match = content.match(/^#(?:salva|s)\s+([\d\s\(\)\-\+]+?)(?:\s+([a-zA-ZÀ-ÿ\s]+))?$/i);
  if (!match) {
    await sock.sendMessage(from, {
      text: '❌ Formato inválido.\n✅ Use: *#salva +55 21 99999-9999 Nome*\n✅ Ou: *#s +55 21 99999-9999 Nome*',
    }, { quoted: message });
    return true;
  }

  const numeroLimpo = match[1].replace(/\D/g, '');
  const nome        = match[2]?.trim() || 'Sem nome';

  if (numeroLimpo.length < 10) {
    await sock.sendMessage(from, {
      text: '❌ Número inválido. Verifique e tente novamente.',
    }, { quoted: message });
    return true;
  }

  // Busca foto de perfil
  let fotoUrl = null;
  try {
    fotoUrl = await sock.profilePictureUrl(`${numeroLimpo}@s.whatsapp.net`, 'image');
  } catch {
    fotoUrl = null;
  }

  await pool.query(
    `INSERT INTO contatos_salvos (numero, nome, foto_url, salvo_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (numero)
     DO UPDATE SET
       nome      = EXCLUDED.nome,
       foto_url  = COALESCE(EXCLUDED.foto_url, contatos_salvos.foto_url),
       salvo_por = EXCLUDED.salvo_por`,
    [numeroLimpo, nome, fotoUrl, remetenteNum]
  );

  const fotoMsg = fotoUrl ? '🖼️ Foto salva!' : '📷 Sem foto de perfil.';
  await sock.sendMessage(from, {
    text: `✅ Contato salvo!\n👤 Nome: ${nome}\n📱 Número: ${numeroLimpo}\n${fotoMsg}`,
  }, { quoted: message });

  return true;
}

// ============================================
// 📋 #contato / #c — lista todos com foto
// Só owner pode usar
// ============================================
export async function handleListarContatos(sock, message) {
  const from   = message.key.remoteJid;
  const userId = message.key.participant || message.key.remoteJid;

  const OWNER_NUMBERS = ['555195201826', '5521972337640'];
  const remetenteReal = message.key.participantAlt || message.key.participant || userId;

  if (!OWNER_NUMBERS.some(o => remetenteReal.includes(o))) {
    await sock.sendMessage(from, {
      text: '❌ Apenas admins podem usar #contatos.',
    }, { quoted: message });
    return true;
  }

  const res = await pool.query(
    `SELECT numero, nome, foto_url, criado_em
     FROM contatos_salvos
     ORDER BY criado_em DESC`
  );

  if (res.rows.length === 0) {
    await sock.sendMessage(from, {
      text: '📋 Nenhum contato salvo ainda.\nUse *#salva +55 XX XXXXX-XXXX Nome* para salvar.',
    }, { quoted: message });
    return true;
  }

  // ✅ Envia um por um com foto + legenda
  for (const r of res.rows) {
    const data    = new Date(r.criado_em).toLocaleDateString('pt-BR');
    const legenda = `👤 *${r.nome}*\n📱 \`${r.numero}\`\n📅 ${data}`;

    if (r.foto_url) {
      try {
        await sock.sendMessage(from, {
          image: { url: r.foto_url },
          caption: legenda,
        });
        continue;
      } catch {
        // se falhar, cai no texto
      }
    }

    // Sem foto — envia só texto
    await sock.sendMessage(from, { text: legenda });
  }

  return true;
}