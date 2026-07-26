// 🎵 EXTRATOR DE LETRA
// ✅ Fontes: LRCLIB (principal) → lyrics.ovh (fallback) → Vagalume (fallback)
// ✅ Funciona no Termux sem conflitos
// ✅ Sem necessidade de API Key
// ✅ Timestamps removidos automaticamente
// ✅ Separação melhorada entre estrofes
// ✅ Limpeza automática de título (remove lixo do YouTube antes de buscar)

import axios from 'axios';

// ============================================
// 🔑 CONFIG VAGALUME (opcional)
// ============================================
const VAGALUME_API_KEY = process.env.VAGALUME_API_KEY || null;

// ============================================
// 🧹 LIMPA TÍTULO ANTES DE BUSCAR LETRA
// ============================================
// Remove lixo comum de títulos do YouTube, como:
// "(Áudio Oficial)", "(Official Video)", "[Clipe Oficial]", "- Topic", "VEVO"
// e também remove duplicação do nome do artista dentro do próprio título.
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function limparTituloBusca(titulo, artista) {
    if (!titulo) return titulo;

    let limpo = titulo;

    // Remove parênteses/colchetes contendo termos de vídeo/áudio
    limpo = limpo.replace(
        /[\(\[][^\)\]]*?(áudio|audio|oficial|official|lyric|lyrics|clipe|clip|video|vídeo|hd|4k|visualizer|legendado|tradução|traduzido|reaction|ao vivo|live)[^\)\]]*?[\)\]]/gi,
        ''
    );

    // Remove sufixos comuns tipo "- Topic" ou "VEVO"
    limpo = limpo.replace(/\s*-\s*(topic|vevo)\b/gi, '');

    // Remove separadores duplicados tipo " - - "
    limpo = limpo.replace(/-\s*-/g, '-');

    // Se o artista aparece duplicado no início do título (ex: "Artista - Artista - Musica")
    if (artista) {
        const artistaEscapado = escapeRegex(artista);
        const artistaRegex = new RegExp(`^\\s*${artistaEscapado}\\s*-\\s*`, 'i');
        limpo = limpo.replace(artistaRegex, '');
        // Executa duas vezes para o caso de duplicação dupla ("Artista - Artista - Musica")
        limpo = limpo.replace(artistaRegex, '');
    }

    // Remove espaços múltiplos e espaços nas pontas
    limpo = limpo.replace(/\s+/g, ' ').trim();

    // Remove hífen solto que sobrou no início ou fim
    limpo = limpo.replace(/^-\s*/, '').replace(/\s*-$/, '').trim();

    return limpo || titulo; // fallback de segurança: nunca retorna string vazia
}

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
    // 🧹 Limpa o título ANTES de qualquer busca (remove "(Áudio Oficial)",
    // artista duplicado, "- Topic", "VEVO", etc.)
    const tituloOriginal = titulo;
    const tituloLimpo = limparTituloBusca(titulo, autor);

    console.log(`\n🔍 ========= BUSCANDO LETRA =========`);
    console.log(`🎵 Música (original): "${tituloOriginal}"`);
    console.log(`🧹 Música (limpa):    "${tituloLimpo}"`);
    console.log(`🎤 Artista: "${autor}"`);
    console.log(`=====================================\n`);

    // 1. LRCLIB (principal) - tenta com título limpo
    let resultado = await buscarLetraLRCLIB(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via LRCLIB');
        return resultado.letra;
    }

    // 2. lyrics.ovh (fallback) - tenta com título limpo
    resultado = await buscarLetraLyricsOvh(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via lyrics.ovh');
        return resultado.letra;
    }

    // 3. Vagalume (fallback) - tenta com título limpo
    resultado = await buscarLetraVagalume(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra encontrada via Vagalume');
        return resultado.letra;
    }

    // 3.5 Retry: se o título limpo for diferente do original e todas falharam,
    // tenta mais uma vez só com LRCLIB usando o título original (rede de segurança)
    if (tituloLimpo !== tituloOriginal) {
        resultado = await buscarLetraLRCLIB(tituloOriginal, autor);
        if (resultado?.letra) {
            console.log('✅ Letra encontrada via LRCLIB (título original)');
            return resultado.letra;
        }
    }

    // 4. Fallback local
    console.warn(`⚠️ Nenhuma fonte encontrou letra para: "${tituloLimpo}" - "${autor}"`);
    const fallback = getFallbackLocal(tituloLimpo, autor);
    return fallback.letra;
}

// ============================================
// 🔗 VARIANTE COM IMAGEM
// ============================================
export async function buscarLetraComImagem(autor, titulo) {
    // 🧹 Limpa o título ANTES de qualquer busca
    const tituloOriginal = titulo;
    const tituloLimpo = limparTituloBusca(titulo, autor);

    console.log(`\n🔍 ========= BUSCANDO LETRA COM IMAGEM =========`);
    console.log(`🎵 Música (original): "${tituloOriginal}"`);
    console.log(`🧹 Música (limpa):    "${tituloLimpo}"`);
    console.log(`🎤 Artista: "${autor}"`);
    console.log(`===============================================\n`);

    // 1. LRCLIB
    let resultado = await buscarLetraLRCLIB(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra + imagem via LRCLIB');
        return { ...resultado, fonte: 'LRCLIB' };
    }

    // 2. lyrics.ovh
    resultado = await buscarLetraLyricsOvh(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra via lyrics.ovh');
        return { ...resultado, fonte: 'lyrics.ovh' };
    }

    // 3. Vagalume
    resultado = await buscarLetraVagalume(tituloLimpo, autor);
    if (resultado?.letra) {
        console.log('✅ Letra + imagem via Vagalume');
        return { ...resultado, fonte: 'vagalume' };
    }

    // 3.5 Retry com título original, se diferente
    if (tituloLimpo !== tituloOriginal) {
        resultado = await buscarLetraLRCLIB(tituloOriginal, autor);
        if (resultado?.letra) {
            console.log('✅ Letra + imagem via LRCLIB (título original)');
            return { ...resultado, fonte: 'LRCLIB' };
        }
    }

    // 4. Fallback local
    console.warn(`⚠️ Nenhuma fonte encontrou letra para: "${tituloLimpo}" - "${autor}"`);
    const fallback = getFallbackLocal(tituloLimpo, autor);
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
        // Casos "sujos" simulando título cru do YouTube
        { musica: 'Zezé Di Camargo & Luciano - Eu Te Amo (And I Love Her) (Áudio Oficial)', artista: 'Zezé Di Camargo & Luciano' },
        { musica: 'Ana Vilela - Trem-Bala (Official Video)', artista: 'Ana Vilela' },
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
    melhorarSeparacaoEstrofes,
    limparTituloBusca
};

console.log('🎵 Extrator de Letras carregado com sucesso!');