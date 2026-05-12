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
      const webContext = await searchWeb(userText);
      console.log(webContext);

      const msg =  await anthropic.messages.create({
        model:'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content:
            `
            Você é um assistente de voz inteligente.

            Pergunta do usuário:
            ${userText}

            Resultado da busca web:
            ${webContext}

            INSTRUÇÕES:
            - Responda em português do Brasil
            - Use o contexto web acima
            - Se houver pouca informação web, responda usando seu conhecimento
            - Não diga para pesquisar no Google
            - Seja objetivo e natural
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