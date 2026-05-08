import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { supabase } from '../services/supabase.js'

export async function register(req, res) {

  try {

    const {
      nome,
      data_nsc,
      email,
      fone,
      login,
      senha
    } = req.body

    const senhaHash = await bcrypt.hash(senha, 10)

    const { data, error } = await supabase
      .from('usuarios')
      .insert([
        {
          nome,
          data_nsc,
          email,
          fone,
          login,
          senha: senhaHash
        }
      ])
      .select()

    if (error) {
      return res.status(400).json(error)
    }

    res.json(data)

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}

export async function getUserById(req, res) {

  try {

    const { id } = req.params

    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        nome,
        data_nsc,
        email,
        fone,
        login,
        criado_em
      `)
      .eq('id', id)
      .single()

    if (error) {

      return res.status(404).json({
        error: 'Usuário não encontrado'
      })
    }

    res.json(data)

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}

export async function updateUser(req, res) {

  try {

    const { id } = req.params

    const {
      nome,
      data_nsc,
      email,
      fone,
      login
    } = req.body

    const { data, error } = await supabase
      .from('usuarios')
      .update({
        nome,
        data_nsc,
        email,
        fone,
        login
      })
      .eq('id', id)
      .select()

    if (error) {

      return res.status(400).json(error)
    }

    res.json(data)

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}

export async function deleteUser(req, res) {

  try {

    const { id } = req.params

    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id)

    if (error) {

      return res.status(400).json(error)
    }

    res.json({
      message: 'Usuário removido com sucesso'
    })

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}

export async function getUsers(req, res) {

  try {

    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        nome,
        data_nsc,
        email,
        fone,
        login,
        criado_em
      `)

    if (error) {

      return res.status(400).json(error)
    }

    res.json(data)

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}

export async function login(req, res) {

  try {

    const { login, senha } = req.body

    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('login', login)
      .single()

    if (error || !data) {

      return res.status(401).json({
        error: 'Usuário inválido'
      })
    }

    const senhaValida = await bcrypt.compare(
      senha,
      data.senha
    )

    if (!senhaValida) {

      return res.status(401).json({
        error: 'Senha inválida'
      })
    }

    const token = jwt.sign(
      {
        id: data.id
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )

    res.json({
      token,
      usuario: {
        id: data.id,
        nome: data.nome,
        email: data.email,
        login: data.login
      }
    })

  } catch (err) {

    res.status(500).json({
      error: err.message
    })
  }
}