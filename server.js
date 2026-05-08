import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import userRoutes from './routes/users.js'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

app.use('/users', userRoutes)

app.get('/', (req, res) => {
  res.send('API funcionando')
})

app.listen(process.env.PORT, () => {
  console.log('Servidor rodando')
})