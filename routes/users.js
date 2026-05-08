import express from 'express'

import {
  register,
  login,
  getUsers,
  getUserById,
  updateUser,
  deleteUser
} from '../controllers/usersController.js'

import { auth } from '../middleware/auth.js'

const router = express.Router()

router.post('/register', register)

router.post('/login', login)

router.get('/', auth, getUsers)

router.get('/:id', auth, getUserById)

router.put('/:id', auth, updateUser)

router.delete('/:id', auth, deleteUser)

export default router