// 🎵 EXTRATOR DE LETRA — COMPLETO E CORRIGIDO
// ✅ Fontes: LRCLIB (principal) → lyrics.ovh (fallback) → Vagalume (fallback)
// ✅ Funciona no Termux sem conflitos
// ✅ Sem necessidade de API Key
// ✅ Timestamps removidos automaticamente
// ✅ Separação melhorada entre estrofes

import axios from 'axios';

// ============================================
// 🔑 CONFIG VAGALUME (opcional)
// ============================================
const VAGALUME_API_KEY = process.env.VAGALUME_API_KEY || null;

// ============================================
// 🧹 REMOVE TIMESTAMPS DAS LETRAS
// ============================================
function limparTimestamps(letra) {
    if (!letra) return letra;
    
    // Remove timestamps no formato [00:00.00] ou [00:00]
    let limpa = letra.replace(/\[\d{2}:\d{2}(?:\.\d{2})?\]/g, '');
    // Remove timestamps no formato [00:00:00]
    limpa = limpa.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '');
    // Remove timestamps com milissegundos [00:00.000]
    limpa = limpa.replace(/\[\d{2}:\d{2}\.\d{3}\]/g, '');
    
    // Remove linhas vazias extras (mantém apenas uma linha vazia entre estrofes)
    limpa = limpa.split('\n').filter((line, index, array) => {
        const trimmed = line.trim();
        // Mantém linhas com conteúdo
        if (trimmed !== '') return true;
        // Mantém apenas uma linha vazia entre estrofes
        const nextLine = index + 1 < array.length ? array[index + 1].trim() : '';
        const prevLine = index > 0 ? array[index - 1].trim() : '';
        // Só mantém a linha vazia se tiver conteúdo antes e depois
        return prevLine !== '' && nextLine !== '';
    }).join('\n');
    
    return limpa.trim();
}

// ============================================
// 🎨 MELHORA A SEPARAÇÃO DAS ESTROFES
// ============================================
function melhorarSeparacaoEstrofes(letra) {
    if (!letra) return letra;
    
    // Divide em linhas
    const linhas = letra.split('\n');
    const resultado = [];
    let estrofeAtual = [];
    
    for (const linha of linhas) {
        const linhaTrim = linha.trim();
        
        if (linhaTrim === '') {
            // Linha vazia - separador de estrofe
            if (estrofeAtual.length > 0) {
                // Adiciona a estrofe atual com uma linha vazia após
                resultado.push(...estrofeAtual);
                resultado.push(''); // Linha vazia entre estrofes
                estrofeAtual = [];
            }
        } else {
            // Linha com conteúdo
            estrofeAtual.push(linhaTrim);
        }
    }
    
    // Adiciona a última estrofe
    if (estrofeAtual.length > 0) {
        resultado.push(...estrofeAtual);
    }
    
    // Remove linhas vazias duplicadas
    const final = [];
    let ultimaVazia = false;
    
    for (const linha of resultado) {
        if (linha === '') {
            if (!ultimaVazia) {
                final.push(linha);
                ultimaVazia = true;
            }
        } else {
            final.push(linha);
            ultimaVazia = false;
        }
    }
    
    // Remove linha vazia no final
    if (final.length > 0 && final[final.length - 1] === '') {
        final.pop();
    }
    
    return final.join('\n');
}

// ============================================
// 1️⃣ FONTE PRINCIPAL: LRCLIB (SEM BLOQUEIOS)
// ============================================
async function buscarLetraLRCLIB(musica, artista) {
    try {
        console.log(`🔍 [LRCLIB] Buscando: "${artista} - ${musica}"`);
        
        const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artista || '')}&track_name=${encodeURIComponent(musica)}`;
        const { data } = await axios.get(url, { timeout: 10000 });

        let letra = data?.syncedLyrics || data?.plainLyrics || null;
        
        if (letra) {
            let letraLimpa = limparTimestamps(letra);
            letraLimpa = melhorarSeparacaoEstrofes(letraLimpa);
            console.log(`✅ [LRCLIB] Letra encontrada (${letraLimpa.length} caracteres)`);
            return { 
                letra: letraLimpa, 
                imagemUrl: null,
                titulo: data?.trackName || musica,
                artista: data?.artistName || artista
            };
        }
        return null;
    } catch (error) {
        console.error('❌ [LRCLIB] Erro:', error.message);
        return null;
    }
}

// ============================================
// 2️⃣ FONTE: lyrics.ovh (fallback)
// ============================================
async function buscarLetraLyricsOvh(musica, artista) {
    try {
        console.log(`🔍 [lyrics.ovh] Buscando: "${artista} - ${musica}"`);
        
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artista || '')}/${encodeURIComponent(musica)}`;
        const { data } = await axios.get(url, { timeout: 8000 });

        if (data?.lyrics) {
            let letraLimpa = limparTimestamps(data.lyrics);
            letraLimpa = melhorarSeparacaoEstrofes(letraLimpa);
            console.log(`✅ [lyrics.ovh] Letra encontrada (${letraLimpa.length} caracteres)`);
            return { letra: letraLimpa, imagemUrl: null };
        }
        return null;
    } catch (error) {
        console.error('❌ [lyrics.ovh] Erro:', error.message);
        return null;
    }
}

