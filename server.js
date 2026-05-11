import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import userRoutes from './routes/users.js'

dotenv.config()

import multer from 'multer';
import path from 'path';
const app = express()

const storage = multer.diskStorage({

  destination: function (
    req,
    file,
    cb
  ) {

    cb(null, 'uploads/');
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

app.post(
  '/voice/upload',

  upload.single('audio'),

  async (req, res) => {

    try {

      console.log(req.file);

      return res.json({

        success: true,

        file: req.file.filename,

        path: req.file.path
      });

    } catch (err) {

      console.log(err);

      return res.status(500).json({

        error: 'Erro upload 3'
      });
    }
  }
);

app.listen(process.env.PORT, () => {
  console.log('Servidor rodando')
})