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

    return (
      response.data.AbstractText ||
      response.data.Heading ||
      'Sem resultados'
    );

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
            content:`Pergunta:
              ${userText}

              Contexto web:
              ${webContext}

              Responda em português.
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