import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai';
import fs from 'fs';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

import userRoutes from './routes/users.js'

dotenv.config()

import multer from 'multer';
import path from 'path';
const app = express()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const anthropic = new Anthropic({

  apiKey:
  process.env.ANTHROPIC_API_KEY
});

function detectIntent(text) {

  const lower =
  text.toLowerCase();

  if (

    lower.includes('dólar') ||
    lower.includes('dolar') ||
    lower.includes('euro') ||
    lower.includes('cotação') ||
    lower.includes('cotacao')

  ) {

    return 'finance';
  }

  if (

    lower.includes('clima') ||
    lower.includes('temperatura') ||
    lower.includes('chuva') ||
    lower.includes('tempo')

  ) {

    return 'weather';
  }

  if (

    lower.includes('soja') ||
    lower.includes('milho') ||
    lower.includes('boi') ||
    lower.includes('gado') ||
    lower.includes('agronegócio') ||
    lower.includes('agro')

  ) {

    return 'agro';
  }

  if (

    lower.includes('trânsito') ||
    lower.includes('transito') ||
    lower.includes('rodovia') ||
    lower.includes('br-101') ||
    lower.includes('rota') ||
    lower.includes('acidente')

  ) {

    return 'traffic';
  }

  return 'general';
}

async function getDollarRate() {

  try {

    const response =
    await axios.get(
      'https://economia.awesomeapi.com.br/json/last/USD-BRL'
    );

    return `
Cotação atual do dólar:
R$ ${response.data.USDBRL.bid}
`;
  }

  catch (err) {

    console.log(err);

    return 'Erro cotação dólar';
  }
}

async function getWeather() {

  try {

    const response =
    await axios.get(

'https://api.open-meteo.com/v1/forecast?latitude=-26.91&longitude=-48.66&current_weather=true'

    );

    const weather =
    response.data.current_weather;

    return `
Temperatura atual:
${weather.temperature}°C

Vento:
${weather.windspeed} km/h
`;

  } catch (err) {

    console.log(err);

    return 'Erro clima';
  }
}

async function getAgroInfo(text) {

  try {

    const result =
    await searchWeb(
      `agronegócio ${text}`
    );

    return result;

  } catch (err) {

    console.log(err);

    return 'Erro agro';
  }
}

async function getTrafficInfo(text) {

  try {

    const result =
    await searchWeb(
      `trânsito ${text}`
    );

    return result;

  } catch (err) {

    console.log(err);

    return 'Erro trânsito';
  }
}

async function searchWeb(query) {

  try {

    const url =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;

    const response =
    await axios.get(url);

    const data = response.data;

    let result = '';

    if (data.AbstractText) {

      result +=
      `Resumo: ${data.AbstractText}\n`;
    }

    if (
      data.RelatedTopics &&
      data.RelatedTopics.length > 0
    ) {

      result += '\nTópicos relacionados:\n';

      data.RelatedTopics
        .slice(0, 5)
        .forEach((item) => {

          if (item.Text) {

            result +=
            `- ${item.Text}\n`;
          }
        });
    }

    if (!result) {

      result =
      'Nenhum resultado encontrado';
    }

    return result;

  } catch (err) {

    console.log(err);

    return 'Erro busca web';
  }
}

const storage = multer.diskStorage({

  destination: function (
    req,
    file,
    cb
  ) {

    cb(null, '/tmp');
  },

  filename: function (
    req,
    file,
    cb
  ) {

    const unique =
      Date.now() +
      path.extname(file.originalname);

    cb(null, unique);
  }
});

const upload = multer({
  storage
});

app.use(cors())
app.use(express.json())

app.use('/users', userRoutes)

app.get('/', (req, res) => {
  res.send('API funcionando')
})

app.post('/voice/upload',

  upload.single('audio'),

  async (req, res) => {

    try {
      console.log('file:',req.file);
      const transcription =  await openai.audio.transcriptions.create({
        file: fs.createReadStream(req.file.path),
        model: 'whisper-1'
      });

      console.log('transcrição',transcription.text);
      
      const userText = transcription.text;

      const intent = detectIntent(userText);

      console.log(intent);

      let webContext = '';

      if (intent === 'finance') {
        webContext = await getDollarRate();
      }

      else if (
        intent === 'weather'
      ) {
        webContext = await getWeather();
      }

      else if (
        intent === 'agro'
      ) {
        webContext = await getAgroInfo(userText);
      }

      else if (
        intent === 'traffic'
      ) {
        webContext = await getTrafficInfo(userText);
      }

      else {
        webContext = await searchWeb(userText);
      }


      const msg =  await anthropic.messages.create({
        model:'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content:
            `
            Você é um assistente de voz inteligente especializado em:

            - agronegócio
            - clima
            - trânsito
            - logística
            - informações gerais

            Pergunta do usuário:
            ${userText}

            Contexto:
            ${webContext}

            INSTRUÇÕES:
            - Responda em português do Brasil
            - Seja natural
            - Seja útil
            - Não diga para pesquisar no Google
            - Responda como um assistente de voz moderno
            `
          }
        ]
      });

      const answer = msg.content[0].text;
      console.log(answer);

      return res.json({
        success: true,
        transcription: userText,
        answer
      });

    } catch (err) {
      console.log(err);
      return res.status(500).json({
        error: 'Erro upload 7'
      });
    }
  }
);

app.listen(process.env.PORT, () => {
  console.log('Servidor rodando')
})