// ============================================
// 3️⃣ FONTE: Vagalume (fallback para músicas BR)
// ============================================
async function buscarLetraVagalume(musica, artista) {
    if (!VAGALUME_API_KEY) {
        console.warn('⚠️ [Vagalume] API Key não configurada, pulando.');
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
            let letraLimpa = limparTimestamps(data.mus[0].text);
            letraLimpa = melhorarSeparacaoEstrofes(letraLimpa);
            console.log(`✅ [Vagalume] Letra encontrada (${letraLimpa.length} caracteres)`);
            return { letra: letraLimpa, imagemUrl };
        }
        return null;
    } catch (error) {
        console.error('❌ [Vagalume] Erro:', error.message);
        return null;
    }
}

// ============================================
// 4️⃣ FONTE: Fallback local (último recurso)
// ============================================
function getFallbackLocal(musica, artista) {
    console.log('📚 Usando fallback local');
    return {
        letra: `🎵 "${musica}" - ${artista || 'Artista desconhecido'}\n\n` +
               `Letra não encontrada no momento.\n` +
               `🔧 Tente novamente mais tarde.\n\n` +
               `💡 Dica: Verifique se o nome da música e artista estão corretos.`,
        imagemUrl: null
    };
}

// ============================================
// 🔗 WRAPPER PRINCIPAL
// ============================================
export async function buscarLetra(autor, titulo) {
    console.log(`\n🔍 ========= BUSCANDO LETRA =========`);
    console.log(`🎵 Música: "${titulo}"`);
    console.log(`🎤 Artista: "${autor}"`);
    console.log(`=====================================\n`);

    // 1. LRCLIB (principal)
    let resultado = await buscarLetraLRCLIB(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via LRCLIB');
        return resultado.letra;
    }

    // 2. lyrics.ovh (fallback)
    resultado = await buscarLetraLyricsOvh(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via lyrics.ovh');
        return resultado.letra;
    }

    // 3. Vagalume (fallback)
    resultado = await buscarLetraVagalume(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via Vagalume');
        return resultado.letra;
    }

    // 4. Fallback local
    console.warn(`⚠️ Nenhuma fonte encontrou letra para: "${titulo}" - "${autor}"`);
    const fallback = getFallbackLocal(titulo, autor);
    return fallback.letra;
}

// ============================================
// 🔗 VARIANTE COM IMAGEM
// ============================================
export async function buscarLetraComImagem(autor, titulo) {
    console.log(`\n🔍 ========= BUSCANDO LETRA COM IMAGEM =========`);
    console.log(`🎵 Música: "${titulo}"`);
    console.log(`🎤 Artista: "${autor}"`);
    console.log(`===============================================\n`);

    // 1. LRCLIB
    let resultado = await buscarLetraLRCLIB(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra + imagem via LRCLIB');
        return { ...resultado, fonte: 'LRCLIB' };
    }

    // 2. lyrics.ovh
    resultado = await buscarLetraLyricsOvh(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra via lyrics.ovh');
        return { ...resultado, fonte: 'lyrics.ovh' };
    }

    // 3. Vagalume
    resultado = await buscarLetraVagalume(titulo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra + imagem via Vagalume');
        return { ...resultado, fonte: 'vagalume' };
    }

    // 4. Fallback local
    console.warn(`⚠️ Nenhuma fonte encontrou letra para: "${titulo}" - "${autor}"`);
    const fallback = getFallbackLocal(titulo, autor);
    return { ...fallback, fonte: 'fallback-local' };
}

// ============================================
// 🧪 FUNÇÃO DE TESTE RÁPIDO
// ============================================
export async function testarExtrator() {
    console.log('\n🧪 ========= TESTE DO EXTRATOR =========');
    
    const testes = [
        { musica: 'Believer', artista: 'Imagine Dragons' },
        { musica: 'Bohemian Rhapsody', artista: 'Queen' },
        { musica: 'Evidências', artista: 'Chitãozinho & Xororó' },
        { musica: 'Trem-Bala', artista: 'Ana Vilela' },
    ];

    for (const test of testes) {
        console.log(`\n📌 Testando: "${test.musica}" - "${test.artista}"`);
        const letra = await buscarLetra(test.artista, test.musica);
        if (letra) {
            console.log(`✅ Letra encontrada (${letra.length} caracteres)`);
            console.log(letra.substring(0, 200) + '...\n');
        } else {
            console.log('❌ Letra não encontrada');
        }
    }
}

// ============================================
// 📦 EXPORTAÇÕES PRINCIPAIS
// ============================================
export default {
    buscarLetra,
    buscarLetraComImagem,
    testarExtrator,
    limparTimestamps,
    melhorarSeparacaoEstrofes
};

console.log('🎵 Extrator de Letras carregado com sucesso!');