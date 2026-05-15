import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai';
import fs from 'fs';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import userRoutes from './routes/users.js'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

dotenv.config()

import multer from 'multer';
import path from 'path';
const app = express()

app.use('/tmp', express.static('/tmp'));
app.use('/uploads', express.static('/uploads'));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_API_KEY
});

async function buscaClaude(userText, latitude, longitude) {
  const intent = detectIntent(userText);
  console.log('Intent detectado:', intent);
  console.log('Latitude:', latitude);
  console.log('Longitude:', longitude);

  let webContext = '';

  if (intent === 'finance') {
    const [dollar, crypto, stocks] = await Promise.allSettled([
      getDollarRate(),
      getCryptoInfo(),
      getStocksInfo()
    ]);
    webContext = [
      dollar.status === 'fulfilled' ? dollar.value : '',
      crypto.status === 'fulfilled' ? crypto.value : '',
      stocks.status === 'fulfilled' ? stocks.value : ''
    ].join('\n');
  }
  else if (intent === 'crypto') {
    webContext = await getCryptoInfo();
  }
  else if (intent === 'stocks') {
    webContext = await getStocksInfo();
  }
  else if (intent === 'weather') {
    const [weather, airQuality] = await Promise.allSettled([
      getWeather(latitude, longitude),
      getAirQuality(latitude, longitude)
    ]);
    webContext = [
      weather.status === 'fulfilled' ? weather.value : '',
      airQuality.status === 'fulfilled' ? airQuality.value : ''
    ].join('\n');
  }
  else if (intent === 'airquality') {
    webContext = await getAirQuality(latitude, longitude);
  }
  else if (intent === 'agro') {
    webContext = await getAgroInfo(userText);
  }
  else if (intent === 'traffic') {
    webContext = await getTrafficInfo(userText);
  }
  else if (intent === 'news') {
    webContext = await getNews(userText);
  }
  else if (intent === 'cep') {
    const cep = extractCEP(userText);
    if (cep) {
      webContext = await getCEPInfo(cep);
    } else {
      webContext = await searchWeb(userText);
    }
  }
  else if (intent === 'cnpj') {
    const cnpj = extractCNPJ(userText);
    if (cnpj) {
      webContext = await getCNPJInfo(cnpj);
    } else {
      webContext = await searchWeb(userText);
    }
  }
  else if (intent === 'fipe') {
    webContext = await getFIPEInfo(userText);
  }
  else if (intent === 'fuel') {
    webContext = await getFuelInfo(latitude, longitude);
  }
  else if (intent === 'location') {
    webContext = await getCityFromCoords(latitude, longitude);
  }
  else if (intent === 'tourism') {
    const [places, wiki] = await Promise.allSettled([
      getTouristSpots(latitude, longitude),
      getWikiGeoInfo(latitude, longitude)
    ]);
    webContext = [
      places.status === 'fulfilled' ? places.value : '',
      wiki.status === 'fulfilled' ? wiki.value : ''
    ].join('\n');
  }
  else {
    webContext = await searchWeb(userText);
  }

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content:
          `
        Você é um assistente de voz inteligente especializado em:
        - finanças (dólar, euro, outras moedas, criptomoedas, ações da B3)
        - agronegócio (soja, milho, boi gordo, cotações agrícolas)
        - clima e qualidade do ar (temperatura, vento, UV, PM2.5)
        - trânsito (informações do trânsito local)
        - logística (CEP, CNPJ, tabela FIPE, rotas)
        - notícias (últimas notícias do Brasil e do mundo)
        - combustíveis (gasolina, diesel, etanol)
        - turismo (pontos turísticos, atrações, museus, parques próximos)
        - informações gerais

        Pergunta do usuário:
        ${userText}

        Contexto com dados atuais:
        ${webContext}

        Coordenadas do usuário: latitude ${latitude}, longitude ${longitude}

        INSTRUÇÕES:
        - Responda em português do Brasil
        - Seja natural e direto como um assistente de voz moderno
        - Use os dados do contexto para dar respostas precisas
        - Não diga para pesquisar no Google
        - Seja útil e completo mas conciso
        `
      }
    ]
  });
  return msg.content[0].text;
}

