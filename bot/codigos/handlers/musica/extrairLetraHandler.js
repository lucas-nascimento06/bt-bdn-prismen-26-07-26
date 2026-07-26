// 🎵 EXTRATOR DE LETRA — busca por nome da música
// Estratégia: lyrics.ovh -> Letras.mus.br (lib) -> Vagalume
import axios from 'axios';
import { searchLyrics } from 'letras-de-musica';

// ============================================
// 🔑 CONFIG VAGALUME (opcional)
// Só é usado se você tiver uma chave. Cadastro em
// https://api.vagalume.com.br — se não conseguir acessar
// o site, não tem problema, essa fonte é pulada e o
// Letras.mus.br (abaixo) cobre bem o repertório BR/sertanejo.
// ============================================
const VAGALUME_API_KEY = process.env.VAGALUME_API_KEY || null;

// ============================================
// 1️⃣ FONTE: lyrics.ovh (gratuita, sem chave)
// Catálogo menor — funciona melhor para música internacional.
// Retorna { letra, imagemUrl: null } ou null
// ============================================
async function buscarLetraLyricsOvh(musica, artista) {
    try {
        console.log(`🔍 [lyrics.ovh] Buscando: "${artista} - ${musica}"`);
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artista || '')}/${encodeURIComponent(musica)}`;
        const { data } = await axios.get(url, { timeout: 8000 });

        if (data?.lyrics) {
            return { letra: data.lyrics.trim(), imagemUrl: null };
        }
        return null;
    } catch (error) {
        console.error('❌ [lyrics.ovh] Erro ao buscar letra:', error.message);
        return null;
    }
}

// ============================================
// 2️⃣ FONTE: Letras.mus.br via lib "letras-de-musica" (npm)
// Não precisa de chave. A lib já cuida da busca no site e da
// extração da letra — muito mais confiável que adivinhar a URL
// na mão (o site usa IDs numéricos pra muitas músicas, então
// "artista/nome-da-musica/" nem sempre existe).
// ============================================
async function buscarLetraLetrasMus(musica, artista) {
    try {
        const query = artista ? `${artista} ${musica}` : musica;
        console.log(`🔍 [Letras.mus.br] Buscando: "${query}"`);

        const resultado = await searchLyrics(query);

        if (resultado?.lyrics) {
            return { letra: resultado.lyrics.trim(), imagemUrl: null };
        }
        return null;
    } catch (error) {
        console.error('❌ [Letras.mus.br] Erro ao buscar letra:', error.message);
        return null;
    }
}

// ============================================
// 3️⃣ FONTE: Vagalume (bom catálogo BR/sertanejo, opcional)
// Precisa de API key gratuita em https://api.vagalume.com.br
// Retorna { letra, imagemUrl } ou null
// ============================================
async function buscarLetraVagalume(musica, artista) {
    if (!VAGALUME_API_KEY) {
        console.warn('⚠️ [Vagalume] VAGALUME_API_KEY não configurada, pulando esta fonte.');
        return null;
    }

    try {
        console.log(`🔍 [Vagalume] Buscando: "${artista} - ${musica}"`);
        const url = 'https://api.vagalume.com.br/search.php';
        const { data } = await axios.get(url, {
            params: {
                art: artista || '',
                mus: musica,
                apikey: VAGALUME_API_KEY,
            },
            timeout: 8000,
        });

        if ((data?.type === 'exact' || data?.type === 'aprox') && data?.mus?.[0]?.text) {
            const imagemUrl = data?.art?.pic_medium || data?.art?.pic_small || null;
            return { letra: data.mus[0].text.trim(), imagemUrl };
        }

        return null;
    } catch (error) {
        console.error('❌ [Vagalume] Erro ao buscar letra:', error.message);
        return null;
    }
}

// ============================================
// 🔗 WRAPPER EXPORTADO — usado pelo musicaHandler.js
// Recebe (autor, titulo), tenta cada fonte em ordem
// e retorna a primeira letra encontrada (ou null).
// ============================================
export async function buscarLetra(autor, titulo) {
    // 1. lyrics.ovh
    let resultado = await buscarLetraLyricsOvh(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via lyrics.ovh');
        return resultado.letra;
    }

    // 2. Letras.mus.br (sem necessidade de chave — ótimo pra sertanejo/BR)
    resultado = await buscarLetraLetrasMus(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via Letras.mus.br');
        return resultado.letra;
    }

    // 3. Vagalume (só roda se você tiver configurado a chave)
    resultado = await buscarLetraVagalume(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via Vagalume');
        return resultado.letra;
    }

    console.warn(`⚠️ Nenhuma fonte encontrou letra para: ${titulo} - ${autor}`);
    return null;
}

// ============================================
// 🔗 VARIANTE — retorna também a imagem/capa, se disponível
// Use esta se seu handler precisar da imagem além da letra.
// ============================================
export async function buscarLetraComImagem(autor, titulo) {
    let resultado = await buscarLetraLyricsOvh(titulo, autor);
    if (resultado?.letra) return { ...resultado, fonte: 'lyrics.ovh' };

    resultado = await buscarLetraLetrasMus(titulo, autor);
    if (resultado?.letra) return { ...resultado, fonte: 'letras.mus.br' };

    resultado = await buscarLetraVagalume(titulo, autor);
    if (resultado?.letra) return { ...resultado, fonte: 'vagalume' };

    return null;
}