// ─── DETECÇÃO DE INTENÇÃO ────────────────────────────────────────────────────

function detectIntent(text) {
  const lower = text.toLowerCase();

  // Finanças / moedas
  if (lower.includes('dólar') || lower.includes('dolar') ||
    lower.includes('euro') || lower.includes('cotação') ||
    lower.includes('cotacao') || lower.includes('câmbio') ||
    lower.includes('cambio') || lower.includes('libra') ||
    lower.includes('iene') || lower.includes('yuan')) {
    return 'finance';
  }

  // Criptomoedas
  if (lower.includes('bitcoin') || lower.includes('btc') ||
    lower.includes('ethereum') || lower.includes('eth') ||
    lower.includes('cripto') || lower.includes('solana') ||
    lower.includes('crypto')) {
    return 'crypto';
  }

  // Bolsa de valores
  if (lower.includes('ação') || lower.includes('ações') ||
    lower.includes('bolsa') || lower.includes('b3') ||
    lower.includes('ibovespa') || lower.includes('ibov') ||
    lower.includes('petr4') || lower.includes('vale3')) {
    return 'stocks';
  }

  // Clima
  if (lower.includes('clima') || lower.includes('temperatura') ||
    lower.includes('chuva') || lower.includes('tempo') ||
    lower.includes('previsão do tempo') || lower.includes('calor') ||
    lower.includes('frio')) {
    return 'weather';
  }

  // Qualidade do ar
  if (lower.includes('qualidade do ar') || lower.includes('poluição') ||
    lower.includes('índice uv') || lower.includes('uv') ||
    lower.includes('pm2') || lower.includes('fumaça')) {
    return 'airquality';
  }

  // Agronegócio
  if (lower.includes('soja') || lower.includes('milho') ||
    lower.includes('boi') || lower.includes('gado') ||
    lower.includes('agronegócio') || lower.includes('agro') ||
    lower.includes('arroz') || lower.includes('café') ||
    lower.includes('açúcar') || lower.includes('trigo')) {
    return 'agro';
  }

  // Trânsito
  if (lower.includes('trânsito') || lower.includes('transito') ||
    lower.includes('rodovia') || lower.includes(' br-') ||
    lower.includes('rota') || lower.includes('acidente') ||
    lower.includes('congestionamento') || lower.includes('tráfego')) {
    return 'traffic';
  }

  // Notícias
  if (lower.includes('notícia') || lower.includes('noticia') ||
    lower.includes('news') || lower.includes('novidade') ||
    lower.includes('aconteceu') || lower.includes('últimas')) {
    return 'news';
  }

  // CEP / Endereço
  if (lower.includes('cep') || lower.includes('endereço') ||
    lower.includes('endereco') || /\d{5}-?\d{3}/.test(lower)) {
    return 'cep';
  }

  // CNPJ / Empresa
  if (lower.includes('cnpj') || lower.includes('empresa') ||
    /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(lower)) {
    return 'cnpj';
  }

  // Tabela FIPE / Veículo
  if (lower.includes('fipe') || lower.includes('tabela fipe') ||
    lower.includes('valor do carro') || lower.includes('preço do carro') ||
    lower.includes('quanto vale o carro')) {
    return 'fipe';
  }

  // Combustível
  if (lower.includes('gasolina') || lower.includes('combustível') ||
    lower.includes('combustivel') || lower.includes('diesel') ||
    lower.includes('etanol') || lower.includes('posto')) {
    return 'fuel';
  }

  // Localização
  if (lower.includes('onde estou') || lower.includes('minha localização') ||
    lower.includes('minha localizacao') || lower.includes('que cidade') ||
    lower.includes('qual cidade')) {
    return 'location';
  }

  // Turismo / pontos turísticos
  if (lower.includes('ponto turístico') || lower.includes('ponto turistico') ||
    lower.includes('o que visitar') || lower.includes('o que ver') ||
    lower.includes('atração') || lower.includes('atracao') ||
    lower.includes('atrações') || lower.includes('museu') ||
    lower.includes('parque') || lower.includes('monumento') ||
    lower.includes('turismo') || lower.includes('turistico') ||
    lower.includes('turístico') || lower.includes('passeio') ||
    lower.includes('visitar') || lower.includes('conhecer aqui') ||
    lower.includes('o que tem aqui') || lower.includes('o que tem por aqui') ||
    lower.includes('perto daqui') || lower.includes('próximo daqui') ||
    lower.includes('próximos') || lower.includes('nos arredores') ||
    lower.includes('trilha') || lower.includes('praia') ||
    lower.includes('cachoeira') || lower.includes('igreja histórica') ||
    lower.includes('patrimônio')) {
    return 'tourism';
  }

  return 'general';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractCEP(text) {
  const match = text.match(/\d{5}-?\d{3}/);
  return match ? match[0].replace('-', '') : null;
}

function extractCNPJ(text) {
  const match = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\.?\d{4}-?\d{2}/);
  return match ? match[0].replace(/[.\-\/]/g, '') : null;
}

// ─── FINANÇAS ────────────────────────────────────────────────────────────────

async function getDollarRate() {
  try {
    // AwesomeAPI — sem API key, cotações em BRL
    const response = await axios.get(
      'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL,JPY-BRL,ARS-BRL,CAD-BRL'
    );
    const d = response.data;
    return `
      Dólar (USD): R$ ${parseFloat(d.USDBRL?.bid).toFixed(2)}
      Euro (EUR): R$ ${parseFloat(d.EURBRL?.bid).toFixed(2)}
      Libra (GBP): R$ ${parseFloat(d.GBPBRL?.bid).toFixed(2)}
      Iene (JPY/100): R$ ${(parseFloat(d.JPYBRL?.bid) * 100).toFixed(2)}
      Peso Argentino: R$ ${parseFloat(d.ARSBRL?.bid).toFixed(4)}
      Dólar Canadense: R$ ${parseFloat(d.CADBRL?.bid).toFixed(2)}
    `;
  } catch (err) {
    console.log('ERRO getDollarRate:', err.message);
    return 'Erro ao buscar cotação de moedas';
  }
}

async function getCryptoInfo() {
  try {
    // CoinGecko — sem API key
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple&vs_currencies=brl,usd&include_24hr_change=true',
      { timeout: 8000 }
    );
    const d = response.data;
    const fmt = (n) => n?.toFixed(2) ?? 'N/A';
    const fmtPct = (n) => (n >= 0 ? `+${n?.toFixed(1)}` : n?.toFixed(1)) + '%';
    return `
      Bitcoin (BTC): R$ ${fmt(d.bitcoin?.brl)} (${fmtPct(d.bitcoin?.brl_24h_change)} 24h)
      Ethereum (ETH): R$ ${fmt(d.ethereum?.brl)} (${fmtPct(d.ethereum?.brl_24h_change)} 24h)
      Solana (SOL): R$ ${fmt(d.solana?.brl)} (${fmtPct(d.solana?.brl_24h_change)} 24h)
      Cardano (ADA): R$ ${fmt(d.cardano?.brl)} (${fmtPct(d.cardano?.brl_24h_change)} 24h)
      XRP: R$ ${fmt(d.ripple?.brl)} (${fmtPct(d.ripple?.brl_24h_change)} 24h)
    `;
  } catch (err) {
    console.log('ERRO getCryptoInfo:', err.message);
    return 'Erro ao buscar cotação de criptomoedas';
  }
}

async function getStocksInfo() {
  try {
    // BRAPI — key gratuita via env
    const key = process.env.BRAPI_KEY || '';
    const tickers = 'PETR4,VALE3,ITUB4,BBDC4,ABEV3,IBOV';
    const url = key
      ? `https://brapi.dev/api/quote/${tickers}?token=${key}`
      : `https://brapi.dev/api/quote/${tickers}`;
    const response = await axios.get(url, { timeout: 8000 });
    const results = response.data?.results ?? [];
    if (!results.length) return 'Sem dados de ações no momento';
    return 'Ações B3:\n' + results.map(s =>
      `  ${s.symbol}: R$ ${s.regularMarketPrice?.toFixed(2)} (${s.regularMarketChangePercent >= 0 ? '+' : ''}${s.regularMarketChangePercent?.toFixed(2)}%)`
    ).join('\n');
  } catch (err) {
    console.log('ERRO getStocksInfo:', err.message);
    return 'Erro ao buscar ações da B3';
  }
}

// ─── CLIMA / QUALIDADE DO AR ──────────────────────────────────────────────────

async function getWeather(latitude, longitude) {
  try {
    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=precipitation_probability,relative_humidity_2m&forecast_days=1&timezone=America%2FSao_Paulo`
    );
    const w = response.data.current_weather;
    const humidity = response.data.hourly?.relative_humidity_2m?.[0] ?? 'N/A';
    const rain = response.data.hourly?.precipitation_probability?.[0] ?? 'N/A';
    return `
      Temperatura atual: ${w.temperature}°C
      Vento: ${w.windspeed} km/h | Direção: ${w.winddirection}°
      Umidade relativa: ${humidity}%
      Probabilidade de chuva: ${rain}%
    `;
  } catch (err) {
    console.log('ERRO getWeather:', err.message);
    return 'Erro ao buscar clima';
  }
}

async function getAirQuality(latitude, longitude) {
  try {
    // Open-Meteo Air Quality — sem API key
    const response = await axios.get(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm2_5,pm10,carbon_monoxide,uv_index,uv_index_clear_sky`
    );
    const c = response.data.current;
    const uvLevel = c.uv_index <= 2 ? 'Baixo' : c.uv_index <= 5 ? 'Moderado' : c.uv_index <= 7 ? 'Alto' : 'Muito Alto';
    return `
      Qualidade do Ar:
      PM2.5: ${c.pm2_5?.toFixed(1)} µg/m³
      PM10: ${c.pm10?.toFixed(1)} µg/m³
      Monóxido de Carbono: ${c.carbon_monoxide?.toFixed(1)} µg/m³
      Índice UV: ${c.uv_index?.toFixed(1)} (${uvLevel})
    `;
  } catch (err) {
    console.log('ERRO getAirQuality:', err.message);
    return 'Erro ao buscar qualidade do ar';
  }
}

// ─── AGRONEGÓCIO ──────────────────────────────────────────────────────────────

async function getAgroInfo(text) {
  try {
    // Busca cotações CEPEA via web + contexto geral
    const [webResult, cryptoContext] = await Promise.allSettled([
      searchWeb(`agronegócio cotação ${text} hoje Brasil`),
      searchWeb(`preço soja milho boi gordo CEPEA hoje`)
    ]);
    return [
      webResult.status === 'fulfilled' ? webResult.value : '',
      cryptoContext.status === 'fulfilled' ? cryptoContext.value : ''
    ].join('\n');
  } catch (err) {
    console.log('ERRO getAgroInfo:', err.message);
    return 'Erro ao buscar informações de agronegócio';
  }
}

// ─── TRÂNSITO ─────────────────────────────────────────────────────────────────

async function getTrafficInfo(text) {
  try {
    const result = await searchWeb(`trânsito rodovias ${text} hoje Brasil`);
    return result;
  } catch (err) {
    console.log('ERRO getTrafficInfo:', err.message);
    return 'Erro ao buscar informações de trânsito';
  }
}

// ─── NOTÍCIAS ─────────────────────────────────────────────────────────────────

async function getNews(query) {
  try {
    // GNews — key gratuita (100 req/dia) via env
    const key = process.env.GNEWS_KEY || '';
    if (key) {
      const q = encodeURIComponent(query || 'Brasil');
      const response = await axios.get(
        `https://gnews.io/api/v4/search?q=${q}&lang=pt&country=br&max=5&token=${key}`,
        { timeout: 8000 }
      );
      const articles = response.data?.articles ?? [];
      if (articles.length) {
        return 'Notícias recentes:\n' + articles.map((a, i) =>
          `${i + 1}. ${a.title} — ${a.source?.name}`
        ).join('\n');
      }
    }
    // Fallback: DuckDuckGo
    return await searchWeb(`notícias ${query || 'Brasil'} hoje`);
  } catch (err) {
    console.log('ERRO getNews:', err.message);
    return 'Erro ao buscar notícias';
  }
}

// ─── CEP / CNPJ / FIPE (BrasilAPI — sem key) ──────────────────────────────────

async function getCEPInfo(cep) {
  try {
    const response = await axios.get(
      `https://brasilapi.com.br/api/cep/v2/${cep}`,
      { timeout: 8000 }
    );
    const d = response.data;
    return `
      CEP: ${d.cep}
      Logradouro: ${d.street ?? 'N/A'}
      Bairro: ${d.neighborhood ?? 'N/A'}
      Cidade: ${d.city}
      Estado: ${d.state}
    `;
  } catch (err) {
    console.log('ERRO getCEPInfo:', err.message);
    return 'CEP não encontrado';
  }
}

async function getCNPJInfo(cnpj) {
  try {
    const response = await axios.get(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      { timeout: 8000 }
    );
    const d = response.data;
    return `
      Empresa: ${d.razao_social}
      Nome Fantasia: ${d.nome_fantasia ?? 'N/A'}
      CNPJ: ${d.cnpj}
      Situação: ${d.descricao_situacao_cadastral}
      Atividade Principal: ${d.cnae_fiscal_descricao}
      Endereço: ${d.logradouro}, ${d.numero} - ${d.municipio}/${d.uf}
    `;
  } catch (err) {
    console.log('ERRO getCNPJInfo:', err.message);
    return 'CNPJ não encontrado';
  }
}

async function getFIPEInfo(text) {
  try {
    // Busca tabelas FIPE via BrasilAPI
    const response = await axios.get(
      'https://brasilapi.com.br/api/fipe/tabelas/v1',
      { timeout: 8000 }
    );
    const tabelas = response.data;
    const latest = tabelas?.[0];
    const webResult = await searchWeb(`tabela fipe ${text} ${latest?.mesReferencia ?? ''}`);
    return `Tabela FIPE referência: ${latest?.mesReferencia ?? 'N/A'}\n${webResult}`;
  } catch (err) {
    console.log('ERRO getFIPEInfo:', err.message);
    return 'Erro ao buscar tabela FIPE';
  }
}

// ─── COMBUSTÍVEL ──────────────────────────────────────────────────────────────

async function getFuelInfo(latitude, longitude) {
  try {
    // Geocoding reverso para saber o estado
    const city = await getCityFromCoords(latitude, longitude);
    const webResult = await searchWeb(`preço gasolina diesel etanol ${city} hoje ANP`);
    return `Localização: ${city}\n${webResult}`;
  } catch (err) {
    console.log('ERRO getFuelInfo:', err.message);
    return 'Erro ao buscar preços de combustível';
  }
}

// ─── LOCALIZAÇÃO ──────────────────────────────────────────────────────────────

async function getCityFromCoords(latitude, longitude) {
  try {
    // Nominatim / OpenStreetMap — sem API key
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      {
        headers: { 'User-Agent': 'AssistenteVoz/1.0' },
        timeout: 8000
      }
    );
    const addr = response.data?.address;
    const city = addr?.city || addr?.town || addr?.village || addr?.county || '';
    const state = addr?.state || '';
    return `${city}, ${state}`;
  } catch (err) {
    console.log('ERRO getCityFromCoords:', err.message);
    return 'localização desconhecida';
  }
}

// ─── TURISMO ──────────────────────────────────────────────────────────────────

async function getTouristSpots(latitude, longitude, radiusKm = 10) {
  try {
    const radiusM = radiusKm * 1000;

    // Overpass API (OpenStreetMap) — sem API key
    // Busca: pontos turísticos, museus, monumentos, parques, praias, cachoeiras, igrejas históricas
    const query = `
      [out:json][timeout:15];
      (
        node["tourism"~"attraction|museum|viewpoint|artwork|zoo|theme_park|aquarium|gallery"](around:${radiusM},${latitude},${longitude});
        node["historic"~"monument|memorial|castle|ruins|archaeological_site|building"](around:${radiusM},${latitude},${longitude});
        node["leisure"~"park|nature_reserve|beach_resort"](around:${radiusM},${latitude},${longitude});
        node["natural"~"beach|waterfall|peak|hot_spring"](around:${radiusM},${latitude},${longitude});
        node["amenity"~"place_of_worship"]["historic"](around:${radiusM},${latitude},${longitude});
        way["tourism"~"attraction|museum|viewpoint"](around:${radiusM},${latitude},${longitude});
        way["historic"~"monument|memorial|castle|ruins"](around:${radiusM},${latitude},${longitude});
        way["natural"~"beach|waterfall|peak"](around:${radiusM},${latitude},${longitude});
      );
      out center 20;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000
      }
    );

    const elements = response.data?.elements ?? [];
    if (!elements.length) {
      return `Nenhum ponto turístico encontrado num raio de ${radiusKm}km.`;
    }

    // Calcula distância e filtra os com nome
    const spots = elements
      .filter(e => e.tags?.name)
      .map(e => {
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        const dist = calcDistance(latitude, longitude, lat, lon);
        const type = classifySpot(e.tags);
        return {
          name: e.tags.name,
          type,
          dist: dist.toFixed(1),
          description: e.tags['description'] || e.tags['name:pt'] || '',
          wikipedia: e.tags['wikipedia'] || '',
          website: e.tags['website'] || e.tags['contact:website'] || '',
          openingHours: e.tags['opening_hours'] || ''
        };
      })
      .sort((a, b) => parseFloat(a.dist) - parseFloat(b.dist))
      .slice(0, 10);

    let result = `Pontos turísticos num raio de ${radiusKm}km:\n`;
    spots.forEach((s, i) => {
      result += `\n${i + 1}. ${s.name} (${s.type}) — ${s.dist}km`;
      if (s.openingHours) result += ` | Horário: ${s.openingHours}`;
      if (s.description) result += `\n   ${s.description}`;
    });

    return result;

  } catch (err) {
    console.log('ERRO getTouristSpots:', err.message);
    return 'Erro ao buscar pontos turísticos';
  }
}

async function getWikiGeoInfo(latitude, longitude) {
  try {
    // Wikipedia GeoSearch API — sem key, retorna artigos próximos às coordenadas
    const response = await axios.get(
      `https://pt.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${latitude}|${longitude}&gsradius=10000&gslimit=5&format=json&origin=*`,
      { timeout: 8000 }
    );

    const pages = response.data?.query?.geosearch ?? [];
    if (!pages.length) return '';

    // Busca o resumo do primeiro artigo mais relevante
    const titles = pages.map(p => encodeURIComponent(p.title)).join('|');
    const summaryResp = await axios.get(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${titles}&prop=extracts&exintro=true&explaintext=true&exsentences=2&format=json&origin=*`,
      { timeout: 8000 }
    );

    const wikiPages = Object.values(summaryResp.data?.query?.pages ?? {});
    let result = '\nInformações históricas/culturais da região (Wikipedia):\n';
    wikiPages.slice(0, 3).forEach(p => {
      if (p.extract) {
        result += `\n• ${p.title}: ${p.extract.substring(0, 200)}...\n`;
      }
    });

    return result;
  } catch (err) {
    console.log('ERRO getWikiGeoInfo:', err.message);
    return '';
  }
}

// Classifica o tipo de ponto turístico em português
function classifySpot(tags) {
  const t = tags.tourism;
  const h = tags.historic;
  const n = tags.natural;
  const l = tags.leisure;

  if (t === 'museum') return 'Museu';
  if (t === 'attraction') return 'Atração Turística';
  if (t === 'viewpoint') return 'Mirante';
  if (t === 'artwork') return 'Obra de Arte';
  if (t === 'zoo') return 'Zoológico';
  if (t === 'theme_park') return 'Parque Temático';
  if (t === 'aquarium') return 'Aquário';
  if (t === 'gallery') return 'Galeria';
  if (h === 'monument') return 'Monumento';
  if (h === 'memorial') return 'Memorial';
  if (h === 'castle') return 'Castelo/Fortaleza';
  if (h === 'ruins') return 'Ruínas';
  if (h === 'archaeological_site') return 'Sítio Arqueológico';
  if (h === 'building') return 'Edifício Histórico';
  if (n === 'beach') return 'Praia';
  if (n === 'waterfall') return 'Cachoeira';
  if (n === 'peak') return 'Pico/Montanha';
  if (n === 'hot_spring') return 'Termas';
  if (l === 'park') return 'Parque';
  if (l === 'nature_reserve') return 'Reserva Natural';
  if (tags.amenity === 'place_of_worship') return 'Igreja/Templo Histórico';
  return 'Ponto Turístico';
}

// Fórmula de Haversine — distância entre duas coordenadas em km
function calcDistance(lat1, lon1, lat2, lon2) {
  if (!lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── BUSCA WEB GERAL ──────────────────────────────────────────────────────────

async function searchWeb(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
    const response = await axios.get(url, { timeout: 8000 });
    const data = response.data;
    let result = '';

    if (data.AbstractText) {
      result += `Resumo: ${data.AbstractText}\n`;
    }

    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      result += '\nTópicos relacionados:\n';
      data.RelatedTopics.slice(0, 5).forEach((item) => {
        if (item.Text) {
          result += `- ${item.Text}\n`;
        }
      });
    }

    if (!result) {
      result = 'Nenhum resultado encontrado';
    }

    return result;
  } catch (err) {
    console.log('ERRO searchWeb:', err.message);
    return 'Erro na busca web';
  }
}

// ─── MULTER ───────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp');
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + path.extname(file.originalname);
    cb(null, unique);
  }
});

const upload = multer({ storage });

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────

app.use(cors())
app.use(express.json())
app.use('/users', userRoutes)

app.get('/', (req, res) => {
  res.send('API funcionando')
})

// ─── ROTAS ────────────────────────────────────────────────────────────────────

app.post('/voice/text', async (req, res) => {
  try {
    const { question, latitude, longitude } = req.body;
    const msg = await buscaClaude(question, latitude, longitude);
    console.log('Resposta:', msg);
    return res.json({ success: true, answer: msg });
  } catch (err) {
    console.log('ERRO /voice/text:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Rota de diagnóstico — mostra quais APIs estão configuradas
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    apis: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      elevenlabs: !!process.env.ELEVEN_API_KEY,
      brapi: !!process.env.BRAPI_KEY,
      gnews: !!process.env.GNEWS_KEY,
    }
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Servidor rodando na porta ${process.env.PORT}`)
})
